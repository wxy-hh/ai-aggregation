/**
 * 奇门分析编排层（评审 C3 内部分段）。
 *
 * 对外窄接口：契约类型 + qimenAnalyzeRequestSchema + generateQimenBaseResult /
 * generateQimenSectionResult（模型调用入口）。prompt 构建（./qimen-prompts）与
 * schema（./qimen-schema）为内部段，不直接对外暴露。
 *
 * 依赖：destiny-model-client（模型调用）、model-json（JSON 抽取），均单向。
 */
import { callModel, ModelUpstreamError, type ModelConfig } from './destiny-model-client';
import { extractJsonBlock } from './model-json';
import {
  QIMEN_BASE_RESULT_SCHEMA,
  QIMEN_CHART_SUMMARY_SCHEMA,
  QIMEN_STRATEGY_OVERVIEW_SCHEMA,
  QIMEN_TIMING_WINDOWS_SCHEMA,
  qimenBaseResultSchema,
  qimenStrategyOverviewSchema,
  qimenTimingWindowsSchema,
  type JsonSchemaConfig,
} from './qimen-schema';
import {
  buildBaseSystemPrompt,
  buildStrategySystemPrompt,
  buildSummarySystemPrompt,
  buildTimingSystemPrompt,
  buildUserPrompt,
} from './qimen-prompts';
import type {
  QimenAnalysisBaseResult,
  QimenAnalyzeRequest,
  QimenBoardCell,
  QimenOutputLength,
  QimenSectionKey,
  QimenSectionResultMap,
  QimenStrategyOverview,
  QimenTimingWindow,
} from './qimen-types';

// 契约层以单一来源对外导出（类型 + 请求校验 schema）
export * from './qimen-types';
export { qimenAnalyzeRequestSchema } from './qimen-schema';

// ==================== 模型时间预算与兜底数据 ====================

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

type QimenTraceContext = {
  analysisId?: string;
  stage: 'baseResult' | QimenSectionKey;
  sectionKey?: QimenSectionKey;
  hooks?: {
    onRequestStart?: (
      meta: Record<string, unknown>
    ) => void | { maxOutputTokens?: number } | Promise<void | { maxOutputTokens?: number }>;
    onRequestSuccess?: (meta: Record<string, unknown>) => void | Promise<void>;
    onRequestNonOk?: (meta: Record<string, unknown>) => void | Promise<void>;
    onRequestTimeout?: (meta: Record<string, unknown>) => void | Promise<void>;
    onRequestError?: (meta: Record<string, unknown>) => void | Promise<void>;
  };
};

// ==================== AI 编排 ====================

export async function generateQimenBaseResult(
  input: QimenAnalyzeRequest,
  config: ModelConfig,
  trace?: QimenTraceContext,
  chart?: QimenAnalysisBaseResult
): Promise<QimenAnalysisBaseResult> {
  // 如果提供了本地排盘结果，直接返回，不再调用 LLM
  if (chart) {
    return chart;
  }

  // 兼容旧路径：LLM 自行排盘
  const result = await requestModelPayload({
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

  return normalizeBaseResult(parseModelJson(result.text));
}

export async function generateQimenSectionResult<K extends QimenSectionKey>(
  sectionKey: K,
  input: QimenAnalyzeRequest,
  config: ModelConfig,
  trace?: QimenTraceContext,
  chart?: QimenAnalysisBaseResult
): Promise<QimenSectionResultMap[K]> {
  switch (sectionKey) {
    case 'strategyOverview':
      return generateStrategyOverview(input, config, trace, chart) as Promise<
        QimenSectionResultMap[K]
      >;
    case 'timingWindows':
      return generateTimingWindows(input, config, trace, chart) as Promise<
        QimenSectionResultMap[K]
      >;
    case 'chartSummary':
      return generateChartSummary(input, config, trace, chart) as Promise<QimenSectionResultMap[K]>;
  }
}

async function generateStrategyOverview(
  input: QimenAnalyzeRequest,
  config: ModelConfig,
  trace?: QimenTraceContext,
  chart?: QimenAnalysisBaseResult
) {
  const hasChart = Boolean(chart);
  const result = await requestModelPayload({
    config,
    input: [
      { role: 'system', content: buildStrategySystemPrompt(input, hasChart) },
      { role: 'user', content: buildUserPrompt(input, chart) },
    ],
    maxOutputTokens: STRATEGY_MAX_OUTPUT_TOKENS,
    temperature: 0.2,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_strategy_overview', schema: QIMEN_STRATEGY_OVERVIEW_SCHEMA },
  });

  return normalizeStrategyOverview(parseModelJson(result.text), input);
}

async function generateTimingWindows(
  input: QimenAnalyzeRequest,
  config: ModelConfig,
  trace?: QimenTraceContext,
  chart?: QimenAnalysisBaseResult
) {
  const hasChart = Boolean(chart);
  const result = await requestModelPayload({
    config,
    input: [
      { role: 'system', content: buildTimingSystemPrompt(input, hasChart) },
      { role: 'user', content: buildUserPrompt(input, chart) },
    ],
    maxOutputTokens: TIMING_MAX_OUTPUT_TOKENS,
    temperature: 0.15,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_timing_windows', schema: QIMEN_TIMING_WINDOWS_SCHEMA },
  });

  return normalizeTimingWindows(parseModelJson(result.text), input);
}

async function generateChartSummary(
  input: QimenAnalyzeRequest,
  config: ModelConfig,
  trace?: QimenTraceContext,
  chart?: QimenAnalysisBaseResult
) {
  const hasChart = Boolean(chart);
  const result = await requestModelPayload({
    config,
    input: [
      { role: 'system', content: buildSummarySystemPrompt(hasChart) },
      { role: 'user', content: buildUserPrompt(input, chart) },
    ],
    maxOutputTokens: SUMMARY_MAX_OUTPUT_TOKENS,
    temperature: 0.15,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
    jsonSchema: { name: 'qimen_chart_summary', schema: QIMEN_CHART_SUMMARY_SCHEMA },
  });

  return normalizeChartSummary(parseModelJson(result.text));
}

async function requestModelPayload({
  config,
  input,
  maxOutputTokens,
  temperature,
  timeoutMs,
  trace,
  jsonSchema,
}: {
  config: ModelConfig;
  input: Array<{ role: 'system' | 'user'; content: string }>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  trace?: QimenTraceContext;
  jsonSchema?: JsonSchemaConfig;
}) {
  const startedAt = Date.now();

  const requestStartResult = await trace?.hooks?.onRequestStart?.({
    analysisId: trace?.analysisId,
    stage: trace?.stage,
    sectionKey: trace?.sectionKey,
    model: config.model,
    provider: config.provider,
    maxOutputTokens,
    timeoutMs,
    messages: input,
  });
  const overriddenMaxTokens = requestStartResult?.maxOutputTokens;
  const effectiveMaxOutputTokens =
    typeof overriddenMaxTokens === 'number' && Number.isFinite(overriddenMaxTokens)
      ? Math.max(1, Math.min(maxOutputTokens, Math.floor(overriddenMaxTokens)))
      : maxOutputTokens;

  try {
    const result = await callModel({
      config,
      messages: input,
      maxTokens: effectiveMaxOutputTokens,
      temperature,
      timeoutMs,
      json: jsonSchema
        ? { schema: { name: jsonSchema.name, schema: jsonSchema.schema } }
        : undefined,
    });

    await trace?.hooks?.onRequestSuccess?.({
      analysisId: trace?.analysisId,
      stage: trace?.stage,
      sectionKey: trace?.sectionKey,
      status: 200,
      durationMs: Date.now() - startedAt,
      payload: result.raw,
      maxOutputTokens: effectiveMaxOutputTokens,
    });
    return result;
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      await trace?.hooks?.onRequestTimeout?.({
        analysisId: trace?.analysisId,
        stage: trace?.stage,
        sectionKey: trace?.sectionKey,
        timeoutMs,
        durationMs: Date.now() - startedAt,
      });
      throw new UpstreamModelError('模型推演超时，请稍后重试', 504);
    }

    if (error instanceof ModelUpstreamError) {
      await trace?.hooks?.onRequestNonOk?.({
        analysisId: trace?.analysisId,
        stage: trace?.stage,
        sectionKey: trace?.sectionKey,
        status: error.status,
        durationMs: Date.now() - startedAt,
      });
      throw new UpstreamModelError(error.message, error.status);
    }

    await trace?.hooks?.onRequestError?.({
      analysisId: trace?.analysisId,
      stage: trace?.stage,
      sectionKey: trace?.sectionKey,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

// ==================== 结果归一化 ====================

function normalizeBaseResult(payload: unknown): QimenAnalysisBaseResult {
  const parsed = qimenBaseResultSchema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }

  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
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
      wuxing: typeof row.wuxing === 'string' ? row.wuxing : undefined,
      pattern: typeof row.pattern === 'string' ? row.pattern : undefined,
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
      wuxing: (value.wuxing ?? (fallback as Record<string, unknown>).wuxing) as string | undefined,
      pattern: (value.pattern ?? (fallback as Record<string, unknown>).pattern) as
        | string
        | undefined,
    };
  });

  return {
    chartTitle: sanitizeText(
      typeof raw.chartTitle === 'string' ? raw.chartTitle : '奇门遁甲排盘',
      32
    ),
    chartMeta: {
      dun: sanitizeText(typeof chartMetaRaw.dun === 'string' ? chartMetaRaw.dun : '', 12),
      ju: sanitizeText(typeof chartMetaRaw.ju === 'string' ? chartMetaRaw.ju : '', 12),
      jiaziXunkong: sanitizeText(
        typeof chartMetaRaw.jiaziXunkong === 'string' ? chartMetaRaw.jiaziXunkong : '',
        20
      ),
      horsePosition: sanitizeText(
        typeof chartMetaRaw.horsePosition === 'string' ? chartMetaRaw.horsePosition : '',
        20
      ),
      valueSymbol: sanitizeText(
        typeof chartMetaRaw.valueSymbol === 'string' ? chartMetaRaw.valueSymbol : '',
        16
      ),
      valueDoor: sanitizeText(
        typeof chartMetaRaw.valueDoor === 'string' ? chartMetaRaw.valueDoor : '',
        16
      ),
      xunshou: sanitizeText(
        typeof chartMetaRaw.xunshou === 'string' ? chartMetaRaw.xunshou : '',
        8
      ),
      riGan: sanitizeText(typeof chartMetaRaw.riGan === 'string' ? chartMetaRaw.riGan : '', 4),
      shiGan: sanitizeText(typeof chartMetaRaw.shiGan === 'string' ? chartMetaRaw.shiGan : '', 4),
      trueSolarTime:
        typeof chartMetaRaw.trueSolarTime === 'string'
          ? sanitizeText(chartMetaRaw.trueSolarTime, 32)
          : undefined,
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

  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
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
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
  const timingWindowsRaw = Array.isArray(raw.timingWindows)
    ? raw.timingWindows
    : Array.isArray(payload)
      ? payload
      : [];

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

  return timingWindows.length >= 1
    ? timingWindows
    : buildFallbackTimingWindows(input.question.outputLength);
}

function normalizeChartSummary(payload: unknown): string {
  const raw = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};
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

// extractArkOutputText / extractJsonBlock 已收敛至 ./model-json（评审 C2 唯一实现）

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