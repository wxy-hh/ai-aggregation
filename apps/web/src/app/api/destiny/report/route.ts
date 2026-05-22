import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildBaziPromptPayload, computeBaziChart } from '@repo/shared';
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
});

const ARK_MODEL = 'doubao-seed-2-0-lite-260428';
const REPORT_TIMEOUT_MS = 300000;
const REPORT_MAX_OUTPUT_TOKENS = 6200;

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

    const arkApiKey = process.env.ARK_API_KEY;
    const arkBaseUrl = process.env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3';
    if (!arkApiKey) {
      return NextResponse.json({ error: 'Missing ARK_API_KEY' }, { status: 500 });
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
      arkApiKey,
      arkBaseUrl,
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
  arkApiKey,
  arkBaseUrl,
  userId,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  arkApiKey: string;
  arkBaseUrl: string;
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
          arkApiKey,
          arkBaseUrl,
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
  arkApiKey,
  arkBaseUrl,
  userId,
  send,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  arkApiKey: string;
  arkBaseUrl: string;
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
  let eventBuffer = '';
  let responseId: string | null = null;
  let usagePayload: unknown = null;
  let incompleteReason: string | null = null;

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

    const response = await fetch(`${arkBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        input: [
          { role: 'system', content: buildStreamingSystemPrompt(currentYear) },
          { role: 'user', content: buildUserPrompt(input, basis) },
        ],
        stream: true,
        temperature: 0.25,
        max_output_tokens: REPORT_MAX_OUTPUT_TOKENS,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'bazi_interpretation_report',
            schema: BAZI_REPORT_JSON_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new UpstreamModelError(
        mapArkError(response.status),
        response.status,
        text.slice(0, 400)
      );
    }

    if (!response.body) {
      throw new UpstreamModelError('模型流式响应为空，请稍后重试', 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const processEvent = (event: unknown) => {
      const textDelta = extractArkTextDelta(event);
      if (textDelta) {
        textBuffer += textDelta;
      }

      const eventType = getArkEventType(event);
      if (eventType === 'response.completed' || eventType === 'response.incomplete') {
        const responseObject = getArkResponseObject(event);
        responseId = responseId ?? (typeof responseObject?.id === 'string' ? responseObject.id : null);
        usagePayload = usagePayload ?? responseObject?.usage ?? null;

        if (eventType === 'response.incomplete') {
          const reason = getIncompleteReason(responseObject);
          incompleteReason = reason ?? 'unknown';
        }

        let rawJson = textBuffer.trim();
        if (!rawJson && eventType === 'response.completed') {
          const fallbackText = extractCompletedOutputText(responseObject);
          if (fallbackText) {
            rawJson = fallbackText;
          }
        }

        if (rawJson) {
          try {
            const fullData = JSON.parse(rawJson);
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
          } catch {
            // 等待 stream 结束后的 fallback 逻辑
          }
        }
      }

      if (eventType === 'response.failed' || eventType === 'error') {
        throw new UpstreamModelError(getArkEventErrorMessage(event), 502);
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        eventBuffer += decoder.decode();
        break;
      }

      eventBuffer += decoder.decode(value, { stream: true });
      let separatorIndex = eventBuffer.indexOf('\n\n');
      while (separatorIndex !== -1) {
        const chunk = eventBuffer.slice(0, separatorIndex);
        eventBuffer = eventBuffer.slice(separatorIndex + 2);
        const event = parseArkSseChunk(chunk);
        if (event !== null) {
          processEvent(event);
        }
        separatorIndex = eventBuffer.indexOf('\n\n');
      }
    }

    if (eventBuffer.trim()) {
      const trailingEvent = parseArkSseChunk(eventBuffer);
      if (trailingEvent !== null) {
        processEvent(trailingEvent);
      }
    }

    if (incompleteReason === 'length') {
      console.warn('[Destiny Report] AI output was truncated (length limit), using available data with fallbacks');
    }

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
        provider: 'doubao',
        model: ARK_MODEL,
        endpoint: '/api/destiny/report',
        usage: normalizeUsage(usagePayload),
        metadata: {
          stage: 'single-stream',
          currentYear,
          responseId,
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
    { basis }
  );
}

function parseArkSseChunk(chunk: string): unknown | null {
  const data = chunk
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('\n')
    .trim();

  if (!data || data === '[DONE]') return null;

  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

function extractCompletedOutputText(responseObject: Record<string, unknown> | null): string {
  if (!responseObject) return '';
  const output = responseObject.output;
  if (!Array.isArray(output)) return '';
  for (const item of output) {
    if (
      item &&
      typeof item === 'object' &&
      (item as Record<string, unknown>).type === 'output_text'
    ) {
      const text = (item as Record<string, unknown>).text;
      if (typeof text === 'string') return text;
    }
  }
  return '';
}

function extractArkTextDelta(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const payload = event as Record<string, unknown>;
  if (payload.type === 'response.output_text.delta' && typeof payload.delta === 'string') {
    return payload.delta;
  }
  return '';
}

function getArkEventType(event: unknown): string {
  if (!event || typeof event !== 'object') return '';
  const payload = event as Record<string, unknown>;
  return typeof payload.type === 'string' ? payload.type : '';
}

function getArkResponseObject(event: unknown): Record<string, unknown> | null {
  if (!event || typeof event !== 'object') return null;
  const response = (event as Record<string, unknown>).response;
  return response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
}

function getIncompleteReason(responseObject: Record<string, unknown> | null) {
  if (!responseObject) return null;
  const details = responseObject.incomplete_details;
  if (!details || typeof details !== 'object') return null;
  return typeof (details as Record<string, unknown>).reason === 'string'
    ? ((details as Record<string, unknown>).reason as string)
    : null;
}

function getArkEventErrorMessage(event: unknown): string {
  if (!event || typeof event !== 'object') return '模型流式输出失败，请稍后重试';
  const payload = event as Record<string, unknown>;
  const error = payload.error;
  if (
    error &&
    typeof error === 'object' &&
    typeof (error as Record<string, unknown>).message === 'string'
  ) {
    return (error as Record<string, unknown>).message as string;
  }

  const responseObject = getArkResponseObject(event);
  const responseError = responseObject?.error;
  if (
    responseError &&
    typeof responseError === 'object' &&
    typeof (responseError as Record<string, unknown>).message === 'string'
  ) {
    return (responseError as Record<string, unknown>).message as string;
  }

  return '模型流式输出失败，请稍后重试';
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

必须严格输出一个包含以下 9 个属性的完整 JSON 对象，禁止输出任何额外文字、markdown、解释或思考过程：

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
  “modulePersonality”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleCareer”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleLove”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleWealth”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “moduleHealth”: {“title”:”string”,”summary”:”string”,”bullets”:[“string”]},
  “timeline”: [{“title”:”string”,”summary”:”string”,”detail”:{“opportunities”:[“string”],”risks”:[“string”],”actions”:[“string”]}}]
}

要求：
1. coreDestinyTone 只写 headline 和 description。headline 8-16 个中文字符，描述命局基调，避免通用句式；description 55-90 个中文字符，2 句内，先概括格局特点再落到现实风格。
2. pillars 必须 4 项，label 依次固定为年柱/月柱/日柱/时柱。tooltip 60-120 个中文字符，固定写成 2-3 句：第一句解释这根柱子代表什么；第二句结合该柱的干支、纳音（sound 字段）与藏干（hiddenStems 字段）分析五行十神重心，明确写"这意味着你……"；如有必要可加第三句点出该柱与月令节气的关系。四根柱子的解读应体现不同侧重点，避免四句结构雷同。
3. elementsAndTenGods 不要输出任何新的数值事实，只能围绕已给出的数值做解释。lifeDimensions 返回 5 项；tenGodDomains 返回 5 项，key 固定 self/expression/wealth/order/resource。每个 domain 的 positive 和 negative 各写 1 句直接针对用户的个性化描述（15-35 字）：positive 写该域在命局中的优势表现，negative 写需注意的倾向。不写领域定义式文案。
4. lifeDimensionHighlights 的 strength 和 caution 各 1 句，28-60 个中文字符，说人话，不堆术语。
5. balanceInsight 用一句短标题 + 当前更显的五行 + 45-90 个中文字符的解释，重点讲现实做事风格。注意：必须结合月令五行（seasonalBonus 最高的元素）与日主的生克关系来分析，不要只堆数值或套话。
6. patternHighlights 返回 2-4 项，用大白话解释已给出的术语或组合，不要虚构新的命理组合，每项要具体对应命盘特征。
7. 五大模块 summary 各 50-90 字，bullets 2-4 条，每条 18 字以内，直接给建议。每个模块必须结合命盘格局、五行强弱或十神重心给出个性化解读，避免千篇一律的通用建议。
8. timeline 必须返回 3 项，分别对应 ${currentYear}、${currentYear + 1}、${currentYear + 2}。每项必须包含 year 字段（数值年份）。标题、摘要和 detail 必须结合 litePromptPayload 中的 decadeFortunes（十年大运）与 annualCycles（流年岁运）来分析：先说明当前所在大运的干支与阶段特征，再结合流年干支判断该年的放大或缓冲效应，给出具体趋势判断。
9. 语气稳健、具体、克制，不夸大确定性，不要许愿式话术。整体输出要求个性化，每个模块都应体现命盘独特性，避免模板化表述。
`.trim();
}

function mapArkError(status: number): string {
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试';
  return '模型调用失败，请稍后重试';
}

function mapStreamError(error: unknown): string {
  if (error instanceof Error && error.name === 'AbortError') {
    return '测算超时，请稍后重试';
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
