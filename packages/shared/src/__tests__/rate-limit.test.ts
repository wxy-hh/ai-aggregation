/**
 * RateLimiter 故障处置决策表（单源）
 *
 * 依 ADR 0003：限流器的可靠性决策表只在本文件断言，路由/调用方测试不得复刻这里的分支逻辑。
 * 矩阵：{Redis 正常, Redis 抛错, Redis 超时} × {fail-open, fail-closed}。
 * 断言面仅限外部行为：放行/拒绝的结果结构、拒绝原因、warn 日志调用。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Redis } from 'ioredis';

const { warnSpy } = vi.hoisted(() => ({ warnSpy: vi.fn() }));

vi.mock('@repo/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: warnSpy,
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { RateLimiter, type RateLimitFailureMode } from '../rate-limit';

/** mock Redis 的 exec 结局 */
type ExecOutcome =
  | { kind: 'ok'; count: number }
  | { kind: 'error'; error: Error }
  | { kind: 'hang' };

/** 构造只实现 check 所需命令的 Redis 替身 */
function createMockRedis(outcome: ExecOutcome): Redis {
  const exec = (): Promise<unknown> => {
    switch (outcome.kind) {
      case 'hang':
        // 永不结算，模拟 Redis 卡住
        return new Promise<never>(() => {});
      case 'error':
        return Promise.reject(outcome.error);
      case 'ok':
        // 事务四步的结果：[zremrangebyscore, zadd, expire, zcard]
        return Promise.resolve([
          [null, 0],
          [null, 1],
          [null, 1],
          [null, outcome.count],
        ]);
    }
  };

  const pipeline = {
    zremrangebyscore: () => pipeline,
    zadd: () => pipeline,
    expire: () => pipeline,
    zcard: () => pipeline,
    exec,
  };

  return { multi: () => pipeline } as unknown as Redis;
}

function createLimiter(outcome: ExecOutcome, failureMode?: RateLimitFailureMode): RateLimiter {
  return new RateLimiter(createMockRedis(outcome), {
    window: 60,
    limit: 3,
    prefix: 'test:ratelimit',
    ...(failureMode ? { failureMode } : {}),
  });
}

/**
 * 内存版 zset 语义的 Redis 替身：按真实语义实现限流用到的 4 条命令
 * （zadd 按 member 去重、zremrangebyscore 按 score 过滤、zcard 返回集合基数、expire 空实现）。
 *
 * 上方的 createMockRedis 直接返回写死的计数，无法发现「同一秒内 zadd 的 member 重复，
 * 被 Redis 去重后计数恒为 1」这类缺陷，因此窗口计数语义另用本替身验证。
 */
class InMemoryZsetRedis {
  private readonly zsets = new Map<string, Map<string, number>>();

  private zsetOf(key: string): Map<string, number> {
    const existing = this.zsets.get(key);
    if (existing) {
      return existing;
    }
    const created = new Map<string, number>();
    this.zsets.set(key, created);
    return created;
  }

  multi() {
    const queued: Array<() => number> = [];

    const pipeline = {
      zremrangebyscore: (key: string, min: number, max: number) => {
        queued.push(() => {
          const zset = this.zsetOf(key);
          let removed = 0;
          for (const [member, score] of zset) {
            if (score >= min && score <= max) {
              zset.delete(member);
              removed += 1;
            }
          }
          return removed;
        });
        return pipeline;
      },
      zadd: (key: string, score: number, member: string) => {
        queued.push(() => {
          const zset = this.zsetOf(key);
          const isNewMember = !zset.has(member);
          zset.set(member, score);
          return isNewMember ? 1 : 0;
        });
        return pipeline;
      },
      expire: () => {
        queued.push(() => 1);
        return pipeline;
      },
      zcard: (key: string) => {
        queued.push(() => this.zsetOf(key).size);
        return pipeline;
      },
      exec: async () => {
        const results = queued.map((run) => [null, run()] as [null, number]);
        queued.length = 0;
        return results;
      },
    };

    return pipeline;
  }
}

describe('RateLimiter 故障处置决策表', () => {
  beforeEach(() => {
    warnSpy.mockReset();
  });

  describe('Redis 正常', () => {
    it('计数未超限时放行，不标记原因也不记告警', async () => {
      const result = await createLimiter({ kind: 'ok', count: 1 }).check('user_1');

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(2);
      expect(result.reason).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('计数超限时拒绝，拒绝原因与设施故障可区分', async () => {
      const result = await createLimiter({ kind: 'ok', count: 4 }).check('user_1');

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reason).toBeUndefined();
      expect(warnSpy).not.toHaveBeenCalled();
    });

    it('fail-closed 模式下仍按计数放行', async () => {
      const result = await createLimiter({ kind: 'ok', count: 1 }, 'closed').check('user_1');

      expect(result.allowed).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Redis 抛错', () => {
    const redisError = new Error('connect ECONNREFUSED 127.0.0.1:6379');

    it('fail-open：放行请求并记录 warn 日志', async () => {
      const result = await createLimiter({ kind: 'error', error: redisError }, 'open').check(
        'user_1'
      );

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(3);
      expect(result.reason).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][1]).toMatchObject({ failureMode: 'open' });
    });

    it('未显式指定模式时默认 fail-open（现有调用方行为不变）', async () => {
      const result = await createLimiter({ kind: 'error', error: redisError }).check('user_1');

      expect(result.allowed).toBe(true);
      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('fail-closed：拒绝请求并标记 limiter-unavailable', async () => {
      const result = await createLimiter({ kind: 'error', error: redisError }, 'closed').check(
        'user_1'
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('limiter-unavailable');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][1]).toMatchObject({ failureMode: 'closed' });
    });
  });

  describe('Redis 超时', () => {
    it('fail-open：超时后放行请求并记录 warn 日志', async () => {
      const result = await createLimiter({ kind: 'hang' }, 'open').check('user_1');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][1]).toMatchObject({ failureMode: 'open' });
    });

    it('fail-closed：超时后拒绝请求并标记 limiter-unavailable', async () => {
      const result = await createLimiter({ kind: 'hang' }, 'closed').check('user_1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('limiter-unavailable');
      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][1]).toMatchObject({ failureMode: 'closed' });
    });

    it('内部超时阈值收紧为 1s', async () => {
      const startTime = Date.now();
      const result = await createLimiter({ kind: 'hang' }, 'closed').check('user_1');
      const elapsed = Date.now() - startTime;

      expect(result.reason).toBe('limiter-unavailable');
      expect(elapsed).toBeGreaterThanOrEqual(900);
      // 旧的 2.5s 超时会被这条断言拒绝
      expect(elapsed).toBeLessThan(2000);
    });
  });
});

describe('RateLimiter 滑动窗口计数', () => {
  beforeEach(() => {
    warnSpy.mockReset();
  });

  /** 用内存 zset 语义的 Redis 替身构造限流器（计数真实累加，不写死 zcard 结果） */
  function createCountingLimiter(limit: number): RateLimiter {
    return new RateLimiter(new InMemoryZsetRedis() as unknown as Redis, {
      window: 60,
      limit,
      prefix: 'test:sliding-window',
      failureMode: 'closed',
    });
  }

  it('同一秒内连续 15 个请求限流 10 次：前 10 个放行，第 11 个起拒绝', async () => {
    const limiter = createCountingLimiter(10);

    const results = [];
    for (let i = 0; i < 15; i += 1) {
      results.push(await limiter.check('203.0.113.7'));
    }

    expect(results.slice(0, 10).map((result) => result.allowed)).toEqual(Array(10).fill(true));
    expect(results.slice(10).map((result) => result.allowed)).toEqual(Array(5).fill(false));
    // 正常超限不是设施故障：调用方应映射为 429 而非 503
    expect(results[10].reason).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('放行请求的剩余次数随窗口内计数递减', async () => {
    const limiter = createCountingLimiter(3);

    const first = await limiter.check('203.0.113.7');
    const second = await limiter.check('203.0.113.7');

    expect(first.remaining).toBe(2);
    expect(second.remaining).toBe(1);
  });

  it('不同限流键各自独立计数', async () => {
    const limiter = createCountingLimiter(1);

    const firstClient = await limiter.check('203.0.113.7');
    const secondClient = await limiter.check('203.0.113.8');

    expect(firstClient.allowed).toBe(true);
    expect(secondClient.allowed).toBe(true);
  });
});
