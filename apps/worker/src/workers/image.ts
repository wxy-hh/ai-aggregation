import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import { resolveRedisConnectionOptions } from '@repo/shared';
import type { ImageJobData } from '@repo/queue';

export const imageWorker = new Worker<ImageJobData>(
  'image',
  async (job) => {
    const { taskId, userId, prompt, size, style } = job.data;
    logger.info('处理图像生成任务', { taskId, userId });

    try {
      // TODO: 实现图像生成逻辑
      // 1. 调用通义万相等 API
      // 2. 下载生成的图像
      // 3. 上传到对象存储
      // 4. 保存结果

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          output: { url: 'https://example.com/image.png' },
          completedAt: new Date(),
        },
      });

      logger.info('图像生成完成', { taskId });
    } catch (error) {
      logger.error('图像生成失败', error as Error, { taskId });
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
    concurrency: 3,
  }
);
