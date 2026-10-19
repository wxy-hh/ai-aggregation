import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { signAccessToken, generateRefreshToken, getRefreshTokenFromCookie, hashRefreshToken, setRefreshTokenCookie, REFRESH_TOKEN_EXPIRES } from '@/lib/auth/jwt';
import { ApiError } from '@/lib/api/responses';

export async function POST(_req: NextRequest) {
  try {
    const token = await getRefreshTokenFromCookie();

    if (!token) {
      return ApiError.unauthorized('缺少刷新令牌');
    }

    const record = await prisma.refreshToken.findUnique({
      // 库中只存摘要：先对 cookie 明文算摘要再查
      where: { token: hashRefreshToken(token) },
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

    if (!user) {
      await prisma.refreshToken.delete({ where: { id: record.id } });
      return ApiError.unauthorized('用户不存在');
    }

    if (user.status === 'disabled') {
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
          // 轮换出的新令牌同样只存摘要
          data: { userId: record.userId, token: hashRefreshToken(newRefreshToken), expiresAt },
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
    // 不向客户端透传底层异常细节，仅保留服务端日志
    return ApiError.internalError('刷新令牌失败，请稍后重试');
  }
}
