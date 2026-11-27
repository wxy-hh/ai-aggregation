import type { CaseExecution } from './case-executor';

/**
 * 真实 adapter 在执行前声明的观测能力：与生产 ChatStreamEvent 联合类型一一对应。
 * 明确不含 chunks_retrieved / ssrf_blocked —— 生产 SSE 没有对应事件，
 * 这些题按能力矩阵判为 UnscoredCase（ADR-0067「已知至少 10 题不可评分」）。
 */
export const REAL_ADAPTER_CAPABILITIES = new Set<string>([
  // 空工具注册表下阶段推进永不发生（推进只发生在本地工具执行后），
  // 规划检查点终态不可观测，故预先声明为能力外 → 规划题判 UnscoredCase，
  // 不把「装配前提不成立」误判为模型能力失败（S-H6）。
  'final_answer',
]);

/** onFinish 完成回调的结构化子集（不依赖 apps/web 内部类型，保持 shared 纯函数） */
export interface FinishLike {
  outcome?: 'success' | 'partial' | 'failed' | string;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
  durationMs?: number;
  /** 失败/取消原因（ChatStreamFinish.reason），用于区分真实异常与正常「无产出」收尾 */
  reason?: string;
  /** 本地墙钟超时触发（适配器 AbortController 中止），用于区分 timeout 与用户中止/异常 */
  localTimedOut?: boolean;
  /** 累计输出文本，正常空回答时为空字符串 */
  outputText?: string;
  /** 单步终止帧 usage，仅用于证明它不等于多步累计值；本函数绝不读取它 */
  doneFrameUsage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number } | null;
}

/**
 * 从完成回调提取计量事实：用量与耗时只取自 onFinish 的累计值。
 * 绝不把 SSE 单步终止帧 done.usage 当作多步总用量；缺失真实用量时如实标为估算。
 * 执行成功态由 outcome 推导，让超时/异常/中止能在编排层进入 execution_error 三态。
 */
export function extractFinishFacts(finish: FinishLike): Pick<
  CaseExecution,
  'usage' | 'latencyMs' | 'usageEstimated' | 'provenance' | 'executionSucceeded' | 'abnormalReason'
> {
  const usage = finish.usage;
  const hasRealUsage = Boolean(usage && typeof usage.totalTokens === 'number');

  // outcome 语义（agent-runner.ts:1042/1054/1099/1109）：
  // - success：正常完成
  // - partial：有输出但中断 → aborted
  // - failed：既用于「正常收尾但无产出」，也用于异常；用 reason / outputText / 本地超时细分。
  //   正常空回答（failed 且无异常 reason、无本地超时）仍属执行成功，空回答交给确定性裁决判负，
  //   绝不记为 execution_error（spec US 16）。
  const reason = finish.reason?.trim() || '';
  const normalEmptyFinish =
    finish.outcome === 'failed' && !reason && !finish.localTimedOut && !finish.outputText;
  const succeeded =
    finish.outcome === 'success' || finish.outcome === undefined || normalEmptyFinish;
  const abnormalReason = succeeded
    ? undefined
    : finish.localTimedOut
      ? 'timeout'
      : finish.outcome === 'partial'
        ? 'aborted'
        : 'error';
  return {
    usage: {
      inputTokens: usage?.inputTokens ?? 0,
      outputTokens: usage?.outputTokens ?? 0,
      totalTokens: usage?.totalTokens ?? 0,
    },
    latencyMs: finish.durationMs ?? 0,
    usageEstimated: !hasRealUsage,
    provenance: 'real-execution',
    executionSucceeded: succeeded,
    abnormalReason,
  };
}
