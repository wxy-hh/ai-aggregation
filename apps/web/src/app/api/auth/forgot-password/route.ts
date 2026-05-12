import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import crypto from 'crypto';
import { forgotPasswordSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';

// 重置 Token 5 分钟有效
const RESET_TOKEN_EXPIRES = 5 * 60 * 1000;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username } = parsed.data;

    // 始终返回相同消息，防止用户枚举攻击
    const user = await prisma.user.findUnique({ where: { username } });

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          token: `reset:${token}`,
          expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRES),
        },
      });

      // 第一期记录日志，后续集成邮件服务
      // TODO: 后续集成邮件服务，将 token 通过邮件发送
    }

    return createSuccessResponse(null, '如该用户名已注册，重置链接已发送');
  } catch (error) {
    console.error('忘记密码处理失败:', error);
    return ApiError.internalError('处理失败', {
      error: error instanceof Error ? error.message : '未知错误',
    });
  }
}
