/**
 * 知识库单文档全文只读内容与安全隔离路由（DocumentPreview 读取投影）
 *
 * 接口契约：
 * - GET /api/knowledge-bases/[id]/documents/[docId]/content
 *   - 权限守卫：强制认证用户并校验知识库与文档所属权 (userId === user.id)；
 *   - 越权/不存在/已软删除：一律返回 404 Not Found；
 *   - 状态门控、正文来源与回退、当前版本切片、源资产签名与 DTO 组装全部由
 *     DocumentPreviewProjection 决定；本路由只负责认证、归属校验、依赖装配与 HTTP 映射；
 *   - 投影读取失败统一映射为既有中文 500，不返回 ready 空白页。
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { createStorageProvider } from '@repo/storage';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { createDocumentPreviewChunkLoader } from '@/lib/rag/document-preview-chunk-loader';
import type { DocumentPreviewData } from '@/lib/rag/document-preview-contract';
import { DocumentPreviewProjection } from '@/lib/rag/document-preview-projection';

interface RouteContext {
  params: Promise<{ id: string; docId: string }>;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId, docId } = await context.params;

    // 1. 严格校验知识库存在性与归属（越权访问统一 404）
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    // 2. 严格校验目标文档存在性、未软删除且归属当前用户
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

    // 3. 依赖装配：存储与当前版本切片加载器由投影按状态与来源决定是否使用
    const projection = new DocumentPreviewProjection({
      getStorage: createStorageProvider,
      loadCurrentVersionChunks: createDocumentPreviewChunkLoader({
        knowledgeBaseId,
        userId: user.id,
      }),
    });

    const { data } = await projection.project(document);
    return createSuccessResponse<DocumentPreviewData>(data);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]/content] 获取文档内容失败:', error);
    return ApiError.internalError('获取文档内容失败，请稍后重试');
  }
}
