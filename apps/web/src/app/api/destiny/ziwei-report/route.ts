import { NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  DestinyModule,
  DestinyReport,
  DestinyReportRequest,
  ZiweiLockedSections,
  ZiweiSectionKey,
  ZiweiStreamEvent,
  ZiweiPalaceAnalysis,
} from '@/app/destiny/_components/types';
import {
  computeZiweiChart,
  buildZiweiPromptContext,
  type ZiweiChartData,
} from '../_lib/ziwei-chart';
import { extractArkUsage, extractJsonBlock } from '../_lib/ark-response';
import {
  resolveModelConfig,
  callModel,
  ModelConfigError,
  ModelUpstreamError,
  type ModelConfig,
} from '@repo/shared';
import { withAuth } from '@/lib/api/with-auth';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';
import { releaseAiQuota, reserveChatQuota, settleAiQuota } from '@/lib/billing/quota-service';
import { createTokenMeasurement, estimateOutputTokens } from '@/lib/billing/usage-measurement';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { getBillingRequestId } from '@/lib/billing/request-id';

export const runtime = 'nodejs';
export const maxDuration = 300;

// ─── 请求校验 ───

const RequestSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空'),
  gender: z.enum(['male', 'female']),
  calendarType: z.enum(['lunar', 'solar']).default('lunar'),
  birthDate: z.object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  }),
  birthTime: z.object({
    hour: z.string().regex(/^\d{2}$/),
    minute: z.string().regex(/^\d{2}$/),
  }),
  location: z.object({
    name: z.string().trim().min(1, '出生地不能为空'),
    lat: z.number().nullable(),
    lon: z.number().nullable(),
  }),
  provider: z.enum(['doubao', 'deepseek']).default('doubao'),
});

// ─── 常量 ───

// quick 阶段需一次性生成 3 个复杂 Schema 区块，pro 级模型 40s 实测稳定超时，提高到 90s
// 注意与 maxDuration=300 对齐：quick(90s) 与 full 两组(各 120s) 并行执行，总预算仍留有余量
const QUICK_TIMEOUT_MS = 90000;
const GROUP_TIMEOUT_MS = 120000;
const QUICK_MAX_TOKENS = 8000;
// 每组（6 宫 + 1 模块）输出预算：doubao pro 的 reasoning token 计入 output，
// 实测简略输出约 3100 token，留足余量避免冗长输出被截断导致整组 JSON 解析失败
const GROUP_MAX_TOKENS = 4500;

// full 阶段 12 宫拆为两组并行：A 组前六宫 + love，B 组后六宫 + health。
// 合并顺序与原单次调用的提示词顺序一致，保证 palaceAnalysis[0] 稳定（前端以此为初始选中宫位）
const PALACE_GROUP_A = ['父母宫', '福德宫', '田宅宫', '官禄宫', '命宫', '兄弟宫'] as const;
const PALACE_GROUP_B = ['奴仆宫', '夫妻宫', '迁移宫', '子女宫', '财帛宫', '疾厄宫'] as const;
const PALACE_CANONICAL_ORDER: readonly string[] = [...PALACE_GROUP_A, ...PALACE_GROUP_B];

const SECTION_ORDER: ZiweiSectionKey[] = [
  'chartData',
  'profileOverview',
  'overviewModules',
  'timeline',
  'relations',
  'palaceAnalysis',
  'love',
  'health',
];

type ZiweiBillingContext = {
  userId: string;
  requestId: string;
};

// ─── JSON Schema（豆包结构化输出）───

/** 单模块（性格/事业/财运/感情/健康）共用的 JSON Schema */
const MODULE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    summary: { type: 'string' },
    advantages: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['title', 'summary', 'advantages', 'suggestions'],
  additionalProperties: false,
} as const;

const QUICK_SCHEMA = {
  type: 'object',
  properties: {
    overviewModules: {
      type: 'object',
      properties: {
        personality: MODULE_JSON_SCHEMA,
        career: MODULE_JSON_SCHEMA,
        wealth: MODULE_JSON_SCHEMA,
      },
      required: ['personality', 'career', 'wealth'],
      additionalProperties: false,
    },
    timeline: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          year: { type: 'integer' },
          title: { type: 'string' },
          summary: { type: 'string' },
          detail: {
            type: 'object',
            properties: {
              opportunities: { type: 'array', items: { type: 'string' } },
              risks: { type: 'array', items: { type: 'string' } },
              actions: { type: 'array', items: { type: 'string' } },
            },
            required: ['opportunities', 'risks', 'actions'],
            additionalProperties: false,
          },
        },
        required: ['year', 'title', 'summary', 'detail'],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
        opportunities: { type: 'array', items: { type: 'string' } },
        risks: { type: 'array', items: { type: 'string' } },
        actions: { type: 'array', items: { type: 'string' } },
      },
      required: ['summary', 'opportunities', 'risks', 'actions'],
      additionalProperties: false,
    },
  },
  additionalProperties: false,
} as const;

const PALACE_ANALYSIS_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    key: { type: 'string' },
    label: { type: 'string' },
    summary: { type: 'string' },
    suggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['key', 'label', 'summary', 'suggestions'],
  additionalProperties: false,
} as const;

/** full 阶段每组（6 宫 + 1 个模块）的 JSON Schema */
function buildGroupSchema(moduleKey: 'love' | 'health') {
  return {
    type: 'object',
    properties: {
      palaceAnalysis: { type: 'array', items: PALACE_ANALYSIS_ITEM_SCHEMA },
      [moduleKey]: MODULE_JSON_SCHEMA,
    },
    required: ['palaceAnalysis', moduleKey],
    additionalProperties: false,
  };
}

// ─── 主入口 ───

export async function POST(req: Request) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const parsed = RequestSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: '请求参数错误',
            details: parsed.error.errors.map((item) => ({
              path: item.path.join('.'),
              message: item.message,
            })),
          },
          { status: 400 }
        );
      }

      let config: ModelConfig;
      try {
        config = resolveModelConfig(parsed.data.provider);
      } catch (error) {
        if (error instanceof ModelConfigError) {
          return NextResponse.json({ error: error.message }, { status: 500 });
        }
        throw error;
      }

      const input: DestinyReportRequest = parsed.data;
      const currentYear = new Date().getFullYear();
      const billing =
        user.role === 'admin'
          ? null
          : {
              userId: user.id,
              requestId: getBillingRequestId(req, body as Record<string, unknown>),
            };

      // Step 0: 本地排盘
      let chartData: ZiweiChartData;
      try {
        chartData = computeZiweiChart(input);
      } catch (chartError) {
        return NextResponse.json(
          {
            error: `排盘计算失败：${chartError instanceof Error ? chartError.message : '未知错误'}`,
          },
          { status: 422 }
        );
      }

      const stream = createZiweiStream({
        input,
        currentYear,
        config,
        userId: user.id,
        billing,
        chartData,
      });

      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
        },
      });
    } catch (error) {
      if (error instanceof BillingError) return billingErrorResponse(error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : '测算失败，请稍后重试' },
        { status: 500 }
      );
    }
  });
}

// ─── SSE 流 ───

function createZiweiStream({
  input,
  currentYear,
  config,
  userId,
  billing,
  chartData,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  config: ModelConfig;
  userId: string;
  billing: ZiweiBillingContext | null;
  chartData: ZiweiChartData;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emittedSections = new Set<ZiweiSectionKey>();
      const lockedSections: ZiweiLockedSections = {};
      // 并行分支在 error/close 之后仍可能回调节入区块，closed 标志防止向已关闭的流写入
      let closed = false;

      const send = (event: ZiweiStreamEvent) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        // 立即发送精确星盘数据（本地计算，毫秒级）
        send({ type: 'status', status: 'queued' });
        send({ type: 'status', status: 'charting' });

        emittedSections.add('chartData');
        lockedSections.chartData = chartData;
        send({
          type: 'section-final',
          sectionKey: 'chartData',
          payload: chartData,
        } as ZiweiStreamEvent);

        // profileOverview 是纯格式化信息，本地生成随星盘后立即下发，不再占用 AI 输出预算
        const profileOverview = buildLocalProfileOverview(input, chartData);
        emittedSections.add('profileOverview');
        lockedSections.profileOverview = profileOverview;
        send({
          type: 'section-final',
          sectionKey: 'profileOverview',
          payload: profileOverview,
        } as ZiweiStreamEvent);

        // 构建 AI 提示词上下文
        const chartContext = buildZiweiPromptContext(chartData);

        // quick 与 full 互不依赖（都只消费本地 chartContext），并行执行；
        // 各自完成后立即下发自己的区块，总耗时从串行的 T(quick)+T(full) 降为 max(T(quick), T(full))
        send({ type: 'status', status: 'analyzing' });

        const quickPromise = generateQuickSections({
          config,
          input,
          chartContext,
          currentYear,
          userId,
          billing,
        }).then((sections) => {
          emitSections({ sections, emittedSections, lockedSections, send });
        });
        const fullPromise = generateFullSections({
          config,
          input,
          chartContext,
          currentYear,
          userId,
          billing,
        }).then((sections) => {
          emitSections({ sections, emittedSections, lockedSections, send });
        });

        await Promise.all([quickPromise, fullPromise]);

        send({ type: 'status', status: 'finalizing' });
        send({
          type: 'complete',
          report: buildFinalReport(input, chartData, lockedSections, currentYear),
        });
      } catch (error) {
        send({
          type: 'error',
          error: mapStreamError(error),
        });
      } finally {
        closed = true;
        controller.close();
      }
    },
  });
}

// ─── 发射区块事件 ───

function emitSections({
  sections,
  emittedSections,
  lockedSections,
  send,
}: {
  sections: ZiweiLockedSections;
  emittedSections: Set<ZiweiSectionKey>;
  lockedSections: ZiweiLockedSections;
  send: (event: ZiweiStreamEvent) => void;
}) {
  for (const sectionKey of SECTION_ORDER) {
    if (emittedSections.has(sectionKey)) continue;
    const payload = sections[sectionKey];
    if (!payload) continue;

    if (sectionKey === 'palaceAnalysis' && (!Array.isArray(payload) || payload.length < 12))
      continue;
    if (sectionKey === 'timeline' && (!Array.isArray(payload) || payload.length === 0)) continue;

    emittedSections.add(sectionKey);
    (lockedSections as Record<string, unknown>)[sectionKey] = payload;
    send({ type: 'section-final', sectionKey, payload } as ZiweiStreamEvent);
  }
}

// ─── 快速解读 ───

async function generateQuickSections({
  config,
  input,
  chartContext,
  currentYear,
  userId,
  billing,
}: {
  config: ModelConfig;
  input: DestinyReportRequest;
  chartContext: string;
  currentYear: number;
  userId: string;
  billing: ZiweiBillingContext | null;
}): Promise<ZiweiLockedSections> {
  const messages = [
    { role: 'system' as const, content: buildQuickSystemPrompt(currentYear) },
    { role: 'user' as const, content: buildUserPrompt(input, chartContext) },
  ];
  const requestId = billing ? `${billing.requestId}:quick` : null;
  let reservation: { id: string } | null = null;
  let inputUnits = 0;
  let outputLimit = QUICK_MAX_TOKENS;

  try {
    if (billing && requestId) {
      const quota = await reserveChatQuota({
        userId: billing.userId,
        requestId,
        feature: 'destiny',
        provider: config.provider,
        model: config.model,
        messages,
        maxOutputTokens: QUICK_MAX_TOKENS,
        metadata: { reportType: 'ziwei', stage: 'quick', currentYear },
      });
      reservation = quota.reservation;
      inputUnits = quota.inputUnits;
      outputLimit = quota.outputLimit;
    }
    const result = await callModel({
      config,
      messages,
      maxTokens: outputLimit,
      temperature: 0.25,
      timeoutMs: QUICK_TIMEOUT_MS,
      json: { schema: { name: 'ziwei_quick', schema: QUICK_SCHEMA } },
    });

    if (reservation && requestId) {
      await settleAiQuota({
        reservationId: reservation.id,
        requestId,
        feature: 'destiny',
        action: 'destiny-ziwei-report',
        provider: config.provider,
        model: config.model,
        endpoint: '/api/destiny/ziwei-report',
        measurement: createTokenMeasurement(
          extractArkUsage(result.raw),
          inputUnits + estimateOutputTokens(result.text)
        ),
        metadata: { reportType: 'ziwei', stage: 'quick', currentYear, provider: config.provider },
      });
    } else {
      await safeRecordAiUsage({
        userId,
        feature: 'destiny',
        action: 'destiny-ziwei-report',
        provider: config.provider,
        model: config.model,
        endpoint: '/api/destiny/ziwei-report',
        usage: normalizeUsage(extractArkUsage(result.raw)),
        metadata: { stage: 'quick', currentYear, provider: config.provider },
      });
    }

    const parsed = parseJson(result.text);

    const resultSections: ZiweiLockedSections = {};
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      if (data.overviewModules) resultSections.overviewModules = data.overviewModules as never;
      if (Array.isArray(data.timeline)) resultSections.timeline = data.timeline as never;
      if (data.relations) resultSections.relations = data.relations as never;
    }
    return resultSections;
  } catch (error) {
    if (reservation) {
      await releaseAiQuota({
        reservationId: reservation.id,
        reason: '紫微快速解读调用失败',
        meterType: 'tokens',
      }).catch((releaseError) =>
        console.error('[ziwei-report] 释放快速解读额度失败:', releaseError)
      );
    }
    if (error instanceof BillingError) throw error;
    // quick 区块允许降级为空，但错误详情必须落日志，否则线上排查无迹可循
    console.warn(
      '[ziwei-report] quick stage skipped:',
      error instanceof Error ? `${error.name}: ${error.message}` : error
    );
    return {};
  }
}

// ─── 完整解读（12 宫拆两组并行）───

type PalaceGroupResult = {
  palaceAnalysis: ZiweiPalaceAnalysis[];
  module: DestinyModule | null;
};

async function generateFullSections({
  config,
  input,
  chartContext,
  currentYear,
  userId,
  billing,
}: {
  config: ModelConfig;
  input: DestinyReportRequest;
  chartContext: string;
  currentYear: number;
  userId: string;
  billing: ZiweiBillingContext | null;
}): Promise<ZiweiLockedSections> {
  // 12 宫解读是 full 阶段的输出主体，拆为两组并行后各组耗时近似减半；任一组失败仅影响本组输出
  const [groupA, groupB] = await Promise.all([
    generatePalaceGroup({
      config,
      input,
      chartContext,
      currentYear,
      userId,
      billing,
      palaces: PALACE_GROUP_A,
      moduleKey: 'love',
      stage: 'full:a',
    }),
    generatePalaceGroup({
      config,
      input,
      chartContext,
      currentYear,
      userId,
      billing,
      palaces: PALACE_GROUP_B,
      moduleKey: 'health',
      stage: 'full:b',
    }),
  ]);

  // 按 canonical 顺序排序，保证并行合并后的宫位顺序稳定（前端以 palaceAnalysis[0] 作为初始选中宫位）
  const orderIndex = (label: string) => {
    const idx = PALACE_CANONICAL_ORDER.indexOf(label);
    return idx === -1 ? PALACE_CANONICAL_ORDER.length : idx;
  };
  const palaceAnalysis = [...groupA.palaceAnalysis, ...groupB.palaceAnalysis].sort(
    (a, b) => orderIndex(a.label) - orderIndex(b.label)
  );

  const resultSections: ZiweiLockedSections = {};
  // 不满 12 项时不产出 palaceAnalysis：emitSections 现有检查会跳过该区块，
  // 但另一组成功生成的 love/health 不受影响
  if (palaceAnalysis.length >= 12) resultSections.palaceAnalysis = palaceAnalysis;
  if (groupA.module) resultSections.love = groupA.module;
  if (groupB.module) resultSections.health = groupB.module;
  return resultSections;
}

async function generatePalaceGroup({
  config,
  input,
  chartContext,
  currentYear,
  userId,
  billing,
  palaces,
  moduleKey,
  stage,
}: {
  config: ModelConfig;
  input: DestinyReportRequest;
  chartContext: string;
  currentYear: number;
  userId: string;
  billing: ZiweiBillingContext | null;
  palaces: readonly string[];
  moduleKey: 'love' | 'health';
  stage: string;
}): Promise<PalaceGroupResult> {
  const messages = [
    { role: 'system' as const, content: buildPalaceGroupSystemPrompt(palaces, moduleKey) },
    { role: 'user' as const, content: buildUserPrompt(input, chartContext) },
  ];
  const requestId = billing ? `${billing.requestId}:${stage}` : null;
  let reservation: { id: string } | null = null;
  let inputUnits = 0;
  let outputLimit = GROUP_MAX_TOKENS;

  try {
    if (billing && requestId) {
      const quota = await reserveChatQuota({
        userId: billing.userId,
        requestId,
        feature: 'destiny',
        provider: config.provider,
        model: config.model,
        messages,
        maxOutputTokens: GROUP_MAX_TOKENS,
        metadata: { reportType: 'ziwei', stage, currentYear },
      });
      reservation = quota.reservation;
      inputUnits = quota.inputUnits;
      outputLimit = quota.outputLimit;
    }
    const result = await callModel({
      config,
      messages,
      maxTokens: outputLimit,
      temperature: 0.35,
      timeoutMs: GROUP_TIMEOUT_MS,
      json: { schema: { name: `ziwei_${moduleKey}_group`, schema: buildGroupSchema(moduleKey) } },
    });

    if (reservation && requestId) {
      await settleAiQuota({
        reservationId: reservation.id,
        requestId,
        feature: 'destiny',
        action: 'destiny-ziwei-report',
        provider: config.provider,
        model: config.model,
        endpoint: '/api/destiny/ziwei-report',
        measurement: createTokenMeasurement(
          extractArkUsage(result.raw),
          inputUnits + estimateOutputTokens(result.text)
        ),
        metadata: { reportType: 'ziwei', stage, currentYear, provider: config.provider },
      });
    } else {
      await safeRecordAiUsage({
        userId,
        feature: 'destiny',
        action: 'destiny-ziwei-report',
        provider: config.provider,
        model: config.model,
        endpoint: '/api/destiny/ziwei-report',
        usage: normalizeUsage(extractArkUsage(result.raw)),
        metadata: { stage, currentYear, provider: config.provider },
      });
    }

    const parsed = parseJson(result.text);

    let palaceAnalysis: ZiweiPalaceAnalysis[] = [];
    let module: DestinyModule | null = null;
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      if (Array.isArray(data.palaceAnalysis)) {
        palaceAnalysis = data.palaceAnalysis as ZiweiPalaceAnalysis[];
      }
      if (data[moduleKey]) module = data[moduleKey] as DestinyModule;
    }
    return { palaceAnalysis, module };
  } catch (error) {
    if (reservation) {
      await releaseAiQuota({
        reservationId: reservation.id,
        reason: `紫微宫位解读（${stage}）调用失败`,
        meterType: 'tokens',
      }).catch((releaseError) =>
        console.error(`[ziwei-report] 释放宫位解读额度失败（${stage}）:`, releaseError)
      );
    }
    if (error instanceof BillingError) throw error;
    // 单组失败降级为空：合并后 palaceAnalysis 不满 12 项会被 emitSections 跳过，
    // 另一组成功生成的 love/health 不受影响
    console.warn(
      `[ziwei-report] palace group ${stage} skipped:`,
      error instanceof Error ? `${error.name}: ${error.message}` : error
    );
    return { palaceAnalysis: [], module: null };
  }
}

// ─── 提示词构建 ───

function buildUserPrompt(input: DestinyReportRequest, chartContext: string): string {
  const location =
    input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat}, ${input.location.lon}）`
      : input.location.name;

  return [
    `姓名：${input.name}`,
    `性别：${input.gender === 'female' ? '女' : '男'}`,
    `出生日期：${input.birthDate.year}-${input.birthDate.month}-${input.birthDate.day}`,
    `出生时间：${input.birthTime.hour}:${input.birthTime.minute}`,
    `出生地：${location}`,
    '',
    chartContext,
  ].join('\n');
}

/** 本地生成用户名片（纯格式化信息，无需消耗 AI 输出预算） */
function buildLocalProfileOverview(
  input: DestinyReportRequest,
  chartData: ZiweiChartData
): DestinyReport['profile'] {
  return {
    name: input.name,
    genderLabel: input.gender === 'female' ? '坤造（女命）' : '乾造（男命）',
    birthText: `${input.birthDate.year}年${input.birthDate.month}月${input.birthDate.day}日 ${input.birthTime.hour}:${input.birthTime.minute}`,
    lunarText: chartData.lunarDate,
    locationText: input.location.name,
  };
}

function buildQuickSystemPrompt(currentYear: number): string {
  return `你是专业的紫微斗数命理分析师。你需要基于用户提供的精确星盘数据进行解读。
星盘数据已由本地算法精确计算完成，你只需负责解读，不要编造或修改星曜位置。

请输出首屏可展示的 3 个区块：
1. overviewModules：三大维度（personality 性格/career 事业/wealth 财运）
   - title：对应宫位的星曜组合描述，如"命宫武曲贪狼同守"、"官禄宫紫微七杀坐守"、"财帛宫廉贞破军坐守"，不要写模块名称
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议
2. timeline：未来 3 年流年运势（${currentYear}, ${currentYear + 1}, ${currentYear + 2}），每项含 year/title/summary/detail(opportunities/risks/actions)
3. relations：六亲关系总览，含 summary/opportunities/risks/actions

要求：
- 所有解读必须基于提供的星盘数据，不要凭空编造
- 语气稳健，不夸大确定性
- summary 每项 50-90 字，advantages/suggestions 每条 18 字以内
- 使用中文简体
- 严格只返回 JSON 对象`.trim();
}

function buildPalaceGroupSystemPrompt(
  palaces: readonly string[],
  moduleKey: 'love' | 'health'
): string {
  const moduleSpec =
    moduleKey === 'love'
      ? `2. love：感情婚姻模块
   - title：对应宫位的星曜组合描述，如"夫妻宫天府坐守"，不要写"感情婚姻运势解析"等模块名称
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议`
      : `2. health：健康运势模块
   - title：对应宫位的星曜组合描述，如"疾厄宫廉贞破军能量"，不要写"整体健康运势提示"等模块名称
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议`;

  return `你是专业的紫微斗数命理分析师。你需要基于用户提供的精确星盘数据进行深度解读。

请输出以下内容：
1. palaceAnalysis：以下 ${palaces.length} 个宫位的 AI 解读（必须 ${palaces.length} 项，对应 ${palaces.join('/')}）
   每项含：key（唯一标识）、label（宫位名）、summary（结合星曜组合的解读，50-90字）、suggestions（2-4 条可执行的行动建议，每条 18 字以内）
${moduleSpec}

要求：
- 必须严格基于提供的星盘数据进行解读，不要编造
- 关注宫位间的关系（三方四正、对宫影响）
- 关注生年四化在各宫位的能量分布
- 对于空宫，说明需借对宫星曜参考
- 语气稳健，不夸大确定性，不使用"改命""转运""消灾""化解"等词汇
- 使用中文简体
- 严格只返回 JSON 对象`.trim();
}

// ─── 构建最终报告 ───

function buildFinalReport(
  input: DestinyReportRequest,
  chartData: ZiweiChartData,
  lockedSections: ZiweiLockedSections,
  currentYear: number
): DestinyReport {
  const profile = lockedSections.profileOverview ?? buildLocalProfileOverview(input, chartData);

  const modules = lockedSections.overviewModules ?? {
    personality: { title: '性格特质', summary: '', advantages: [], suggestions: [] },
    career: { title: '事业发展', summary: '', advantages: [], suggestions: [] },
    wealth: { title: '财运运势', summary: '', advantages: [], suggestions: [] },
  };

  const defaultModule = { title: '', summary: '', advantages: [], suggestions: [] };

  return {
    profile: profile as DestinyReport['profile'],
    coreTone: { tag: chartData.fiveElementsClass, chartSummary: '', headline: '', description: '' },
    pillars: [],
    tenGods: [],
    elements: [],
    balanceInsight: { title: '', value: '', tooltip: '' },
    patternHighlights: [],
    modules: {
      personality: modules.personality ?? defaultModule,
      career: modules.career ?? defaultModule,
      love: lockedSections.love ?? defaultModule,
      wealth: modules.wealth ?? defaultModule,
      health: lockedSections.health ?? defaultModule,
    },
    timeline: lockedSections.timeline ?? [],
  };
}

// ─── 工具函数 ───

function parseJson(text: string): unknown {
  const source = extractJsonBlock(text).trim();
  try {
    return JSON.parse(source);
  } catch {
    const match = source.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
    }
    throw new SyntaxError('JSON 解析失败');
  }
}

function mapStreamError(error: unknown): string {
  if (error instanceof ModelUpstreamError) return error.message;
  if (error instanceof Error && error.name === 'AbortError') return '测算超时，请稍后重试';
  return error instanceof Error ? error.message : '测算失败，请稍后重试';
}
