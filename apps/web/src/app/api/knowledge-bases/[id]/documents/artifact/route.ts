/**
 * 对话产物沉淀至知识库 API (ADR-0034 / AGENT-KB-LOOP)
 *
 * 接口契约：
 * POST /api/knowledge-bases/[id]/documents/artifact
 * - 输入：{ artifactId, title, content, type, tags?, sourceSessionId? }
 * - 鉴权：需要登录，严格校验知识库归属（ACL 越权 404）
 * - 安全：单次内容 <= 30,000 字符硬截断校验
 * - 限额：单库最大 50 篇文档，超限 429
 * - 性能：纯内存切块 + 并发向量计算 + 单事务落盘，端到端 <= 1.5s
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import {
  RAG_CAPACITY_LIMITS,
  RAG_CAPACITY_ERROR_MESSAGES,
  depositArtifactSchema,
} from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { depositArtifactToKnowledgeBase } from '@/lib/rag/artifact-deposit-service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await context.params;

    // 1. 严格校验知识库存在性与所有权（越权访问一律 404）
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
    });

    if (!kb || kb.userId !== user.id) {
      return ApiError.notFound('知识库不存在');
    }

    // 2. 解析与验证请求体
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('无效的 JSON 请求体');
    }

    const parseResult = depositArtifactSchema.safeParse(body);
    if (!parseResult.success) {
      const firstError = parseResult.error.errors[0]?.message || '请求参数格式错误';
      return ApiError.badRequest(firstError);
    }

    const input = parseResult.data;

    // 3. 知识库单库容量检查（最多 50 篇）
    const currentCount = await prisma.document.count({
      where: {
        knowledgeBaseId,
        deletedAt: null,
      },
    });

    if (currentCount >= RAG_CAPACITY_LIMITS.maxDocumentsPerKnowledgeBase) {
      return ApiError.tooManyRequests(RAG_CAPACITY_ERROR_MESSAGES.maxDocuments);
    }

    // 4. 执行内存切块、向量化与单事务落盘
    const result = await depositArtifactToKnowledgeBase({
      userId: user.id,
      knowledgeBaseId,
      input,
    });

    return createSuccessResponse(result.document);
  } catch (err: unknown) {
    if (err instanceof AuthError || (err as { name?: string })?.name === 'AuthError') {
      return handleAuthError(err as AuthError);
    }
    console.error('[deposit-artifact] 接口处理异常:', err);
    return ApiError.internalError('产物沉淀至知识库失败，请稍后重试');
  }
}
