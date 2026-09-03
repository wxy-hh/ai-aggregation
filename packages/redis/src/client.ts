import { Redis } from 'ioredis';
import { resolveRedisConnectionOptions } from '@repo/shared/server';

/**
 * 创建 Redis 客户端（Serverless 安全默认：短超时、无 offline queue）。
 * 连接/命令失败时由调用方（如 RateLimiter.check）捕获并放行请求。
 *
 * 长驻进程（Next.js / Worker）自愈：
 * 默认 retryStrategy 放弃后 status='end'，配合 offline queue 会让后续命令
 * 无限排队（每个请求都撞超时放行、限流静默失效）。
 * 这里覆盖为持续重试（指数退避封顶 5s），保证单例客户端永远可恢复。
 */
export function createRedisClient(): Redis {
  const options = {
    ...resolveRedisConnectionOptions(process.env),
    // 覆盖短重试策略：长驻进程的客户端需要断线自愈能力
    retryStrategy: (times: number) => Math.min(times * 200, 5000),
  };
  const redis = new Redis(options);

  // 避免未处理 error 事件导致进程噪音；调用方已按需失败放行
  redis.on('error', (error) => {
    console.error('[redis] 连接错误:', error instanceof Error ? error.message : error);
  });

  return redis;
}

/**
 * 进程内唯一 Redis 连接。
 *
 * 生命周期仅由本模块治理：消费方（限流器 / 心跳 / 奇门存储）注入共享连接，
 * 不自行创建、不自行关闭，避免连接泄漏与多份连接并存。Serverless 下复用
 * 进程内 keep-alive 连接，不主动 disconnect。
 */
let instance: Redis | null = null;

export function getRedisClient(): Redis {
  if (!instance) {
    instance = createRedisClient();
  }
  return instance;
}

/**
 * 优雅关闭单例连接（仅长驻进程关闭时显式调用，如 Worker shutdown）。
 * Serverless 场景不要调用，复用进程连接即可。
 */
export async function shutdownRedisClient(): Promise<void> {
  if (!instance) return;
  await instance.quit();
  instance = null;
}