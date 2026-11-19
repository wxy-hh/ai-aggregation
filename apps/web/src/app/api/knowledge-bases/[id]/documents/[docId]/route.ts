/**
 * 单个知识库文档详情、状态轮询与软删除路由（工单 04 / 知识检索 RAG）
 *
 * 接口契约：
 * - GET    /api/knowledge-bases/[id]/documents/[docId]：获取文档当前处理状态（越权/不存在 404）
 * - DELETE /api/knowledge-bases/[id]/documents/[docId]：软删除文档（标记 deletedAt，越权/不存在 404）
 */

import { NextRequest } from 'next/server';
import { prisma, updateDocumentMetadataInPlace } from '@repo/db';
import { isProtectedMetadataKey } from '@repo/shared';
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

/**
 * 原地即时更新文档及其切片的标签与元数据 (ADR-0032 / KB-META-FILTER)
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
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
      select: { id: true, tags: true, metadata: true },
    });

    if (!existing) {
      return ApiError.notFound('文档不存在');
    }

    const body = await req.json().catch(() => ({}));

    // tags 处理：显式传参则更新，未传则保留现有
    const sanitizedTags = Array.isArray(body.tags)
      ? body.tags.map(String).map((t: string) => t.trim()).filter(Boolean)
      : (existing.tags ?? []);

    // metadata 处理：键名白名单校验，保留现有并浅层合并更新
    const existingMetadata =
      typeof existing.metadata === 'object' && existing.metadata !== null && !Array.isArray(existing.metadata)
        ? (existing.metadata as Record<string, unknown>)
        : {};

    let nextMetadata: Record<string, unknown> = { ...existingMetadata };

    if (body.metadata !== undefined) {
      if (typeof body.metadata === 'object' && body.metadata !== null && !Array.isArray(body.metadata)) {
        for (const [key, val] of Object.entries(body.metadata)) {
          if (!/^[a-zA-Z0-9_-]{1,32}$/.test(key)) {
            return ApiError.badRequest(`元数据键名非法: ${key}，仅允许 1-32 位字母、数字、下划线及连字符`);
          }
          // C1 / ADR-0032 修订：系统派生键与溯源键只从主表权威重算，禁止请求体写入
          if (isProtectedMetadataKey(key)) {
            return ApiError.badRequest(`元数据键名 ${key} 为系统保护字段，禁止手动更新`);
          }
          nextMetadata[key] = val;
        }
      }
    }

    const syncResult = await updateDocumentMetadataInPlace({
      documentId: docId,
      userId: user.id,
      tags: sanitizedTags,
      metadata: nextMetadata,
    });

    return createSuccessResponse({
      documentId: syncResult.documentId,
      updatedChunkCount: syncResult.updatedChunkCount,
      tags: sanitizedTags,
      metadata: nextMetadata,
    }, '文档标签与元数据已更新');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]] 更新元数据失败:', error);
    return ApiError.internalError('更新文档元数据失败，请稍后重试');
  }
}

