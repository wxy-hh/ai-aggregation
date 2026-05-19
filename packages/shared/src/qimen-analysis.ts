import { z } from 'zod';

export type QimenQuestionCategory =
  | 'career'
  | 'wealth'
  | 'love'
  | 'health'
  | 'decision'
  | 'study'
  | 'other';

export type QimenChartMethod = 'time' | 'daily';
export type QimenAnalysisFocus = 'short_term' | 'long_term' | 'risk_control';
export type QimenOutputStyle = 'professional' | 'plain';
export type QimenOutputLength = 'brief' | 'detailed';

export type QimenAnalyzeRequest = {
  context: {
    datetime: string;
    location: string;
    chartMethod: QimenChartMethod;
  };
  question: {
    category: QimenQuestionCategory;
    description: string;
    focus: QimenAnalysisFocus;
    outputStyle: QimenOutputStyle;
    outputLength: QimenOutputLength;
  };
};

export type QimenBoardCell = {
  palace: string;
  luoshu: number;
  direction: string;
  god: string;
  star: string;
  door: string;
  heavenStem: string;
  earthStem: string;
  isValueSymbol?: boolean;
  isValueDoor?: boolean;
  isVoid?: boolean;
  isHorse?: boolean;
};

export type QimenAnalysisBaseResult = {
  chartTitle: string;
  chartMeta: {
    dun: string;
    ju: string;
    jiaziXunkong: string;
    horsePosition: string;
    valueSymbol: string;
    valueDoor: string;
  };
  board: QimenBoardCell[];
  score: number;
  disclaimer: string;
};

export type QimenStrategyOverview = {
  overallAssessment: string;
  riskAlerts: string[];
  actionSuggestions: string[];
};

export type QimenTimingWindow = {
  period: string;
  guidance: string;
};

export type QimenSectionKey = 'strategyOverview' | 'timingWindows' | 'chartSummary';
export type QimenQuerySectionKey = QimenSectionKey | 'baseResult';
export type QimenSectionTaskStatus = 'pending' | 'completed' | 'failed';

export type QimenSectionResultMap = {
  strategyOverview: QimenStrategyOverview;
  timingWindows: QimenTimingWindow[];
  chartSummary: string;
};

export type QimenAnalysisStartResponse = {
  success: true;
  analysisId: string;
  baseResult: QimenAnalysisBaseResult;
};

export type QimenSectionResponseMap = {
  baseResult: QimenAnalysisBaseResult;
  strategyOverview: QimenStrategyOverview;
  timingWindows: QimenTimingWindow[];
  chartSummary: string;
};

export const qimenAnalyzeRequestSchema = z.object({
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

const qimenCellSchema = z.object({
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

const qimenBaseResultSchema = z.object({
  chartTitle: z.string().trim().min(1),
  chartMeta: z.object({
    dun: z.string().trim().min(1),
    ju: z.string().trim().min(1),
    jiaziXunkong: z.string().trim().min(1),
    horsePosition: z.string().trim().min(1),
    valueSymbol: z.string().trim().min(1),
    valueDoor: z.string().trim().min(1),
  }),
  board: z.array(qimenCellSchema).min(9).max(9),
  score: z.number().int().min(40).max(95),
  disclaimer: z.string().trim().min(1),
});

const qimenStrategyOverviewSchema = z.object({
  overallAssessment: z.string().trim().min(1),
  riskAlerts: z.array(z.string().trim().min(1)).min(3).max(6),
  actionSuggestions: z.array(z.string().trim().min(1)).min(3).max(6),
});

const qimenTimingWindowsSchema = z.array(
  z.object({
    period: z.string().trim().min(1),
    guidance: z.string().trim().min(1),
  })
);

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

// JSON Schema 常量，用于 Doubao json_schema 结构化输出
const QIMEN_BASE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    chartTitle: { type: 'string' },
    chartMeta: {
      type: 'object',
      properties: {
        dun: { type: 'string' },
        ju: { type: 'string' },
        jiaziXunkong: { type: 'string' },
        horsePosition: { type: 'string' },
        valueSymbol: { type: 'string' },
        valueDoor: { type: 'string' },
      },
      required: ['dun', 'ju', 'jiaziXunkong', 'horsePosition', 'valueSymbol', 'valueDoor'],
      additionalProperties: false,
    },
    board: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          palace: { type: 'string' },
          luoshu: { type: 'integer', minimum: 1, maximum: 9 },
          direction: { type: 'string' },
          god: { type: 'string' },
          star: { type: 'string' },
          door: { type: 'string' },
          heavenStem: { type: 'string' },
          earthStem: { type: 'string' },
          isValueSymbol: { type: 'boolean' },
          isValueDoor: { type: 'boolean' },
          isVoid: { type: 'boolean' },
          isHorse: { type: 'boolean' },
        },
        required: ['palace', 'luoshu', 'direction', 'god', 'star', 'door', 'heavenStem', 'earthStem'],
        additionalProperties: false,
      },
    },
    score: { type: 'integer', minimum: 40, maximum: 95 },
    disclaimer: { type: 'string' },
  },
  required: ['chartTitle', 'chartMeta', 'board', 'score', 'disclaimer'],
  additionalProperties: false,
} as const;

const QIMEN_STRATEGY_OVERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    overallAssessment: { type: 'string' },
    riskAlerts: { type: 'array', items: { type: 'string' } },
    actionSuggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['overallAssessment', 'riskAlerts', 'actionSuggestions'],
  additionalProperties: false,
} as const;

const QIMEN_TIMING_WINDOWS_SCHEMA = {
  type: 'object',
  properties: {
    timingWindows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          period: { type: 'string' },
          guidance: { type: 'string' },
        },
        required: ['period', 'guidance'],
        additionalProperties: false,
      },
    },
  },
  required: ['timingWindows'],
  additionalProperties: false,
} as const;

const QIMEN_CHART_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    chartSummary: { type: 'string' },
  },
  required: ['chartSummary'],
  additionalProperties: false,
} as const;

type JsonSchemaConfig = { name: string; schema: Record<string, unknown> };

const ARK_MODEL = 'doubao-seed-2-0-lite-260428';
// 异步 worker 链路与页面直连链路需要保持一致的模型时间预算。
// 当前奇门能力使用强推理模型，40-45s 在生产环境中会被频繁打断。
const BASE_STAGE_TIMEOUT_MS = 300000;
const SECTION_STAGE_TIMEOUT_MS = 300000;
// Seed 2.0 模型强制推理，约 75% 输出 token 用于推理过程，需预留充足预算
const BASE_MAX_OUTPUT_TOKENS = 8192;
const STRATEGY_MAX_OUTPUT_TOKENS = 8192;
const TIMING_MAX_OUTPUT_TOKENS = 4096;
const SUMMARY_MAX_OUTPUT_TOKENS = 4096;

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

type ArkConfig = {
  apiKey: string;
  baseUrl: string;
};

type QimenTraceContext = {
  analysisId?: string;
  stage: 'baseResult' | QimenSectionKey;
  sectionKey?: QimenSectionKey;
  hooks?: {
    onRequestStart?: (meta: Record<string, unknown>) => void;
    onRequestSuccess?: (meta: Record<string, unknown>) => void;
    onRequestNonOk?: (meta: Record<string, unknown>) => void;
    onRequestTimeout?: (meta: Record<string, unknown>) => void;
    onRequestError?: (meta: Record<string, unknown>) => void;
  };
};

export function resolveArkConfig(env: NodeJS.ProcessEnv): ArkConfig {
  const apiKey = env.ARK_API_KEY;
  if (!apiKey) {
    throw new Error('Missing ARK_API_KEY');
  }

  return {
    apiKey,
    baseUrl: env.ARK_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3',
  };
}

export async function generateQimenBaseResult(
  input: QimenAnalyzeRequest,
  config: ArkConfig,
  trace?: QimenTraceContext
): Promise<QimenAnalysisBaseResult> {
  const payload = await requestArkPayload({
    config,
    input: [
      { role: 'system', content: buildBaseSystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxOutputTokens: BASE_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: BASE_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_base_result', schema: QIMEN_BASE_RESULT_SCHEMA },
  });

  return normalizeBaseResult(parseModelJson(extractArkOutputText(payload)));
}

export async function generateQimenSectionResult<K extends QimenSectionKey>(
  sectionKey: K,
  input: QimenAnalyzeRequest,
  config: ArkConfig,
  trace?: QimenTraceContext
): Promise<QimenSectionResultMap[K]> {
  switch (sectionKey) {
    case 'strategyOverview':
      return generateStrategyOverview(input, config, trace) as Promise<QimenSectionResultMap[K]>;
    case 'timingWindows':
      return generateTimingWindows(input, config, trace) as Promise<QimenSectionResultMap[K]>;
    case 'chartSummary':
      return generateChartSummary(input, config, trace) as Promise<QimenSectionResultMap[K]>;
  }
}

async function generateStrategyOverview(
  input: QimenAnalyzeRequest,
  config: ArkConfig,
  trace?: QimenTraceContext
) {
  const payload = await requestArkPayload({
    config,
    input: [
      { role: 'system', content: buildStrategySystemPrompt(input) },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxOutputTokens: STRATEGY_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_strategy_overview', schema: QIMEN_STRATEGY_OVERVIEW_SCHEMA },
  });

  return normalizeStrategyOverview(parseModelJson(extractArkOutputText(payload)), input);
}

async function generateTimingWindows(
  input: QimenAnalyzeRequest,
  config: ArkConfig,
  trace?: QimenTraceContext
) {
  const payload = await requestArkPayload({
    config,
    input: [
      { role: 'system', content: buildTimingSystemPrompt(input) },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxOutputTokens: TIMING_MAX_OUTPUT_TOKENS,
    temperature: 0.15,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_timing_windows', schema: QIMEN_TIMING_WINDOWS_SCHEMA },
  });

  return normalizeTimingWindows(parseModelJson(extractArkOutputText(payload)), input);
}

async function generateChartSummary(
  input: QimenAnalyzeRequest,
  config: ArkConfig,
  trace?: QimenTraceContext
) {
  const payload = await requestArkPayload({
    config,
    input: [
      { role: 'system', content: buildSummarySystemPrompt() },
      { role: 'user', content: buildUserPrompt(input) },
    ],
    maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
    temperature: 0.15,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_chart_summary', schema: QIMEN_CHART_SUMMARY_SCHEMA },
  });

  return normalizeChartSummary(parseModelJson(extractArkOutputText(payload)));
}

async function requestArkPayload({
  config,
  input,
  maxOutputTokens,
  temperature,
  timeoutMs,
  trace,
  jsonSchema,
}: {
  config: ArkConfig;
  input: Array<{ role: 'system' | 'user'; content: string }>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  trace?: QimenTraceContext;
  jsonSchema?: JsonSchemaConfig;
}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();

  trace?.hooks?.onRequestStart?.({
    analysisId: trace?.analysisId,
    stage: trace?.stage,
    sectionKey: trace?.sectionKey,
    model: ARK_MODEL,
    maxOutputTokens,
    timeoutMs,
  });

  try {
    const response = await fetch(`${config.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: ARK_MODEL,
        input,
        temperature,
        max_output_tokens: maxOutputTokens,
        reasoning: { effort: 'low' },
        text: jsonSchema
          ? { format: { type: 'json_schema', name: jsonSchema.name, schema: jsonSchema.schema } }
          : { format: { type: 'json_object' } },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const text = await response.text();
      trace?.hooks?.onRequestNonOk?.({
        analysisId: trace?.analysisId,
        stage: trace?.stage,
        sectionKey: trace?.sectionKey,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });
      throw new UpstreamModelError(mapArkError(response.status), response.status, text.slice(0, 400));
    }

    const payload = await response.json();
    trace?.hooks?.onRequestSuccess?.({
      analysisId: trace?.analysisId,
      stage: trace?.stage,
      sectionKey: trace?.sectionKey,
      status: response.status,
      durationMs: Date.now() - startedAt,
      payload,
    });
    return payload;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      trace?.hooks?.onRequestTimeout?.({
        analysisId: trace?.analysisId,
        stage: trace?.stage,
        sectionKey: trace?.sectionKey,
        timeoutMs,
        durationMs: Date.now() - startedAt,
      });
      throw new UpstreamModelError('模型推演超时，请稍后重试', 504);
    }

    trace?.hooks?.onRequestError?.({
      analysisId: trace?.analysisId,
      stage: trace?.stage,
      sectionKey: trace?.sectionKey,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildUserPrompt(input: QimenAnalyzeRequest) {
  return [
    '请根据以下信息输出奇门基础盘面 JSON：',
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

function buildBaseSystemPrompt() {
  return `
你是奇门遁甲排盘助手。必须严格输出 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

你的任务是只生成首屏基础盘面，字段必须且仅能包含：
- chartTitle
- chartMeta: dun, ju, jiaziXunkong, horsePosition, valueSymbol, valueDoor
- board: 9项，宫位顺序必须是 [巽四宫,离九宫,坤二宫,震三宫,中五宫,兑七宫,艮八宫,坎一宫,乾六宫]
- score
- disclaimer

要求：
1. board 字段必须完整，不能省略宫位
2. 每个字段内容简洁，适合首屏直接展示
3. 不要输出 overallAssessment、riskAlerts、actionSuggestions、timingWindows、chartSummary
4. disclaimer 控制在一句话内
`.trim();
}

function buildStrategySystemPrompt(input: QimenAnalyzeRequest) {
  const maxListCount = input.question.outputLength === 'brief' ? 3 : 5;

  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字、解释和 markdown。
禁止输出思考过程。

为前端右侧策略区生成最终定稿，必须且仅返回：
- overallAssessment: 一段完整综合判断，1-2 句
- riskAlerts: ${maxListCount} 条完整风险提醒
- actionSuggestions: ${maxListCount} 条完整行动建议

要求：
1. 返回内容必须是最终版，禁止续写、禁止占位、禁止后续修订
2. riskAlerts 与 actionSuggestions 每条都要独立成句
3. 不要输出 board、chartMeta、timingWindows、chartSummary、score、disclaimer

返回格式：
{
  "overallAssessment": "string",
  "riskAlerts": ["string"],
  "actionSuggestions": ["string"]
}
`.trim();
}

function buildTimingSystemPrompt(input: QimenAnalyzeRequest) {
  const maxTimingCount = input.question.outputLength === 'brief' ? 2 : 4;

  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

只生成“关键时间窗口”最终定稿，必须且仅返回：
{
  "timingWindows": [
    { "period": "string", "guidance": "string" }
  ]
}

要求：
1. 输出 ${maxTimingCount} 项以内的完整时间窗口
2. 每项 period 与 guidance 都必须可直接展示
3. 禁止占位、禁止续写、禁止后续修订
4. 不要输出其他字段
`.trim();
}

function buildSummarySystemPrompt() {
  return `
你是专业奇门遁甲分析助手。必须仅返回合法 JSON 对象，禁止输出任何额外文字。
禁止输出思考过程。

只生成“盘局摘要”最终定稿，必须且仅返回：
{
  "chartSummary": "string"
}

要求：
1. 输出 1-2 句完整总结
2. 可直接展示，禁止续写、禁止占位、禁止后续修订
3. 不要输出其他字段
`.trim();
}

function normalizeBaseResult(payload: unknown): QimenAnalysisBaseResult {
  const parsed = qimenBaseResultSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  const raw =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const chartMetaRaw =
    raw.chartMeta && typeof raw.chartMeta === 'object'
      ? (raw.chartMeta as Record<string, unknown>)
      : {};
  const boardRaw = Array.isArray(raw.board) ? raw.board : [];

  const boardByPalace = new Map<string, Partial<QimenBoardCell>>();
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

  const board = PALACE_ORDER.map((palace, index) => {
    const fallback = FALLBACK_BOARD[index];
    const value = {
      ...fallback,
      ...boardByPalace.get(palace),
    };

    return {
      palace,
      luoshu: Math.max(1, Math.min(9, Number(value.luoshu ?? fallback.luoshu))),
      direction: sanitizeText(value.direction ?? fallback.direction, 6),
      god: sanitizeText(value.god ?? fallback.god, 4),
      star: sanitizeText(value.star ?? fallback.star, 4),
      door: sanitizeText(value.door ?? fallback.door, 4),
      heavenStem: sanitizeText(value.heavenStem ?? fallback.heavenStem, 2),
      earthStem: sanitizeText(value.earthStem ?? fallback.earthStem, 2),
      isValueSymbol: Boolean(value.isValueSymbol),
      isValueDoor: Boolean(value.isValueDoor),
      isVoid: Boolean(value.isVoid),
      isHorse: Boolean(value.isHorse),
    };
  });

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
    board,
    score: Math.max(40, Math.min(95, Math.round(typeof raw.score === 'number' ? raw.score : 78))),
    disclaimer:
      sanitizeText(typeof raw.disclaimer === 'string' ? raw.disclaimer : '', 120) ||
      '本排盘与分析仅供传统民俗文化研究和策略参考，不构成任何现实决策承诺。',
  };
}

function normalizeStrategyOverview(
  payload: unknown,
  input: QimenAnalyzeRequest
): QimenStrategyOverview {
  const parsed = qimenStrategyOverviewSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  const raw =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const riskAlertsRaw = Array.isArray(raw.riskAlerts) ? raw.riskAlerts : [];
  const actionSuggestionsRaw = Array.isArray(raw.actionSuggestions) ? raw.actionSuggestions : [];

  return {
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
      ['注意信息不完整导致误判', '避免情绪驱动下做不可逆决策', '重要协同节点需预留缓冲']
    ),
    actionSuggestions: normalizeStringList(
      actionSuggestionsRaw.filter((item): item is string => typeof item === 'string'),
      input.question.outputLength === 'brief' ? 3 : 5,
      78,
      ['先做小范围验证再扩大投入', '聚焦单一目标推进主线', '以周为单位复盘并调整策略']
    ),
  };
}

function normalizeTimingWindows(payload: unknown, input: QimenAnalyzeRequest): QimenTimingWindow[] {
  const raw =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const timingWindowsRaw =
    Array.isArray(raw.timingWindows) ? raw.timingWindows : Array.isArray(payload) ? payload : [];

  const parsed = qimenTimingWindowsSchema.safeParse(timingWindowsRaw);
  if (parsed.success && parsed.data.length >= 1) {
    return parsed.data.slice(0, input.question.outputLength === 'brief' ? 2 : 4);
  }

  const timingWindows = timingWindowsRaw
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      return {
        period: sanitizeText(typeof row.period === 'string' ? row.period : '', 44),
        guidance: sanitizeText(typeof row.guidance === 'string' ? row.guidance : '', 120),
      };
    })
    .filter((item): item is QimenTimingWindow => Boolean(item?.period && item?.guidance))
    .slice(0, input.question.outputLength === 'brief' ? 2 : 4);

  return timingWindows.length >= 1 ? timingWindows : buildFallbackTimingWindows(input.question.outputLength);
}

function normalizeChartSummary(payload: unknown): string {
  const raw =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  return sanitizeText(
    typeof raw.chartSummary === 'string'
      ? raw.chartSummary
      : '当前盘局显示先稳后进为宜，需重视节奏控制与信息验证。',
    260
  );
}

function normalizeStringList(
  items: string[],
  maxCount: number,
  maxLen: number,
  fallback: string[]
) {
  const deduped = Array.from(
    new Set(items.map((item) => sanitizeText(item, maxLen)).filter(Boolean))
  );

  if (deduped.length === 0) {
    return fallback.slice(0, maxCount).map((item) => sanitizeText(item, maxLen));
  }

  return deduped.slice(0, maxCount);
}

function buildFallbackTimingWindows(outputLength: QimenOutputLength) {
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

export function extractArkOutputText(result: unknown): string {
  if (!result || typeof result !== 'object') {
    throw new Error('ARK 响应为空');
  }

  const payload = result as Record<string, unknown>;
  const topLevelText = payload.output_text;
  if (typeof topLevelText === 'string' && topLevelText.trim()) {
    return topLevelText.trim();
  }

  const output = payload.output;
  if (!Array.isArray(output)) {
    throw new Error('ARK 响应格式不合法');
  }

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const typed = item as Record<string, unknown>;
    if (typed.type !== 'message') continue;

    if (typeof typed.content === 'string' && typed.content.trim()) {
      return typed.content.trim();
    }

    if (!Array.isArray(typed.content)) continue;

    for (const content of typed.content) {
      if (!content || typeof content !== 'object') continue;
      const part = content as Record<string, unknown>;
      const partType = part.type;
      const text = part.text;

      if ((partType === 'output_text' || partType === 'text') && typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed) return trimmed;
      }

      if (partType === 'output_json' && part.json && typeof part.json === 'object') {
        return JSON.stringify(part.json);
      }
    }
  }

  throw new Error('ARK 未返回有效文本');
}

export function extractJsonBlock(text: string): string {
  const cleaned = text.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return cleaned;
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

      try {
        return JSON.parse(candidate);
      } catch {
        try {
          return Function(`"use strict"; return (${candidate});`)();
        } catch {
          return {};
        }
      }
    }

    return {};
  }
}

function sanitizeText(value: string, maxLen: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function mapArkError(status: number) {
  if (status === 429) return '请求过于频繁，请稍后重试';
  if (status >= 500) return '模型服务暂时不可用，请稍后重试';
  return '模型调用失败，请稍后重试';
}
