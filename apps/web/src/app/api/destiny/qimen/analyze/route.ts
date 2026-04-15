import { NextResponse } from 'next/server';
import { z } from 'zod';
import { extractArkOutputText, extractJsonBlock } from '../../_lib/ark-response';

// 使用 Node.js Runtime（Edge Runtime 有超时限制）
export const runtime = 'nodejs';
// Vercel Pro 支持最长 300 秒（5 分钟）
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

type QimenAnalyzeInput = z.infer<typeof RequestSchema>;
type QimenAnalyzeResult = z.infer<typeof QimenModelSchema>;

const ARK_MODEL = 'doubao-seed-2-0-lite-260215';
// 设置 5 分钟超时（300 秒）
const REPORT_TIMEOUT_MS = 300000;
const PRIMARY_MAX_OUTPUT_TOKENS = 2600;
const RETRY_MAX_OUTPUT_TOKENS = 4600;

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

    const input = parsed.data;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);

    let response: Response;
    try {
      response = await fetch(`${arkBaseUrl}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${arkApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: ARK_MODEL,
          input: [
            { role: 'system', content: buildSystemPrompt() },
            { role: 'user', content: buildUserPrompt(input) },
          ],
          temperature: 0.25,
          max_output_tokens: PRIMARY_MAX_OUTPUT_TOKENS,
          reasoning: { effort: 'low' },
          text: { format: { type: 'json_object' } },
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const text = await response.text();
      return NextResponse.json(
        {
          success: false,
          error: mapArkError(response.status),
          details: text.slice(0, 400),
        },
        { status: response.status }
      );
    }

    let payload = await response.json();
    if (isLengthIncomplete(payload)) {
      payload = await retryWithCompactPrompt({ arkApiKey, arkBaseUrl, input });
      if (isLengthIncomplete(payload)) {
        return NextResponse.json(
          { success: false, error: '模型输出被截断（长度限制），请重试一次' },
          { status: 502 }
        );
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
    const normalized = normalizeQimenResult(parsedModel, input);

    return NextResponse.json(
      {
        success: true,
        data: normalized,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ success: false, error: '测算超时，请稍后重试' }, { status: 504 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          success: false,
          error: '模型返回格式不合法，请稍后重试',
          details: error.issues,
        },
        { status: 502 }
      );
    }

    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { success: false, error: '模型返回内容不可解析，请稍后重试' },
        { status: 502 }
      );
    }

    if (error instanceof UpstreamModelError) {
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
        { status: error.status }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '服务暂时不可用，请稍后重试',
      },
      { status: 500 }
    );
  }
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

async function retryWithCompactPrompt({
  arkApiKey,
  arkBaseUrl,
  input,
}: {
  arkApiKey: string;
  arkBaseUrl: string;
  input: QimenAnalyzeInput;
}) {
  const response = await fetch(`${arkBaseUrl}/responses`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${arkApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ARK_MODEL,
      input: [
        { role: 'system', content: buildCompactSystemPrompt() },
        { role: 'user', content: buildUserPrompt(input) },
      ],
      temperature: 0.15,
      max_output_tokens: RETRY_MAX_OUTPUT_TOKENS,
      reasoning: { effort: 'low' },
      text: { format: { type: 'json_object' } },
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new UpstreamModelError(mapArkError(response.status), response.status, text.slice(0, 200));
  }

  return response.json();
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
