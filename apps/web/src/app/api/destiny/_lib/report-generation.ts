/**
 * 命盘报告共享处理器工厂与流式配额结算管道
 *
 * 核心职责：
 * 1. 统一认证、请求校验、错误映射与 SSE 响应包装；
 * 2. 统一流式配额会话结算（withQuotaStream）：
 *    - 自动拦截流的完成（flush/done ➔ success）、中断带产出（partial）与空流报错/取消（failed ➔ 释放预留）；
 *    - 消除各路由内部手写的 settle('success') / settle('partial') / release / settleSafely 闭包；
 *    - 适配器只需通过 sessionReporter 记录 model 的 rawUsage 与增量 outputText。
 */

import { NextResponse } from 'next/server';
import { type ZodSchema } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { createSseResponse } from '@/lib/utils/sse';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';
import { QuotaSession, type QuotaOutcome } from '@/lib/billing/quota-session';
import type { AiUsageAction } from '@repo/shared';

export type ReportGenerationContext = {
  req: Request;
  user: { id: string; role: string };
};

/** 默认错误映射：透传 Error.message，非 Error 返回通用文案 */
export const defaultMapError = (error: unknown): string =>
  error instanceof Error ? error.message : '测算失败，请稍后重试';

/** 流式配额会话报告器接口 */
export interface QuotaStreamSessionReporter {
  /** 记录模型实际返回的 rawUsage（通常在 done 事件获得） */
  setUsage: (usage: unknown) => void;
  getUsage: () => unknown;
  /** 追加已生成的文本增量（用于流异常或截断时的 partial 结算兜底） */
  appendOutputText: (chunk: string) => void;
  /** 设置或覆盖完整已生成文本 */
  setOutputText: (text: string) => void;
  getOutputText: () => string;
  /** 标记流已完整输出全部业务分区/正文（流关闭时若已标记则结算为 success） */
  markCompleted: () => void;
  isCompleted: () => boolean;
}

/** 创建会话报告器实例 */
export function createQuotaStreamReporter(): QuotaStreamSessionReporter {
  let text = '';
  let usage: unknown = null;
  let completed = false;

  return {
    setUsage: (u: unknown) => {
      usage = u;
    },
    getUsage: () => usage,
    appendOutputText: (chunk: string) => {
      text += chunk;
    },
    setOutputText: (fullText: string) => {
      text = fullText;
    },
    getOutputText: () => text,
    markCompleted: () => {
      completed = true;
    },
    isCompleted: () => completed,
  };
}

export type QuotaStreamSessionHolder =
  | QuotaSession
  | { current: QuotaSession | null };

export interface QuotaStreamOptions {
  /** 结算会话或延迟赋值的会话持有对象 */
  session: QuotaStreamSessionHolder;
  context: {
    requestId: string;
    action: AiUsageAction;
    endpoint: string;
    provider?: string | null;
    model?: string | null;
    userId?: string;
    feature?: 'chat' | 'voice' | 'video_prompt' | 'destiny' | 'resume';
    reason?: string;
    metadata?: Record<string, unknown>;
  };
  /** 异常日志前缀（缺省使用 context.action） */
  logLabel?: string;
}

/**
 * 包装输出流，统一监听流的完成、中断与异常并触发 QuotaSession.finalize
 *
 * 状态映射规则（对齐三态决策表）：
 * - 标记 completed，或流正常结束且有正文 ➔ 'success'（按实际 usage 结算）
 * - 流异常中止/截断但已有部分输出 ➔ 'partial'（按已输出文本估算结算，不退款）
 * - 未产出任何正文即失败或取消 ➔ 'failed'（全额释放预留）
 * - session 内部已保证幂等（settled 守卫），重复触发安全
 */
export function withQuotaStream<T = Uint8Array>(
  sourceStream: ReadableStream<T>,
  options: QuotaStreamOptions,
  reporter: QuotaStreamSessionReporter
): ReadableStream<T> {
  const reader = sourceStream.getReader();
  let finalized = false;

  const finalizeSafely = async (outcome: QuotaOutcome, errorReason?: string) => {
    if (finalized) return;
    finalized = true;

    const session =
      'current' in options.session ? options.session.current : options.session;
    if (!session) return;

    try {
      await session.finalize(outcome, {
        ...options.context,
        usage: reporter.getUsage(),
        outputText: reporter.getOutputText(),
        reason: errorReason ?? options.context.reason,
      });
    } catch (err) {
      const label = options.logLabel ?? options.context.action;
      console.error(`[${label}] 配额结算失败（用量由对账兜底）:`, err);
    }
  };

  return new ReadableStream<T>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          const hasOutput = reporter.getOutputText().trim().length > 0;
          const outcome: QuotaOutcome = reporter.isCompleted()
            ? 'success'
            : hasOutput
              ? 'partial'
              : 'failed';
          await finalizeSafely(outcome);
          return;
        }
        controller.enqueue(value);
      } catch (error) {
        controller.error(error);
        const hasOutput = reporter.getOutputText().trim().length > 0;
        const outcome: QuotaOutcome = hasOutput ? 'partial' : 'failed';
        const reason = error instanceof Error ? error.message : '流式传输异常';
        await finalizeSafely(outcome, reason);
      }
    },
    async cancel(reason) {
      try {
        await reader.cancel(reason);
      } finally {
        const hasOutput = reporter.getOutputText().trim().length > 0;
        const outcome: QuotaOutcome = reporter.isCompleted()
          ? 'success'
          : hasOutput
            ? 'partial'
            : 'failed';
        const reasonStr = typeof reason === 'string' ? reason : '客户端主动取消';
        await finalizeSafely(outcome, reasonStr);
      }
    },
  });
}

export type ReportGenerationAdapter<TStream extends ReadableStream<Uint8Array>> = {
  /** 请求校验 schema */
  requestSchema: ZodSchema;

  /**
   * 解析已校验的请求体并创建输出流
   */
  generate: (ctx: ReportGenerationContext, body: unknown) => Promise<TStream>;

  /** 将非 BillingError 映射为用户可见错误文案（可选，缺省使用通用文案） */
  mapError?: (error: unknown) => string;
};

/**
 * 创建命盘报告 POST 处理函数
 *
 * 统一拦截 401（未认证）、400（参数校验失败）、402（配额不足）与 500（未预期的服务端错误）
 */
export function createReportHandler<TStream extends ReadableStream<Uint8Array>>(
  adapter: ReportGenerationAdapter<TStream>
) {
  return async function POST(req: Request) {
    return withAuth(req, async (user) => {
      try {
        const body = await req.json();
        const parsed = adapter.requestSchema.safeParse(body);

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

        const stream = await adapter.generate({ req, user }, parsed.data);
        return createSseResponse(stream);
      } catch (error) {
        if (error instanceof BillingError) return billingErrorResponse(error);

        return NextResponse.json(
          {
            error: adapter.mapError?.(error) ?? '测算失败，请稍后重试',
          },
          { status: 500 }
        );
      }
    });
  };
}
