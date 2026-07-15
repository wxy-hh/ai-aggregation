import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@repo/db';
import {
  signAccessToken,
  generateRefreshToken,
  setRefreshTokenCookie,
  REFRESH_TOKEN_EXPIRES,
} from '@/lib/auth/jwt';
import { ApiError, createSuccessResponse } from '@/lib/api/responses';
import { getRateLimiter, RateLimiter, createRedisClient } from '@repo/shared/server';
import { ANONYMOUS_FREE_TOKENS } from '@/lib/constants/quota';
import { DEVICE_ID_REGEX } from '@/lib/constants/device';

// 匿名用户创建速率限制：每 IP 每小时最多 30 次
const anonymousCreationLimiter = new RateLimiter(createRedisClient(), {
  window: 3600,
  limit: 30,
  prefix: 'anonymous:create',
});

function getDeviceHash(deviceId: string): string {
  const salt = process.env.ANONYMOUS_DEVICE_SALT;
  if (!salt) {
    throw new Error('ANONYMOUS_DEVICE_SALT 环境变量未配置');
  }
  return crypto.createHmac('sha256', salt).update(deviceId).digest('hex');
}

function getClientIp(req: NextRequest): string {
  // 优先使用边缘/代理注入的真实 IP（不可由客户端伪造）
  const realIp = req.headers.get('x-real-ip');
  if (realIp) {
    return realIp.split(',')[0].trim();
  }

  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // 取最右侧（最近可信代理）的 IP，降低客户端伪造风险
    const parts = forwarded.split(',');
    return parts[parts.length - 1].trim();
  }

  // NextRequest 在 Edge Runtime 中不提供 ip 属性，回退到未知标识
  return 'unknown';
}

function generateAnonymousUsername(deviceHash: string): string {
  // username 需满足现有正则 ^[a-z0-9_]+$
  return `anon_${deviceHash.slice(0, 16)}`;
}

/**
 * POST /api/auth/anonymous
 * 根据设备指纹标识查找或创建匿名用户，并签发 JWT / refresh token cookie。
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const deviceId = typeof body.deviceId === 'string' ? body.deviceId : '';

    if (!DEVICE_ID_REGEX.test(deviceId)) {
      return ApiError.badRequest('设备标识格式错误', 'INVALID_DEVICE_ID');
    }

    const clientIp = getClientIp(req);

    // IP 级速率限制
    const rateLimitResult = await anonymousCreationLimiter.check(clientIp);
    if (!rateLimitResult.allowed) {
      return ApiError.tooManyRequests('设备注册过于频繁，请稍后再试', {
        retryAfter: rateLimitResult.reset - Math.floor(Date.now() / 1000),
      });
    }

    const deviceHash = getDeviceHash(deviceId);
    let username = generateAnonymousUsername(deviceHash);

    // 根据 deviceHash 查找或创建匿名用户
    let user = await prisma.user.findUnique({
      where: { deviceHash },
      select: {
        id: true,
        username: true,
        name: true,
        avatar: true,
        role: true,
        status: true,
        tokens: true,
        isAnonymous: true,
      },
    });

    if (!user) {
      // 再次检查 username 唯一性（极小概率哈希冲突）
      const existingUsername = await prisma.user.findUnique({
        where: { username },
        select: { id: true },
      });

      if (existingUsername) {
        // 冲突时追加时间戳后缀
        const suffix = Date.now().toString(36);
        username = `${username}_${suffix}`;
      }

      user = await prisma.user.create({
        data: {
          username,
          passwordHash: null,
          role: 'user',
          status: 'active',
          tokens: ANONYMOUS_FREE_TOKENS,
          isAnonymous: true,
          deviceHash,
          quotaAccount: {
            create: {
              grantedUnits: ANONYMOUS_FREE_TOKENS,
              availableUnits: ANONYMOUS_FREE_TOKENS,
            },
          },
        },
        select: {
          id: true,
          username: true,
          name: true,
          avatar: true,
          role: true,
          status: true,
          tokens: true,
          isAnonymous: true,
        },
      });

      console.log('[anonymous] 创建匿名用户:', {
        userId: user.id,
        username: user.username,
        ipPrefix: clientIp.slice(0, 8),
      });
    }

    if (user.status === 'disabled') {
      return ApiError.forbidden('账号已被停用，请联系管理员');
    }

    const accessToken = signAccessToken(user.id, user.role);
    const refreshToken = generateRefreshToken();
    // 匿名用户 refresh token 有效期缩短为 7 天
    const anonymousRefreshExpires = Math.min(REFRESH_TOKEN_EXPIRES, 7 * 24 * 60 * 60);
    const expiresAt = new Date(Date.now() + anonymousRefreshExpires * 1000);

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
        role: user.role,
        tokens: user.tokens,
        isAnonymous: user.isAnonymous,
      },
      accessToken,
    });
  } catch (error) {
    console.error('[anonymous] 匿名认证失败:', error);

    if (error instanceof Error && error.message.includes('ANONYMOUS_DEVICE_SALT')) {
      return ApiError.internalError('服务配置错误');
    }

    return ApiError.internalError('匿名认证失败');
  }
}

// 兼容 OPTIONS 预检
export async function OPTIONS() {
  return NextResponse.json({}, { status: 200 });
}
