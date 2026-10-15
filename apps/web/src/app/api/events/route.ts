/**
 * 前端行为埋点事件上报接口（ADR-0013 / P0a 工单 03）
 *
 * 接口契约：
 * - POST /api/events：上报单个合法埋点事件
 * - 鉴权：requireAuth 提取 userId（未登录 401，被封禁 403）
 * - 节流：AUTH_RATE_LIMITS.productEvents 针对 userId 限流（超限 429，故障 503）
 * - 校验：trackProductEventSchema 严格校验白名单与 props 字段（多余字段拒绝 400）
 * - 落库：写入 product_events 表
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { trackProductEventSchema } from '@/schemas/product-event.schema';

export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.productEvents, userId);
    if (limited) {
      return limited;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = trackProductEventSchema.safeParse(body);
    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const record = await prisma.productEvent.create({
      data: {
        userId,
        event: parsed.data.event,
        props: parsed.data.props,
      },
    });

    return createSuccessResponse({ id: record.id }, '事件记录成功');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('埋点事件上报失败:', error);
    return ApiError.internalError('上报事件失败，请稍后重试');
  }
}
