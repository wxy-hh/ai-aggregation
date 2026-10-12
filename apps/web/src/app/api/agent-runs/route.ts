/**
 * Agent 运行记录查询路由（ADR-0015 / P1 工单 02）
 *
 * 接口契约：
 * - GET /api/agent-runs：获取当前用户的 Agent 运行记录列表（分页 + 状态过滤）
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);
    const { searchParams } = new URL(req.url);

    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
    const outcome = searchParams.get('outcome');

    const where = {
      userId: user.id,
      ...(outcome ? { outcome } : {}),
    };

    const [total, runs] = await Promise.all([
      prisma.agentRun.count({ where }),
      prisma.agentRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return createSuccessResponse({
      runs,
      total,
      page,
      limit,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[agent-runs] 获取运行记录失败:', error);
    return ApiError.internalError('获取智能体运行记录失败，请稍后重试');
  }
}
