import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { withAuth } from '@/lib/api/with-auth';
import { AuthError } from '@/lib/auth/errors';
import { assertCanDeleteAccount } from '@/lib/auth/anonymous-policy';
import { verifyPassword } from '@/lib/auth/password';
import { clearRefreshTokenCookie } from '@/lib/auth/jwt';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';

export async function DELETE(req: NextRequest) {
  return withAuth(req, async (user) => {
    try {
      // 验证密码（如果用户有设置密码）
      const body = await req.json().catch(() => ({}));
      const { password } = body;

      // 管理员账号不支持自助注销
      if (user.role === 'admin') {
        return ApiError.forbidden('管理员账号不支持自助注销');
      }

      // 匿名用户不支持自助注销
      assertCanDeleteAccount(user);

      const dbUser = await prisma.user.findUnique({
        where: { id: user.id },
        select: { passwordHash: true },
      });

      if (!dbUser) {
        return ApiError.unauthorized('用户不存在');
      }

      // 有密码的账号需要密码确认
      if (dbUser.passwordHash) {
        if (!password) {
          return ApiError.badRequest('请输入密码以确认注销', 'PASSWORD_REQUIRED');
        }
        const valid = await verifyPassword(password, dbUser.passwordHash);
        if (!valid) {
          return ApiError.badRequest('密码错误', 'INVALID_PASSWORD');
        }
      }

      // 级联删除用户及所有关联数据
      await prisma.user.delete({ where: { id: user.id } });

      // 清除 refresh token cookie
      try {
        await clearRefreshTokenCookie();
      } catch {
        // Cookie 清除失败不阻塞
      }

      return createSuccessResponse(null, '账户已注销');
    } catch (error) {
      console.error('账户注销失败:', error);
      if (error instanceof AuthError) {
        return handleAuthError(error);
      }
      return ApiError.internalError('账户注销失败', {
        error: error instanceof Error ? error.message : '未知错误',
      });
    }
  });
}
