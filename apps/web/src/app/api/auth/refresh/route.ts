import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { signAccessToken, generateRefreshToken, getRefreshTokenFromCookie, setRefreshTokenCookie, REFRESH_TOKEN_EXPIRES } from '@/lib/auth/jwt';
import { ApiError } from '@/lib/api/responses';

export async function POST(_req: NextRequest) {
  try {
    const token = await getRefreshTokenFromCookie();

    if (!token) {
      return ApiError.unauthorized('缺少刷新令牌');
    }

    const record = await prisma.refreshToken.findUnique({
      where: { token },
      include: { user: { select: { role: true } } },
    });

    if (!record || record.expiresAt < new Date()) {
      if (record) {
        await prisma.refreshToken.delete({ where: { id: record.id } });
      }
      return ApiError.unauthorized('刷新令牌已过期，请重新登录');
    }

    // 检查用户是否被禁用
    const user = await prisma.user.findUnique({
      where: { id: record.userId },
      select: { status: true },
    });

    if (!user || user.status === 'disabled') {
      await prisma.refreshToken.delete({ where: { id: record.id } });
      return ApiError.forbidden('账号已被停用，请联系管理员');
    }

    // 轮换：删除旧 Token，生成新 Token
    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    try {
      await prisma.$transaction([
        prisma.refreshToken.delete({ where: { id: record.id } }),
        prisma.refreshToken.create({
          data: { userId: record.userId, token: newRefreshToken, expiresAt },
        }),
      ]);
    } catch (txError: unknown) {
      // P2025：记录已被并发请求删除（React StrictMode 或网络重试导致竞争条件）
      const prismaError = txError as { code?: string };
      if (prismaError.code === 'P2025') {
        return ApiError.unauthorized('刷新令牌已过期，请重新登录');
      }
      throw txError;
    }

    const accessToken = signAccessToken(record.userId, record.user.role);
    await setRefreshTokenCookie(newRefreshToken, expiresAt);

    return Response.json({ accessToken });
  } catch (error) {
    console.error('刷新令牌失败:', error);
    return ApiError.internalError('刷新令牌失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
