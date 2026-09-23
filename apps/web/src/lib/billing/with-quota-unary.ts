/**
 * 一元请求配额结算管道（Unary Quota Pipeline）。
 *
 * 设计意图：
 * 与 ADR-0001（流式显式终态声明）同源，专为非流式（一元）API 设计的配额生命周期收口工具。
 * 一元场景严格遵循二态决策（success / failed），不支持 partial：
 * 1. 预留阶段：调用 QuotaSession.reserve，若失败（如额度不足）直接抛出，不执行业务逻辑。
 * 2. 业务执行：调用 run(session)，业务方使用 session.outputLimit 约束模型输出。
 * 3. 成功终态：若 run 正常返回，调用 session.finalize('success', ...)，支持透传 usage 与 outputText（缺省为空串）；
 *    成功终态独立 try/catch 守护——结算异常仅 console.error（用量由对账兜底），不得把已成功的业务结果改判 failed 或冒泡成 500；
 *    admin 免预留场景由 QuotaSession.finalize 内置处理 safeRecordAiUsage 用量归档，路由无需关心。
 * 4. 失败终态：若 run 抛出任何错误，调用 session.finalize('failed', ...)，透传错误原因并释放预留额度，最后重新抛出原错误。
 */

import { QuotaSession } from '@/lib/billing/quota-session';
import type { QuotaSessionReserveInput, QuotaFinalizeContext } from '@/lib/billing/quota-session';

export interface WithQuotaUnaryOptions<T> {
  /** 预留参数（透传给 QuotaSession.reserve） */
  reserve: QuotaSessionReserveInput;
  /** 调用方角色（如 'admin'，admin 用户免扣预留额度） */
  userRole?: string;
  /** 结算上下文（usage / outputText / reason 由本管道自动注入） */
  finalize: Omit<QuotaFinalizeContext, 'usage' | 'outputText' | 'reason'>;
  /** 业务调用：传入 session 供业务方获取 outputLimit，返回业务结果与用量物料 */
  run: (session: QuotaSession) => Promise<{ value: T; usage?: unknown; outputText?: string }>;
}

export async function withQuotaUnary<T>(options: WithQuotaUnaryOptions<T>): Promise<T> {
  const session = await QuotaSession.reserve(options.reserve, options.userRole);

  try {
    const { value, usage, outputText } = await options.run(session);
    // 成功终态独立守护：finalize 异常不得进入下方 catch 触发二次结算，也不得让已成功结果冒泡成 500
    try {
      await session.finalize('success', {
        ...options.finalize,
        usage,
        outputText: outputText ?? '',
      });
    } catch (finalizeError) {
      console.error('[withQuotaUnary] 额度成功终态处理异常（用量由对账兜底）:', finalizeError);
    }
    return value;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    try {
      await session.finalize('failed', {
        ...options.finalize,
        usage: undefined,
        outputText: '',
        reason,
      });
    } catch (finalizeError) {
      console.error('[withQuotaUnary] 额度失败终态处理异常:', finalizeError);
    }
    throw error;
  }
}
