/**
 * 单条 Agent 运行记录删除路由（ADR-0019）
 *
 * 接口契约：
 * - DELETE /api/agent-runs/[id]：删除指定的运行记录（越权或不存在返回 404）
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id } = await context.params;

    // 校验记录存在性与归属权：不存在或越权访问他人记录一律返回 404
    const existing = await prisma.agentRun.findUnique({
      where: { id },
    });

    if (!existing || existing.userId !== user.id) {
      return ApiError.notFound('运行记录不存在');
    }

    await prisma.agentRun.delete({
      where: { id },
    });

    return createSuccessResponse({ id }, '运行记录删除成功');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[agent-runs] 删除运行记录失败:', error);
    return ApiError.internalError('删除运行记录失败，请稍后重试');
  }
}
