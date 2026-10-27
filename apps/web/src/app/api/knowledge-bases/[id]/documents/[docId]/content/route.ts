/**
 * 知识库单文档全文只读内容与安全隔离路由（工单 01 / DocumentPreview）
 *
 * 接口契约：
 * - GET /api/knowledge-bases/[id]/documents/[docId]/content
 *   - 权限守卫：强制认证用户并校验知识库与文档所属权 (userId === user.id)；
 *   - 越权/不存在/已软删除：一律返回 404 Not Found；
 *   - Markdown/TXT：通过对象存储下载原始 Buffer 并转为 UTF-8 正文字符串；
 *   - PDF：聚合数据库已处理切片并生成 1 小时有效期的原版安全临时下载 URL。
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { createStorageProvider } from '@repo/storage';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

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

    const fileName = document.name;
    const lastDotIndex = fileName.lastIndexOf('.');
    const ext = lastDotIndex !== -1 ? fileName.slice(lastDotIndex).toLowerCase() : '';

    // 若文档状态为失败：直接返回结构化失败状态模型，不抛 500，供前端展示失败原因面板 (US-12)
    if (document.status === 'failed') {
      return createSuccessResponse({
        id: document.id,
        name: document.name,
        version: document.version,
        chunkCount: document.chunkCount,
        status: 'failed',
        errorMessage: document.errorMessage || '文档解析索引失败',
        fileType: ext === '.pdf' ? 'pdf' : ext === '.txt' ? 'text' : 'markdown',
        content: '',
        chunks: [],
        sourceType: document.sourceType,
        sourceUrl: document.sourceUrl,
      });
    }

    // 查询该版本切片元数据（用于高亮锚点与章节导航）
    const chunks = await prisma.documentChunk.findMany({
      where: {
        documentId: docId,
        knowledgeBaseId,
        userId: user.id,
        documentVersion: document.version,
      },
      orderBy: { chunkIndex: 'asc' },
      select: {
        chunkIndex: true,
        content: true,
        headingPath: true,
        pageNumber: true,
      },
    });

    // 3. 针对 PDF 文档：提取已切块的结构化段落，并生成签名下载 URL
    if (ext === '.pdf') {
      let originalUrl: string | null = null;
      try {
        const storage = createStorageProvider();
        originalUrl = await storage.getUrl(document.storageKey, 3600);
      } catch (storageErr) {
        console.warn('[document/content] 获取 PDF 签名 URL 失败:', storageErr);
      }

      const fullContent = chunks.map((c) => c.content).join('\n\n');

      return createSuccessResponse({
        id: document.id,
        name: document.name,
        version: document.version,
        chunkCount: document.chunkCount,
        status: document.status,
        errorMessage: document.errorMessage,
        fileType: 'pdf',
        content: fullContent,
        originalUrl,
        chunks,
      });
    }

    // 4. 生成原文件签名下载链接 (供 Word/Excel/CSV/PDF 等下载原件)
    let originalUrl: string | null = null;
    const storage = createStorageProvider();
    try {
      originalUrl = await storage.getUrl(document.storageKey, 3600);
    } catch (storageErr) {
      console.warn('[document/content] 获取原文件签名 URL 失败:', storageErr);
    }

    // 5. 针对 Markdown / 纯文本 / Word / 表格读取正文内容
    // 若为 Word (.docx) 或表格 (.xlsx)，优先从对象存储读取 Worker 提纯落盘的 content.md 缓存
    let content = '';
    const isStructuredBinary = ext === '.docx' || ext === '.xlsx';

    if (isStructuredBinary) {
      const parsedContentKey = document.storageKey.replace(/\/[^/]+$/, '/content.md');
      try {
        const buffer = await storage.download(parsedContentKey);
        content = buffer.toString('utf-8');
      } catch {
        // 若提纯快照未命中，回退由切片聚合呈现
        content = chunks.map((c) => c.content).join('\n\n');
      }
    } else {
      try {
        const buffer = await storage.download(document.storageKey);
        content = buffer.toString('utf-8');
      } catch (storageErr) {
        console.warn('[document/content] 从存储层读取原文件失败，回退从切片聚合正文:', storageErr);
        if (chunks.length > 0) {
          content = chunks.map((c) => c.content).join('\n\n');
        } else if (document.status === 'pending' || document.status === 'processing') {
          // 处理中且无切片：优雅返回空内容模型，供前端展示处理中状态 (US-12)
          content = '';
        } else {
          throw storageErr;
        }
      }
    }

    const fileType =
      ext === '.txt'
        ? 'text'
        : ext === '.docx'
        ? 'docx'
        : ext === '.xlsx'
        ? 'xlsx'
        : ext === '.csv'
        ? 'csv'
        : 'markdown';

    return createSuccessResponse({
      id: document.id,
      name: document.name,
      version: document.version,
      chunkCount: document.chunkCount,
      status: document.status,
      errorMessage: document.errorMessage,
      fileType,
      content,
      originalUrl,
      chunks,
      sourceType: document.sourceType,
      sourceUrl: document.sourceUrl,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/[docId]/content] 获取文档内容失败:', error);
    return ApiError.internalError('获取文档内容失败，请稍后重试');
  }
}
