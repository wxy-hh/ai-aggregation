import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { hashPassword } from '@/lib/auth/password';
import { requireAdmin } from '@/lib/auth/require-admin';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { adminCreateUserSchema, adminUsersQuerySchema } from '@/schemas/auth.schema';

export async function GET(req: NextRequest) {
  try {
    await requireAdmin(req);

    const url = new URL(req.url);
    const parsed = adminUsersQuerySchema.safeParse({
      search: url.searchParams.get('search') || undefined,
      page: url.searchParams.get('page') || 1,
      limit: url.searchParams.get('limit') || 10,
    });

    if (!parsed.success) {
      return ApiError.badRequest('参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { search, page, limit } = parsed.data;

    const where = search
      ? {
          OR: [
            { username: { contains: search, mode: 'insensitive' as const } },
            { name: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [users, total, adminCount, disabledCount] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          email: true,
          name: true,
          avatar: true,
          role: true,
          status: true,
          tokens: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { role: 'admin' } }),
      prisma.user.count({ where: { status: 'disabled' } }),
    ]);

    return createSuccessResponse({
      users,
      meta: { total, page, limit, adminCount, disabledCount },
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return error.code === 'UNAUTHORIZED'
        ? ApiError.unauthorized(error.message)
        : ApiError.forbidden(error.message);
    }
    return ApiError.internalError('获取用户列表失败');
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin(req);

    const body = await req.json();
    const parsed = adminCreateUserSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return ApiError.badRequest('用户名已存在', 'USERNAME_EXISTS', {
        username: '用户名已存在',
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name: name || null,
        role: 'user',
        status: 'active',
        tokens: 20000,
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        tokens: true,
        createdAt: true,
      },
    });

    return createSuccessResponse({ user }, '用户创建成功', 201);
  } catch (error) {
    if (error instanceof AuthError) {
      return error.code === 'UNAUTHORIZED'
        ? ApiError.unauthorized(error.message)
        : ApiError.forbidden(error.message);
    }
    return ApiError.internalError('创建用户失败');
  }
}
