import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { hashPassword } from '@/lib/auth/password';
import { signAccessToken, generateRefreshToken, setRefreshTokenCookie, REFRESH_TOKEN_EXPIRES } from '@/lib/auth/jwt';
import { registerSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password, name } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return ApiError.badRequest('该用户名已被注册', 'USERNAME_EXISTS');
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: { username, passwordHash, name },
      select: { id: true, username: true, name: true, avatar: true },
    });

    const accessToken = signAccessToken(user.id);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    await prisma.refreshToken.create({
      data: { userId: user.id, token: refreshToken, expiresAt },
    });

    await setRefreshTokenCookie(refreshToken, expiresAt);

    return createSuccessResponse({ user, accessToken }, '注册成功');
  } catch (error) {
    console.error('注册失败:', error);
    return ApiError.internalError('注册失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
