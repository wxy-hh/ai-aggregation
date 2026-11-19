/**
 * 会话记忆增量索引 Worker (Memory Index Worker)
 *
 * 订阅 'memory-index' 队列，消费用户会话产生的增量切块与向量化任务
 */

import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { resolveBullMQConnectionOptions } from '@repo/shared/server';
import { memoryIndexQueue, type MemoryIndexJobData } from '@repo/queue';
import { processMemoryIndexJob } from './memory-index/processor';
import { dispatchMemoryCatchup } from './memory-index/catchup';

export const memoryIndexWorker = new Worker<MemoryIndexJobData>(
  'memory-index',
  async (job) => {
    const startedAt = Date.now();
    logger.info('memory-index worker 收到索引任务', {
      jobId: job.id,
      name: job.name,
      userId: job.data.userId,
      sessionId: job.data.sessionId,
    });

    const result = await processMemoryIndexJob(job.data);

    if (result.needsCatchup) {
      await dispatchMemoryCatchup(memoryIndexQueue, job.data);
      logger.info('memory-index worker 追加追赶任务', {
        sessionId: job.data.sessionId,
        userId: job.data.userId,
      });
    }

    logger.info('memory-index worker 任务处理完毕', {
      jobId: job.id,
      sessionId: job.data.sessionId,
      success: result.success,
      chunkCount: result.chunkCount,
      skipped: result.skipped,
      durationMs: Date.now() - startedAt,
    });

    return result;
  },
  {
    autorun: false,
    connection: resolveBullMQConnectionOptions(process.env),
    concurrency: 2,
  }
);
