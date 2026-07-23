/**
 * 反馈详情与更新 API
 * GET    /api/feedback/[id]  - 获取单个反馈详情
 * PATCH  /api/feedback/[id]  - 管理员更新反馈状态（仅管理员）
 */
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { requireAdmin } from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { createStorageProvider } from '@repo/storage';
import { z } from 'zod';

const updateSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  isPinned: z.boolean().optional(),
  resolvedAt: z.string().datetime().optional().nullable(),
});

/**
 * GET /api/feedback/[id]
 * 获取单个反馈详情，仅作者和管理员可查看
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // 强制认证
    const userId = await requireAuth(req);
    const { id } = await params;

    // 检查管理员
    let isAdmin = false;
    try {
      await requireAdmin(req);
      isAdmin = true;
    } catch {
      /* 非管理员 */
    }

    const feedback = await prisma.feedback.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, username: true, name: true, avatar: true },
        },
        replies: {
          include: {
            user: {
              select: { id: true, username: true, name: true, avatar: true },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        attachments: true,
        _count: {
          select: { replies: true },
        },
      },
    });

    if (!feedback) {
      return ApiError.notFound('反馈不存在');
    }

    // 仅作者和管理员可查看
    if (feedback.userId !== userId && !isAdmin) {
      return ApiError.forbidden('无权查看此反馈');
    }

    // S3 模式下为附件生成签名 URL（本地模式下 URL 已是可访问的相对路径）
    const isS3 = process.env.STORAGE_PROVIDER === 's3';
    let resolvedAttachments = feedback.attachments;
    if (isS3 && feedback.attachments.length > 0) {
      try {
        const storage = createStorageProvider();
        const bucket = process.env.S3_BUCKET || 'ai-aggregation';
        resolvedAttachments = await Promise.all(
          feedback.attachments.map(async (att) => {
            try {
              const url = new URL(att.fileUrl);
              const key = url.pathname.replace(`/${bucket}/`, '');
              const signedUrl = await storage.getUrl(key, 3600);
              return { ...att, fileUrl: signedUrl };
            } catch {
              return att;
            }
          })
        );
      } catch {
        // S3 不可用时保留原始 URL
      }
    }

    return createSuccessResponse({
      ...feedback,
      attachments: resolvedAttachments,
      replyCount: feedback._count.replies,
      _count: undefined,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.message.includes('无权') || error.message.includes('管理员')
        ? ApiError.forbidden(error.message)
        : ApiError.unauthorized(error.message);
    }
    return ApiError.internalError('获取反馈详情失败');
  }
}

/**
 * PATCH /api/feedback/[id]
 * 管理员更新反馈状态（仅管理员可操作）
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id } = await params;
    const body = await req.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST_BODY', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { status, priority, isPinned, resolvedAt } = parsed.data;

    const updateData: Record<string, unknown> = {};
    if (status !== undefined) updateData.status = status;
    if (priority !== undefined) updateData.priority = priority;
    if (isPinned !== undefined) updateData.isPinned = isPinned;
    if (resolvedAt !== undefined) updateData.resolvedAt = resolvedAt ? new Date(resolvedAt) : null;

    const feedback = await prisma.feedback.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: { id: true, username: true, name: true, avatar: true },
        },
      },
    });

    return createSuccessResponse(feedback, '更新成功');
  } catch (error) {
    if (error instanceof AuthError) {
      return error.message.includes('无权') || error.message.includes('管理员')
        ? ApiError.forbidden(error.message)
        : ApiError.unauthorized(error.message);
    }
    return ApiError.internalError('更新反馈失败');
  }
}
