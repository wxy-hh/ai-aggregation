import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { assertCanUpdateUsername } from '@/lib/auth/anonymous-policy';
import { updateProfileSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

export async function PATCH(req: NextRequest) {
  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const parsed = updateProfileSchema.safeParse(body);

      if (!parsed.success) {
        return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { username, name, avatar } = parsed.data;

      // 匿名用户业务规则校验
      assertCanUpdateUsername(user, username);

      // 如果修改用户名，检查唯一性
      if (username) {
        const existing = await prisma.user.findUnique({ where: { username } });
        if (existing && existing.id !== user.id) {
          return ApiError.badRequest('该用户名已被使用', 'USERNAME_EXISTS');
        }
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
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

      return createSuccessResponse({ user: updatedUser }, '个人资料已更新');
    } catch (error) {
      console.error('更新个人资料失败:', error);
      if (error instanceof AuthError) {
        return handleAuthError(error);
      }
      return ApiError.internalError('更新个人资料失败', {
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  });
}
