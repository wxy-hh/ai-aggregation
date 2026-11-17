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
import { createStorageProvider } from '@repo/storage';
import { isDocumentStatus } from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { loadOwnedDocument } from '@/lib/api/owned-document';
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

    // 1-2. 认证后的知识库与文档归属校验由共享读取器统一完成（越权统一 404）
    const access = await loadOwnedDocument({
      userId: user.id,
      knowledgeBaseId,
      docId,
    });

    if (!access.ok) {
      return access.response;
    }

    const { document } = access;

    // 3. Prisma 列是 string；进入投影前收窄为四态，脏数据落 500 而不是伪装成索引中
    if (!isDocumentStatus(document.status)) {
      console.error('[knowledge-bases/documents/[docId]/content] 文档状态异常:', {
        documentId: document.id,
        status: document.status,
      });
      return ApiError.internalError('文档状态异常，请稍后重试');
    }

    // 4. 依赖装配：存储与当前版本切片加载器由投影按状态与来源决定是否使用
    const projection = new DocumentPreviewProjection({
      getStorage: createStorageProvider,
      loadCurrentVersionChunks: createDocumentPreviewChunkLoader({
        knowledgeBaseId,
        userId: user.id,
      }),
    });

    const { data } = await projection.project({ ...document, status: document.status });
    return createSuccessResponse<DocumentPreviewData>(data);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]/content] 获取文档内容失败:', error);
    return ApiError.internalError('获取文档内容失败，请稍后重试');
  }
}
