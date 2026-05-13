import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

export async function GET(req: NextRequest) {
  try {
    const userId = await requireAuth(req);

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
        emailVerified: true,
        role: true,
        tokens: true,
        createdAt: true,
      },
    });

    if (!user) {
      return ApiError.unauthorized('用户不存在');
    }

    return createSuccessResponse({ user });
  } catch (error) {
    if (error instanceof AuthError) {
      if (error.code === 'FORBIDDEN') {
        return ApiError.forbidden(error.message);
      }
      return ApiError.unauthorized(error.message);
    }
    if (error instanceof Error && error.message.includes('jwt')) {
      return ApiError.unauthorized('登录已过期，请重新登录');
    }
    return ApiError.internalError('获取用户信息失败');
  }
}
