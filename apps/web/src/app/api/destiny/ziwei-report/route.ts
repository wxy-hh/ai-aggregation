import { NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  DestinyReport,
  DestinyReportRequest,
  ZiweiLockedSections,
  ZiweiSectionKey,
  ZiweiStreamEvent,
} from '@/app/destiny/_components/types';
import { extractArkOutputText, extractJsonBlock } from '../_lib/ark-response';
import { normalizeDestinyReport } from '../_lib/report-normalizer';

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

const QuickZiweiSectionSchema = z.object({
  profileOverview: z
    .object({
      name: z.string().min(1),
      genderLabel: z.string().min(1),
      birthText: z.string().min(1),
      lunarText: z.string().min(1),
      locationText: z.string().min(1),
    })
    .optional(),
  overviewModules: z
    .object({
      personality: z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        bullets: z.array(z.string().min(1)).min(1),
      }),
      career: z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        bullets: z.array(z.string().min(1)).min(1),
      }),
      wealth: z.object({
        title: z.string().min(1),
        summary: z.string().min(1),
        bullets: z.array(z.string().min(1)).min(1),
      }),
    })
    .optional(),
  timeline: z
    .array(
      z.object({
        year: z.number(),
        title: z.string().min(1),
        summary: z.string().min(1),
        detail: z.object({
          opportunities: z.array(z.string().min(1)).min(1),
          risks: z.array(z.string().min(1)).min(1),
          actions: z.array(z.string().min(1)).min(1),
        }),
      })
    )
    .min(1)
    .optional(),
  relations: z
    .object({
      summary: z.string().min(1),
      opportunities: z.array(z.string().min(1)).min(1),
      risks: z.array(z.string().min(1)).min(1),
      actions: z.array(z.string().min(1)).min(1),
    })
    .optional(),
});

const ARK_MODEL = 'doubao-seed-2-0-lite-260215';
const QUICK_STAGE_TIMEOUT_MS = 20000;
const REPORT_TIMEOUT_MS = 300000;
const QUICK_MAX_OUTPUT_TOKENS = 1800;
const PRIMARY_MAX_OUTPUT_TOKENS = 2800;
const RETRY_MAX_OUTPUT_TOKENS = 5000;

const ZIWEI_SECTION_ORDER: ZiweiSectionKey[] = [
  'profileOverview',
  'overviewModules',
  'timeline',
  'relations',
  'ziweiCenter',
  'ziweiPalaces',
];

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

    const input: DestinyReportRequest = parsed.data;
    const currentYear = new Date().getFullYear();
    const stream = createZiweiStream({
      input,
      currentYear,
      arkApiKey,
      arkBaseUrl,
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

function createZiweiStream({
  input,
  currentYear,
  arkApiKey,
  arkBaseUrl,
}: {
  input: DestinyReportRequest;
  currentYear: number;
  arkApiKey: string;
  arkBaseUrl: string;
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
        send({ type: 'status', status: 'queued' });
        send({ type: 'status', status: 'charting' });

        const quickSections = await generateQuickZiweiSections({
          arkApiKey,
          arkBaseUrl,
          input,
          currentYear,
        });

        emitZiweiSectionEvents({
          sections: quickSections,
          emittedSections,
          lockedSections,
          send,
        });

        send({ type: 'status', status: 'analyzing' });

        const fullReport = await generateFullZiweiReport({
          arkApiKey,
          arkBaseUrl,
          input,
          currentYear,
        });

        emitZiweiSectionEvents({
          sections: extractZiweiSectionsFromReport(fullReport),
          emittedSections,
          lockedSections,
          send,
        });

        send({ type: 'status', status: 'finalizing' });
        send({
          type: 'complete',
          report: mergeZiweiSectionsIntoReport(fullReport, lockedSections),
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

async function generateQuickZiweiSections({
  arkApiKey,
  arkBaseUrl,
  input,
  currentYear,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: DestinyReportRequest;
  currentYear: number;
}) {
  try {
    const payload = await requestArkPayload({
      arkApiKey,
      arkBaseUrl,
      inputMessages: [
        { role: 'system', content: buildQuickZiweiSystemPrompt(currentYear) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      maxOutputTokens: QUICK_MAX_OUTPUT_TOKENS,
      temperature: 0.25,
      timeoutMs: QUICK_STAGE_TIMEOUT_MS,
    });

    const text = extractArkOutputText(payload);
    return normalizeQuickZiweiSections(parseModelJson(text));
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {};
    }
    console.warn('[destiny/ziwei-report] quick stage skipped', {
      message: error instanceof Error ? error.message : 'unknown quick stage error',
    });
    return {};
  }
}

async function generateFullZiweiReport({
  arkApiKey,
  arkBaseUrl,
  input,
  currentYear,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: DestinyReportRequest;
  currentYear: number;
}) {
  let payload = await requestArkPayload({
    arkApiKey,
    arkBaseUrl,
    inputMessages: [
      { role: 'system', content: buildSystemPrompt(currentYear) },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxOutputTokens: PRIMARY_MAX_OUTPUT_TOKENS,
    temperature: 0.35,
    timeoutMs: REPORT_TIMEOUT_MS,
  });

  if (isLengthIncomplete(payload)) {
    payload = await requestArkPayload({
      arkApiKey,
      arkBaseUrl,
      inputMessages: [
        { role: 'system', content: buildCompactSystemPrompt(currentYear) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      maxOutputTokens: RETRY_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      timeoutMs: REPORT_TIMEOUT_MS,
    });

    if (isLengthIncomplete(payload)) {
      throw new UpstreamModelError('模型输出被截断（长度限制），请重试一次', 502);
    }
  }

  const text = extractArkOutputText(payload);
  const modelJson = parseModelJson(text);
  const strictError = validateZiweiModelPayload(modelJson);
  if (strictError) {
    throw new UpstreamModelError(`紫微测算结果不完整：${strictError}，请重试`, 502);
  }

  return normalizeDestinyReport(modelJson, input, currentYear);
}

async function requestArkPayload({
  arkApiKey,
  arkBaseUrl,
  inputMessages,
  maxOutputTokens,
  temperature,
  timeoutMs,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  inputMessages: Array<{ role: 'system' | 'user'; content: string }>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${arkBaseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${arkApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        input: inputMessages,
        temperature,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: 'low' },
        text: { format: { type: 'json_object' } },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new UpstreamModelError(mapArkError(response.status), response.status, text.slice(0, 400));
    }

    return response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

function emitZiweiSectionEvents({
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
  for (const sectionKey of ZIWEI_SECTION_ORDER) {
    if (emittedSections.has(sectionKey)) continue;

    const payload = sections[sectionKey];
    if (!isRenderableZiweiSection(sectionKey, payload)) continue;

    emittedSections.add(sectionKey);
    (lockedSections as Record<ZiweiSectionKey, ZiweiLockedSections[ZiweiSectionKey]>)[sectionKey] =
      payload;
    send({
      type: 'section-final',
      sectionKey,
      payload,
    } as ZiweiStreamEvent);
  }
}

function isRenderableZiweiSection(
  sectionKey: ZiweiSectionKey,
  payload: ZiweiLockedSections[ZiweiSectionKey]
): payload is NonNullable<ZiweiLockedSections[ZiweiSectionKey]> {
  if (!payload) return false;
  if (sectionKey === 'profileOverview') return typeof payload === 'object';
  if (sectionKey === 'ziweiCenter') return typeof payload === 'object';
  if (sectionKey === 'overviewModules') return typeof payload === 'object';
  if (sectionKey === 'timeline') return Array.isArray(payload) && payload.length > 0;
  if (sectionKey === 'relations') return typeof payload === 'object';
  if (sectionKey === 'ziweiPalaces') return Array.isArray(payload) && payload.length >= 12;
  return false;
}

function extractZiweiSectionsFromReport(report: DestinyReport): ZiweiLockedSections {
  return {
    profileOverview: report.profile,
    overviewModules: {
      personality: report.modules.personality,
      career: report.modules.career,
      wealth: report.modules.wealth,
    },
    timeline: report.timeline,
    relations: {
      summary: report.modules.love.summary,
      opportunities: report.modules.love.bullets.slice(0, 3),
      risks: report.modules.health.bullets.slice(0, 3),
      actions: report.modules.personality.bullets.slice(0, 3),
    },
    ziweiCenter: report.ziweiCenter,
    ziweiPalaces: report.ziweiPalaces,
  };
}

function mergeZiweiSectionsIntoReport(report: DestinyReport, lockedSections: ZiweiLockedSections): DestinyReport {
  return {
    ...report,
    profile: lockedSections.profileOverview ?? report.profile,
    modules: lockedSections.overviewModules
      ? {
          ...report.modules,
          personality: lockedSections.overviewModules.personality,
          career: lockedSections.overviewModules.career,
          wealth: lockedSections.overviewModules.wealth,
          love: lockedSections.relations
            ? {
                ...report.modules.love,
                summary: lockedSections.relations.summary,
                bullets: lockedSections.relations.opportunities,
              }
            : report.modules.love,
          health: lockedSections.relations
            ? {
                ...report.modules.health,
                bullets: lockedSections.relations.risks,
              }
            : report.modules.health,
        }
      : lockedSections.relations
        ? {
            ...report.modules,
            love: {
              ...report.modules.love,
              summary: lockedSections.relations.summary,
              bullets: lockedSections.relations.opportunities,
            },
            health: {
              ...report.modules.health,
              bullets: lockedSections.relations.risks,
            },
            personality: {
              ...report.modules.personality,
              bullets: lockedSections.relations.actions,
            },
          }
        : report.modules,
    timeline: lockedSections.timeline ?? report.timeline,
    ziweiCenter: lockedSections.ziweiCenter ?? report.ziweiCenter,
    ziweiPalaces: lockedSections.ziweiPalaces ?? report.ziweiPalaces,
  };
}

function normalizeQuickZiweiSections(payload: unknown): ZiweiLockedSections {
  const parsed = QuickZiweiSectionSchema.safeParse(payload);
  if (!parsed.success) {
    return {};
  }
  return parsed.data;
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

function buildUserPrompt(input: DestinyReportRequest): string {
  const location =
    input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat}, ${input.location.lon}）`
      : input.location.name;

  return [
    '请基于以下用户信息生成紫微斗数排盘分析（中文）：',
    '重要：以下出生日期与出生时间均为农历（阴历）口径，不是公历（阳历）。',
    `姓名：${input.name}`,
    `性别：${input.gender === 'female' ? '女' : '男'}`,
    `出生日期：${input.birthDate.year}-${input.birthDate.month}-${input.birthDate.day}`,
    `出生时间：${input.birthTime.hour}:${input.birthTime.minute}`,
    `出生地：${location}`,
  ].join('\n');
}

function buildQuickZiweiSystemPrompt(currentYear: number) {
  return `
你是专业紫微斗数分析助手。必须严格返回合法 JSON，禁止额外文字。
只返回首屏可直接展示的 4 个区块：
- profileOverview: name, genderLabel, birthText, lunarText, locationText
- overviewModules: personality/career/wealth，每项含 title/summary/bullets
- timeline: 至少 1 项，年份优先从 ${currentYear} 开始
- relations: summary/opportunities/risks/actions

要求：
1. 所有字段必须完整可直接展示
2. 不要输出 pillars、elements、tenGods、ziweiCenter、ziweiPalaces
3. 严格只返回 JSON 对象
`.trim();
}

function buildSystemPrompt(currentYear: number): string {
  return `
你是专业紫微斗数分析助手。必须严格输出 JSON 对象，禁止输出任何额外文字。
不要输出思考过程，不要解释，只返回最终 JSON。
用户提供的出生日期与出生时间均为农历（阴历）口径，请按农历进行紫微斗数推演，不要按公历换算理解。

字段要求：
1. profile：name, genderLabel, birthText, lunarText, locationText
2. pillars：长度4，按年柱/月柱/日柱/时柱，包含 stem, branch, label, element, tooltip
3. elements：必须含 metal/wood/water/fire/earth 五项，value 为 0-100 数字
4. tenGods：返回 4 项，包含 key, label, value(0-100), tooltip
5. modules：包含 personality/career/love/wealth/health，每项有 title/summary/bullets(2-4条)
6. timeline：必须返回 3 项，年份依次是 ${currentYear}, ${currentYear + 1}, ${currentYear + 2}，每项含 title/summary/detail，
   detail 里有 opportunities/risks/actions 三个数组，每个数组 2-3 条
7. ziweiCenter：包含 chartTitle, mingZhu, shenZhu
8. ziweiPalaces：必须返回 12 项（父母宫/福德宫/田宅宫/官禄宫/命宫/兄弟宫/奴仆宫/夫妻宫/迁移宫/子女宫/财帛宫/疾厄宫），每项包含 key,label,branch,stars(1-3),dominant,summary,suggestions(2-4)

输出风格：
- 聚焦紫微斗数语境，强调宫位、主星结构与流年建议
- 内容可执行，避免空泛措辞
- 语气稳健，不夸大确定性
- 使用中文简体
- 控制篇幅：summary 每项 50-90 字，bullet/action 每条 18 字以内
- 保持精炼，避免重复表达
  `.trim();
}

function buildCompactSystemPrompt(currentYear: number) {
  return `
仅返回合法 JSON。不要输出其他文字。
用户提供的出生日期与出生时间均为农历（阴历）口径，请按农历进行紫微斗数推演，不要按公历换算理解。
返回字段：
profile(name,genderLabel,birthText,lunarText,locationText)
pillars(4项: stem,branch,label,element,tooltip)
elements(5项: key=metal/wood/water/fire/earth, value=0-100)
tenGods(4项: key,label,value,tooltip)
modules(personality/career/love/wealth/health，每项 title/summary/bullets[2-3条])
timeline(3项，年份固定 ${currentYear}/${currentYear + 1}/${currentYear + 2}，每项 title/summary/detail，detail含 opportunities/risks/actions)
ziweiCenter(chartTitle,mingZhu,shenZhu)
ziweiPalaces(12项: key,label,branch,stars,dominant,summary,suggestions)
内容尽量简短，保持紫微斗数表述。
  `.trim();
}

function isLengthIncomplete(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  const incomplete = data.incomplete_details;
  if (!incomplete || typeof incomplete !== 'object') return false;
  return (incomplete as Record<string, unknown>).reason === 'length';
}

function parseModelJson(text: string): unknown {
  const source = extractJsonBlock(text).trim();

  try {
    return JSON.parse(source);
  } catch {
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

function validateZiweiModelPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return '返回体为空';
  const source = payload as Record<string, unknown>;

  if (
    !source.ziweiPalaces ||
    !Array.isArray(source.ziweiPalaces) ||
    source.ziweiPalaces.length < 12
  ) {
    return '缺少 12 宫位数据';
  }

  const firstTimeline = Array.isArray(source.timeline) ? source.timeline[0] : null;
  const firstDetail =
    firstTimeline && typeof firstTimeline === 'object'
      ? (firstTimeline as Record<string, unknown>).detail
      : null;
  if (!firstDetail || typeof firstDetail !== 'object') {
    return '缺少流年 detail';
  }

  const detailObj = firstDetail as Record<string, unknown>;
  if (
    !Array.isArray(detailObj.opportunities) ||
    !Array.isArray(detailObj.risks) ||
    !Array.isArray(detailObj.actions)
  ) {
    return '流年 detail 结构不完整';
  }

  const modules = source.modules;
  if (!modules || typeof modules !== 'object') {
    return '缺少 modules';
  }
  const moduleObj = modules as Record<string, unknown>;
  if (!moduleObj.love || !moduleObj.personality) {
    return '缺少六亲/总论模块';
  }

  return null;
}
