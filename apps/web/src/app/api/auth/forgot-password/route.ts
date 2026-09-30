import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { logger } from '@repo/logger';
import crypto from 'crypto';
import { forgotPasswordSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { hashResetToken } from '@/lib/auth/jwt';
import { getMailer } from '@/lib/mail/mailer';

// 重置 Token 5 分钟有效
const RESET_TOKEN_EXPIRES = 5 * 60 * 1000;

/**
 * 对外恒定文案：账号不存在、未绑定邮箱、已发信三条路径返回完全一致，
 * 未绑定邮箱的账号由这段引导改走微信/QQ 登录或重新注册。
 */
const FORGOT_PASSWORD_MESSAGE =
  '若账号已绑定邮箱，重置邮件已发送（链接 5 分钟内有效）；未绑定邮箱的账号请使用微信/QQ 登录或重新注册';

export async function POST(req: NextRequest) {
  try {
    // 先过 IP 级限流（fail-closed：防止重置令牌被批量生成/枚举）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.forgotPassword);
    if (limited) {
      return limited;
    }

    const body = await req.json();
    const parsed = forgotPasswordSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const account = parsed.data.account ?? parsed.data.username ?? '';

    // 邮件能力检查放在账号查询之前：未配置时对任何账号都返回 503，
    // 不产生「响应差异 ⇒ 账号存在」的旁路
    const mailer = getMailer();
    if (!mailer.configured) {
      logger.warn('邮件通道未配置，忘记密码流程不可用');
      return ApiError.serviceUnavailable('邮件服务暂不可用，请稍后再试');
    }

    // 支持用户名或邮箱查找（含 @ 视为邮箱；邮箱统一小写存储与比对）
    const user = account.includes('@')
      ? await prisma.user.findFirst({ where: { email: account } })
      : await prisma.user.findUnique({ where: { username: account } });

    if (user?.email) {
      const token = crypto.randomBytes(32).toString('hex');

      await prisma.refreshToken.create({
        data: {
          userId: user.id,
          // 库中只存摘要：`reset:<sha256>`，明文仅出现在重置链接里
          token: hashResetToken(token),
          expiresAt: new Date(Date.now() + RESET_TOKEN_EXPIRES),
        },
      });

      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, '') || req.nextUrl.origin;
      const resetUrl = `${appUrl}/reset-password?token=${token}`;

      try {
        await mailer.sendPasswordReset(user.email, resetUrl);
      } catch (error) {
        // 发信失败只落服务端日志：响应必须与「账号不存在 / 未绑邮箱」完全一致，
        // 否则「发信失败 ⇒ 账号存在」会成为账号枚举旁路
        logger.error(
          '重置密码邮件发送失败',
          error instanceof Error ? error : undefined,
          { userId: user.id }
        );
      }
    }

    return createSuccessResponse(null, FORGOT_PASSWORD_MESSAGE);
  } catch (error) {
    console.error('忘记密码处理失败:', error);
    // 不向客户端透传底层异常细节，仅保留服务端日志
    return ApiError.internalError('处理失败，请稍后重试');
  }
}
