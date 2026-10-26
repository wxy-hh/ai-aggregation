/**
 * FAQ 列表获取与单条创建路由 (ADR-0027)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, insertFaqWithQuestions, getFaqsByKnowledgeBase } from '@repo/db';
import { RAG_FAQ_CONFIG } from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { embedFaqText, segmentFaqText } from '@/lib/rag/faq-service';

const createFaqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, '标准问题不能为空')
    .max(RAG_FAQ_CONFIG.maxQuestionLength, `标准问题不能超过 ${RAG_FAQ_CONFIG.maxQuestionLength} 个字符`),
  answer: z
    .string()
    .trim()
    .min(1, '标准答案不能为空')
    .max(RAG_FAQ_CONFIG.maxAnswerLength, `标准答案不能超过 ${RAG_FAQ_CONFIG.maxAnswerLength} 个字符`),
  similarQuestions: z
    .array(z.string().trim().min(1).max(RAG_FAQ_CONFIG.maxQuestionLength))
    .max(RAG_FAQ_CONFIG.maxSimilarQuestionsPerFaq, `相似问最多添加 ${RAG_FAQ_CONFIG.maxSimilarQuestionsPerFaq} 条`)
    .optional(),
  enabled: z.boolean().optional().default(true),
});

/**
 * 校验知识库归属
 */
async function verifyKnowledgeBaseOwner(userId: string, knowledgeBaseId: string) {
  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    select: { id: true, userId: true, status: true },
  });

  if (!kb || kb.userId !== userId || kb.status === 'archived') {
    return null;
  }
  return kb;
}

/**
 * 获取知识库问答对列表
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await params;

    const kb = await verifyKnowledgeBaseOwner(user.id, knowledgeBaseId);
    if (!kb) {
      return ApiError.notFound('知识库不存在或无权访问');
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get('search') || undefined;
    const enabledParam = searchParams.get('enabled');
    const enabled = enabledParam !== null ? enabledParam === 'true' : undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10)));

    const faqs = await getFaqsByKnowledgeBase(user.id, knowledgeBaseId, {
      search,
      enabled,
      page,
      pageSize,
    });

    return createSuccessResponse({ faqs });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] 获取问答对列表失败:', error);
    return ApiError.internalError('获取问答对列表失败，请稍后重试');
  }
}

/**
 * 创建新问答对并同步向量化
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId } = await params;

    const kb = await verifyKnowledgeBaseOwner(user.id, knowledgeBaseId);
    if (!kb) {
      return ApiError.notFound('知识库不存在或无权访问');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = createFaqSchema.safeParse(body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || '参数校验失败';
      return ApiError.badRequest(errorMsg);
    }

    const { question, answer, similarQuestions = [], enabled } = parsed.data;

    const faq = await insertFaqWithQuestions({
      userId: user.id,
      knowledgeBaseId,
      question,
      answer,
      similarQuestions,
      enabled,
      embedFn: embedFaqText,
      tokenizeFn: segmentFaqText,
    });

    return createSuccessResponse({ faq }, '创建成功', 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] 创建问答对失败:', error);
    return ApiError.internalError('创建问答对失败，请稍后重试');
  }
}
