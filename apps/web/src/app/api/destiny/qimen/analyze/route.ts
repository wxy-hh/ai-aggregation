import { NextResponse } from 'next/server';
import { z } from 'zod';
import type {
  QimenLockedSections,
  QimenSectionKey,
  QimenStreamEvent,
} from '@/app/destiny/_components/qimen-types';
import { extractArkOutputText, extractArkUsage, extractJsonBlock } from '../../_lib/ark-response';
import { getOptionalUserId } from '@/lib/auth/get-optional-user-id';
import { normalizeUsage, safeRecordAiUsage } from '@/lib/ai-usage';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RequestSchema = z.object({
  context: z.object({
    datetime: z.string().min(1, '起局时间不能为空'),
    location: z.string().min(1, '地点不能为空'),
    chartMethod: z.enum(['time', 'daily']),
  }),
  question: z.object({
    category: z.enum(['career', 'wealth', 'love', 'health', 'decision', 'study', 'other']),
    description: z.string().trim().min(10, '问题描述至少 10 字').max(300, '问题描述最多 300 字'),
    focus: z.enum(['short_term', 'long_term', 'risk_control']),
    outputStyle: z.enum(['professional', 'plain']),
    outputLength: z.enum(['brief', 'detailed']),
  }),
});

const QimenCellSchema = z.object({
  palace: z.string().trim().min(1),
  luoshu: z.number().int().min(1).max(9),
  direction: z.string().trim().min(1),
  god: z.string().trim().min(1),
  star: z.string().trim().min(1),
  door: z.string().trim().min(1),
  heavenStem: z.string().trim().min(1),
  earthStem: z.string().trim().min(1),
  isValueSymbol: z.boolean().optional(),
  isValueDoor: z.boolean().optional(),
  isVoid: z.boolean().optional(),
  isHorse: z.boolean().optional(),
});

const QimenModelSchema = z.object({
  chartTitle: z.string().trim().min(1),
  chartMeta: z.object({
    dun: z.string().trim().min(1),
    ju: z.string().trim().min(1),
    jiaziXunkong: z.string().trim().min(1),
    horsePosition: z.string().trim().min(1),
    valueSymbol: z.string().trim().min(1),
    valueDoor: z.string().trim().min(1),
  }),
  board: z.array(QimenCellSchema).min(9).max(9),
  chartSummary: z.string().trim().min(1),
  overallAssessment: z.string().trim().min(1),
  riskAlerts: z.array(z.string().trim().min(1)).min(3).max(8),
  actionSuggestions: z.array(z.string().trim().min(1)).min(3).max(8),
  timingWindows: z
    .array(
      z.object({
        period: z.string().trim().min(1),
        guidance: z.string().trim().min(1),
      })
    )
    .min(2)
    .max(6),
  score: z.number().int().min(40).max(95),
  disclaimer: z.string().trim().min(1),
});

const QuickSectionSchema = z.object({
  overallAssessment: z.string().trim().min(1).optional(),
  riskAlerts: z.array(z.string().trim().min(1)).min(1).max(6).optional(),
  actionSuggestions: z.array(z.string().trim().min(1)).min(1).max(6).optional(),
  timingWindows: z
    .array(
      z.object({
        period: z.string().trim().min(1),
        guidance: z.string().trim().min(1),
      })
    )
    .min(1)
    .max(4)
    .optional(),
  chartSummary: z.string().trim().min(1).optional(),
});

type QimenAnalyzeInput = z.infer<typeof RequestSchema>;
type QimenAnalyzeResult = z.infer<typeof QimenModelSchema>;

const ARK_MODEL = 'doubao-seed-2-0-lite-260428';
const QUICK_STAGE_TIMEOUT_MS = 20000;
const FULL_STAGE_TIMEOUT_MS = 300000;
// Seed 2.0 模型强制推理，约 75% 输出 token 用于推理过程，需预留充足预算
const QUICK_MAX_OUTPUT_TOKENS = 8192;
const QUICK_RETRY_MAX_OUTPUT_TOKENS = 12288;
const PRIMARY_MAX_OUTPUT_TOKENS = 16384;
const RETRY_MAX_OUTPUT_TOKENS = 24576;

const categoryLabelMap = {
  career: '事业发展',
  wealth: '财务与投资',
  love: '感情关系',
  health: '健康状态',
  decision: '重要决策',
  study: '学业进修',
  other: '综合问题',
} as const;

const focusLabelMap = {
  short_term: '短期策略',
  long_term: '长期布局',
  risk_control: '风险规避',
} as const;

const chartMethodLabelMap = {
  time: '时家奇门',
  daily: '日家奇门',
} as const;

const outputStyleLabelMap = {
  professional: '专业术语风格',
  plain: '通俗易懂风格',
} as const;

const outputLengthLabelMap = {
  brief: '简版',
  detailed: '详版',
} as const;

const SECTION_ORDER: QimenSectionKey[] = [
  'overallAssessment',
  'riskAlerts',
  'actionSuggestions',
  'timingWindows',
  'chartSummary',
];

const PALACE_ORDER = [
  '巽四宫',
  '离九宫',
  '坤二宫',
  '震三宫',
  '中五宫',
  '兑七宫',
  '艮八宫',
  '坎一宫',
  '乾六宫',
] as const;

const FALLBACK_BOARD = [
  {
    palace: '巽四宫',
    luoshu: 4,
    direction: '东南',
    god: '螣蛇',
    star: '天辅',
    door: '杜门',
    heavenStem: '壬',
    earthStem: '丙',
  },
  {
    palace: '离九宫',
    luoshu: 9,
    direction: '正南',
    god: '九天',
    star: '天英',
    door: '景门',
    heavenStem: '丙',
    earthStem: '戊',
  },
  {
    palace: '坤二宫',
    luoshu: 2,
    direction: '西南',
    god: '九地',
    star: '天芮',
    door: '死门',
    heavenStem: '丁',
    earthStem: '己',
  },
  {
    palace: '震三宫',
    luoshu: 3,
    direction: '正东',
    god: '值符',
    star: '天冲',
    door: '伤门',
    heavenStem: '癸',
    earthStem: '乙',
    isValueSymbol: true,
    isValueDoor: true,
    isVoid: true,
  },
  {
    palace: '中五宫',
    luoshu: 5,
    direction: '中宫',
    god: '-',
    star: '天禽',
    door: '-',
    heavenStem: '戊',
    earthStem: '戊',
  },
  {
    palace: '兑七宫',
    luoshu: 7,
    direction: '正西',
    god: '六合',
    star: '天柱',
    door: '惊门',
    heavenStem: '辛',
    earthStem: '丁',
  },
  {
    palace: '艮八宫',
    luoshu: 8,
    direction: '东北',
    god: '勾陈',
    star: '天任',
    door: '生门',
    heavenStem: '己',
    earthStem: '庚',
    isVoid: true,
  },
  {
    palace: '坎一宫',
    luoshu: 1,
    direction: '正北',
    god: '朱雀',
    star: '天蓬',
    door: '休门',
    heavenStem: '乙',
    earthStem: '癸',
  },
  {
    palace: '乾六宫',
    luoshu: 6,
    direction: '西北',
    god: '太阴',
    star: '天心',
    door: '开门',
    heavenStem: '庚',
    earthStem: '壬',
  },
] as const;

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

export async function POST(request: Request) {
  try {
    const userId = await getOptionalUserId(request);
    const body = await request.json();
    const parsed = RequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
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
      return NextResponse.json({ success: false, error: 'Missing ARK_API_KEY' }, { status: 500 });
    }

    const stream = createQimenStream({
      input: parsed.data,
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
        success: false,
        error: error instanceof Error ? error.message : '服务暂时不可用，请稍后重试',
      },
      { status: 500 }
    );
  }
}

function createQimenStream({
  input,
  arkApiKey,
  arkBaseUrl,
  userId,
}: {
  input: QimenAnalyzeInput;
  arkApiKey: string;
  arkBaseUrl: string;
  userId: string | null;
}) {
  const encoder = new TextEncoder();

  return new ReadableStream({
    async start(controller) {
      const emittedSections = new Set<QimenSectionKey>();
      const lockedSections: QimenLockedSections = {};

      const send = (event: QimenStreamEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      try {
        send({ type: 'status', status: 'queued' });
        send({ type: 'status', status: 'charting' });

        const quickSections = await generateQuickSections({
          arkApiKey,
          arkBaseUrl,
          input,
          userId,
        });

        emitSectionEvents({
          quickSections,
          emittedSections,
          lockedSections,
          send,
        });

        send({ type: 'status', status: 'analyzing' });

        const fullResult = await generateFullResult({
          arkApiKey,
          arkBaseUrl,
          input,
          userId,
        });

        emitSectionEvents({
          quickSections: extractSectionsFromResult(fullResult),
          emittedSections,
          lockedSections,
          send,
        });

        const mergedResult = mergeLockedSectionsIntoResult(fullResult, lockedSections);

        send({ type: 'status', status: 'finalizing' });
        send({
          type: 'complete',
          result: mergedResult,
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

function emitSectionEvents({
  quickSections,
  emittedSections,
  lockedSections,
  send,
}: {
  quickSections: QimenLockedSections;
  emittedSections: Set<QimenSectionKey>;
  lockedSections: QimenLockedSections;
  send: (event: QimenStreamEvent) => void;
}) {
  for (const sectionKey of SECTION_ORDER) {
    if (emittedSections.has(sectionKey)) continue;

    const payload = quickSections[sectionKey];
    if (!isRenderableSection(sectionKey, payload)) continue;

    emittedSections.add(sectionKey);
    setLockedSection(lockedSections, sectionKey, payload);
    send({
      type: 'section-final',
      sectionKey,
      payload,
    } as QimenStreamEvent);
  }
}

function isRenderableSection(
  sectionKey: QimenSectionKey,
  payload: QimenLockedSections[QimenSectionKey]
): payload is NonNullable<QimenLockedSections[QimenSectionKey]> {
  if (!payload) return false;

  if (sectionKey === 'overallAssessment' || sectionKey === 'chartSummary') {
    return typeof payload === 'string' && payload.trim().length > 0;
  }

  if (sectionKey === 'riskAlerts' || sectionKey === 'actionSuggestions') {
    return Array.isArray(payload) && payload.length > 0;
  }

  if (sectionKey === 'timingWindows') {
    return Array.isArray(payload) && payload.length > 0;
  }

  return false;
}

function setLockedSection(
  target: QimenLockedSections,
  sectionKey: QimenSectionKey,
  payload: NonNullable<QimenLockedSections[QimenSectionKey]>
) {
  (target as Record<QimenSectionKey, QimenLockedSections[QimenSectionKey]>)[sectionKey] = payload;
}

async function generateQuickSections({
  arkApiKey,
  arkBaseUrl,
  input,
  userId,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: QimenAnalyzeInput;
  userId: string | null;
}): Promise<QimenLockedSections> {
  try {
    const primaryPayload = await requestArkPayload({
      arkApiKey,
      arkBaseUrl,
      input: [
        { role: 'system', content: buildQuickSectionSystemPrompt(input) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      maxOutputTokens: QUICK_MAX_OUTPUT_TOKENS,
      temperature: 0.2,
      timeoutMs: QUICK_STAGE_TIMEOUT_MS,
      userId,
      action: 'destiny-qimen-analyze',
      metadata: { stage: 'quick-primary' },
    });

    const primaryText = extractArkOutputText(primaryPayload);
    const primarySections = normalizeQuickSections(parseModelJson(primaryText), input);
    if (hasRenderableQuickSections(primarySections)) {
      return primarySections;
    }

    const retryPayload = await requestArkPayload({
      arkApiKey,
      arkBaseUrl,
      input: [
        { role: 'system', content: buildQuickSectionRetryPrompt(input) },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      maxOutputTokens: QUICK_RETRY_MAX_OUTPUT_TOKENS,
      temperature: 0.15,
      timeoutMs: QUICK_STAGE_TIMEOUT_MS,
      userId,
      action: 'destiny-qimen-analyze',
      metadata: { stage: 'quick-retry' },
    });

    const retryText = extractArkOutputText(retryPayload);
    return normalizeQuickSections(parseModelJson(retryText), input);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return {};
    }

    console.warn('[qimen/analyze] quick stage skipped', {
      message: error instanceof Error ? error.message : 'unknown quick stage error',
    });
    return {};
  }
}

async function generateFullResult({
  arkApiKey,
  arkBaseUrl,
  input,
  userId,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: QimenAnalyzeInput;
  userId: string | null;
}) {
  let payload = await requestArkPayload({
    arkApiKey,
    arkBaseUrl,
    input: [
      { role: 'system', content: buildSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxOutputTokens: PRIMARY_MAX_OUTPUT_TOKENS,
    temperature: 0.25,
    timeoutMs: FULL_STAGE_TIMEOUT_MS,
    userId,
    action: 'destiny-qimen-analyze',
    metadata: { stage: 'primary' },
  });

  if (isLengthIncomplete(payload)) {
    payload = await requestArkPayload({
      arkApiKey,
      arkBaseUrl,
      input: [
        { role: 'system', content: buildCompactSystemPrompt() },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      maxOutputTokens: RETRY_MAX_OUTPUT_TOKENS,
      temperature: 0.15,
      timeoutMs: FULL_STAGE_TIMEOUT_MS,
      userId,
      action: 'destiny-qimen-analyze',
      metadata: { stage: 'retry' },
    });

    if (isLengthIncomplete(payload)) {
      throw new UpstreamModelError('模型输出被截断（长度限制），请重试一次', 502);
    }
  }

  let text: string;
  try {
    text = extractArkOutputText(payload);
  } catch (error) {
    throw new UpstreamModelError(
      '模型返回格式不合法，请稍后重试',
      502,
      error instanceof Error ? error.message : undefined
    );
  }

  const parsedModel = parseModelJson(text);
  return normalizeQimenResult(parsedModel, input);
}

async function requestArkPayload({
  arkApiKey,
  arkBaseUrl,
  input,
  maxOutputTokens,
  temperature,
  timeoutMs,
  userId,
  action,
  metadata,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: Array<{ role: 'system' | 'user'; content: string }>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  userId: string | null;
  action: 'destiny-qimen-analyze';
  metadata?: Record<string, unknown>;
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
        input,
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

    const payload = await response.json();

    if (userId) {
      await safeRecordAiUsage({
        userId,
        feature: 'destiny',
        action,
        provider: 'doubao',
        model: ARK_MODEL,
        endpoint: '/api/destiny/qimen/analyze',
        usage: normalizeUsage(extractArkUsage(payload)),
        metadata: {
          ...metadata,
          maxOutputTokens,
          messageCount: input.length,
        },
      });
    }

    return payload;
  } finally {
    clearTimeout(timeoutId);
  }
}

function mergeLockedSectionsIntoResult(result: QimenAnalyzeResult, lockedSections: QimenLockedSections) {
  return {
    ...result,
    overallAssessment: lockedSections.overallAssessment ?? result.overallAssessment,
    riskAlerts: lockedSections.riskAlerts ?? result.riskAlerts,
    actionSuggestions: lockedSections.actionSuggestions ?? result.actionSuggestions,
    timingWindows: lockedSections.timingWindows ?? result.timingWindows,
    chartSummary: lockedSections.chartSummary ?? result.chartSummary,
  };
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

  return error instanceof Error ? error.message : '服务暂时不可用，请稍后重试';
}

function mapArkError(status: number): string {
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试';
  return '模型调用失败，请稍后重试';
}

function buildUserPrompt(input: QimenAnalyzeInput): string {
  return [
    '请根据以下时家奇门问题信息输出结构化盘局与策略分析：',
    `起局时间：${input.context.datetime}`,
    `地点：${input.context.location}`,
    `起局方式：${chartMethodLabelMap[input.context.chartMethod]}`,
    `问题类别：${categoryLabelMap[input.question.category]}`,
    `问题描述：${input.question.description}`,
    `分析侧重：${focusLabelMap[input.question.focus]}`,
    `语言风格：${outputStyleLabelMap[input.question.outputStyle]}`,
    `结果长度：${outputLengthLabelMap[input.question.outputLength]}`,
  ].join('\n');
}

function buildQuickSectionSystemPrompt(input: QimenAnalyzeInput): string {
  const maxListCount = input.question.outputLength === 'brief' ? 3 : 5;
  const maxTimingCount = input.question.outputLength === 'brief' ? 2 : 4;

  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字、解释和 markdown。
禁止输出思考过程。

你的任务是先给前端可直接展示的“定稿区块”。必须一次性返回以下 5 个字段，缺一不可：
- overallAssessment: 一段完整综合判断，1-2 句
- riskAlerts: ${maxListCount} 条风险提醒
- actionSuggestions: ${maxListCount} 条行动建议
- timingWindows: ${maxTimingCount} 项时间窗口，每项包含 period 和 guidance
- chartSummary: 一段完整盘局摘要，1-2 句

约束：
1. 每个字段都必须是可直接展示的最终文案，不要半句，不要续写占位
2. 不要输出九宫盘、chartMeta、score、disclaimer
3. 风格与用户选择一致，内容简洁但判断完整
4. 不允许省略字段，不允许返回 null、空数组、空字符串
5. riskAlerts 和 actionSuggestions 必须逐条独立，不要合并成长段

严格按以下 JSON 结构返回：
{
  "overallAssessment": "string",
  "riskAlerts": ["string"],
  "actionSuggestions": ["string"],
  "timingWindows": [
    { "period": "string", "guidance": "string" }
  ],
  "chartSummary": "string"
}
`.trim();
}

function buildQuickSectionRetryPrompt(input: QimenAnalyzeInput): string {
  const maxListCount = input.question.outputLength === 'brief' ? 3 : 5;
  const maxTimingCount = input.question.outputLength === 'brief' ? 2 : 4;

  return `
仅返回合法 JSON，禁止任何额外文字。
为前端生成 5 个可直接展示的定稿区块，必须包含且仅包含：
- overallAssessment
- riskAlerts（${maxListCount} 条）
- actionSuggestions（${maxListCount} 条）
- timingWindows（${maxTimingCount} 项，字段为 period/guidance）
- chartSummary

要求：
1. 五个字段全部必填
2. 全部内容必须完整可展示，不能留空
3. 不要输出 board、chartMeta、score、disclaimer
4. 使用中文简体

返回格式：
{
  "overallAssessment": "完整句子",
  "riskAlerts": ["完整句子"],
  "actionSuggestions": ["完整句子"],
  "timingWindows": [
    { "period": "完整时间段", "guidance": "完整建议" }
  ],
  "chartSummary": "完整句子"
}
`.trim();
}

function buildSystemPrompt(): string {
  return `
你是专业奇门遁甲排盘分析助手。必须严格输出 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

要求：
1. 采用时家奇门语义，按“洛书九宫”输出九宫盘元素
2. 九宫字段必须完整：宫位、洛书数、方位、八神、九星、八门、天盘干、地盘干
3. 值符值使要能在 board 中体现（isValueSymbol/isValueDoor）
4. 输出中必须体现六甲旬空与驿马信息（chartMeta.jiaziXunkong / horsePosition）
5. 内容要专业严谨，但不夸大确定性

必须返回字段：
- chartTitle
- chartMeta: dun, ju, jiaziXunkong, horsePosition, valueSymbol, valueDoor
- board: 9项，宫位顺序必须是 [巽四宫,离九宫,坤二宫,震三宫,中五宫,兑七宫,艮八宫,坎一宫,乾六宫]
- chartSummary
- overallAssessment
- riskAlerts: 3-6条
- actionSuggestions: 3-6条
- timingWindows: 2-4项，每项含 period/guidance
- score: 40-95
- disclaimer

风格：
- 中文简体
- 如用户选通俗风格，可降低术语密度并附简释
- 简版减少条目，详版增加条目
- 严禁输出 markdown 代码块
  `.trim();
}

function buildCompactSystemPrompt(): string {
  return `
仅返回合法 JSON。
字段必须包含：chartTitle, chartMeta, board(9项), chartSummary, overallAssessment, riskAlerts[], actionSuggestions[], timingWindows[{period,guidance}], score, disclaimer。
board 宫位顺序固定：巽四宫,离九宫,坤二宫,震三宫,中五宫,兑七宫,艮八宫,坎一宫,乾六宫。
内容精简但保持奇门专业语义。
  `.trim();
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

function isLengthIncomplete(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const data = payload as Record<string, unknown>;
  const incomplete = data.incomplete_details;
  if (!incomplete || typeof incomplete !== 'object') return false;
  return (incomplete as Record<string, unknown>).reason === 'length';
}

function normalizeQuickSections(payload: unknown, input: QimenAnalyzeInput): QimenLockedSections {
  const parsed = QuickSectionSchema.safeParse(payload);

  if (!parsed.success) {
    console.warn('[qimen/analyze] quick stage schema mismatch', {
      issues: parsed.error.issues.slice(0, 5),
    });
  }

  const raw =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const riskAlertsRaw = Array.isArray(raw.riskAlerts) ? raw.riskAlerts : [];
  const actionSuggestionsRaw = Array.isArray(raw.actionSuggestions) ? raw.actionSuggestions : [];
  const timingWindowsRaw = Array.isArray(raw.timingWindows) ? raw.timingWindows : [];

  const timingWindows = timingWindowsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        period: sanitizeText(typeof row.period === 'string' ? row.period : '', 44),
        guidance: sanitizeText(typeof row.guidance === 'string' ? row.guidance : '', 120),
      };
    })
    .filter((item): item is { period: string; guidance: string } =>
      Boolean(item?.period && item?.guidance)
    )
    .slice(0, input.question.outputLength === 'brief' ? 2 : 4);

  const overallAssessment = sanitizeText(
    typeof raw.overallAssessment === 'string' ? raw.overallAssessment : '',
    260
  );
  const chartSummary = sanitizeText(
    typeof raw.chartSummary === 'string' ? raw.chartSummary : '',
    260
  );
  const riskAlerts = normalizeOptionalStringList(
    riskAlertsRaw.filter((item): item is string => typeof item === 'string'),
    input.question.outputLength === 'brief' ? 3 : 5,
    78
  );
  const actionSuggestions = normalizeOptionalStringList(
    actionSuggestionsRaw.filter((item): item is string => typeof item === 'string'),
    input.question.outputLength === 'brief' ? 3 : 5,
    78
  );

  return {
    ...(overallAssessment ? { overallAssessment } : {}),
    ...(riskAlerts ? { riskAlerts } : {}),
    ...(actionSuggestions ? { actionSuggestions } : {}),
    ...(timingWindows.length >= 1 ? { timingWindows } : {}),
    ...(chartSummary ? { chartSummary } : {}),
  };
}

function hasRenderableQuickSections(sections: QimenLockedSections) {
  return SECTION_ORDER.some((sectionKey) => isRenderableSection(sectionKey, sections[sectionKey]));
}

function extractSectionsFromResult(result: QimenAnalyzeResult): QimenLockedSections {
  return {
    overallAssessment: result.overallAssessment,
    riskAlerts: result.riskAlerts,
    actionSuggestions: result.actionSuggestions,
    timingWindows: result.timingWindows,
    chartSummary: result.chartSummary,
  };
}

function normalizeQimenResult(payload: unknown, input: QimenAnalyzeInput): QimenAnalyzeResult {
  const parsed = QimenModelSchema.safeParse(payload);

  if (!parsed.success) {
    console.warn('[qimen/analyze] model payload schema mismatch, fallback to tolerant normalize', {
      issues: parsed.error.issues.slice(0, 5),
    });
  }

  const raw = (
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {}
  ) as Record<string, unknown>;

  const chartMetaRaw =
    raw.chartMeta && typeof raw.chartMeta === 'object'
      ? (raw.chartMeta as Record<string, unknown>)
      : {};

  const boardRaw = Array.isArray(raw.board) ? raw.board : [];

  const boardByPalace = new Map<string, Partial<QimenAnalyzeResult['board'][number]>>();
  for (const item of boardRaw) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const palace = typeof row.palace === 'string' ? row.palace.trim() : '';
    if (!palace) continue;
    boardByPalace.set(palace, {
      palace,
      luoshu: typeof row.luoshu === 'number' ? row.luoshu : undefined,
      direction: typeof row.direction === 'string' ? row.direction : undefined,
      god: typeof row.god === 'string' ? row.god : undefined,
      star: typeof row.star === 'string' ? row.star : undefined,
      door: typeof row.door === 'string' ? row.door : undefined,
      heavenStem: typeof row.heavenStem === 'string' ? row.heavenStem : undefined,
      earthStem: typeof row.earthStem === 'string' ? row.earthStem : undefined,
      isValueSymbol: Boolean(row.isValueSymbol),
      isValueDoor: Boolean(row.isValueDoor),
      isVoid: Boolean(row.isVoid),
      isHorse: Boolean(row.isHorse),
    });
  }

  const normalizedBoard = PALACE_ORDER.map((palace, idx) => {
    const fromModel = boardByPalace.get(palace);
    const fallback = FALLBACK_BOARD[idx];
    const use = {
      ...fallback,
      ...fromModel,
    };

    return {
      palace,
      luoshu: Math.max(1, Math.min(9, Number(use.luoshu ?? fallback.luoshu))),
      direction: sanitizeText(use.direction ?? fallback.direction, 6),
      god: sanitizeText(use.god ?? fallback.god, 4),
      star: sanitizeText(use.star ?? fallback.star, 4),
      door: sanitizeText(use.door ?? fallback.door, 4),
      heavenStem: sanitizeText(use.heavenStem ?? fallback.heavenStem, 2),
      earthStem: sanitizeText(use.earthStem ?? fallback.earthStem, 2),
      isValueSymbol: Boolean(use.isValueSymbol),
      isValueDoor: Boolean(use.isValueDoor),
      isVoid: Boolean(use.isVoid),
      isHorse: Boolean(use.isHorse),
    };
  });

  const riskAlertsRaw = Array.isArray(raw.riskAlerts) ? raw.riskAlerts : [];
  const actionSuggestionsRaw = Array.isArray(raw.actionSuggestions) ? raw.actionSuggestions : [];
  const timingWindowsRaw = Array.isArray(raw.timingWindows) ? raw.timingWindows : [];

  const timingWindows = timingWindowsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        period: sanitizeText(typeof row.period === 'string' ? row.period : '', 44),
        guidance: sanitizeText(typeof row.guidance === 'string' ? row.guidance : '', 120),
      };
    })
    .filter((item): item is { period: string; guidance: string } =>
      Boolean(item?.period && item?.guidance)
    )
    .slice(0, input.question.outputLength === 'brief' ? 2 : 4);

  const fallbackRisk = [
    '注意信息不完整导致误判',
    '避免情绪驱动下做不可逆决策',
    '重要协同节点需预留缓冲',
  ];
  const fallbackAction = [
    '先做小范围验证再扩大投入',
    '聚焦单一目标推进主线',
    '以周为单位复盘并调整策略',
  ];

  return {
    chartTitle: sanitizeText(
      typeof raw.chartTitle === 'string' ? raw.chartTitle : '奇门遁甲排盘',
      32
    ),
    chartMeta: {
      dun: sanitizeText(typeof chartMetaRaw.dun === 'string' ? chartMetaRaw.dun : '阳遁', 12),
      ju: sanitizeText(typeof chartMetaRaw.ju === 'string' ? chartMetaRaw.ju : '三局', 12),
      jiaziXunkong: sanitizeText(
        typeof chartMetaRaw.jiaziXunkong === 'string' ? chartMetaRaw.jiaziXunkong : '甲辰旬 寅卯空',
        20
      ),
      horsePosition: sanitizeText(
        typeof chartMetaRaw.horsePosition === 'string' ? chartMetaRaw.horsePosition : '马星在巳',
        20
      ),
      valueSymbol: sanitizeText(
        typeof chartMetaRaw.valueSymbol === 'string' ? chartMetaRaw.valueSymbol : '天冲星',
        16
      ),
      valueDoor: sanitizeText(
        typeof chartMetaRaw.valueDoor === 'string' ? chartMetaRaw.valueDoor : '伤门',
        16
      ),
    },
    board: normalizedBoard,
    chartSummary: sanitizeText(
      typeof raw.chartSummary === 'string'
        ? raw.chartSummary
        : '当前盘局显示先稳后进为宜，需重视节奏控制与信息验证。',
      260
    ),
    overallAssessment: sanitizeText(
      typeof raw.overallAssessment === 'string'
        ? raw.overallAssessment
        : '整体态势偏稳，适合先验证关键变量，再在窗口期集中推进。',
      260
    ),
    riskAlerts: normalizeStringList(
      riskAlertsRaw.filter((item): item is string => typeof item === 'string'),
      input.question.outputLength === 'brief' ? 3 : 5,
      78,
      fallbackRisk
    ),
    actionSuggestions: normalizeStringList(
      actionSuggestionsRaw.filter((item): item is string => typeof item === 'string'),
      input.question.outputLength === 'brief' ? 3 : 5,
      78,
      fallbackAction
    ),
    timingWindows:
      timingWindows.length >= 2
        ? timingWindows
        : buildFallbackTimingWindows(input.question.outputLength),
    score: Math.max(40, Math.min(95, Math.round(typeof raw.score === 'number' ? raw.score : 78))),
    disclaimer:
      sanitizeText(typeof raw.disclaimer === 'string' ? raw.disclaimer : '', 120) ||
      '本排盘与分析仅供传统民俗文化研究和策略参考，不构成任何现实决策承诺。',
  };
}

function normalizeStringList(
  items: string[],
  maxCount: number,
  maxLen: number,
  fallback: string[] = []
): string[] {
  const deduped = Array.from(
    new Set(items.map((item) => sanitizeText(item, maxLen)).filter(Boolean))
  );
  if (deduped.length === 0) {
    return fallback.slice(0, maxCount).map((item) => sanitizeText(item, maxLen));
  }
  return deduped.slice(0, maxCount);
}

function normalizeOptionalStringList(items: string[], maxCount: number, maxLen: number) {
  const deduped = Array.from(
    new Set(items.map((item) => sanitizeText(item, maxLen)).filter(Boolean))
  );
  return deduped.length > 0 ? deduped.slice(0, maxCount) : undefined;
}

function buildFallbackTimingWindows(outputLength: QimenAnalyzeInput['question']['outputLength']) {
  if (outputLength === 'brief') {
    return [
      { period: '近 3-7 天', guidance: '先小步试探，验证关键假设后再扩大动作。' },
      { period: '近 2-4 周', guidance: '聚焦主线推进，避免并行目标分散资源。' },
    ];
  }

  return [
    { period: '第 1 窗口（近 3-7 天）', guidance: '以低成本验证为主，先确认关键变量方向。' },
    { period: '第 2 窗口（近 2-4 周）', guidance: '验证成立后集中资源推进，减少策略摇摆。' },
    { period: '第 3 窗口（近 1-2 个月）', guidance: '围绕复盘结果迭代执行机制，放大有效动作。' },
  ];
}

function sanitizeText(value: string, maxLen: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
