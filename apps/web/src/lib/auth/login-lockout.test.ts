import { describe, expect, it, vi } from 'vitest';

import {
  LOCKOUT_BASE_SECONDS,
  LOCKOUT_FAILURE_TTL_SECONDS,
  LOCKOUT_MAX_SECONDS,
  buildLoginAttemptKey,
  computeLockSeconds,
  createLoginAttemptStore,
  formatLockoutMessage,
} from './login-lockout';

/** 仅实现登录锁定用到的 Redis 命令，避免测试依赖真实 Redis */
class FakeRedis {
  values = new Map<string, string>();
  setCalls: Array<{ key: string; ttl: number | undefined }> = [];

  async get(key: string) {
    return this.values.get(key) ?? null;
  }

  async set(key: string, value: string, _ex?: string, ttl?: number) {
    this.values.set(key, value);
    this.setCalls.push({ key, ttl });
    return 'OK';
  }

  async del(key: string) {
    return this.values.delete(key) ? 1 : 0;
  }
}

function createStore() {
  const redis = new FakeRedis();
  return { redis, store: createLoginAttemptStore(redis as never) };
}

describe('登录锁定策略常量', () => {
  it('连续失败 5 次锁定 15 分钟，锁定期内再失败翻倍，上限 24 小时', () => {
    expect(LOCKOUT_BASE_SECONDS).toBe(15 * 60);
    expect(LOCKOUT_MAX_SECONDS).toBe(24 * 60 * 60);
  });

  it('未达阈值不锁定，达阈值后逐次翻倍并封顶', () => {
    expect(computeLockSeconds(1)).toBe(0);
    expect(computeLockSeconds(4)).toBe(0);
    expect(computeLockSeconds(5)).toBe(15 * 60);
    expect(computeLockSeconds(6)).toBe(30 * 60);
    expect(computeLockSeconds(7)).toBe(60 * 60);
    expect(computeLockSeconds(13)).toBe(LOCKOUT_MAX_SECONDS);
    expect(computeLockSeconds(50)).toBe(LOCKOUT_MAX_SECONDS);
  });

  it('锁定文案含剩余分钟数并向上取整', () => {
    expect(formatLockoutMessage(900)).toBe('尝试次数过多，账号已临时锁定，请 15 分钟后再试');
    expect(formatLockoutMessage(1)).toBe('尝试次数过多，账号已临时锁定，请 1 分钟后再试');
    expect(formatLockoutMessage(901)).toBe('尝试次数过多，账号已临时锁定，请 16 分钟后再试');
  });
});

describe('登录失败计数键', () => {
  it('按「用户名 + IP」组合，用户名统一小写（登录入参会先转小写）', () => {
    expect(buildLoginAttemptKey('Alice', '203.0.113.7')).toBe('alice:203.0.113.7');
  });
});

describe('登录失败计数与锁定存储', () => {
  it('累计失败未达阈值时保持未锁定', async () => {
    const { redis, store } = createStore();
    const key = buildLoginAttemptKey('alice', '203.0.113.7');

    for (let i = 1; i < 5; i += 1) {
      const state = await store.recordFailure(key);
      expect(state.lockedUntil, `第 ${i} 次失败不应锁定`).toBeNull();
    }

    expect(await store.getLock(key)).toEqual({ failures: 4, lockedUntil: null });
    expect(redis.setCalls.every((call) => call.ttl === LOCKOUT_FAILURE_TTL_SECONDS)).toBe(true);
  });

  it('第 5 次失败进入锁定；锁定期内再次失败不累计、不延长锁定', async () => {
    vi.useFakeTimers();
    try {
      const { store } = createStore();
      const key = buildLoginAttemptKey('alice', '203.0.113.7');
      const now = Math.floor(Date.now() / 1000);

      for (let i = 1; i <= 4; i += 1) {
        await store.recordFailure(key);
      }

      const fifth = await store.recordFailure(key);
      expect(fifth.lockSeconds).toBe(LOCKOUT_BASE_SECONDS);
      expect(fifth.lockedUntil).toBe(now + LOCKOUT_BASE_SECONDS);

      // 锁定期内不喂养计数器：否则攻击者周期性尝试即可让账号永远锁着（锁定 DoS）
      const duringLock = await store.recordFailure(key);
      expect(duringLock).toEqual({
        failures: 5,
        lockedUntil: now + LOCKOUT_BASE_SECONDS,
        lockSeconds: 0,
      });
      expect(await store.getLock(key)).toEqual({
        failures: 5,
        lockedUntil: now + LOCKOUT_BASE_SECONDS,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('锁定期满后再次失败从已有计数继续翻倍（跨锁定周期仍渐进）', async () => {
    vi.useFakeTimers();
    try {
      const { store } = createStore();
      const key = buildLoginAttemptKey('alice', '203.0.113.7');

      for (let i = 1; i <= 5; i += 1) {
        await store.recordFailure(key);
      }

      const locked = await store.getLock(key);
      expect(locked.failures).toBe(5);

      // 锁定到期后再次失败：计数从 5 继续累进到 6，锁定时长翻倍为 30 分钟
      const afterExpiryAt = locked.lockedUntil! + 1;
      vi.setSystemTime(new Date(afterExpiryAt * 1000));
      const afterExpiry = await store.recordFailure(key);

      expect(afterExpiry.failures).toBe(6);
      expect(afterExpiry.lockSeconds).toBe(LOCKOUT_BASE_SECONDS * 2);
      expect(afterExpiry.lockedUntil).toBe(afterExpiryAt + LOCKOUT_BASE_SECONDS * 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('登录成功可清零计数', async () => {
    const { redis, store } = createStore();
    const key = buildLoginAttemptKey('alice', '203.0.113.7');

    await store.recordFailure(key);
    await store.clear(key);

    expect(await store.getLock(key)).toEqual({ failures: 0, lockedUntil: null });
    expect(redis.values.size).toBe(0);
  });

  it('存储内容损坏时按未锁定处理，不阻断登录', async () => {
    const { redis, store } = createStore();
    const key = buildLoginAttemptKey('alice', '203.0.113.7');
    redis.values.set(key, '{不是合法 JSON');

    await expect(store.getLock(key)).resolves.toEqual({ failures: 0, lockedUntil: null });
  });

  it('Redis 异常时按未锁定处理，不抛出（安全边界由 fail-closed 的限流层兜底）', async () => {
    const failingRedis = {
      get: async () => {
        throw new Error('Redis 连接不可用');
      },
      set: async () => {
        throw new Error('Redis 连接不可用');
      },
      del: async () => {
        throw new Error('Redis 连接不可用');
      },
    };
    const store = createLoginAttemptStore(failingRedis as never);
    const key = buildLoginAttemptKey('alice', '203.0.113.7');

    await expect(store.getLock(key)).resolves.toEqual({ failures: 0, lockedUntil: null });
    await expect(store.recordFailure(key)).resolves.toEqual({
      failures: 0,
      lockedUntil: null,
      lockSeconds: 0,
    });
    await expect(store.clear(key)).resolves.toBeUndefined();
  });
});
