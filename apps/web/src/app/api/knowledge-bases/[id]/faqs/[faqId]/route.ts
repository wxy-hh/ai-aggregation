/**
 * 单条 FAQ 更新与删除路由 (ADR-0027)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, updateFaqWithQuestions, deleteFaq } from '@repo/db';
import { RAG_FAQ_CONFIG } from '@repo/shared';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { embedFaqText, segmentFaqText } from '@/lib/rag/faq-service';

const updateFaqSchema = z.object({
  question: z
    .string()
    .trim()
    .min(1, '标准问题不能为空')
    .max(RAG_FAQ_CONFIG.maxQuestionLength, `标准问题不能超过 ${RAG_FAQ_CONFIG.maxQuestionLength} 个字符`)
    .optional(),
  answer: z
    .string()
    .trim()
    .min(1, '标准答案不能为空')
    .max(RAG_FAQ_CONFIG.maxAnswerLength, `标准答案不能超过 ${RAG_FAQ_CONFIG.maxAnswerLength} 个字符`)
    .optional(),
  similarQuestions: z
    .array(z.string().trim().min(1).max(RAG_FAQ_CONFIG.maxQuestionLength))
    .max(RAG_FAQ_CONFIG.maxSimilarQuestionsPerFaq, `相似问最多添加 ${RAG_FAQ_CONFIG.maxSimilarQuestionsPerFaq} 条`)
    .optional(),
  enabled: z.boolean().optional(),
});

/**
 * 更新问答对
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; faqId: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId, faqId } = await params;

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, userId: true, status: true },
    });

    if (!kb || kb.userId !== user.id || kb.status === 'archived') {
      return ApiError.notFound('知识库不存在或无权访问');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = updateFaqSchema.safeParse(body);
    if (!parsed.success) {
      const errorMsg = parsed.error.issues[0]?.message || '参数校验失败';
      return ApiError.badRequest(errorMsg);
    }

    const { question, answer, similarQuestions, enabled } = parsed.data;

    const updated = await updateFaqWithQuestions({
      userId: user.id,
      faqId,
      question,
      answer,
      similarQuestions,
      enabled,
      embedFn: embedFaqText,
      tokenizeFn: segmentFaqText,
    });

    if (!updated) {
      return ApiError.notFound('问答对不存在或无权修改');
    }

    return createSuccessResponse({ faq: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] 更新问答对失败:', error);
    return ApiError.internalError('更新问答对失败，请稍后重试');
  }
}

/**
 * 删除问答对
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; faqId: string }> }
) {
  try {
    const user = await getCurrentUser(req);
    const { id: knowledgeBaseId, faqId } = await params;

    const kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      select: { id: true, userId: true, status: true },
    });

    if (!kb || kb.userId !== user.id || kb.status === 'archived') {
      return ApiError.notFound('知识库不存在或无权访问');
    }

    const success = await deleteFaq(user.id, faqId);
    if (!success) {
      return ApiError.notFound('问答对不存在或已被删除');
    }

    return createSuccessResponse({ success: true, message: '问答对已成功删除' });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] 删除问答对失败:', error);
    return ApiError.internalError('删除问答对失败，请稍后重试');
  }
}
