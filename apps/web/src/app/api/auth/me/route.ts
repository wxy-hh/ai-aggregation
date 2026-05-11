import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
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
        createdAt: true,
      },
    });

    if (!user) {
      return ApiError.unauthorized('用户不存在');
    }

    return createSuccessResponse({ user });
  } catch (error) {
    if (error instanceof Error && error.message === '缺少认证令牌') {
      return ApiError.unauthorized('缺少认证令牌');
    }
    if (error instanceof Error && error.message === 'jwt expired') {
      return ApiError.unauthorized('登录已过期，请重新登录');
    }
    console.error('获取用户信息失败:', error);
    return ApiError.unauthorized('认证失败');
  }
}
