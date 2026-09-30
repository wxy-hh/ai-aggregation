import crypto from 'crypto';
import { logger } from '@repo/logger';
import { getRedisClient } from '@repo/redis';
import { hashToken } from '@/lib/auth/jwt';

/**
 * 邮箱验证码的生成、存储与一次性校验。
 *
 * 用途只有注册验证与绑定邮箱两条：忘记密码走重置链接（`reset:` 前缀的重置令牌，
 * 复用 RefreshToken 表），不发验证码。
 *
 * 存储选型：注册用途的用户尚不存在（无法挂 userId），绑定用途的邮箱也尚未生效，
 * 因此验证码存 Redis —— 键 `verify:<purpose>:<email>`、值只存 SHA-256 摘要、TTL 10 分钟。
 * 路由级限流阈值见 `@/lib/auth/rate-limit` 的 AUTH_RATE_LIMITS。
 *
 * 故障处置：验证码存储属于认证链路，读取失败按 fail-closed 处理
 * （抛 EmailVerificationUnavailableError，路由层返回 503）。
 */

export const EMAIL_PURPOSES = ['register', 'bind'] as const;
export type EmailPurpose = (typeof EMAIL_PURPOSES)[number];

/** 验证码有效期（秒）：10 分钟 */
export const EMAIL_CODE_TTL_SECONDS = 10 * 60;

/** 单邮箱每日发码上限（防邮件轰炸） */
export const EMAIL_DAILY_SEND_LIMIT = 10;

/** 日计数窗口（秒）：24 小时滚动窗口 */
const EMAIL_DAILY_WINDOW_SECONDS = 24 * 60 * 60;

/** Redis 操作等待上限：超时按设施故障处置，避免请求永久挂起 */
const REDIS_TIMEOUT_MS = 1000;

/** 验证码存储/读取设施不可用（路由层按 503 处理） */
export class EmailVerificationUnavailableError extends Error {
  constructor(message = '验证码存储不可用') {
    super(message);
    this.name = 'EmailVerificationUnavailableError';
  }
}

function codeKey(purpose: EmailPurpose, email: string): string {
  return `verify:${purpose}:${email}`;
}

function dailyCountKey(email: string): string {
  return `auth:email-daily:${email}`;
}

/** 生成 6 位数字验证码（加密安全随机源） */
export function generateEmailCode(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** 验证码落库值：只存 SHA-256 摘要，泄露也无法直接使用 */
export function hashEmailCode(code: string): string {
  return hashToken(code);
}

async function withRedisTimeout<T>(operation: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new EmailVerificationUnavailableError('验证码存储操作超时')),
          REDIS_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asUnavailable(error: unknown): EmailVerificationUnavailableError {
  if (error instanceof EmailVerificationUnavailableError) {
    return error;
  }
  return new EmailVerificationUnavailableError(
    error instanceof Error ? error.message : String(error)
  );
}

/** 存储验证码（TTL 10 分钟）；设施故障抛 EmailVerificationUnavailableError */
export async function storeEmailCode(
  purpose: EmailPurpose,
  email: string,
  code: string
): Promise<void> {
  try {
    await withRedisTimeout(
      getRedisClient().set(codeKey(purpose, email), hashEmailCode(code), 'EX', EMAIL_CODE_TTL_SECONDS)
    );
  } catch (error) {
    throw asUnavailable(error);
  }
}

/**
 * 校验验证码并在验证通过时一次性作废。
 * 返回 false 表示验证码不存在、已过期或不匹配（验证码保留，允许用户重试）。
 */
export async function consumeEmailCode(
  purpose: EmailPurpose,
  email: string,
  code: string
): Promise<boolean> {
  const key = codeKey(purpose, email);
  const expected = Buffer.from(hashEmailCode(code), 'hex');

  try {
    const stored = await withRedisTimeout(getRedisClient().get(key));
    if (!stored) {
      return false;
    }

    const actual = Buffer.from(stored, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return false;
    }

    await withRedisTimeout(getRedisClient().del(key));
    return true;
  } catch (error) {
    throw asUnavailable(error);
  }
}

export type EmailDailyQuotaResult =
  | { status: 'allowed' }
  | { status: 'exceeded'; retryAfter: number }
  | { status: 'unavailable' };

/**
 * 单邮箱日发码配额：每次调用都计数（与邮箱是否已注册无关），
 * 这样「第 11 次返回 429」对存在与不存在的账号完全一致，不会成为账号枚举旁路。
 */
export async function consumeEmailDailyQuota(email: string): Promise<EmailDailyQuotaResult> {
  const key = dailyCountKey(email);

  try {
    const redis = getRedisClient();
    const count = await withRedisTimeout(redis.incr(key));
    if (count === 1) {
      await withRedisTimeout(redis.expire(key, EMAIL_DAILY_WINDOW_SECONDS));
    }

    if (count <= EMAIL_DAILY_SEND_LIMIT) {
      return { status: 'allowed' };
    }

    let retryAfter = EMAIL_DAILY_WINDOW_SECONDS;
    try {
      const ttl = await withRedisTimeout(redis.ttl(key));
      if (ttl > 0) {
        retryAfter = ttl;
      }
    } catch {
      // TTL 读取失败不影响拒绝结论，退回整窗口等待时间
    }

    return { status: 'exceeded', retryAfter };
  } catch (error) {
    logger.warn('邮箱日发送配额检查失败（Redis 不可用）', {
      error: error instanceof Error ? error.message : String(error),
    });
    return { status: 'unavailable' };
  }
}
