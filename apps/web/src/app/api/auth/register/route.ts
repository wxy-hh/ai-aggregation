import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { hashPassword } from '@/lib/auth/password';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshTokenCookie,
  setAuthKindCookie,
  REFRESH_TOKEN_EXPIRES,
} from '@/lib/auth/jwt';
import { registerSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { REGISTERED_FREE_TOKENS } from '@/lib/constants/quota';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { consumeEmailCode } from '@/lib/auth/email-verification';

export async function POST(req: NextRequest) {
  try {
    // 先过 IP 级限流（fail-closed：限流设施故障时拒绝注册，防止批量刷免费额度）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.register);
    if (limited) {
      return limited;
    }

    const body = await req.json();
    const parsed = registerSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password, name, email, emailCode } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      return ApiError.badRequest('该用户名已被注册', 'USERNAME_EXISTS');
    }

    if (email) {
      const emailTaken = await prisma.user.findFirst({ where: { email } });
      if (emailTaken) {
        return ApiError.badRequest('该邮箱已被注册，请更换邮箱或直接登录', 'EMAIL_EXISTS');
      }

      let verified: boolean;
      try {
        verified = await consumeEmailCode('register', email, emailCode!);
      } catch (error) {
        // 验证码存储属认证链路：设施故障 fail-closed 拒绝注册
        console.error('校验注册验证码失败:', error);
        return ApiError.serviceUnavailable('服务暂不可用，请稍后再试');
      }

      if (!verified) {
        return ApiError.badRequest('验证码错误或已过期，请重新获取', 'INVALID_EMAIL_CODE');
      }
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        username,
        passwordHash,
        name,
        // 邮箱只有通过验证码校验后才写入，并同时标记已验证
        ...(email ? { email, emailVerified: new Date() } : {}),
        tokens: REGISTERED_FREE_TOKENS,
        quotaAccount: {
          create: {
            grantedUnits: REGISTERED_FREE_TOKENS,
            availableUnits: REGISTERED_FREE_TOKENS,
          },
        },
      },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
        email: true,
        emailVerified: true,
        role: true,
      },
    });

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    await prisma.refreshToken.create({
      // 库中只存摘要，明文仅存在于 httpOnly cookie
      data: { userId: user.id, token: hashRefreshToken(refreshToken), expiresAt },
    });

    await setRefreshTokenCookie(refreshToken, expiresAt);
    await setAuthKindCookie('user', expiresAt);

    return createSuccessResponse({ user, accessToken }, '注册成功');
  } catch (error) {
    console.error('注册失败:', error);
    // 不向客户端透传底层异常细节（数据库地址、约束名等），仅保留服务端日志
    return ApiError.internalError('注册失败，请稍后重试');
  }
}
