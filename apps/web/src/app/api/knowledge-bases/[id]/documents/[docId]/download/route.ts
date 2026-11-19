/**
 * 知识库文档源资产同源下载路由 (ADR-0053, C7)
 *
 * 接口契约：
 * - GET /api/knowledge-bases/[id]/documents/[docId]/download
 *   - 权限守卫：强制认证用户并校验知识库与文档所属权；
 *   - 越权/不存在/已软删除：一律返回 404；
 *   - 只按数据库中的 storageKey 读取对象，不把请求路径当作文件路径；
 *   - 返回原始字节、按 SourceFormat 映射的 Content-Type 与含 UTF-8 文件名的
 *     Content-Disposition；未知格式回退 application/octet-stream。
 */

import { NextRequest, NextResponse } from 'next/server';
import { createStorageProvider } from '@repo/storage';
import { deriveSourceFormat, type SourceFormat } from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, handleAuthError } from '@/lib/api/responses';
import { loadOwnedDocument } from '@/lib/api/owned-document';

interface RouteContext {
  params: Promise<{ id: string; docId: string }>;
}

/** 最小安全映射：未知格式不猜测具体 MIME */
const SOURCE_FORMAT_CONTENT_TYPES: Record<SourceFormat, string> = {
  pdf: 'application/pdf',
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain; charset=utf-8',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  unknown: 'application/octet-stream',
};

/** 按 RFC 5987 编码非 ASCII 文件名，避免头字段注入 */
function encodeRFC5987(value: string): string {
  return encodeURIComponent(value).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

/** 同时提供 ASCII 回退名与 UTF-8 文件名，非 ASCII 字符不直接进入引号字段 */
function buildContentDisposition(fileName: string): string {
  const fallback =
    fileName.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_') || 'document';
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encodeRFC5987(fileName)}`;
}

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId, docId } = await context.params;

    const access = await loadOwnedDocument({
      userId: user.id,
      knowledgeBaseId,
      docId,
    });

    if (!access.ok) {
      return access.response;
    }

    const { document } = access;
    const storage = createStorageProvider();
    const bytes = await storage.download(document.storageKey);
    const sourceFormat = deriveSourceFormat({
      sourceType: document.sourceType,
      storageKey: document.storageKey,
    });

    return new NextResponse(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'Content-Type': SOURCE_FORMAT_CONTENT_TYPES[sourceFormat],
        'Content-Disposition': buildContentDisposition(document.name),
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]/download] 下载源资产失败:', error);
    return ApiError.internalError('下载文档失败，请稍后重试');
  }
}
