import { randomUUID } from 'node:crypto';
import type { Redis } from 'ioredis';
import { logger } from '@repo/logger';

/**
 * 限流设施故障（Redis 异常 / 超时）时的处置模式
 * - open：放行请求（默认，业务路由保持既有行为）
 * - closed：拒绝请求，由调用方映射为 503
 */
export type RateLimitFailureMode = 'open' | 'closed';

/**
 * 拒绝原因
 * - limiter-unavailable：因限流设施故障拒绝（仅 fail-closed 模式产生），调用方应映射为 503 而非 429
 */
export type RateLimitDenyReason = 'limiter-unavailable';

/**
 * 限流配置
 */
export interface RateLimitConfig {
  /** 时间窗口(秒) */
  window: number;
  /** 最大请求数 */
  limit: number;
  /** 限流键前缀 */
  prefix: string;
  /** 设施故障时的处置模式，默认 open */
  failureMode: RateLimitFailureMode;
}

/**
 * 限流结果
 */
export interface RateLimitResult {
  /** 是否允许请求 */
  allowed: boolean;
  /** 剩余请求次数 */
  remaining: number;
  /** 重置时间(秒) */
  reset: number;
  /** 总限制数 */
  limit: number;
  /** 拒绝原因；仅当因限流设施故障拒绝时存在 */
  reason?: RateLimitDenyReason;
}

/** 限流检查的 Redis 等待上限；超时按设施故障处置，避免请求永久挂起 */
const CHECK_TIMEOUT_MS = 1000;

/**
 * Redis 限流器。
 *
 * 纯契约：连接由构造显式注入，运行时不依赖具体连接生命周期。
 * 带连接状态的单例工厂在 @repo/redis，这里只保留算法与类型。
 */
export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: Partial<RateLimitConfig> = {}) {
    this.redis = redis;
    this.config = {
      window: config.window || 60, // 默认 60 秒
      limit: config.limit || 10, // 默认 10 次
      prefix: config.prefix || 'ratelimit',
      failureMode: config.failureMode || 'open', // 默认放行，保持业务路由既有行为
    };
  }

  /**
   * 检查限流
   *
   * 决策表（Redis 正常 / 抛错 / 超时 × fail-open / fail-closed）由
   * src/__tests__/rate-limit.test.ts 单源覆盖（ADR 0003），调用方测试请勿复刻分支逻辑。
   *
   * @param key - 限流键 (通常是 userId 或 IP)
   * @returns 限流结果
   */
  async check(key: string): Promise<RateLimitResult> {
    const redisKey = `${this.config.prefix}:${key}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - this.config.window;

    let timer: ReturnType<typeof setTimeout> | undefined;

    try {
      const run = async (): Promise<RateLimitResult> => {
        // 使用 Redis 事务确保原子性
        const multi = this.redis.multi();

        // 1. 移除时间窗口之前的记录
        multi.zremrangebyscore(redisKey, 0, windowStart);

        // 2. 添加当前请求记录：member 必须唯一（同一秒内多次请求的 score 相同，
        //    若 member 也用秒级时间戳会被 zadd 去重，导致计数恒为 1、滑动窗口失效）
        multi.zadd(redisKey, now, `${now}:${randomUUID()}`);

        // 3. 设置过期时间
        multi.expire(redisKey, this.config.window);

        // 4. 获取当前窗口内的请求数
        multi.zcard(redisKey);

        const results = await multi.exec();

        if (!results) {
          throw new Error('Redis 事务执行失败');
        }

        const currentCount = results[3][1] as number;
        const remaining = Math.max(0, this.config.limit - currentCount);
        const allowed = currentCount <= this.config.limit;

        return {
          allowed,
          remaining,
          reset: now + this.config.window,
          limit: this.config.limit,
        };
      };

      // Serverless 兜底：Redis 卡住时按 failureMode 处置，避免请求永久挂起
      const result = await Promise.race([
        run(),
        new Promise<RateLimitResult>((resolve) => {
          timer = setTimeout(() => {
            resolve(this.unavailableResult(key, `限流检查超时(${CHECK_TIMEOUT_MS}ms)`, now));
          }, CHECK_TIMEOUT_MS);
        }),
      ]);

      return result;
    } catch (error) {
      return this.unavailableResult(key, error, now);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * 限流设施不可用（Redis 异常或超时）时的处置
   *
   * fail-open 放行请求（保留原兜底行为，但必须留下 warn 日志，不再静默）；
   * fail-closed 拒绝请求并标记 reason，调用方据此映射为 503。
   *
   * @param key - 限流键
   * @param error - 原始异常或超时描述
   * @param now - 当前时间戳(秒)
   * @returns 限流结果
   */
  private unavailableResult(key: string, error: unknown, now: number): RateLimitResult {
    const { failureMode, prefix, limit, window } = this.config;

    logger.warn('限流设施不可用', {
      prefix,
      key,
      failureMode,
      error: error instanceof Error ? error.message : String(error),
    });

    if (failureMode === 'closed') {
      return {
        allowed: false,
        remaining: 0,
        // 设施故障不涉及窗口等待，调用方按 limiter-unavailable 返回 503
        reset: now,
        limit,
        reason: 'limiter-unavailable',
      };
    }

    return {
      allowed: true,
      remaining: limit,
      reset: now + window,
      limit,
    };
  }

  /**
   * 获取当前状态
   * @param key - 限流键
   * @returns 限流状态
   */
  async getStatus(key: string): Promise<RateLimitResult> {
    const redisKey = `${this.config.prefix}:${key}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - this.config.window;

    try {
      // 清理过期记录
      await this.redis.zremrangebyscore(redisKey, 0, windowStart);

      // 获取当前计数
      const currentCount = await this.redis.zcard(redisKey);
      const remaining = Math.max(0, this.config.limit - currentCount);
      const allowed = currentCount <= this.config.limit;

      return {
        allowed,
        remaining,
        reset: now + this.config.window,
        limit: this.config.limit,
      };
    } catch (error) {
      console.error('获取限流状态失败:', error);
      return {
        allowed: true,
        remaining: this.config.limit,
        reset: now + this.config.window,
        limit: this.config.limit,
      };
    }
  }

  /**
   * 重置限流
   * @param key - 限流键
   */
  async reset(key: string): Promise<void> {
    const redisKey = `${this.config.prefix}:${key}`;
    try {
      await this.redis.del(redisKey);
    } catch (error) {
      console.error('重置限流失败:', error);
    }
  }
}

/**
 * 用户配额管理器。
 *
 * 纯契约：连接由构造显式注入，不涉及连接生命周期。
 */
export class QuotaManager {
  private redis: Redis;
  private prefix: string;

  constructor(redis: Redis, prefix = 'quota') {
    this.redis = redis;
    this.prefix = prefix;
  }

  /**
   * 检查用户配额
   * @param userId - 用户 ID
   * @param quotaType - 配额类型 (tokens, requests, etc.)
   * @param amount - 请求数量
   * @param maxQuota - 最大配额
   * @returns 是否允许
   */
  async checkQuota(
    userId: string,
    quotaType: string,
    amount: number = 1,
    maxQuota?: number
  ): Promise<{ allowed: boolean; remaining: number; quota: number }> {
    const quotaKey = `${this.prefix}:${userId}:${quotaType}`;
    const period = 'daily'; // 可以扩展为 monthly, weekly 等

    try {
      // 获取当前配额使用量
      const currentUsage = await this.redis.get(quotaKey);
      const usage = currentUsage ? parseInt(currentUsage, 10) : 0;

      // 如果没有指定最大配额，从配置获取
      const quotaLimit = maxQuota || this.getDefaultQuota(quotaType);

      const remaining = Math.max(0, quotaLimit - usage);
      const allowed = usage + amount <= quotaLimit;

      return {
        allowed,
        remaining,
        quota: quotaLimit,
      };
    } catch (error) {
      console.error('配额检查失败:', error);
      // 错误时允许请求
      return {
        allowed: true,
        remaining: 1000,
        quota: 1000,
      };
    }
  }

  /**
   * 增加配额使用量
   * @param userId - 用户 ID
   * @param quotaType - 配额类型
   * @param amount - 增加数量
   */
  async incrementQuota(userId: string, quotaType: string, amount: number = 1): Promise<void> {
    const quotaKey = `${this.prefix}:${userId}:${quotaType}`;

    try {
      // 使用 INCRBY 增加计数
      await this.redis.incrby(quotaKey, amount);

      // 如果是第一次设置，设置过期时间 (24小时)
      const ttl = await this.redis.ttl(quotaKey);
      if (ttl === -1) {
        await this.redis.expire(quotaKey, 24 * 60 * 60); // 24小时
      }
    } catch (error) {
      console.error('增加配额失败:', error);
    }
  }

  /**
   * 获取默认配额
   * @param quotaType - 配额类型
   * @returns 默认配额值
   */
  private getDefaultQuota(quotaType: string): number {
    const defaultQuotas: Record<string, number> = {
      tokens: 10000, // 每天 10k tokens
      requests: 100, // 每天 100 次请求
      images: 20, // 每天 20 张图片
      voice: 60, // 每天 60 分钟语音
    };

    return defaultQuotas[quotaType] || 100;
  }

  /**
   * 重置用户配额
   * @param userId - 用户 ID
   * @param quotaType - 配额类型 (可选，不传则重置所有)
   */
  async resetQuota(userId: string, quotaType?: string): Promise<void> {
    try {
      if (quotaType) {
        const quotaKey = `${this.prefix}:${userId}:${quotaType}`;
        await this.redis.del(quotaKey);
      } else {
        // 重置所有配额
        const pattern = `${this.prefix}:${userId}:*`;
        const keys = await this.redis.keys(pattern);
        if (keys.length > 0) {
          await this.redis.del(...keys);
        }
      }
    } catch (error) {
      console.error('重置配额失败:', error);
    }
  }
}