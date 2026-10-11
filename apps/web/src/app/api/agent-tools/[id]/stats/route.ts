/**
 * 单个 Webhook 工具调用统计聚合路由（spec §4.4 / 工单 03）
 *
 * 接口契约：
 * - GET /api/agent-tools/[id]/stats：获取指定工具的聚合调用指标
 *   - 越权或工具不存在：返回 404
 *   - 无调用数据：除零保护，返回 totalCalls: 0 与 null 指标
 *   - 有调用数据：返回 totalCalls、successRate、avgDurationMs、lastCalledAt、lastErrorSummary
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { formatToolCallErrorSummary } from '../../_lib/observability';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsCrud, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;

    // 校验工具存在性与归属权：不存在或越权访问他人工具一律返回 404
    const existing = await prisma.userWebhookTool.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== user.id) {
      return ApiError.notFound('工具不存在');
    }

    // 查询该工具在当前用户下的调用审计记录（按时间倒序）
    const calls = await prisma.webhookToolCall.findMany({
      where: {
        toolId: id,
        userId: user.id,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    const totalCalls = calls.length;

    // 0 次调用时除零保护，避免 NaN
    if (totalCalls === 0) {
      return createSuccessResponse({
        totalCalls: 0,
        successRate: null,
        avgDurationMs: null,
        lastCalledAt: null,
        lastErrorSummary: null,
      });
    }

    const successCalls = calls.filter((call) => call.outcome === 'success').length;
    const rawRate = (successCalls / totalCalls) * 100;
    // 保留至多一位小数，若整除则为整数
    const successRate = Math.round(rawRate * 10) / 10;

    const totalDuration = calls.reduce((acc, call) => acc + (call.durationMs || 0), 0);
    const avgDurationMs = Math.round(totalDuration / totalCalls);

    const lastCalledAt = calls[0].createdAt instanceof Date
      ? calls[0].createdAt.toISOString()
      : new Date(calls[0].createdAt).toISOString();

    const latestFailed = calls.find((call) => call.outcome !== 'success');
    const lastErrorSummary = latestFailed
      ? formatToolCallErrorSummary(latestFailed)
      : null;

    return createSuccessResponse({
      totalCalls,
      successRate,
      avgDurationMs,
      lastCalledAt,
      lastErrorSummary,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[agent-tools/stats] 获取工具统计失败:', error);
    return ApiError.internalError('获取工具统计失败，请稍后重试');
  }
}
