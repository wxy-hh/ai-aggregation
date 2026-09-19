/**
 * astrology-qa-limit.ts —— 星语问答 · 每报告上限的服务端计数（收尾修复）
 *
 * 为什么不能只信请求体：askedCount 由客户端上报，绕过前端即可无限提问。额度是硬约束，
 * 但「每报告 3 问」这条产品铁律的裁决权不能交给客户端——本模块用 Redis 计数器在服务端强制：
 *
 * - 键：astrology:qa:<userId>:<报告标识>。报告标识取事实层 calculationRevision + calculatedAt
 *   的短哈希：同一份报告的追问共享同一计数，重算后真值换了修订与计算时刻即换新键（新报告重新计 3 问）。
 * - 计数：INCR + EXPIRE（TTL 7 天，与报告在本地的生命周期同量级），结果超过上限即拒绝。
 * - 计次语义：一次提问消耗一次机会（与前端 UI 计数一致：敏感拦截命中、上游失败同样计次，不退还）。
 * - 降级（Redis 不可用 / 超时）：放行并记日志。计费仍是硬约束（额度不足按 402 拦住），
 *   不该因为计数后端故障把用户挡在门外；日志用于事后发现计数长期失效。
 */

import crypto from 'node:crypto';
import { createRedisClient } from '@repo/shared/server';
import { ASTROLOGY_QA_MAX_QUESTIONS } from '@/lib/astrology/qa-events';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';

/** 计数键 TTL：7 天（过期键由 Redis 自然回收） */
const QA_LIMIT_TTL_SECONDS = 7 * 24 * 3600;
/** 计数操作超时：卡住即按放行处理，绝不让请求挂在计数后端上 */
const QA_LIMIT_REDIS_TIMEOUT_MS = 2_000;
/** 计数键前缀（与限流键区分，便于运维检索） */
const QA_LIMIT_KEY_PREFIX = 'astrology:qa';

/** 计数结果（degraded 仅供日志与测试观察，不影响路由行为） */
export interface AstrologyQaLimitResult {
  allowed: boolean;
  used: number;
  remaining: number;
  /** 计数后端不可用而放行 */
  degraded: boolean;
}

/**
 * 计数器所需的最小 Redis 能力：真实实例是 ioredis（其 multi() 链满足此结构），
 * 单测注入假实现，避免依赖真实 Redis。
 */
export interface QaLimitPipeline {
  incr(key: string): QaLimitPipeline;
  expire(key: string, seconds: number): QaLimitPipeline;
  exec(): Promise<unknown>;
}

export interface QaLimitRedis {
  multi(): QaLimitPipeline;
}

/** 报告标识：同一份真值（同一修订 + 同一计算时刻）共享一个计数键 */
export function buildQaLimitKey(
  userId: string,
  facts: Pick<AstrologyChartFacts, 'calculationRevision' | 'calculatedAt'>
): string {
  const fingerprint = crypto
    .createHash('sha256')
    .update(`${facts.calculationRevision}|${facts.calculatedAt}`)
    .digest('hex')
    .slice(0, 16);
  return `${QA_LIMIT_KEY_PREFIX}:${userId}:${fingerprint}`;
}

/** 超时包装：计数后端卡住时抛错，由调用方走放行分支 */
async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('计数后端超时')), ms);
      }),
    ]);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

/** 默认 Redis 连接（模块级单例；懒建连，导入本模块不会触发连接） */
let defaultRedis: QaLimitRedis | null = null;
function resolveRedis(): QaLimitRedis {
  if (!defaultRedis) defaultRedis = createRedisClient();
  return defaultRedis;
}

/**
 * 记一次提问并判断是否超限。
 * @returns allowed=false 表示该报告已用满 ASTROLOGY_QA_MAX_QUESTIONS 次提问
 */
export async function consumeAstrologyQaQuota(
  userId: string,
  facts: Pick<AstrologyChartFacts, 'calculationRevision' | 'calculatedAt'>,
  redis: QaLimitRedis = resolveRedis()
): Promise<AstrologyQaLimitResult> {
  const key = buildQaLimitKey(userId, facts);
  try {
    const result = (await withTimeout(
      redis.multi().incr(key).expire(key, QA_LIMIT_TTL_SECONDS).exec(),
      QA_LIMIT_REDIS_TIMEOUT_MS
    )) as Array<[Error | null, unknown]> | null;

    const firstError = result?.[0]?.[0];
    if (firstError) throw firstError;
    const used = Number(result?.[0]?.[1]);
    if (!Number.isFinite(used)) throw new Error('计数结果不合法');

    return {
      allowed: used <= ASTROLOGY_QA_MAX_QUESTIONS,
      used,
      remaining: Math.max(0, ASTROLOGY_QA_MAX_QUESTIONS - used),
      degraded: false,
    };
  } catch (error) {
    console.error(
      '[astrology/copilot] 问答次数计数失败，本次放行（额度仍是硬约束）:',
      error instanceof Error ? error.message : error
    );
    return {
      allowed: true,
      used: 0,
      remaining: ASTROLOGY_QA_MAX_QUESTIONS,
      degraded: true,
    };
  }
}
