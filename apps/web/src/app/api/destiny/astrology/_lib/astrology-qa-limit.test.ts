/**
 * astrology-qa-limit.test.ts —— 星语问答 · 每报告上限的服务端计数（Redis，假实现注入）
 *
 * 锁定的外部行为：
 * - 同一用户 + 同一份报告（同一修订 + 同一计算时刻）：前 3 次放行，第 4 次拒绝；
 * - 换报告（修订或计算时刻变化）与换用户各自独立计数；
 * - 每次写入 7 天 TTL；
 * - 计数后端异常或超时：放行并记日志（额度仍是硬约束），绝不把用户挡在门外。
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import { ASTROLOGY_QA_MAX_QUESTIONS } from '@/lib/astrology/qa-events';
import {
  buildQaLimitKey,
  consumeAstrologyQaQuota,
  type QaLimitRedis,
} from './astrology-qa-limit';

type FactsKey = Pick<AstrologyChartFacts, 'calculationRevision' | 'calculatedAt'>;

const REPORT_A: FactsKey = { calculationRevision: 'astro-aaaa1111', calculatedAt: '2026-09-20T00:00:00.000Z' };
const REPORT_B: FactsKey = { calculationRevision: 'astro-bbbb2222', calculatedAt: '2026-09-20T00:00:00.000Z' };

/** 假 Redis：只实现计数所需的最小能力（INCR + EXPIRE），并记录调用便于断言 */
function fakeRedis(options: { error?: Error; hang?: boolean } = {}) {
  const counters = new Map<string, number>();
  const ttlCalls: Array<{ key: string; seconds: number }> = [];
  const redis: QaLimitRedis = {
    multi() {
      let currentKey = '';
      return {
        incr(key: string) {
          currentKey = key;
          return this;
        },
        expire(key: string, seconds: number) {
          ttlCalls.push({ key, seconds });
          return this;
        },
        async exec() {
          if (options.hang) return new Promise<never>(() => {});
          if (options.error) return [[options.error, null]];
          const next = (counters.get(currentKey) ?? 0) + 1;
          counters.set(currentKey, next);
          return [[null, next]];
        },
      };
    },
  };
  return { redis, counters, ttlCalls };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('consumeAstrologyQaQuota（服务端计数）', () => {
  it('同一份报告：前 3 次放行，第 4 次拒绝', async () => {
    const { redis } = fakeRedis();

    for (let i = 1; i <= ASTROLOGY_QA_MAX_QUESTIONS; i += 1) {
      const result = await consumeAstrologyQaQuota('user-1', REPORT_A, redis);
      expect(result.allowed, `第 ${i} 问`).toBe(true);
      expect(result.used).toBe(i);
      expect(result.remaining).toBe(ASTROLOGY_QA_MAX_QUESTIONS - i);
      expect(result.degraded).toBe(false);
    }

    const exceeded = await consumeAstrologyQaQuota('user-1', REPORT_A, redis);
    expect(exceeded.allowed).toBe(false);
    expect(exceeded.used).toBe(ASTROLOGY_QA_MAX_QUESTIONS + 1);
    expect(exceeded.remaining).toBe(0);
  });

  it('换报告 / 换用户各自独立计数', async () => {
    const { redis } = fakeRedis();

    for (let i = 0; i < ASTROLOGY_QA_MAX_QUESTIONS; i += 1) {
      await consumeAstrologyQaQuota('user-1', REPORT_A, redis);
    }
    expect((await consumeAstrologyQaQuota('user-1', REPORT_A, redis)).allowed).toBe(false);

    // 重算后真值换了修订：新报告重新计 3 问
    expect((await consumeAstrologyQaQuota('user-1', REPORT_B, redis)).allowed).toBe(true);
    // 另一个用户互不影响
    expect((await consumeAstrologyQaQuota('user-2', REPORT_A, redis)).allowed).toBe(true);
  });

  it('每次计数写入 7 天 TTL，键含用户与报告标识', async () => {
    const { redis, ttlCalls } = fakeRedis();

    await consumeAstrologyQaQuota('user-9', REPORT_A, redis);

    expect(ttlCalls).toEqual([{ key: buildQaLimitKey('user-9', REPORT_A), seconds: 7 * 24 * 3600 }]);
    // 键稳定：同一份真值重复计数落到同一个键
    expect(buildQaLimitKey('user-9', { ...REPORT_A })).toBe(buildQaLimitKey('user-9', REPORT_A));
    // 修订或计算时刻变化 → 换键
    expect(buildQaLimitKey('user-9', REPORT_B)).not.toBe(buildQaLimitKey('user-9', REPORT_A));
    expect(
      buildQaLimitKey('user-9', { ...REPORT_A, calculatedAt: '2026-09-21T00:00:00.000Z' })
    ).not.toBe(buildQaLimitKey('user-9', REPORT_A));
  });

  it('Redis 报错：放行并记日志（degraded）', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { redis } = fakeRedis({ error: new Error('redis down') });

    const result = await consumeAstrologyQaQuota('user-1', REPORT_A, redis);

    expect(result).toEqual({
      allowed: true,
      used: 0,
      remaining: ASTROLOGY_QA_MAX_QUESTIONS,
      degraded: true,
    });
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining('计数失败，本次放行'),
      expect.anything()
    );
  });

  it('Redis 超时：按放行处理，不让请求挂在计数后端上', async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { redis } = fakeRedis({ hang: true });

    const pending = consumeAstrologyQaQuota('user-1', REPORT_A, redis);
    await vi.advanceTimersByTimeAsync(2_100);
    const result = await pending;

    expect(result.allowed).toBe(true);
    expect(result.degraded).toBe(true);
    expect(consoleError).toHaveBeenCalled();
  });
});
