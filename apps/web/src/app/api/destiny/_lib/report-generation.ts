/**
 * 命盘报告共享处理器工厂
 *
 * 核心职责：
 * 统一认证、请求校验、错误映射与 SSE 响应包装。
 */

import { NextResponse } from 'next/server';
import { type ZodSchema } from 'zod';
import { withAuth } from '@/lib/api/with-auth';
import { createSseResponse } from '@/lib/utils/sse';
import { BillingError, billingErrorResponse } from '@/lib/billing/billing-errors';

export type ReportGenerationContext = {
  req: Request;
  user: { id: string; role: string };
};

/** 默认错误映射：透传 Error.message，非 Error 返回通用文案 */
export const defaultMapError = (error: unknown): string =>
  error instanceof Error ? error.message : '测算失败，请稍后重试';

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
