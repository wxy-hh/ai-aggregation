import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { verifyPassword } from '@/lib/auth/password';
import { signAccessToken, generateRefreshToken, setRefreshTokenCookie, REFRESH_TOKEN_EXPIRES } from '@/lib/auth/jwt';
import { loginSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password } = parsed.data;

    const user = await prisma.user.findUnique({ where: { username } });
    if (!user || !user.passwordHash) {
      return ApiError.unauthorized('用户名或密码错误');
    }

    const valid = await verifyPassword(password, user.passwordHash);
    if (!valid) {
      return ApiError.unauthorized('用户名或密码错误');
    }

    if (user.status === 'disabled') {
      return ApiError.forbidden('账号已被停用，请联系管理员');
    }

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt },
    });

    await setRefreshTokenCookie(refreshToken, expiresAt);

    return createSuccessResponse({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
      },
      accessToken,
    });
  } catch (error) {
    console.error('登录失败:', error);
    return ApiError.internalError('登录失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
