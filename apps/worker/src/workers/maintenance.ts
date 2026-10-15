import { Queue, Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import { resolveBullMQConnectionOptions } from '@repo/shared/server';

/**
 * 维护队列：清理类定时任务。
 *
 * 该队列由 Worker 自己注册调度、自己消费，Web 侧不入队，因此不进
 * `packages/queue` 的统一队列清单——否则 Web 每次冷启动都会多出一条用不到的 Redis 连接。
 */
export const MAINTENANCE_QUEUE_NAME = 'maintenance';

/** 维护任务名（维护任务不是用户任务，不进 shared 的 TaskType / JOB_NAMES 名单） */
export const REFRESH_TOKEN_CLEANUP_JOB_NAME = 'refresh-token-cleanup';

/** 调度 id：upsert 语义幂等，Worker 每次启动重复注册不会产生重复任务 */
const REFRESH_TOKEN_CLEANUP_SCHEDULER_ID = 'refresh-token-cleanup-daily';

/** 每天 03:17（东八区）执行；避开整点，减少与其它定时任务/平台作业抢资源 */
const REFRESH_TOKEN_CLEANUP_PATTERN = '17 3 * * *';

/** 执行时区：容器默认多为 UTC，显式固定为东八区保证「凌晨 3 点」符合团队预期 */
const SCHEDULE_TIMEZONE = 'Asia/Shanghai';

/** 删除 `expiresAt` 已早于当前时间的 refresh token 记录，返回删除条数 */
async function cleanupExpiredRefreshTokens(): Promise<number> {
  const { count } = await prisma.refreshToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}

export const maintenanceWorker = new Worker(
  MAINTENANCE_QUEUE_NAME,
  async (job) => {
    if (job.name !== REFRESH_TOKEN_CLEANUP_JOB_NAME) {
      logger.warn('收到未知维护任务，已跳过', { jobName: job.name, jobId: job.id });
      return;
    }

    const startedAt = Date.now();
    const deletedCount = await cleanupExpiredRefreshTokens();
    logger.info('清理过期 refresh token 完成', {
      deletedCount,
      durationMs: Date.now() - startedAt,
    });
  },
  {
    autorun: false,
    connection: resolveBullMQConnectionOptions(process.env),
    concurrency: 1,
  }
);

/**
 * 注册维护类重复任务调度。
 *
 * 幂等：`upsertJobScheduler` 以调度 id 为准覆盖，Worker 重启不会堆积重复任务；
 * 注册完成后立即关闭生产者连接，避免常驻进程多留一条闲置 Redis 连接。
 */
export async function registerMaintenanceSchedules(): Promise<void> {
  const queue = new Queue(MAINTENANCE_QUEUE_NAME, {
    connection: resolveBullMQConnectionOptions(process.env),
  });

  try {
    await queue.upsertJobScheduler(
      REFRESH_TOKEN_CLEANUP_SCHEDULER_ID,
      { pattern: REFRESH_TOKEN_CLEANUP_PATTERN, tz: SCHEDULE_TIMEZONE },
      {
        name: REFRESH_TOKEN_CLEANUP_JOB_NAME,
        opts: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          // 只保留有限历史，避免每日任务在 Redis 里无限堆积
          removeOnComplete: { count: 30, age: 7 * 24 * 3600 },
          removeOnFail: { count: 90, age: 30 * 24 * 3600 },
        },
      }
    );
    logger.info('已注册维护任务调度', {
      queueName: MAINTENANCE_QUEUE_NAME,
      jobName: REFRESH_TOKEN_CLEANUP_JOB_NAME,
      pattern: REFRESH_TOKEN_CLEANUP_PATTERN,
      timezone: SCHEDULE_TIMEZONE,
    });
  } finally {
    await queue.close();
  }
}
