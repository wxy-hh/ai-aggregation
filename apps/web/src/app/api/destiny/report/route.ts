import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  buildBaziPromptPayload,
  computeBaziChart,
  resolveModelConfig,
  streamModel,
  ModelConfigError,
  ModelUpstreamError,
  type ModelConfig,
} from '@repo/shared';
import type {
  BaziLockedSections,
  BaziSectionKey,
  BaziSectionPayloadMap,
  BaziStreamEvent,
  DestinyReport,
  DestinyReportRequest,
  DestinyStreamStatus,
} from '@/app/destiny/_components/types';
import {
  BAZI_MODEL_SECTION_ORDER,
  PRIMARY_SECTION_KEYS,
  buildMissingRecoverableSections,
  parseBaziSectionPayload,
} from '../_lib/bazi-section-payload';
import { normalizeDestinyReport } from '../_lib/report-normalizer';
import { BAZI_REPORT_JSON_SCHEMA } from '../_lib/bazi-json-schema';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RequestSchema = z.object({
  name: z.string().trim().min(1, '姓名不能为空'),
  gender: z.enum(['male', 'female']),
  calendarType: z.enum(['lunar', 'solar']).default('lunar'), // 默认农历
  birthDate: z.object({
    year: z.number().int().min(1900).max(2100),
    month: z.number().int().min(1).max(12),
    isLeapMonth: z.boolean().optional(),
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

const REPORT_TIMEOUT_MS = 300000;
const REPORT_MAX_OUTPUT_TOKENS = 24000;

class UpstreamModelError extends Error {
  status: number;
  details?: string;

  constructor(message: string, status = 502, details?: string) {
    super(message);
    this.name = 'UpstreamModelError';
    this.status = status;
    this.details = details;
  }
}

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

    const input: DestinyReportRequest = {
      name: parsed.data.name,
      gender: parsed.data.gender,
      calendarType: parsed.data.calendarType,
      birthDate: parsed.data.birthDate,
      birthTime: parsed.data.birthTime,
      location: parsed.data.location,
    };
    const currentYear = new Date().getFullYear();
    const stream = createBaziStream({
      input,
      currentYear,
      config,
      userId,
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : '测算失败，请稍后重试',
      },
      { status: 500 }
    );
  }
}

function createBaziStream({
  input,
  currentYear,
  config,
  userId,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  config: ModelConfig;
  userId: string | null;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const send = (event: BaziStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: 'status', status: 'queued' });
        await streamBaziReport({
          input,
          currentYear,
          config,
          userId,
          send,
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

async function streamBaziReport({
  input,
  currentYear,
  config,
  userId,
  send,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  config: ModelConfig;
  userId: string | null;
  send: (event: BaziStreamEvent) => void;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
  let latestStatus: DestinyStreamStatus = 'queued';

  const transitionStatus = (status: DestinyStreamStatus) => {
    if (latestStatus === status) return;
    latestStatus = status;
    send({ type: 'status', status });
  };

  const emittedSections = new Set<BaziSectionKey>();
  const lockedSections: BaziLockedSections = {};
  let textBuffer = '';
  let usagePayload: unknown = null;

  try {
    const basis = computeBaziChart(input, { referenceYear: currentYear });
    const deterministicReport = normalizeDestinyReport({}, input, currentYear, { basis });
    transitionStatus('charting');
    emitLockedSection({
      sectionKey: 'baziBasis',
      payload: basis,
      emittedSections,
      lockedSections,
      send,
    });
    emitLockedSection({
      sectionKey: 'profileOverview',
      payload: deterministicReport.profile,
      emittedSections,
      lockedSections,
      send,
    });
    transitionStatus('analyzing');

    // 把累计文本解析为结构化分区并发射（流结束后调用；截断/半完整 JSON 交给后续兜底）
    const emitSectionsFromText = (rawJson: string) => {
      const trimmed = rawJson.trim();
      if (!trimmed) return;
      let fullData: Record<string, unknown>;
      try {
        fullData = JSON.parse(trimmed) as Record<string, unknown>;
      } catch {
        return;
      }
      for (const sectionKey of BAZI_MODEL_SECTION_ORDER) {
        if (emittedSections.has(sectionKey)) continue;
        const rawValue = fullData[sectionKey];
        if (rawValue == null) continue;
        const result = parseSectionPayloadSafely({
          sectionKey,
          rawPayload: JSON.stringify(rawValue),
          input,
          currentYear,
          basis,
        });
        emitLockedSection({
          sectionKey,
          payload: result,
          emittedSections,
          lockedSections,
          send,
        });
        if (sectionKey === 'timeline') {
          transitionStatus('finalizing');
        }
      }
    };

    const stream = streamModel({
      config,
      messages: [
        { role: 'system', content: buildStreamingSystemPrompt(currentYear) },
        { role: 'user', content: buildUserPrompt(input, basis) },
      ],
      temperature: 0.25,
      maxTokens: REPORT_MAX_OUTPUT_TOKENS,
      timeoutMs: REPORT_TIMEOUT_MS,
      json: { schema: { name: 'bazi_interpretation_report', schema: BAZI_REPORT_JSON_SCHEMA } },
    });

    for await (const ev of stream) {
      if (ev.type === 'text-delta') {
        textBuffer += ev.text;
      } else if (ev.type === 'done') {
        usagePayload = ev.rawUsage ?? usagePayload;
      } else if (ev.type === 'error') {
        throw new ModelUpstreamError(ev.error, 502);
      }
    }

    emitSectionsFromText(textBuffer);

    // 补充缺失的分区：先尝试恢复（recoverable section），再用算法真值兜底（primary section）

    // 先处理可恢复分区（module + timeline）
    for (const fallbackSection of buildMissingRecoverableSections(
      lockedSections,
      input,
      currentYear,
      { basis }
    )) {
      console.warn('[Destiny Report] Missing recoverable section, using fallback payload', {
        sectionKey: fallbackSection.sectionKey,
      });

      emitLockedSection({
        sectionKey: fallbackSection.sectionKey,
        payload: fallbackSection.payload,
        emittedSections,
        lockedSections,
        send,
      });
    }

    // 再处理核心分区缺失：使用算法真值兜底（不报错）
    const stillMissingPrimary = PRIMARY_SECTION_KEYS.filter(
      (sectionKey) => !lockedSections[sectionKey]
    );
    if (stillMissingPrimary.length > 0 && basis) {
      console.warn('[Destiny Report] Missing primary sections, using basis fallback', {
        sections: stillMissingPrimary,
      });
      const primaryFallback = normalizeDestinyReport({}, input, currentYear, { basis });
      for (const sectionKey of stillMissingPrimary) {
        const fallbackPayload = buildPrimaryFallbackPayload(sectionKey, primaryFallback);
        emitLockedSection({
          sectionKey,
          payload: fallbackPayload,
          emittedSections,
          lockedSections,
          send,
        });
      }
    } else if (stillMissingPrimary.length > 0) {
      // 连 basis 都没有才是真正的致命错误
      throw new UpstreamModelError(
        `模型分区输出不完整且缺少排盘依据：缺少 ${stillMissingPrimary.join('、')}，请稍后重试`,
        502
      );
    }

    transitionStatus('finalizing');
    const report = buildReportFromSections(lockedSections, input, currentYear, basis);
    send({
      type: 'complete',
      report,
    });

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'destiny',
        action: 'destiny-report',
        provider: config.provider,
        model: config.model,
        endpoint: '/api/destiny/report',
        usage: normalizeUsage(usagePayload),
        metadata: {
          stage: 'single-stream',
          currentYear,
          provider: config.provider,
          sectionCount: emittedSections.size,
        },
      });
    }
  } finally {
    clearTimeout(timeoutId);
  }
}

function emitLockedSection<K extends BaziSectionKey>({
  sectionKey,
  payload,
  emittedSections,
  lockedSections,
  send,
}: {
  sectionKey: K;
  payload: BaziSectionPayloadMap[K];
  emittedSections: Set<BaziSectionKey>;
  lockedSections: BaziLockedSections;
  send: (event: BaziStreamEvent) => void;
}) {
  emittedSections.add(sectionKey);
  (lockedSections as Record<BaziSectionKey, BaziSectionPayloadMap[BaziSectionKey]>)[sectionKey] =
    payload;
  send({
    type: 'section-final',
    sectionKey,
    payload,
  } as BaziStreamEvent);
}

function parseSectionPayloadSafely<K extends BaziSectionKey>({
  sectionKey,
  rawPayload,
  input,
  currentYear,
  basis,
}: {
  sectionKey: K;
  rawPayload: string;
  input: DestinyReportRequest;
  currentYear: number;
  basis: ReturnType<typeof computeBaziChart>;
}): BaziSectionPayloadMap[K] {
  try {
    const result = parseBaziSectionPayload({
      sectionKey,
      rawPayload,
      input,
      currentYear,
      basis,
    });

    if (result.recovery !== 'none') {
      console.warn('[Destiny Report] Section parse drift recovered', {
        sectionKey,
        excerpt: rawPayload.slice(0, 240),
      });
    }

    return result.payload;
  } catch (error) {
    console.warn('[Destiny Report] Section parse failed', {
      sectionKey,
      error: error instanceof Error ? error.message : String(error),
      excerpt: rawPayload.slice(0, 240),
    });
    throw new UpstreamModelError(`模型分区 ${sectionKey} 返回格式不完整，请重试`, 502);
  }
}

type PrimarySectionKey = (typeof PRIMARY_SECTION_KEYS)[number];

function buildPrimaryFallbackPayload(
  sectionKey: PrimarySectionKey,
  report: DestinyReport
): BaziSectionPayloadMap[PrimarySectionKey] {
  switch (sectionKey) {
    case 'profileOverview':
      return report.profile as BaziSectionPayloadMap['profileOverview'];
    case 'coreDestinyTone':
      return report.coreTone as BaziSectionPayloadMap['coreDestinyTone'];
    case 'pillars':
      return report.pillars as BaziSectionPayloadMap['pillars'];
    case 'elementsAndTenGods':
      return {
        elements: report.elements,
        tenGods: report.tenGods,
        balanceInsight: report.balanceInsight,
        patternHighlights: report.patternHighlights,
        lifeDimensions: report.lifeDimensions,
        lifeDimensionHighlights: report.lifeDimensionHighlights,
        tenGodDomains: report.tenGodDomains,
      } as BaziSectionPayloadMap['elementsAndTenGods'];
  }
}

function buildReportFromSections(
  sections: BaziLockedSections,
  input: DestinyReportRequest,
  currentYear: number,
  basis: ReturnType<typeof computeBaziChart>
): DestinyReport {
  const mergedBasis = basis
    ? {
      ...basis,
      decadeFortuneInsights:
        sections.decadeFortuneInsights ?? basis.decadeFortuneInsights,
    }
    : sections.baziBasis;

  return normalizeDestinyReport(
    {
      profile: sections.profileOverview,
      coreTone: sections.coreDestinyTone,
      pillars: sections.pillars,
      elements: sections.elementsAndTenGods?.elements,
      tenGods: sections.elementsAndTenGods?.tenGods,
      lifeDimensions: sections.elementsAndTenGods?.lifeDimensions,
      lifeDimensionHighlights: sections.elementsAndTenGods?.lifeDimensionHighlights,
      tenGodDomains: sections.elementsAndTenGods?.tenGodDomains,
      balanceInsight: sections.elementsAndTenGods?.balanceInsight,
      patternHighlights: sections.elementsAndTenGods?.patternHighlights,
      modules: {
        personality: sections.modulePersonality,
        career: sections.moduleCareer,
        love: sections.moduleLove,
        wealth: sections.moduleWealth,
        health: sections.moduleHealth,
      },
      timeline: sections.timeline,
    },
    input,
    currentYear,
    { basis: mergedBasis }
  );
}

function buildUserPrompt(
  input: DestinyReportRequest,
  basis: ReturnType<typeof computeBaziChart>
): string {
  const location =
    input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat}, ${input.location.lon}）`
      : input.location.name;
  const { deterministicFacts, litePromptPayload } = buildBaziPromptPayload(basis);

  return [
    '请只基于以下已经完成的本地排盘真值撰写命理解读，不要重算、不要改写任何干支、五行、十神、节气、起运或流年年份。',
    '用户原始信息（出生日期与出生时间均为农历口径，仅作背景）：',
    `姓名：${input.name}`,
    `性别：${input.gender === 'female' ? '女' : '男'}`,
    `出生日期：${input.birthDate.year}-${input.birthDate.month}-${input.birthDate.day}`,
    `出生时间：${input.birthTime.hour}:${input.birthTime.minute}`,
    `出生地：${location}`,
    '',
    'deterministicFacts（必须严格沿用）：',
    JSON.stringify(deterministicFacts, null, 2),
    '',
    'litePromptPayload（便于快速把握主轴）：',
    JSON.stringify(litePromptPayload, null, 2),
  ].join('\n');
}

function buildStreamingSystemPrompt(currentYear: number): string {
  return `
你是深耕传统子平命理的文化学者，精通《渊海子平》《滴天髓》《穷通宝鉴》等经典，擅长以”以日为主、以月为提纲”的原则进行八字命理分析，熟练运用五行生克、十神格局、调候喜忌等理论。

【合规声明】你提供的内容都是基于中国传统民俗文化的娱乐化解读，不得出现封建迷信表述，不得提及”改运””化解””注定””算命””占卜”等词汇，不得预测具体年份的事件，不制造焦虑，所有分析均为娱乐参考。

你拿到的排盘、五行、十神、节气、起运与流年数据都已经由本地算法确定，你只能做解释，不能修改任何事实值。分析思路必须遵循以下原则顺序：
1. 先看月令调候：elementStats 中 seasonalBonus 最高的即为月令当旺五行，结合日主五行判断是否需要调候
2. 再看十神格局：根据 tenGodStats 中权重最高的十神结合日主关系判断主导格局
3. 综合五行生克与藏干关系，确保解释有理论依据
4. 纳音辅助：pillars 中每柱的 sound 字段为纳音（如"海中金""炉中火"），可用于辅助判断命局层次与五行气质
5. 节气定位：solarTerms 提供了命主出生时的节气上下文（前一个、当前、下一个节气），可用于辅助判断月令深浅与五行进退

必须严格输出一个包含以下 10 个属性的完整 JSON 对象，禁止输出任何额外文字、markdown、解释或思考过程：

{
  “coreDestinyTone”: {“headline”:”string”,”description”:”string”},
  “pillars”: [{“label”:”string”,”tooltip”:”string”}],
  “elementsAndTenGods”: {
    “lifeDimensions”:[...],
    “lifeDimensionHighlights”:{...},
    “tenGodDomains”:[...],
    “balanceInsight”:{...},
    “patternHighlights”:[...]
  },
  “decadeFortuneInsights”: [{
    “name”:”string”,
    “summary”:”string”,
    “stemPhase”:”string”,
    “branchPhase”:”string”,
    “natalNotes”:[“string”]
  }],
  “modulePersonality”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleCareer”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleLove”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleWealth”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleHealth”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “timeline”: [{“title”:”string”,”summary”:”string”,”detail”:{“opportunities”:[“string”],”risks”:[“string”],”actions”:[“string”]}}]
}

要求：
1. coreDestinyTone 只写 headline 和 description。headline 必须为**零基础可读的大白话**（10-18 字），直接说「你」的整体气质或做事风格，例如「内敛好学，适合稳扎稳打」「表达力强，宜先立口碑再扩张」；禁止把 headline 写成格局术语串（如印食相生、寒金、清透、七杀格等）。专业格局名若有，放在 description 第一句括号内简要带过。description 55-90 个中文字符，2 句内，第二句必须落到现实生活场景。
2. pillars 必须 4 项，label 依次固定为年柱/月柱/日柱/时柱。tooltip 60-120 个中文字符，固定写成 2-3 句：第一句解释这根柱子代表什么；第二句结合该柱的干支、纳音（sound 字段）与藏干（hiddenStems 字段）分析五行十神重心，明确写"这意味着你……"；如有必要可加第三句点出该柱与月令节气的关系。四根柱子的解读应体现不同侧重点，避免四句结构雷同。
3. elementsAndTenGods 不要输出任何新的数值事实，只能围绕已给出的数值做解释。lifeDimensions 返回 5 项，key 固定 career/wealth/health/love/wisdom；每项除 value 外必须输出 summary（18-32 字），用大白话说明该维在用户命局中的现实倾向，禁止写「事业指……」这类定义式解释。tenGodDomains 返回 5 项，key 固定 self/expression/wealth/order/resource。每个 domain 的 positive 和 negative 各写 1 句直接针对用户的个性化描述（15-35 字）：positive 写该域在命局中的优势表现，negative 写需注意的倾向。不写领域定义式文案。
4. lifeDimensionHighlights 的 strength 和 caution 各 1 句，28-60 个中文字符，说人话，不堆术语。
5. balanceInsight 用一句短标题 + 当前更显的五行 + 45-90 个中文字符的解释，重点讲现实做事风格。注意：必须结合月令五行（seasonalBonus 最高的元素）与日主的生克关系来分析，不要只堆数值或套话。
6. patternHighlights 返回 2-4 项，用大白话解释已给出的术语或组合，不要虚构新的命理组合，每项要具体对应命盘特征。
7. decadeFortuneInsights 必须覆盖 litePromptPayload.decadeFortunes 中的每一步大运（条数一致，name 与干支名完全一致）。你只写可读文案，不要输出十神字段（stemTenGod/branchMainTenGod 由系统根据排盘补齐）。针对**该命主本人**个性化撰写，必须引用其日主、四柱、十神重心、五行强弱与当步大运干支的合冲关系；每一步的 summary/stemPhase/branchPhase 必须彼此不同，禁止在不同大运间复用相同句式和套话（如「见好就收」「忌逞强单打」「宜建设少硬扛」等）。字段要求：
   - summary：45-75 字，用「你」称呼，说明这十年整体和你的人生主题（事业/感情/财务/健康等）有什么关系；
   - stemPhase：14-28 字，前五年外在行动建议，紧扣该步天干主题；
   - branchPhase：14-28 字，后五年内在重心，紧扣该步地支藏干主题；
   - natalNotes：0-2 条，每条 12-22 字，仅当 litePromptPayload 中该步大运的 natalNotes 非空时，将其改写成更口语的一句话；无互动则返回空数组。
8. 五大模块：
   - title：对应宫位的星曜组合描述，如"命宫武曲贪狼同守"、"官禄宫紫微七杀坐守"，不要写模块名称（如"性格特质"、"事业发展"）
   - summary：50-90 字核心解读
   - advantages：1 条优势
   - suggestions：1 条建议
   每条 18 字以内，必须结合命盘格局、五行强弱或十神重心给出个性化解读，避免千篇一律的通用建议。
9. timeline 必须返回 3 项，分别对应 ${currentYear}、${currentYear + 1}、${currentYear + 2}。每项必须包含 year 字段（数值年份）。标题、摘要和 detail 必须结合 litePromptPayload 中的 decadeFortunes（十年大运）与 annualCycles（流年岁运）来分析：先说明当前所在大运的干支与阶段特征，再结合流年干支判断该年的放大或缓冲效应，给出具体趋势判断。可与 decadeFortuneInsights 中当前大运的解读呼应，但不要整段复制。
10. 语气稳健、具体、克制，不夸大确定性，不要许愿式话术。整体输出要求个性化，每个模块都应体现命盘独特性，避免模板化表述。
`.trim();
}

function mapStreamError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '测算超时，请稍后重试';
  }
  if (error instanceof ModelUpstreamError) {
    return error.message;
  }
  if (error instanceof z.ZodError) {
    return '模型返回格式不合法，请稍后重试';
  }
  if (error instanceof SyntaxError) {
    return '模型返回内容不可解析，请稍后重试';
  }
  if (error instanceof UpstreamModelError) {
    return error.message;
  }
  return error instanceof Error ? error.message : '测算失败，请稍后重试';
}
