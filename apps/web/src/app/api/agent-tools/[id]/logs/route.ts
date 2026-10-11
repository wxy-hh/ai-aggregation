/**
 * 单个 Webhook 工具调用审计日志分页路由（spec §4.4 / 工单 03）
 *
 * 接口契约：
 * - GET /api/agent-tools/[id]/logs：倒序分页获取指定工具的历史调用记录
 *   - 越权或工具不存在：返回 404
 *   - 成功：返回 `{ logs: [...], total, hasMore }`
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

    // 解析分页参数
    const { searchParams } = new URL(req.url);
    const parsedLimit = parseInt(searchParams.get('limit') || '', 10);
    const parsedOffset = parseInt(searchParams.get('offset') || '', 10);

    const limit = Number.isFinite(parsedLimit)
      ? Math.max(1, Math.min(parsedLimit, MAX_LIMIT))
      : DEFAULT_LIMIT;
    const offset = Number.isFinite(parsedOffset) ? Math.max(0, parsedOffset) : 0;

    const where = {
      toolId: id,
      userId: user.id,
    };

    const [total, calls] = await Promise.all([
      prisma.webhookToolCall.count({ where }),
      prisma.webhookToolCall.findMany({
        where,
        orderBy: {
          createdAt: 'desc',
        },
        take: limit,
        skip: offset,
      }),
    ]);

    const logs = calls.map((call) => ({
      id: call.id,
      method: call.method,
      statusCode: call.statusCode,
      durationMs: call.durationMs,
      outcome: call.outcome,
      errorKind: call.errorKind,
      createdAt:
        call.createdAt instanceof Date
          ? call.createdAt.toISOString()
          : new Date(call.createdAt).toISOString(),
    }));

    const hasMore = offset + logs.length < total;

    return createSuccessResponse({
      logs,
      total,
      hasMore,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[agent-tools/logs] 获取调用日志失败:', error);
    return ApiError.internalError('获取调用日志失败，请稍后重试');
  }
}
