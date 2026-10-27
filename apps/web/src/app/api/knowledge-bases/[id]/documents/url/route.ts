/**
 * 网页 URL 与微信文章批量录入接口 (ADR-0028)
 *
 * 接口契约：
 * POST /api/knowledge-bases/[id]/documents/url
 * - 输入：{ urls: string[] } (1 <= length <= 10)
 * - 鉴权：需要登录，严格校验知识库归属 (ACL 隔离)
 * - 安全：通过 @repo/shared 的 validateUrlLiteral 进行字面量与内网拦截
 * - 配额：单知识库上限 50 篇文档，超限返回 429
 * - 异步：数据库插入 status='pending'、sourceType='url' 的文档并投递 BullMQ，返回 202
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import {
  RAG_CAPACITY_LIMITS,
  RAG_CAPACITY_ERROR_MESSAGES,
  validateUrlLiteral,
} from '@repo/shared';
import { ragIndexQueue, JOB_NAMES } from '@repo/queue';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await context.params;

    // 1. 校验知识库存在性与归属（越权返回 404）
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    // 2. 解析 JSON 请求体
    let body: { urls?: unknown };
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('无效的 JSON 请求体');
    }

    const rawUrls = body.urls;
    if (!Array.isArray(rawUrls) || rawUrls.length === 0) {
      return ApiError.badRequest('请至少提供一个有效的网页网址');
    }

    if (rawUrls.length > 10) {
      return ApiError.badRequest('单次最多允许导入 10 个网址，请分批导入');
    }

    // 3. 对每个 URL 进行 SSRF 安全与格式校验
    const validatedUrls: Array<{ original: string; url: URL; hostname: string }> = [];
    for (const item of rawUrls) {
      if (typeof item !== 'string' || !item.trim()) {
        return ApiError.badRequest('列表中包含空网址');
      }
      const trimmed = item.trim();
      const guard = validateUrlLiteral(trimmed);
      if (!guard.ok) {
        return ApiError.badRequest(`网址 [${trimmed}] 校验未通过: ${guard.reason}`);
      }
      validatedUrls.push({
        original: trimmed,
        url: guard.url,
        hostname: guard.hostname,
      });
    }

    // 4. 知识库容量检查（最多 50 篇）
    const currentCount = await prisma.document.count({
      where: {
        knowledgeBaseId,
        deletedAt: null,
      },
    });

    if (currentCount + validatedUrls.length > RAG_CAPACITY_LIMITS.maxDocumentsPerKnowledgeBase) {
      return ApiError.tooManyRequests(RAG_CAPACITY_ERROR_MESSAGES.maxDocuments);
    }

    // 5. 数据库原子创建文档记录并投递 BullMQ 异步队列
    const createdDocuments = await prisma.$transaction(async (tx) => {
      const docs = [];
      for (const item of validatedUrls) {
        // 初始显示名称，截取 pathname 或使用主机名
        const pathSuffix = item.url.pathname.replace(/^\/|\/$/g, '').slice(0, 24);
        const initialName = pathSuffix ? `${item.hostname}/${pathSuffix}` : item.hostname;

        // 生成存储路径规范：docs/{userId}/url-{timestamp}-{rand}/v1/content.md
        const randomId = Math.random().toString(36).slice(2, 10);
        const storageKey = `docs/${user.id}/url-${Date.now()}-${randomId}/v1/content.md`;

        const doc = await tx.document.create({
          data: {
            knowledgeBaseId,
            userId: user.id,
            name: initialName,
            storageKey,
            status: 'pending',
            version: 1,
            sourceType: 'url',
            sourceUrl: item.original,
          },
        });
        docs.push(doc);
      }
      return docs;
    });

    // 投递队列任务（事务提交后）
    for (const doc of createdDocuments) {
      await ragIndexQueue.add(
        JOB_NAMES.RAG_INDEX,
        {
          documentId: doc.id,
          knowledgeBaseId,
          userId: user.id,
          version: 1,
          storageKey: doc.storageKey,
          fileName: `${doc.name}.md`,
          sourceType: 'url',
          sourceUrl: doc.sourceUrl ?? undefined,
        },
        {
          attempts: 2,
          backoff: { type: 'exponential', delay: 3000 },
          removeOnComplete: true,
        }
      );
    }

    return createSuccessResponse(
      { documents: createdDocuments },
      '网页抓取任务已接收，正在后台异步处理',
      202
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[knowledge-bases/documents/url] 导入网页外链异常:', error);
    return ApiError.internalError('导入网页失败，请稍后重试');
  }
}
