import type { NextRequest } from 'next/server';
import { RateLimiter, type RateLimitFailureMode } from '@repo/shared/server';
import { getRedisClient } from '@repo/redis';
import { ApiError } from '@/lib/api/responses';
import { getClientIp } from '@/lib/auth/client-ip';

/** 认证路由的限流配置（键为客户端 IP，窗口内计数） */
export interface AuthRateLimitConfig {
  /** 限流键前缀（区分路由） */
  prefix: string;
  /** 时间窗口（秒） */
  window: number;
  /** 窗口内允许的最大请求数 */
  limit: number;
}

/**
 * 认证路由限流阈值表（调整阈值只改这里）。
 * 登录/重置密码 10 次每分钟、注册/忘记密码/发送验证码 5 次每分钟、绑定邮箱校验 10 次每分钟。
 */
export const AUTH_RATE_LIMITS = {
  login: { prefix: 'auth:login', window: 60, limit: 10 },
  register: { prefix: 'auth:register', window: 60, limit: 5 },
  forgotPassword: { prefix: 'auth:forgot-password', window: 60, limit: 5 },
  resetPassword: { prefix: 'auth:reset-password', window: 60, limit: 10 },
  emailSendCode: { prefix: 'auth:email-send-code', window: 60, limit: 5 },
  emailBindVerify: { prefix: 'auth:email-bind-verify', window: 60, limit: 10 },
} as const satisfies Record<string, AuthRateLimitConfig>;

/**
 * 认证接口限流设施故障（Redis 异常/超时）时的处置模式。
 *
 * 默认 closed：认证防线不因基础设施抖动而自动消失（拒绝请求并返回 503）。
 * AUTH_RATE_LIMIT_FAILURE_MODE=open 为运维应急放行开关——仅在 Redis 长时间故障、
 * 需要临时恢复登录能力时使用，用完应立刻改回默认值。
 */
export function resolveAuthRateLimitFailureMode(): RateLimitFailureMode {
  return process.env.AUTH_RATE_LIMIT_FAILURE_MODE === 'open' ? 'open' : 'closed';
}

/** 按「前缀 + 故障模式」缓存限流器实例：复用进程内唯一 Redis 连接，避免每次请求新建连接 */
const limitersByPrefix = new Map<string, RateLimiter>();

export function getAuthRateLimiter(config: AuthRateLimitConfig): RateLimiter {
  const failureMode = resolveAuthRateLimitFailureMode();
  const cacheKey = `${config.prefix}:${failureMode}`;
  const cached = limitersByPrefix.get(cacheKey);
  if (cached) {
    return cached;
  }

  const limiter = new RateLimiter(getRedisClient(), {
    window: config.window,
    limit: config.limit,
    prefix: config.prefix,
    failureMode,
  });
  limitersByPrefix.set(cacheKey, limiter);
  return limiter;
}

/**
 * 认证请求的 IP 级限流。
 *
 * 返回错误响应表示应中断请求；返回 null 表示放行。
 * 映射规则：设施故障（limiter-unavailable）→ 503（无窗口，不下发 Retry-After）；
 * 正常超限 → 429 + 剩余等待秒数。
 */
export async function enforceAuthRateLimit(
  req: NextRequest,
  config: AuthRateLimitConfig
): Promise<Response | null> {
  let limiter: RateLimiter;
  try {
    limiter = getAuthRateLimiter(config);
  } catch (error) {
    // 连接创建失败同属设施故障：fail-closed 下拒绝认证请求
    console.error('[auth] 创建限流器失败:', error instanceof Error ? error.message : error);
    return ApiError.serviceUnavailable('服务暂不可用，请稍后再试');
  }

  const result = await limiter.check(getClientIp(req));

  if (result.allowed) {
    return null;
  }

  if (result.reason === 'limiter-unavailable') {
    return ApiError.serviceUnavailable('服务暂不可用，请稍后再试');
  }

  return ApiError.tooManyRequests('请求过于频繁，请稍后再试', {
    retryAfter: Math.max(0, result.reset - Math.floor(Date.now() / 1000)),
  });
}
