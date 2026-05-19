import { NextResponse } from 'next/server';
import { z } from 'zod';
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
  BAZI_SECTION_ORDER,
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
    transitionStatus('charting');

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
          { role: 'user', content: buildUserPrompt(input) },
        ],
        stream: true,
        temperature: 0.25,
        max_output_tokens: REPORT_MAX_OUTPUT_TOKENS,
        reasoning: { effort: 'low' },
        text: {
          format: {
            type: 'json_schema',
            name: 'bazi_full_report',
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

    const processTextBuffer = () => {
      // json_schema 模式下模型直接输出完整 JSON 对象，无需 SECTION 标签解析
    };

    const processEvent = (event: unknown) => {
      const textDelta = extractArkTextDelta(event);
      if (textDelta) {
        textBuffer += textDelta;
      }

      const eventType = getArkEventType(event);
      if (eventType === 'response.completed') {
        const responseObject = getArkResponseObject(event);
        responseId = typeof responseObject?.id === 'string' ? responseObject.id : null;
        usagePayload = responseObject?.usage ?? null;

        // 优先使用 delta 累积的 textBuffer，若为空则从 response output_text 兜底
        let rawJson = textBuffer.trim();
        if (!rawJson) {
          const fallbackText = extractCompletedOutputText(responseObject);
          if (fallbackText) {
            rawJson = fallbackText;
          }
        }

        if (rawJson) {
          try {
            const fullData = JSON.parse(rawJson);
            for (const sectionKey of BAZI_SECTION_ORDER) {
              if (emittedSections.has(sectionKey)) continue;
              const rawValue = fullData[sectionKey];
              if (rawValue == null) continue;

              const result = parseSectionPayloadSafely({
                sectionKey,
                rawPayload: JSON.stringify(rawValue),
                input,
                currentYear,
              });

              emittedSections.add(sectionKey);
              (lockedSections as Record<BaziSectionKey, BaziSectionPayloadMap[BaziSectionKey]>)[
                sectionKey
              ] = result;

              send({
                type: 'section-final',
                sectionKey,
                payload: result,
              } as BaziStreamEvent);

              if (sectionKey === 'timeline') {
                transitionStatus('finalizing');
              }
            }

            if (arePrimarySectionsReady(lockedSections)) {
              transitionStatus('analyzing');
            }
          } catch {
            // JSON 解析失败时等待 stream 结束后的 fallback 逻辑
          }
        }
      }

      if (eventType === 'response.incomplete') {
        const responseObject = getArkResponseObject(event);
        const reason = getIncompleteReason(responseObject);
        incompleteReason = reason ?? 'unknown';
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
      throw new UpstreamModelError('模型输出被截断（长度限制），请重试一次', 502);
    }

    const missingPrimarySections = PRIMARY_SECTION_KEYS.filter(
      (sectionKey) => !lockedSections[sectionKey]
    );
    if (missingPrimarySections.length > 0) {
      throw new UpstreamModelError(
        `模型分区输出不完整：缺少 ${missingPrimarySections.join('、')}，请稍后重试`,
        502
      );
    }

    for (const fallbackSection of buildMissingRecoverableSections(
      lockedSections,
      input,
      currentYear
    )) {
      emittedSections.add(fallbackSection.sectionKey);
      (lockedSections as Record<BaziSectionKey, BaziSectionPayloadMap[BaziSectionKey]>)[
        fallbackSection.sectionKey
      ] = fallbackSection.payload;

      console.warn('[Destiny Report] Missing non-core section, using fallback payload', {
        sectionKey: fallbackSection.sectionKey,
      });

      send({
        type: 'section-final',
        sectionKey: fallbackSection.sectionKey,
        payload: fallbackSection.payload,
      } as BaziStreamEvent);
    }

    transitionStatus('finalizing');
    const report = buildReportFromSections(lockedSections, input, currentYear);
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

function parseSectionPayloadSafely<K extends BaziSectionKey>({
  sectionKey,
  rawPayload,
  input,
  currentYear,
}: {
  sectionKey: K;
  rawPayload: string;
  input: DestinyReportRequest;
  currentYear: number;
}): BaziSectionPayloadMap[K] {
  try {
    const result = parseBaziSectionPayload({
      sectionKey,
      rawPayload,
      input,
      currentYear,
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

function buildReportFromSections(
  sections: BaziLockedSections,
  input: DestinyReportRequest,
  currentYear: number
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
    currentYear
  );
}

function arePrimarySectionsReady(sections: BaziLockedSections) {
  return PRIMARY_SECTION_KEYS.every((sectionKey) => Boolean(sections[sectionKey]));
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
    if (item && typeof item === 'object' && (item as Record<string, unknown>).type === 'output_text') {
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

function buildUserPrompt(input: DestinyReportRequest): string {
  const location =
    input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat}, ${input.location.lon}）`
      : input.location.name;

  return [
    '请基于以下用户信息生成完整命理报告（中文）：',
    '重要：以下出生日期与出生时间均为农历（阴历）口径，不是公历（阳历）。',
    `姓名：${input.name}`,
    `性别：${input.gender === 'female' ? '女' : '男'}`,
    `出生日期：${input.birthDate.year}-${input.birthDate.month}-${input.birthDate.day}`,
    `出生时间：${input.birthTime.hour}:${input.birthTime.minute}`,
    `出生地：${location}`,
  ].join('\n');
}

function buildStreamingSystemPrompt(currentYear: number): string {
  return `
你是专业命理分析助手。必须严格输出一个包含所有 10 个属性的完整 JSON 对象，禁止输出任何额外文字、markdown、解释或思考过程。

输出格式为单个 JSON 对象，包含以下 10 个属性：

{
  "profileOverview": {"name":"string","genderLabel":"string","birthText":"string","locationText":"string","lunarText?":"string"},
  "coreDestinyTone": {"tag":"string","chartSummary":"string","headline":"string","description":"string"},
  "pillars": [{"stem":"string","branch":"string","label":"string","element":"metal|wood|water|fire|earth","tooltip":"string"}],
  "elementsAndTenGods": {"elements":[...],"tenGods":[...],"lifeDimensions":[...],"lifeDimensionHighlights":{...},"tenGodDomains":[...],"balanceInsight":{...},"patternHighlights":[...]},
  "modulePersonality": {"title":"string","summary":"string","bullets":["string"]},
  "moduleCareer": {"title":"string","summary":"string","bullets":["string"]},
  "moduleLove": {"title":"string","summary":"string","bullets":["string"]},
  "moduleWealth": {"title":"string","summary":"string","bullets":["string"]},
  "moduleHealth": {"title":"string","summary":"string","bullets":["string"]},
  "timeline": [{"year":${currentYear},"title":"string","summary":"string","detail":{"opportunities":["string"],"risks":["string"],"actions":["string"]}}]
}

要求：
1. pillars 必须 4 项，按年柱/月柱/日柱/时柱；每项 tooltip 控制在 55-110 个中文字符，固定写成 2 句。
   第一句必须先解释“这根柱子代表什么”，优先使用下面这种句式：
   - 年柱代表祖基、早年环境和家族底色
   - 月柱代表提纲，主要看成长氛围、做事习惯和事业根基
   - 日柱代表自己和夫妻宫，主要看核心性格、自我驱动力与亲密关系反应
   - 时柱代表子女宫与晚景，主要看行动落点、后续发展方向和结果意识
   第二句再结合这个用户当前四柱、五行旺衰或十神重心，明确写“这意味着你……”或“……意味着你……”，解释对他本人现实生活的影响。
2. elements 必须包含 metal/wood/water/fire/earth 五项；tenGods 返回 4 项；lifeDimensions 返回 5 项，key 固定为 career/wealth/health/love/wisdom，对应 label 固定写成“事业”“财运”“健康”“感情”“智慧/创造”。
3. lifeDimensionHighlights 必须返回 strength 和 caution 两句，分别对应“优势点”和“规避点”，每句控制在 28-60 个中文字符，直接说人话，不要写成术语堆砌。
4. tenGodDomains 必须返回 5 项，key 固定为 self/expression/wealth/order/resource。label 必须分别对应“自我与社交 / 创造与表达 / 物质与掌控 / 秩序与责任 / 资源与守护”，technicalLabel 分别对应“比肩/劫财 / 食神/伤官 / 正财/偏财 / 正官/七杀 / 正印/偏印”。description 控制在 35-80 个中文字符，解释这一类能量落到现实性格与能力上的表现。
5. balanceInsight 必须概括当前命局哪类五行更显，title 可写“命局偏强”或同类短语，value 类似“金、水”，tooltip 控制在 45-90 个中文字符，解释这种旺衰在现实性格与做事方式上的体现。
6. patternHighlights 返回 2-4 个当前命局里最值得提示的术语或组合（如伤官配印、三合局等），每项 tooltip 控制在 35-80 个中文字符，用大白话解释术语是什么意思、会怎样影响现实表现。
7. timeline 必须返回 3 项，年份依次是 ${currentYear}、${currentYear + 1}、${currentYear + 2}。
8. 模块 summary 每项 50-90 字，bullets 2-4 条，每条 18 字以内。
9. coreDestinyTone 的 tag 固定为“核心命理定调”；chartSummary 使用“乾造：甲子 丙寅 戊辰 庚申”或“坤造：...”格式。
10. headline 必须写成一句凝练的人生底色总评，控制在 8-16 个中文字符，优先使用四字或六字节奏，像“外柔内定，后运渐丰”“先稳后发，厚积见成”这种短句。不要写成解释句，不要出现“人生”“命格”“底色”“类型”这类空泛收尾词。
11. description 用通俗易懂的话承接 headline，控制在 55-90 个中文字符，最好 2 句，讲清命格主轴与运势走向，少堆术语，不要重复罗列四柱。
12. 语气稳健，内容具体可执行，避免夸大确定性。
13. 用户提供的出生日期与出生时间均为农历（阴历）口径，请按农历进行命理推演，不要按公历换算理解。
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
