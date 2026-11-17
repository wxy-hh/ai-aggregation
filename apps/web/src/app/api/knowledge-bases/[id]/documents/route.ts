/**
 * 知识库文档列表与上传路由（工单 04 / 知识检索 RAG）
 *
 * 接口契约：
 * - GET  /api/knowledge-bases/[id]/documents：获取指定知识库的未删除文档列表
 * - POST /api/knowledge-bases/[id]/documents：向知识库上传文档（multipart/form-data）
 *   - 仅支持 PDF/Markdown/TXT，超限与非法文件立即拒绝且 DB/Storage 零残留
 *   - 配额检查（50 文档/20000 切片）超限返回 429
 *   - 对象存储 key 由 @repo/shared 的 buildFileStorageKey 统一构造：docs/{userId}/{documentId}/v{version}/{filename}
 *   - 幂等性：相同 userId+requestId 不产生重复行
 *   - 同文档重上传：version+1 且状态置为 pending
 *   - DB 行 status=pending 即返回 202
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import {
  RAG_CAPACITY_LIMITS,
  RAG_CAPACITY_ERROR_MESSAGES,
  buildFileStorageKey,
  validateRagDocument,
} from '@repo/shared';
import { createStorageProvider } from '@repo/storage';
import { ragIndexQueue } from '@repo/queue';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

/**
 * 修复部分环境（如 Node.js / multipart 解析器）对 UTF-8 文件名的 latin1 误解码
 */
function sanitizeUploadFileName(rawName: string): string {
  try {
    const candidate = Buffer.from(rawName, 'latin1').toString('utf8');
    // 若还原后不包含替换字符且包含有效多字节字符，采用还原结果
    if (!candidate.includes('�') && candidate !== rawName) {
      return candidate;
    }
  } catch {
    // 忽略异常，降级回原始文件名
  }
  return rawName;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 获取知识库的有效文档列表
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await context.params;

    // 校验知识库归属
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    const documents = await prisma.document.findMany({
      where: {
        knowledgeBaseId,
        userId: user.id,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    return createSuccessResponse({ documents });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents] 获取文档列表失败:', error);
    return ApiError.internalError('获取文档列表失败，请稍后重试');
  }
}

/**
 * 上传文档到知识库
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await context.params;

    // 1. 校验知识库存在性与所有权（越权访问返回 404）
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    // 2. 解析 multipart/form-data
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch {
      return ApiError.badRequest('无效的表单数据，请使用 multipart/form-data');
    }

    const file = formData.get('file');
    if (!file || !(file instanceof Blob)) {
      return ApiError.badRequest('缺少上传文件');
    }

    const rawFileName = (file as { name?: string }).name || 'document.txt';
    const fileName = sanitizeUploadFileName(rawFileName);
    const fileSize = file.size;
    const fileType = file.type || '';

    const requestId =
      (formData.get('requestId') as string | null)?.trim() ||
      req.headers.get('x-request-id')?.trim() ||
      req.headers.get('idempotency-key')?.trim() ||
      null;

    const specifiedDocId = (formData.get('documentId') as string | null)?.trim() || null;

    // 3. 文件格式与大小严格校验（QA-015：非法/超大文件拒绝且 DB/Storage 零残留）
    const validation = validateRagDocument({
      name: fileName,
      size: fileSize,
      type: fileType,
    });

    if (!validation.valid) {
      return ApiError.badRequest(validation.error);
    }

    const safeFileName = validation.safeName;

    // 4. 幂等检查（userId + requestId）：若已处理过直接返回已有文档
    if (requestId) {
      const existingTask = await prisma.task.findUnique({
        where: {
          userId_requestId: {
            userId: user.id,
            requestId,
          },
        },
      });

      if (existingTask && existingTask.output && typeof existingTask.output === 'object') {
        const docId = (existingTask.output as { documentId?: string }).documentId;
        if (docId) {
          const doc = await prisma.document.findUnique({
            where: { id: docId },
          });
          if (doc) {
            return createSuccessResponse({ document: doc }, '文档已接收（幂等）', 202);
          }
        }
      }
    }

    // 5. 检查是否为同名或指定文档的重上传（重上传同文档 version+1）
    let existingDoc = null;
    if (specifiedDocId) {
      existingDoc = await prisma.document.findFirst({
        where: {
          id: specifiedDocId,
          knowledgeBaseId,
          userId: user.id,
          deletedAt: null,
        },
      });
    } else {
      existingDoc = await prisma.document.findFirst({
        where: {
          knowledgeBaseId,
          userId: user.id,
          name: safeFileName,
          deletedAt: null,
        },
      });
    }

    const isReupload = Boolean(existingDoc);

    // 6. 容量配额检查（QA-009：超出时返回中文 429 提示）
    if (!isReupload) {
      // 检查当前知识库未删除文档数量（单库上限 50 篇）
      const docCount = await prisma.document.count({
        where: {
          knowledgeBaseId,
          userId: user.id,
          deletedAt: null,
        },
      });

      if (docCount >= RAG_CAPACITY_LIMITS.maxDocumentsPerKnowledgeBase) {
        return ApiError.tooManyRequests(RAG_CAPACITY_ERROR_MESSAGES.maxDocuments);
      }
    }

    // 检查用户跨库总切片数量（上限 20000 个切片）
    const totalChunks = await prisma.documentChunk.count({
      where: { userId: user.id },
    });

    if (totalChunks >= RAG_CAPACITY_LIMITS.maxChunksPerUser) {
      return ApiError.tooManyRequests(RAG_CAPACITY_ERROR_MESSAGES.maxChunks);
    }

    // 7. 计算目标 Document ID 与版本号
    const targetDocId = existingDoc
      ? existingDoc.id
      : (globalThis.crypto?.randomUUID?.() ?? `doc_${Date.now()}_${Math.random().toString(36).slice(2)}`);
    const targetVersion = existingDoc ? existingDoc.version + 1 : 1;

    // 8. 对象存储 key 由共享布局构造器统一产出：docs/{userId}/{documentId}/v{version}/{filename}
    const storageKey = buildFileStorageKey({
      userId: user.id,
      documentId: targetDocId,
      version: targetVersion,
      safeFileName,
    });

    // 9. 将文件写入对象存储
    const buffer = Buffer.from(await file.arrayBuffer());
    const storage = createStorageProvider();
    await storage.upload(storageKey, buffer, fileType || 'application/octet-stream');

    // 10. 数据库事务落库：写 Document + 若有 requestId 写 Task 记录
    const document = await prisma.$transaction(async (tx) => {
      let doc;
      if (existingDoc) {
        doc = await tx.document.update({
          where: { id: targetDocId },
          data: {
            name: safeFileName,
            storageKey,
            status: 'pending',
            version: targetVersion,
            errorMessage: null,
          },
        });
      } else {
        doc = await tx.document.create({
          data: {
            id: targetDocId,
            knowledgeBaseId,
            userId: user.id,
            name: safeFileName,
            storageKey,
            status: 'pending',
            version: 1,
            chunkCount: 0,
          },
        });
      }

      if (requestId) {
        await tx.task.create({
          data: {
            userId: user.id,
            requestId,
            type: 'rag:document_upload',
            status: 'completed',
            input: {
              fileName: safeFileName,
              knowledgeBaseId,
            },
            output: { documentId: doc.id },
          },
        });
      }

      return doc;
    });

    // 11. 将新文档或重传文档投递至 rag-index 索引队列进行异步解析切片与向量化
    try {
      await ragIndexQueue.add(
        'index-document',
        {
          documentId: document.id,
          knowledgeBaseId,
          userId: user.id,
          version: document.version,
          storageKey,
          fileName: safeFileName,
        },
        {
          jobId: `rag-index-${document.id}-v${document.version}`,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        }
      );
    } catch (queueError) {
      console.error('[knowledge-bases/documents] 派发 rag-index 队列任务失败:', queueError);
      // 队列故障不阻断上传 202 响应，后台有补发或重试机制
    }

    // 12. 返回 202，状态 pending 为当前阶段的正确终态
    return createSuccessResponse(
      { document },
      '文档上传成功，已加入排队队列',
      202
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents] 文档上传失败:', error);
    return ApiError.internalError('文档上传失败，请稍后重试');
  }
}
