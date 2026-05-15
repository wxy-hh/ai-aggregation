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
import { extractJsonBlock } from '../_lib/ark-response';
import { normalizeDestinyReport } from '../_lib/report-normalizer';
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
const REPORT_MAX_OUTPUT_TOKENS = 5200;

const BAZI_SECTION_ORDER: BaziSectionKey[] = [
  'profileOverview',
  'pillars',
  'elementsAndTenGods',
  'modulePersonality',
  'moduleCareer',
  'moduleLove',
  'moduleWealth',
  'moduleHealth',
  'timeline',
];

const PRIMARY_SECTION_KEYS: BaziSectionKey[] = [
  'profileOverview',
  'pillars',
  'elementsAndTenGods',
];

const ProfileSectionSchema = z.object({
  name: z.string().trim().min(1),
  genderLabel: z.string().trim().min(1),
  birthText: z.string().trim().min(1),
  locationText: z.string().trim().min(1),
  lunarText: z.string().trim().min(1).optional(),
});

const PillarSchema = z.object({
  stem: z.string().trim().min(1),
  branch: z.string().trim().min(1),
  label: z.string().trim().min(1),
  element: z.enum(['metal', 'wood', 'water', 'fire', 'earth']),
  tooltip: z.string().trim().min(1),
});

const ElementsAndTenGodsSectionSchema = z.object({
  elements: z
    .array(
      z.object({
        key: z.enum(['metal', 'wood', 'water', 'fire', 'earth']),
        label: z.string().trim().min(1).optional(),
        value: z.number(),
      })
    )
    .min(1),
  tenGods: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        label: z.string().trim().min(1),
        value: z.number(),
        tooltip: z.string().trim().min(1).optional(),
      })
    )
    .min(1),
});

const ModuleSectionSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  bullets: z.array(z.string().trim().min(1)).min(1),
});

const TimelineSectionSchema = z
  .array(
    z.object({
      year: z.number(),
      title: z.string().trim().min(1),
      summary: z.string().trim().min(1),
      detail: z.object({
        opportunities: z.array(z.string().trim().min(1)).min(1),
        risks: z.array(z.string().trim().min(1)).min(1),
        actions: z.array(z.string().trim().min(1)).min(1),
      }),
    })
  )
  .min(1);

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
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new UpstreamModelError(mapArkError(response.status), response.status, text.slice(0, 400));
    }

    if (!response.body) {
      throw new UpstreamModelError('模型流式响应为空，请稍后重试', 502);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    const processTextBuffer = () => {
      while (true) {
        const match = textBuffer.match(/<SECTION key="([^"]+)">([\s\S]*?)<\/SECTION>/);
        if (!match || match.index == null) break;

        const blockEnd = match.index + match[0].length;
        textBuffer = textBuffer.slice(blockEnd);
        handleSectionBlock({
          rawKey: match[1],
          rawPayload: match[2],
          input,
          currentYear,
          emittedSections,
          lockedSections,
          send,
          transitionStatus,
        });
      }
    };

    const processEvent = (event: unknown) => {
      const textDelta = extractArkTextDelta(event);
      if (textDelta) {
        textBuffer += textDelta;
        processTextBuffer();
      }

      const eventType = getArkEventType(event);
      if (eventType === 'response.completed') {
        const responseObject = getArkResponseObject(event);
        responseId = typeof responseObject?.id === 'string' ? responseObject.id : null;
        usagePayload = responseObject?.usage ?? null;
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

    const missingSections = BAZI_SECTION_ORDER.filter((sectionKey) => !lockedSections[sectionKey]);
    if (missingSections.length > 0) {
      throw new UpstreamModelError(
        `模型分区输出不完整：缺少 ${missingSections.join('、')}，请稍后重试`,
        502
      );
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

function handleSectionBlock({
  rawKey,
  rawPayload,
  input,
  currentYear,
  emittedSections,
  lockedSections,
  send,
  transitionStatus,
}: {
  rawKey: string;
  rawPayload: string;
  input: DestinyReportRequest;
  currentYear: number;
  emittedSections: Set<BaziSectionKey>;
  lockedSections: BaziLockedSections;
  send: (event: BaziStreamEvent) => void;
  transitionStatus: (status: DestinyStreamStatus) => void;
}) {
  const sectionKey = toBaziSectionKey(rawKey);
  if (!sectionKey || emittedSections.has(sectionKey)) return;

  const payload = parseSectionPayloadSafely({
    sectionKey,
    rawPayload,
    input,
    currentYear,
  });
  emittedSections.add(sectionKey);
  (lockedSections as Record<BaziSectionKey, BaziSectionPayloadMap[BaziSectionKey]>)[sectionKey] = payload;

  if (sectionKey === 'timeline') {
    transitionStatus('finalizing');
  }

  send({
    type: 'section-final',
    sectionKey,
    payload,
  } as BaziStreamEvent);

  if (arePrimarySectionsReady(lockedSections) && sectionKey !== 'timeline') {
    transitionStatus('analyzing');
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
    return normalizeSectionPayload(sectionKey, parseModelJson(rawPayload), input, currentYear);
  } catch (error) {
    console.warn('[Destiny Report] Section parse failed, using fallback payload', {
      sectionKey,
      error: error instanceof Error ? error.message : String(error),
      excerpt: rawPayload.slice(0, 240),
    });
    return buildFallbackSectionPayload(sectionKey, input, currentYear);
  }
}

function buildFallbackSectionPayload<K extends BaziSectionKey>(
  sectionKey: K,
  input: DestinyReportRequest,
  currentYear: number
): BaziSectionPayloadMap[K] {
  const fallback = normalizeDestinyReport({}, input, currentYear);

  switch (sectionKey) {
    case 'profileOverview':
      return fallback.profile as BaziSectionPayloadMap[K];
    case 'pillars':
      return fallback.pillars as BaziSectionPayloadMap[K];
    case 'elementsAndTenGods':
      return {
        elements: fallback.elements,
        tenGods: fallback.tenGods,
      } as BaziSectionPayloadMap[K];
    case 'modulePersonality':
      return fallback.modules.personality as BaziSectionPayloadMap[K];
    case 'moduleCareer':
      return fallback.modules.career as BaziSectionPayloadMap[K];
    case 'moduleLove':
      return fallback.modules.love as BaziSectionPayloadMap[K];
    case 'moduleWealth':
      return fallback.modules.wealth as BaziSectionPayloadMap[K];
    case 'moduleHealth':
      return fallback.modules.health as BaziSectionPayloadMap[K];
    case 'timeline':
      return fallback.timeline as BaziSectionPayloadMap[K];
  }
}

function normalizeSectionPayload<K extends BaziSectionKey>(
  sectionKey: K,
  raw: unknown,
  input: DestinyReportRequest,
  currentYear: number
): BaziSectionPayloadMap[K] {
  switch (sectionKey) {
    case 'profileOverview': {
      const parsed = ProfileSectionSchema.parse(raw);
      return normalizeDestinyReport({ profile: parsed }, input, currentYear).profile as BaziSectionPayloadMap[K];
    }
    case 'pillars': {
      const parsed = z.array(PillarSchema).min(4).parse(raw);
      return normalizeDestinyReport({ pillars: parsed }, input, currentYear).pillars as BaziSectionPayloadMap[K];
    }
    case 'elementsAndTenGods': {
      const parsed = ElementsAndTenGodsSectionSchema.parse(raw);
      const report = normalizeDestinyReport(
        { elements: parsed.elements, tenGods: parsed.tenGods },
        input,
        currentYear
      );
      return {
        elements: report.elements,
        tenGods: report.tenGods,
      } as BaziSectionPayloadMap[K];
    }
    case 'modulePersonality': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { personality: parsed } }, input, currentYear).modules
        .personality as BaziSectionPayloadMap[K];
    }
    case 'moduleCareer': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { career: parsed } }, input, currentYear).modules
        .career as BaziSectionPayloadMap[K];
    }
    case 'moduleLove': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { love: parsed } }, input, currentYear).modules
        .love as BaziSectionPayloadMap[K];
    }
    case 'moduleWealth': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { wealth: parsed } }, input, currentYear).modules
        .wealth as BaziSectionPayloadMap[K];
    }
    case 'moduleHealth': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { health: parsed } }, input, currentYear).modules
        .health as BaziSectionPayloadMap[K];
    }
    case 'timeline': {
      const parsed = TimelineSectionSchema.parse(raw);
      return normalizeDestinyReport({ timeline: parsed }, input, currentYear).timeline as BaziSectionPayloadMap[K];
    }
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
      pillars: sections.pillars,
      elements: sections.elementsAndTenGods?.elements,
      tenGods: sections.elementsAndTenGods?.tenGods,
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

function toBaziSectionKey(rawKey: string): BaziSectionKey | null {
  switch (rawKey.trim()) {
    case 'profileOverview':
      return 'profileOverview';
    case 'pillars':
      return 'pillars';
    case 'elementsAndTenGods':
      return 'elementsAndTenGods';
    case 'modulePersonality':
      return 'modulePersonality';
    case 'moduleCareer':
      return 'moduleCareer';
    case 'moduleLove':
      return 'moduleLove';
    case 'moduleWealth':
      return 'moduleWealth';
    case 'moduleHealth':
      return 'moduleHealth';
    case 'timeline':
      return 'timeline';
    default:
      return null;
  }
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
  if (error && typeof error === 'object' && typeof (error as Record<string, unknown>).message === 'string') {
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
你是专业命理分析助手。请严格按指定顺序输出 9 个 SECTION 区块，每个区块一旦输出就必须是最终定稿。
禁止输出 markdown、解释、前后缀说明、思考过程，禁止省略 SECTION 标签。

输出格式必须严格如下：
<SECTION key="profileOverview">
{"name":"string","genderLabel":"string","birthText":"string","locationText":"string"}
</SECTION>
<SECTION key="pillars">
[{"stem":"string","branch":"string","label":"string","element":"metal|wood|water|fire|earth","tooltip":"string"}]
</SECTION>
<SECTION key="elementsAndTenGods">
{"elements":[{"key":"metal|wood|water|fire|earth","label":"string","value":number}],"tenGods":[{"key":"string","label":"string","value":number,"tooltip":"string"}]}
</SECTION>
<SECTION key="modulePersonality">
{"title":"string","summary":"string","bullets":["string"]}
</SECTION>
<SECTION key="moduleCareer">
{"title":"string","summary":"string","bullets":["string"]}
</SECTION>
<SECTION key="moduleLove">
{"title":"string","summary":"string","bullets":["string"]}
</SECTION>
<SECTION key="moduleWealth">
{"title":"string","summary":"string","bullets":["string"]}
</SECTION>
<SECTION key="moduleHealth">
{"title":"string","summary":"string","bullets":["string"]}
</SECTION>
<SECTION key="timeline">
[{"year":${currentYear},"title":"string","summary":"string","detail":{"opportunities":["string"],"risks":["string"],"actions":["string"]}}]
</SECTION>

要求：
1. 必须严格按上面的顺序输出，不可调换顺序，不可合并区块。
2. 每个 SECTION 内只放合法 JSON，不能有 markdown 代码块。
3. pillars 必须 4 项，按年柱/月柱/日柱/时柱。
4. elements 必须包含 metal/wood/water/fire/earth 五项；tenGods 返回 4 项。
5. timeline 必须返回 3 项，年份依次是 ${currentYear}、${currentYear + 1}、${currentYear + 2}。
6. 模块 summary 每项 50-90 字，bullets 2-4 条，每条 18 字以内。
7. 语气稳健，内容具体可执行，避免夸大确定性。
8. 用户提供的出生日期与出生时间均为农历（阴历）口径，请按农历进行命理推演，不要按公历换算理解。
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

function parseModelJson(text: string): unknown {
  const source = extractJsonBlock(text).trim();

  try {
    return JSON.parse(source);
  } catch {
    const arrayMatch = source.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const candidate = arrayMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(candidate);
    }

    const objectMatch = source.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const candidate = objectMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(candidate);
    }

    throw new SyntaxError('模型 JSON 解析失败');
  }
}
