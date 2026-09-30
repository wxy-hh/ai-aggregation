import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { withAuth } from '@/lib/api/with-auth';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { EmailVerificationUnavailableError, consumeEmailCode } from '@/lib/auth/email-verification';
import { bindEmailSchema } from '@/schemas/auth.schema';

/**
 * POST /api/profile/email —— 绑定 / 更换邮箱。
 *
 * 流程：个人中心输入邮箱 → 调 /api/auth/email/send-code（purpose=bind）拿验证码 →
 * 本接口校验验证码并写入 email / emailVerified（换绑同一流程）。
 * 限流：10 次/分钟/IP（fail-closed），限制验证码暴力枚举。
 */
export async function POST(req: NextRequest) {
  // 先过 IP 级限流（fail-closed：限流设施故障时拒绝校验）
  const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.emailBindVerify);
  if (limited) {
    return limited;
  }

  return withAuth(req, async (user) => {
    try {
      const body = await req.json();
      const parsed = bindEmailSchema.safeParse(body);

      if (!parsed.success) {
        return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
          errors: parsed.error.flatten().fieldErrors,
        });
      }

      const { email, code } = parsed.data;

      const taken = await prisma.user.findFirst({ where: { email, id: { not: user.id } } });
      if (taken) {
        return ApiError.badRequest('该邮箱已被其他账号绑定', 'EMAIL_EXISTS');
      }

      let verified: boolean;
      try {
        verified = await consumeEmailCode('bind', email, code);
      } catch (error) {
        if (error instanceof EmailVerificationUnavailableError) {
          console.error('校验邮箱绑定验证码失败:', error.message);
          return ApiError.serviceUnavailable('服务暂不可用，请稍后再试');
        }
        throw error;
      }

      if (!verified) {
        return ApiError.badRequest('验证码错误或已过期，请重新获取', 'INVALID_EMAIL_CODE');
      }

      const updatedUser = await prisma.user.update({
        where: { id: user.id },
        data: { email, emailVerified: new Date() },
        select: { id: true, username: true, email: true, emailVerified: true },
      });

      return createSuccessResponse({ user: updatedUser }, '邮箱绑定成功');
    } catch (error) {
      console.error('绑定邮箱失败:', error);
      // 不向客户端透传底层异常细节（数据库地址、约束名等），仅保留服务端日志
      return ApiError.internalError('绑定失败，请稍后重试');
    }
  });
}
