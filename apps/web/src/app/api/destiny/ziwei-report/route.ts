import { NextResponse } from 'next/server';
import { z } from 'zod';
import type {
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
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';

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

const QUICK_TIMEOUT_MS = 40000;
const REPORT_TIMEOUT_MS = 180000;
const QUICK_MAX_TOKENS = 4000;
const FULL_MAX_TOKENS = 6000;

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

// ─── JSON Schema（豆包结构化输出）───

const QUICK_SCHEMA = {
  type: 'object',
  properties: {
    profileOverview: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        genderLabel: { type: 'string' },
        birthText: { type: 'string' },
        lunarText: { type: 'string' },
        locationText: { type: 'string' },
      },
      required: ['name', 'genderLabel', 'birthText', 'lunarText', 'locationText'],
      additionalProperties: false,
    },
    overviewModules: {
      type: 'object',
      properties: {
        personality: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            advantages: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'summary', 'advantages', 'suggestions'],
          additionalProperties: false,
        },
        career: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            advantages: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'summary', 'advantages', 'suggestions'],
          additionalProperties: false,
        },
        wealth: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            summary: { type: 'string' },
            advantages: { type: 'array', items: { type: 'string' } },
            suggestions: { type: 'array', items: { type: 'string' } },
          },
          required: ['title', 'summary', 'advantages', 'suggestions'],
          additionalProperties: false,
        },
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

const FULL_SCHEMA = {
  type: 'object',
  properties: {
    palaceAnalysis: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          key: { type: 'string' },
          label: { type: 'string' },
          summary: { type: 'string' },
          suggestions: { type: 'array', items: { type: 'string' } },
        },
        required: ['key', 'label', 'summary', 'suggestions'],
        additionalProperties: false,
      },
    },
    love: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        advantages: { type: 'array', items: { type: 'string' } },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'advantages', 'suggestions'],
      additionalProperties: false,
    },
    health: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        advantages: { type: 'array', items: { type: 'string' } },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'summary', 'advantages', 'suggestions'],
      additionalProperties: false,
    },
  },
  required: ['palaceAnalysis', 'love', 'health'],
  additionalProperties: false,
} as const;

// ─── 主入口 ───

export async function POST(req: Request) {
  try {
    const userId = await getOptionalUserId(req);
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

    // Step 0: 本地排盘
    let chartData: ZiweiChartData;
    try {
      chartData = computeZiweiChart(input);
    } catch (chartError) {
      return NextResponse.json(
        { error: `排盘计算失败：${chartError instanceof Error ? chartError.message : '未知错误'}` },
        { status: 422 }
      );
    }

    const stream = createZiweiStream({ input, currentYear, config, userId, chartData });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : '测算失败，请稍后重试' },
      { status: 500 }
    );
  }
}

// ─── SSE 流 ───

function createZiweiStream({
  input,
  currentYear,
  config,
  userId,
  chartData,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  config: ModelConfig;
  userId: string | null;
  chartData: ZiweiChartData;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emittedSections = new Set<ZiweiSectionKey>();
      const lockedSections: ZiweiLockedSections = {};

      const send = (event: ZiweiStreamEvent) => {
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

        // 构建 AI 提示词上下文
        const chartContext = buildZiweiPromptContext(chartData);

        // 第一阶段：快速区块（profile + modules + timeline + relations）
        send({ type: 'status', status: 'analyzing' });

        const quickResult = await generateQuickSections({
          config,
          input,
          chartContext,
          currentYear,
          userId,
        });

        emitSections({ sections: quickResult, emittedSections, lockedSections, send });

        // 第二阶段：宫位详解 + 感情/健康模块
        const fullResult = await generateFullSections({
          config,
          input,
          chartContext,
          currentYear,
          userId,
        });

        emitSections({ sections: fullResult, emittedSections, lockedSections, send });

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

    if (sectionKey === 'palaceAnalysis' && (!Array.isArray(payload) || payload.length < 12)) continue;
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
}: {
  config: ModelConfig;
  input: DestinyReportRequest;
  chartContext: string;
  currentYear: number;
  userId: string | null;
}): Promise<ZiweiLockedSections> {
  try {
    const result = await callModel({
      config,
      messages: [
        { role: 'system', content: buildQuickSystemPrompt(currentYear) },
        { role: 'user', content: buildUserPrompt(input, chartContext) },
      ],
      maxTokens: QUICK_MAX_TOKENS,
      temperature: 0.25,
      timeoutMs: QUICK_TIMEOUT_MS,
      json: { schema: { name: 'ziwei_quick', schema: QUICK_SCHEMA } },
    });

    const parsed = parseJson(result.text);

    if (userId) {
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

    const resultSections: ZiweiLockedSections = {};
    if (parsed && typeof parsed === 'object') {
      const data = parsed as Record<string, unknown>;
      if (data.profileOverview) resultSections.profileOverview = data.profileOverview as never;
      if (data.overviewModules) resultSections.overviewModules = data.overviewModules as never;
      if (Array.isArray(data.timeline)) resultSections.timeline = data.timeline as never;
      if (data.relations) resultSections.relations = data.relations as never;
    }
    return resultSections;
  } catch {
    console.warn('[ziwei-report] quick stage skipped');
    return {};
  }
}

// ─── 完整解读 ───

async function generateFullSections({
  config,
  input,
  chartContext,
  currentYear,
  userId,
}: {
  config: ModelConfig;
  input: DestinyReportRequest;
  chartContext: string;
  currentYear: number;
  userId: string | null;
}): Promise<ZiweiLockedSections> {
  const result = await callModel({
    config,
    messages: [
      { role: 'system', content: buildFullSystemPrompt(currentYear) },
      { role: 'user', content: buildUserPrompt(input, chartContext) },
    ],
    maxTokens: FULL_MAX_TOKENS,
    temperature: 0.35,
    timeoutMs: REPORT_TIMEOUT_MS,
    json: { schema: { name: 'ziwei_full', schema: FULL_SCHEMA } },
  });

  const parsed = parseJson(result.text);

  if (userId) {
    await safeRecordAiUsage({
      userId,
      feature: 'destiny',
      action: 'destiny-ziwei-report',
      provider: config.provider,
      model: config.model,
      endpoint: '/api/destiny/ziwei-report',
      usage: normalizeUsage(extractArkUsage(result.raw)),
      metadata: { stage: 'full', currentYear, provider: config.provider },
    });
  }

  const resultSections: ZiweiLockedSections = {};
  if (parsed && typeof parsed === 'object') {
    const data = parsed as Record<string, unknown>;
    if (Array.isArray(data.palaceAnalysis)) {
      resultSections.palaceAnalysis = data.palaceAnalysis as ZiweiPalaceAnalysis[];
    }
    if (data.love) resultSections.love = data.love as never;
    if (data.health) resultSections.health = data.health as never;
  }
  return resultSections;
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

function buildQuickSystemPrompt(currentYear: number): string {
  return `你是专业的紫微斗数命理分析师。你需要基于用户提供的精确星盘数据进行解读。
星盘数据已由本地算法精确计算完成，你只需负责解读，不要编造或修改星曜位置。

请输出首屏可展示的 4 个区块：
1. profileOverview：用户名片信息（name, genderLabel, birthText, lunarText, locationText）
2. overviewModules：三大维度（personality 性格/career 事业/wealth 财运）
   - title：对应宫位的星曜组合描述，如"命宫武曲贪狼同守"、"官禄宫紫微七杀坐守"、"财帛宫廉贞破军坐守"，不要写模块名称
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议
3. timeline：未来 3 年流年运势（${currentYear}, ${currentYear + 1}, ${currentYear + 2}），每项含 year/title/summary/detail(opportunities/risks/actions)
4. relations：六亲关系总览，含 summary/opportunities/risks/actions

要求：
- 所有解读必须基于提供的星盘数据，不要凭空编造
- 语气稳健，不夸大确定性
- summary 每项 50-90 字，advantages/suggestions 每条 18 字以内
- 使用中文简体
- 严格只返回 JSON 对象`.trim();
}

function buildFullSystemPrompt(currentYear: number): string {
  return `你是专业的紫微斗数命理分析师。你需要基于用户提供的精确星盘数据进行深度解读。

请输出以下内容：
1. palaceAnalysis：12 宫位的 AI 解读（必须 12 项，对应 父母宫/福德宫/田宅宫/官禄宫/命宫/兄弟宫/奴仆宫/夫妻宫/迁移宫/子女宫/财帛宫/疾厄宫）
   每项含：key（唯一标识）、label（宫位名）、summary（结合星曜组合的解读，50-90字）、suggestions（2-4 条可执行的行动建议，每条 18 字以内）
2. love：感情婚姻模块
   - title：对应宫位的星曜组合描述，如"夫妻宫天府坐守"，不要写"感情婚姻运势解析"等模块名称
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议
3. health：健康运势模块
   - title：对应宫位的星曜组合描述，如"疾厄宫廉贞破军能量"，不要写"整体健康运势提示"等模块名称
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议

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
  const profile = lockedSections.profileOverview ?? {
    name: input.name,
    genderLabel: input.gender === 'female' ? '坤造（女命）' : '乾造（男命）',
    birthText: `${input.birthDate.year}年${input.birthDate.month}月${input.birthDate.day}日 ${input.birthTime.hour}:${input.birthTime.minute}`,
    lunarText: chartData.lunarDate,
    locationText: input.location.name,
  };

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
