/**
 * 反馈回复 API
 * POST /api/feedback/[id]/reply
 * 为反馈添加回复，仅作者和管理员可操作
 */
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { requireAdmin } from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { z } from 'zod';

const replySchema = z.object({
  content: z.string().min(2).max(3000),
  isInternal: z.boolean().default(false),
});

/**
 * POST /api/feedback/[id]/reply
 * 添加回复
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await requireAuth(req);
    const { id: feedbackId } = await params;
    const body = await req.json();
    const parsed = replySchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST_BODY', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { content, isInternal } = parsed.data;

    // 内部回复仅管理员可发
    if (isInternal) {
      await requireAdmin(req);
    }

    // 检查反馈是否存在
    const feedback = await prisma.feedback.findUnique({
      where: { id: feedbackId },
      select: { userId: true },
    });

    if (!feedback) {
      return ApiError.notFound('反馈不存在');
    }

    // 仅作者和管理员可回复
    let isAdmin = false;
    try {
      await requireAdmin(req);
      isAdmin = true;
    } catch {
      /* 非管理员 */
    }

    if (feedback.userId !== userId && !isAdmin) {
      return ApiError.forbidden('无权回复此反馈');
    }

    const reply = await prisma.feedbackReply.create({
      data: {
        feedbackId,
        userId,
        content,
        isInternal,
      },
      include: {
        user: {
          select: { id: true, username: true, name: true, avatar: true },
        },
      },
    });

    return createSuccessResponse(reply, '回复成功', 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return error.message.includes('无权') || error.message.includes('管理员')
        ? ApiError.forbidden(error.message)
        : ApiError.unauthorized(error.message);
    }
    return ApiError.internalError('添加回复失败');
  }
}
