// ============================================
// 供应商用量归一化 — 全仓唯一实现
// --------------------------------------------
// 职责：把各供应商的原始 usage（snake_case / camelCase / 嵌套 details）
// 归一化为统一结构 NormalizedAiUsage（评审 C3：原 db 版与 destiny 简版并存，
// 本文件为唯一权威；db 包与 destiny-model-client 均复用）。
//
// 行为约定：
// - 空/非法输入：返回「全 null + taskCount=1」（不返回 null，字段面稳定）；
// - totalTokens 缺失时可从 input+output 合计；
// - cachedTokens/reasoningTokens 从主流供应商的嵌套 details 提取。
// ============================================

import type { NormalizedAiUsage } from './types/ai-usage';

/** 仅接受有限数字（含字符串数字），负数/小数按 0/取整处理 */
function toInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed));
    }
  }

  return null;
}

/** 依次取第一个有效 token 计数值（支持数字、字符串数字、负数净化） */
function pickTokenCount(...values: unknown[]): number | null {
  for (const value of values) {
    const result = toInteger(value);
    if (result !== null) {
      return result;
    }
  }

  return null;
}

/**
 * 归一化供应商原始 usage。
 *
 * 兼容字段面：
 * - input：inputTokens / input_tokens / promptTokens / prompt_tokens（含 cached 细节）
 * - output：outputTokens / output_tokens / completionTokens / completion_tokens（含 reasoning 细节）
 * - total：totalTokens / total_tokens（缺失时按 input+output 合计）
 */
export function normalizeUsage(rawUsage: unknown): NormalizedAiUsage {
  if (!rawUsage || typeof rawUsage !== 'object') {
    return {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: null,
      taskCount: 1,
    };
  }

  const usage = rawUsage as Record<string, unknown>;
  const inputDetails =
    usage.input_tokens_details && typeof usage.input_tokens_details === 'object'
      ? (usage.input_tokens_details as Record<string, unknown>)
      : null;
  const outputDetails =
    usage.output_tokens_details && typeof usage.output_tokens_details === 'object'
      ? (usage.output_tokens_details as Record<string, unknown>)
      : null;
  const inputTokenDetails =
    usage.inputTokenDetails && typeof usage.inputTokenDetails === 'object'
      ? (usage.inputTokenDetails as Record<string, unknown>)
      : null;
  const outputTokenDetails =
    usage.outputTokenDetails && typeof usage.outputTokenDetails === 'object'
      ? (usage.outputTokenDetails as Record<string, unknown>)
      : null;

  const inputTokens = pickTokenCount(
    usage.inputTokens,
    usage.input_tokens,
    usage.promptTokens,
    usage.prompt_tokens
  );
  const outputTokens = pickTokenCount(
    usage.outputTokens,
    usage.output_tokens,
    usage.completionTokens,
    usage.completion_tokens
  );
  const totalTokens = pickTokenCount(usage.totalTokens, usage.total_tokens);
  const cachedTokens = pickTokenCount(
    usage.cachedTokens,
    usage.cachedInputTokens,
    inputDetails?.cached_tokens,
    inputTokenDetails?.cacheReadTokens
  );
  const reasoningTokens = pickTokenCount(
    usage.reasoningTokens,
    outputDetails?.reasoning_tokens,
    outputTokenDetails?.reasoningTokens
  );

  return {
    inputTokens,
    outputTokens,
    totalTokens:
      totalTokens ??
      (inputTokens !== null || outputTokens !== null
        ? (inputTokens ?? 0) + (outputTokens ?? 0)
        : null),
    cachedTokens,
    reasoningTokens,
    taskCount: 1,
    rawUsage,
  };
}
