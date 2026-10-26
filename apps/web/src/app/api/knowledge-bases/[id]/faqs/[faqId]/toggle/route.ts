/**
 * FAQ 启停状态切换路由 (ADR-0027)
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma, toggleFaqStatus } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

const toggleSchema = z.object({
  enabled: z.boolean().optional(),
});

export async function PATCH(
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

    let enabledValue: boolean | undefined;
    try {
      const body = await req.json();
      const parsed = toggleSchema.safeParse(body);
      if (parsed.success) {
        enabledValue = parsed.data.enabled;
      }
    } catch {
      // 允许空 body 默认取反
    }

    const success = await toggleFaqStatus(user.id, faqId, enabledValue);
    if (!success) {
      return ApiError.notFound('问答对不存在或无权操作');
    }

    return createSuccessResponse({ success: true, message: '状态已更新' });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('[faqs] 切换启用状态失败:', error);
    return ApiError.internalError('切换启用状态失败，请稍后重试');
  }
}
