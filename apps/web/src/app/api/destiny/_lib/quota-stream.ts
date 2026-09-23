/**
 * 配额流式结算管道（onFinish 显式终态声明模式）
 *
 * 核心设计：
 * 1. 终态判定权移交业务方（显式 finish 声明），管道退化为“恰好结算一次”的守卫；
 * 2. 业务方显式 control.finish({outcome, usage?, outputText?, reason?}) 声明终态；幂等，首次生效，后续忽略；
 * 3. cancel（客户端断开）且未声明：hasOutput ? 'partial' : 'failed'（cancel 是唯一允许管道凭现场判断的分支）；
 * 4. 流正常关闭但未声明 finish：已绑定 session → fail-closed：按 failed 结算 + console.error 告警（编程错误当场暴露）；未绑定 session → 静默跳过（额度不足等合法无预留路径）；
 * 5. reader.read() 抛异常且未声明：已绑定 session → hasOutput ? 'partial' : 'failed'，reason 取错误 message；
 * 6. 所有 session.finalize 调用必须 try/catch，失败仅 console.error（用量由对账兜底），不向流内抛出。
 */

import { QuotaSession, type QuotaFinalizeContext, type QuotaOutcome } from '@/lib/billing/quota-session';

export interface QuotaStreamFinish {
  /** 结算结果：'success' | 'partial' | 'failed' */
  outcome: QuotaOutcome;
  /** 上游模型返回的原始用量 rawUsage */
  usage?: unknown;
  /** 完整输出文本，缺省使用累计文本 */
  outputText?: string;
  /** 失败或取消原因 */
  reason?: string;
}

export interface QuotaStreamControl {
  /** 预留完成后绑定会话；重复绑定记录 console.error 并忽略 */
  bindSession(session: QuotaSession): void;
  /** 累积产出文本（用于 cancel 兜底与 partial 估算） */
  appendOutputText(chunk: string): void;
  /** 读回累计产出文本（供业务方解析完整产出，避免自行双写） */
  getOutputText(): string;
  /** 累计文本去除首尾空白后是否非空（供业务方判断 partial/failed） */
  hasOutput(): boolean;
  /** 显式声明终态并触发配额结算 */
  finish(result: QuotaStreamFinish): Promise<void>;
}

export interface CreateQuotaStreamOptions {
  /** 结算上下文：与 QuotaFinalizeContext 同构，用量与产出文本由管道在结算时注入 */
  context: Omit<QuotaFinalizeContext, 'usage' | 'outputText'>;
  logLabel?: string;
}

export function createQuotaStream<T = Uint8Array>(options: CreateQuotaStreamOptions): {
  control: QuotaStreamControl;
  wrap: (source: ReadableStream<T>) => ReadableStream<T>;
} {
  const logLabel = options.logLabel ?? options.context.action;
  let boundSession: QuotaSession | null = null;
  let accumulatedText = '';
  let settled = false;

  /** 累计文本是否非空（cancel/读异常兜底与业务方 partial/failed 判定共用同一口径） */
  const hasOutputText = () => accumulatedText.trim().length > 0;

  const finalizeSafely = async (
    session: QuotaSession,
    outcome: QuotaOutcome,
    details: {
      usage?: unknown;
      outputText?: string;
      reason?: string;
    }
  ) => {
    try {
      await session.finalize(outcome, {
        ...options.context,
        usage: details.usage,
        outputText: details.outputText ?? accumulatedText,
        reason: details.reason ?? options.context.reason,
      });
    } catch (err) {
      console.error(`[${logLabel}] 配额结算失败（用量由对账兜底）:`, err);
    }
  };

  const control: QuotaStreamControl = {
    bindSession(session: QuotaSession): void {
      if (boundSession) {
        console.error(`[${logLabel}] 重复绑定 QuotaSession，忽略此次绑定`);
        return;
      }
      boundSession = session;
    },

    appendOutputText(chunk: string): void {
      accumulatedText += chunk;
    },

    getOutputText(): string {
      return accumulatedText;
    },

    hasOutput(): boolean {
      return hasOutputText();
    },

    async finish(result: QuotaStreamFinish): Promise<void> {
      if (settled) return;
      settled = true;

      if (!boundSession) {
        console.error(`[${logLabel}] 声明终态前未绑定会话，跳过结算（编程错误）`);
        return;
      }

      await finalizeSafely(boundSession, result.outcome, {
        usage: result.usage,
        outputText: result.outputText,
        reason: result.reason,
      });
    },
  };

  const wrap = (source: ReadableStream<T>): ReadableStream<T> => {
    const reader = source.getReader();

    return new ReadableStream<T>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            // 先终止流再做结算：finalize 慢/挂起时不得阻塞 SSE 收尾
            controller.close();
            if (!settled) {
              settled = true;
              if (boundSession) {
                console.error(
                  `[${logLabel}] 流正常关闭但未显式声明 finish 终态，按 failed 结算（编程错误当场暴露）`
                );
                await finalizeSafely(boundSession, 'failed', {
                  reason: options.context.reason ?? '流正常关闭但未声明终态',
                });
              }
            }
            return;
          }
          controller.enqueue(value);
        } catch (error) {
          // 先终止流再做结算：保证错误即时传播给客户端
          controller.error(error);
          if (!settled) {
            settled = true;
            if (boundSession) {
              const outcome: QuotaOutcome = hasOutputText() ? 'partial' : 'failed';
              const reason = error instanceof Error ? error.message : '流式传输异常';
              await finalizeSafely(boundSession, outcome, { reason });
            }
          }
        }
      },

      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          if (!settled) {
            settled = true;
            if (boundSession) {
              const outcome: QuotaOutcome = hasOutputText() ? 'partial' : 'failed';
              const reasonStr =
                typeof reason === 'string'
                  ? reason
                  : (options.context.reason ?? '客户端主动取消');
              await finalizeSafely(boundSession, outcome, { reason: reasonStr });
            }
          }
        }
      },
    });
  };

  return { control, wrap };
}
