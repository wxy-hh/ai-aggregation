import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { verifyPassword } from '@/lib/auth/password';
import {
  signAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  setRefreshTokenCookie,
  setAuthKindCookie,
  REFRESH_TOKEN_EXPIRES,
} from '@/lib/auth/jwt';
import { loginSchema } from '@/schemas/auth.schema';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { getClientIp } from '@/lib/auth/client-ip';
import {
  buildLoginAttemptKey,
  formatLockoutMessage,
  getLoginAttemptStore,
} from '@/lib/auth/login-lockout';

export async function POST(req: NextRequest) {
  try {
    // 先过 IP 级限流（fail-closed：限流设施故障时拒绝登录）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.login);
    if (limited) {
      return limited;
    }

    const body = await req.json();
    const parsed = loginSchema.safeParse(body);

    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    const { username, password } = parsed.data;
    const attemptKey = buildLoginAttemptKey(username, getClientIp(req));
    const attemptStore = getLoginAttemptStore();
    const now = Math.floor(Date.now() / 1000);

    const lock = await attemptStore.getLock(attemptKey);
    if (lock.lockedUntil && lock.lockedUntil > now) {
      // 锁定期内的尝试只拒绝：不校验密码（不给密码正确性的旁路信号），
      // 也不累计失败、不延长锁定——否则攻击者周期性尝试即可把账号永久锁死（锁定 DoS）
      const remaining = Math.max(0, lock.lockedUntil - now);
      return ApiError.accountLocked(formatLockoutMessage(remaining), { retryAfter: remaining });
    }

    const user = await prisma.user.findUnique({ where: { username } });

    // 用户不存在与密码错误分别返回同一文案，且都计入失败次数（不泄露账号是否存在）
    const valid = user?.passwordHash ? await verifyPassword(password, user.passwordHash) : false;
    if (!user || !user.passwordHash || !valid) {
      const failure = await attemptStore.recordFailure(attemptKey);
      if (failure.lockedUntil) {
        const remaining = Math.max(0, failure.lockedUntil - now);
        return ApiError.accountLocked(formatLockoutMessage(remaining), { retryAfter: remaining });
      }
      return ApiError.unauthorized('用户名或密码错误');
    }

    if (user.status === 'disabled') {
      return ApiError.forbidden('账号已被停用，请联系管理员');
    }

    // 登录成功清零失败计数
    await attemptStore.clear(attemptKey);

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES * 1000);

    await prisma.refreshToken.create({
      // 库中只存摘要，明文仅存在于 httpOnly cookie
      data: { userId: user.id, token: hashRefreshToken(refreshToken), expiresAt },
    });

    await setRefreshTokenCookie(refreshToken, expiresAt);
    await setAuthKindCookie('user', expiresAt);

    return createSuccessResponse({
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        avatar: user.avatar,
        role: user.role,
        tokens: user.tokens,
        isAnonymous: false,
      },
      accessToken,
    });
  } catch (error) {
    console.error('登录失败:', error);
    // 不向客户端透传底层异常细节（数据库地址、约束名等），仅保留服务端日志
    return ApiError.internalError('登录失败，请稍后重试');
  }
}
