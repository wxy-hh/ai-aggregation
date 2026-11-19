/**
 * 奇门分析编排层（评审 C3 纯函数契约）。
 *
 * 对外窄接口：契约类型 + qimenAnalyzeRequestSchema + buildQimenSectionMessages（预留输入估算消息）
 * + generateQimenSectionResult（预算入参 → 结果与用量物料二元组）。prompt 构建（./qimen-prompts）与
 * schema（./qimen-schema）为内部段，不直接对外暴露。观测日志内聚本层（@repo/logger）。
 *
 * 依赖：destiny-model-client（模型调用）、model-json（JSON 抽取），均单向。
 */
import { logger } from '@repo/logger';
import { callModel, ModelUpstreamError, type ModelConfig } from './destiny-model-client';
import { extractJsonBlock } from './model-json';
import {
  QIMEN_CHART_SUMMARY_SCHEMA,
  QIMEN_STRATEGY_OVERVIEW_SCHEMA,
  QIMEN_TIMING_WINDOWS_SCHEMA,
  qimenStrategyOverviewSchema,
  qimenTimingWindowsSchema,
  type JsonSchemaConfig,
} from './qimen-schema';
import {
  buildStrategySystemPrompt,
  buildSummarySystemPrompt,
  buildTimingSystemPrompt,
  buildUserPrompt,
} from './qimen-prompts';
import type {
  QimenAnalysisBaseResult,
  QimenAnalyzeRequest,
  QimenSectionKey,
  QimenSectionResultMap,
  QimenTimingWindow,
} from './qimen-types';

// 契约层以单一来源对外导出（类型 + 请求校验 schema）
export * from './qimen-types';
export { qimenAnalyzeRequestSchema } from './qimen-schema';

// ==================== 模型时间预算 ====================

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

// 异步 worker 链路与页面直连链路需要保持一致的模型时间预算。
// 当前奇门能力使用强推理模型，40-45s 在生产环境中会被频繁打断。
const SECTION_STAGE_TIMEOUT_MS = 300000;
// Seed 2.0 模型强制推理，约 75% 输出 token 用于推理过程，需预留充足预算
const STRATEGY_MAX_OUTPUT_TOKENS = 8192;
const TIMING_MAX_OUTPUT_TOKENS = 4096;
const SUMMARY_MAX_OUTPUT_TOKENS = 4096;

/** 各分块程序内置输出上限（预留估算与预算收敛共用同一事实源） */
export const QIMEN_SECTION_MAX_OUTPUT_TOKENS = {
  strategyOverview: STRATEGY_MAX_OUTPUT_TOKENS,
  timingWindows: TIMING_MAX_OUTPUT_TOKENS,
  chartSummary: SUMMARY_MAX_OUTPUT_TOKENS,
} as const;

type QimenTraceContext = {
  analysisId?: string;
  stage: QimenSectionKey;
  sectionKey?: QimenSectionKey;
};

export interface GenerateQimenSectionOptions {
  /** 输出预算（通常为结算会话的 outputLimit），超过程序内置上限时按上限收敛 */
  maxOutputTokens?: number;
  trace?: QimenTraceContext;
  chart?: QimenAnalysisBaseResult;
}

/** 为预留阶段的输入 token 估算构造与模型调用完全一致的消息序列（单一事实源） */
export function buildQimenSectionMessages(
  sectionKey: QimenSectionKey,
  input: QimenAnalyzeRequest,
  chart?: QimenAnalysisBaseResult
): Array<{ role: 'system' | 'user'; content: string }> {
  const hasChart = Boolean(chart);
  const system =
    sectionKey === 'strategyOverview'
      ? buildStrategySystemPrompt(input, hasChart)
      : sectionKey === 'timingWindows'
        ? buildTimingSystemPrompt(input, hasChart)
        : buildSummarySystemPrompt(hasChart);

  return [
    { role: 'system', content: system },
    { role: 'user', content: buildUserPrompt(input, chart) },
  ];
}

// ==================== AI 编排 ====================

export async function generateQimenSectionResult<K extends QimenSectionKey>(
  sectionKey: K,
  input: QimenAnalyzeRequest,
  config: ModelConfig,
  options: GenerateQimenSectionOptions = {}
): Promise<{ value: QimenSectionResultMap[K]; usage: unknown }> {
  const messages = buildQimenSectionMessages(sectionKey, input, options.chart);
  const trace = options.trace;
  const programMax = QIMEN_SECTION_MAX_OUTPUT_TOKENS[sectionKey];
  const budget = options.maxOutputTokens;
  const effectiveMaxOutputTokens =
    typeof budget === 'number' && Number.isFinite(budget)
      ? Math.max(1, Math.min(programMax, Math.floor(budget)))
      : programMax;

  const request = {
    config,
    messages,
    maxOutputTokens: effectiveMaxOutputTokens,
    timeoutMs: SECTION_STAGE_TIMEOUT_MS,
    trace,
  };

  switch (sectionKey) {
    case 'strategyOverview': {
      const result = await requestModelPayload({
        ...request,
        temperature: 0.2,
        jsonSchema: { name: 'qimen_strategy_overview', schema: QIMEN_STRATEGY_OVERVIEW_SCHEMA },
      });
      const parsed = qimenStrategyOverviewSchema.safeParse(parseModelJson(result.text));
      if (!parsed.success) {
        throw new Error('奇门分块模型输出未通过契约校验（strategyOverview）');
      }
      return { value: parsed.data as QimenSectionResultMap[K], usage: result.rawUsage ?? null };
    }
    case 'timingWindows': {
      const result = await requestModelPayload({
        ...request,
        temperature: 0.15,
        jsonSchema: { name: 'qimen_timing_windows', schema: QIMEN_TIMING_WINDOWS_SCHEMA },
      });
      const payload = parseModelJson(result.text);
      // 上游结构化输出为 { timingWindows: [...] }，容错接受裸数组
      const timingRaw = Array.isArray(payload)
        ? payload
        : ((payload as Record<string, unknown> | null)?.timingWindows ?? []);
      const parsed = qimenTimingWindowsSchema.safeParse(timingRaw);
      if (!parsed.success || parsed.data.length < 1) {
        throw new Error('奇门分块模型输出未通过契约校验（timingWindows）');
      }
      const value = parsed.data.slice(
        0,
        input.question.outputLength === 'brief' ? 2 : 4
      ) as QimenSectionResultMap[K];
      return { value, usage: result.rawUsage ?? null };
    }
    case 'chartSummary': {
      const result = await requestModelPayload({
        ...request,
        temperature: 0.15,
        jsonSchema: { name: 'qimen_chart_summary', schema: QIMEN_CHART_SUMMARY_SCHEMA },
      });
      const payload = parseModelJson(result.text);
      const chartSummary =
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>).chartSummary
          : undefined;
      if (typeof chartSummary !== 'string' || !chartSummary.trim()) {
        throw new Error('奇门分块模型输出未通过契约校验（chartSummary）');
      }
      return {
        value: sanitizeText(chartSummary, 260) as QimenSectionResultMap[K],
        usage: result.rawUsage ?? null,
      };
    }
  }
}

async function requestModelPayload({
  config,
  messages,
  maxOutputTokens,
  temperature,
  timeoutMs,
  trace,
  jsonSchema,
}: {
  config: ModelConfig;
  messages: Array<{ role: 'system' | 'user'; content: string }>;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  trace?: QimenTraceContext;
  jsonSchema?: JsonSchemaConfig;
}) {
  const startedAt = Date.now();
  logger.info('奇门模型请求开始', trace ?? {});

  try {
    const result = await callModel({
      config,
      messages,
      maxTokens: maxOutputTokens,
      temperature,
      timeoutMs,
      json: jsonSchema ? { schema: { name: jsonSchema.name, schema: jsonSchema.schema } } : undefined,
    });

    logger.info('奇门模型请求完成', { ...trace, durationMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const isTimeout = error instanceof Error && error.name === 'AbortError';
    if (isTimeout) {
      logger.warn('奇门模型请求超时', { ...trace, timeoutMs, durationMs });
      throw new UpstreamModelError('模型推演超时，请稍后重试', 504);
    }

    if (error instanceof ModelUpstreamError) {
      logger.warn('奇门模型请求返回非成功状态', { ...trace, status: error.status, durationMs });
      throw new UpstreamModelError(error.message, error.status);
    }

    logger.error(
      '奇门模型请求失败',
      error instanceof Error ? error : new Error(String(error)),
      { ...trace, durationMs }
    );
    throw error;
  }
}

// ==================== 结果解析 ====================

function parseModelJson(text: string): unknown {
  const source = extractJsonBlock(text).trim();

  try {
    return JSON.parse(source);
  } catch {
    // 继续走容错恢复
  }

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
        // 落入下方统一抛错
      }
    }
  }

  throw new Error('奇门模型请求返回的 JSON 无法解析');
}

function sanitizeText(value: string, maxLen: number) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}
