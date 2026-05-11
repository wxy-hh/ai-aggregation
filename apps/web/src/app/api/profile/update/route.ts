import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { requireAuth } from '@/lib/auth/require-auth';
import { updateProfileSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

export async function PATCH(req: NextRequest) {
  try {
    const userId = await requireAuth(req);
    const body = await req.json();
    const parsed = updateProfileSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, name, avatar } = parsed.data;

    // 如果修改用户名，检查唯一性
    if (username) {
      const existing = await prisma.user.findUnique({ where: { username } });
      if (existing && existing.id !== userId) {
        return ApiError.badRequest('该用户名已被使用', 'USERNAME_EXISTS');
      }
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(username !== undefined && { username }),
        ...(name !== undefined && { name }),
        ...(avatar !== undefined && { avatar }),
      },
      select: {
        id: true,
        username: true,
        email: true,
        name: true,
        avatar: true,
      },
    });

    return createSuccessResponse({ user }, '个人资料已更新');
  } catch (error) {
    console.error('更新个人资料失败:', error);
    return ApiError.internalError('更新个人资料失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
