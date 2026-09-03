import type { Redis } from 'ioredis';
import {
  RateLimiter,
  QuotaManager,
  type RateLimitResult,
} from '@repo/shared/server';
import { getRedisClient } from './client';

/** Redis 完全不可用时的放行限流器，避免 Serverless 冷启动因建连崩溃 */
class AllowAllRateLimiter extends RateLimiter {
  constructor() {
    // 传入空壳 redis 不会被调用；check 直接重写
    super({} as Redis, { window: 60, limit: 10, prefix: 'api:ratelimit:noop' });
  }

  async check(_key: string): Promise<RateLimitResult> {
    const now = Math.floor(Date.now() / 1000);
    return {
      allowed: true,
      remaining: this['config'].limit,
      reset: now + this['config'].window,
      limit: this['config'].limit,
    };
  }
}

let defaultRateLimiter: RateLimiter | null = null;
let defaultQuotaManager: QuotaManager | null = null;

/**
 * 获取默认限流器（进程内单例，复用唯一 Redis 连接）。
 */
export function getRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    try {
      defaultRateLimiter = new RateLimiter(getRedisClient(), {
        window: 60,
        limit: 10,
        prefix: 'api:ratelimit',
      });
    } catch (error) {
      console.error('[redis] 创建限流器失败，使用放行模式:', error);
      defaultRateLimiter = new AllowAllRateLimiter();
    }
  }
  return defaultRateLimiter;
}

/**
 * 获取默认配额管理器（进程内单例，复用唯一 Redis 连接）。
 */
export function getQuotaManager(): QuotaManager {
  if (!defaultQuotaManager) {
    defaultQuotaManager = new QuotaManager(getRedisClient(), 'user:quota');
  }
  return defaultQuotaManager;
}