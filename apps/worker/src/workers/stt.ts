import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import { resolveRedisConnectionOptions } from '@repo/shared';
import type { STTJobData } from '@repo/queue';

export const sttWorker = new Worker<STTJobData>(
  'stt',
  async (job) => {
    const { taskId, userId, audioUrl } = job.data;
    logger.info('处理 STT 任务', { taskId, userId });

    try {
      // TODO: 实现语音转文字逻辑
      // 1. 下载音频文件
      // 2. 调用讯飞/阿里云 STT API
      // 3. 保存结果

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          output: { text: '转写结果示例' },
          completedAt: new Date(),
        },
      });

      logger.info('STT 任务完成', { taskId });
    } catch (error) {
      logger.error('STT 任务失败', error as Error, { taskId });
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          error: (error as Error).message,
        },
      });
      throw error;
    }
  },
  {
    autorun: false,
    connection: resolveRedisConnectionOptions(process.env),
    concurrency: 5,
  }
);
