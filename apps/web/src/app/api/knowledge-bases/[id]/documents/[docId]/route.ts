/**
 * 单个知识库文档详情、状态轮询与软删除路由（工单 04 / 知识检索 RAG）
 *
 * 接口契约：
 * - GET    /api/knowledge-bases/[id]/documents/[docId]：获取文档当前处理状态（越权/不存在 404）
 * - DELETE /api/knowledge-bases/[id]/documents/[docId]：软删除文档（标记 deletedAt，越权/不存在 404）
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

interface RouteContext {
  params: Promise<{ id: string; docId: string }>;
}

/**
 * 获取单个文档详情及状态轮询
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId, docId } = await context.params;

    // 校验文档归属与有效性（软删除文档对用户不可见）
    const document = await prisma.document.findFirst({
      where: {
        id: docId,
        knowledgeBaseId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!document) {
      return ApiError.notFound('文档不存在');
    }

    return createSuccessResponse({ document });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]] 获取文档状态失败:', error);
    return ApiError.internalError('获取文档状态失败，请稍后重试');
  }
}

/**
 * 软删除单个文档
 * 软删除（deletedAt）后不再被任何检索召回
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId, docId } = await context.params;

    const existing = await prisma.document.findFirst({
      where: {
        id: docId,
        knowledgeBaseId,
        userId: user.id,
        deletedAt: null,
      },
    });

    if (!existing) {
      return ApiError.notFound('文档不存在');
    }

    await prisma.document.update({
      where: { id: docId },
      data: {
        deletedAt: new Date(),
      },
    });

    return createSuccessResponse(null, '文档已删除');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]] 删除文档失败:', error);
    return ApiError.internalError('删除文档失败，请稍后重试');
  }
}
