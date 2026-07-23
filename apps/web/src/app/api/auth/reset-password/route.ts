import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { hashPassword } from '@/lib/auth/password';
import { resetPasswordSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = resetPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { token, newPassword } = parsed.data;

    const record = await prisma.refreshToken.findUnique({
      where: { token: `reset:${token}` },
    });

    if (!record || record.expiresAt < new Date()) {
      return ApiError.badRequest('重置链接已过期或无效');
    }

    const passwordHash = await hashPassword(newPassword);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      }),
      // 失效该用户的所有 Refresh Token
      prisma.refreshToken.deleteMany({ where: { userId: record.userId } }),
    ]);

    return createSuccessResponse(null, '密码已重置，请使用新密码登录');
  } catch (error) {
    console.error('重置密码失败:', error);
    return ApiError.internalError('重置密码失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
