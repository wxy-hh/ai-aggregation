/**
 * 用户反馈 API 路由
 * GET  /api/feedback    - 获取反馈列表（支持筛选、排序、分页，仅返回自己的反馈）
 * POST /api/feedback    - 创建新反馈
 */
import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { requireAdmin } from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { z } from 'zod';

// 查询参数校验
const querySchema = z.object({
  type: z.enum(['BUG', 'FEATURE', 'UI', 'PERFORMANCE', 'OTHER']).optional(),
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_PROGRESS', 'COMPLETED', 'DECLINED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  search: z.string().optional(),
  sortBy: z.enum(['newest', 'oldest', 'priority']).default('newest'),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(50).default(10),
});

// 创建反馈请求校验
const createFeedbackSchema = z.object({
  type: z.enum(['BUG', 'FEATURE', 'UI', 'PERFORMANCE', 'OTHER']),
  title: z.string().min(2).max(200),
  content: z.string().min(10).max(5000),
  tags: z.array(z.string()).max(5).default([]),
});

/**
 * GET /api/feedback
 * 获取反馈列表，强制认证，非管理员仅返回自己的反馈
 */
export async function GET(req: NextRequest) {
  try {
    // 强制认证
    let userId: string;
    try {
      userId = await requireAuth(req);
    } catch (error) {
      if (error instanceof AuthError) {
        return ApiError.unauthorized('请先登录后查看反馈');
      }
      return ApiError.unauthorized('请先登录');
    }

    // 检查管理员
    let isAdmin = false;
    try {
      await requireAdmin(req);
      isAdmin = true;
    } catch {
      /* 非管理员 */
    }

    const url = new URL(req.url);
    const rawParams = {
      type: url.searchParams.get('type') || undefined,
      status: url.searchParams.get('status') || undefined,
      priority: url.searchParams.get('priority') || undefined,
      search: url.searchParams.get('search') || undefined,
      sortBy: url.searchParams.get('sortBy') || 'newest',
      page: url.searchParams.get('page') || '1',
      limit: url.searchParams.get('limit') || '10',
    };

    const parsed = querySchema.safeParse(rawParams);

    if (!parsed.success) {
      return ApiError.badRequest('参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { type, status, priority, search, sortBy, page, limit } = parsed.data;

    // 构建 where：管理员看全部，普通用户仅看自己的
    const where: Record<string, unknown> = {};
    if (!isAdmin) {
      where.userId = userId;
    }

    if (type) where.type = type;
    if (status) where.status = status;
    if (priority) where.priority = priority;

    // 搜索标题和内容
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' as const } },
        { content: { contains: search, mode: 'insensitive' as const } },
      ];
    }

    // 排序
    const orderBy: Record<string, 'asc' | 'desc'> =
      sortBy === 'oldest'
        ? { createdAt: 'asc' }
        : sortBy === 'priority'
          ? { priority: 'desc' }
          : { createdAt: 'desc' };

    const [feedbacks, total] = await Promise.all([
      prisma.feedback.findMany({
        where,
        include: {
          user: {
            select: { id: true, username: true, name: true, avatar: true },
          },
          _count: {
            select: { replies: true },
          },
        },
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.feedback.count({ where }),
    ]);

    const items = feedbacks.map((fb) => ({
      ...fb,
      replyCount: fb._count.replies,
      _count: undefined,
    }));

    return createSuccessResponse({
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return ApiError.unauthorized(error.message);
    }
    return ApiError.internalError('获取反馈列表失败');
  }
}

/**
 * POST /api/feedback
 * 创建新反馈（需登录）
 */
export async function POST(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const parsed = createFeedbackSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST_BODY', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { type, title, content, tags } = parsed.data;

    const feedback = await prisma.feedback.create({
      data: {
        userId,
        type,
        title,
        content,
        tags,
      },
      include: {
        user: {
          select: { id: true, username: true, name: true, avatar: true },
        },
      },
    });

    return createSuccessResponse(feedback, '反馈提交成功', 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return ApiError.unauthorized(error.message);
    }
    return ApiError.internalError('提交反馈失败');
  }
}
