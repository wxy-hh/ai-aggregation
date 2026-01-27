import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { prisma } from '@repo/db';
import type { PPTJobData } from '@repo/queue';
import PptxGenJS from 'pptxgenjs';

export const pptWorker = new Worker<PPTJobData>(
  'ppt',
  async (job) => {
    const { taskId, userId, content, template } = job.data;
    logger.info('处理 PPT 生成任务', { taskId, userId });

    try {
      // TODO: 实现 PPT 生成逻辑
      const pptx = new PptxGenJS();
      const slide = pptx.addSlide();
      slide.addText(content, { x: 1, y: 1, w: 8, h: 4 });

      // 生成文件
      const fileName = `${taskId}.pptx`;
      // TODO: 上传到对象存储并获取 URL

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'completed',
          output: { url: `https://example.com/${fileName}` },
          completedAt: new Date(),
        },
      });

      logger.info('PPT 生成完成', { taskId });
    } catch (error) {
      logger.error('PPT 生成失败', error as Error, { taskId });
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
    connection: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
    },
    concurrency: 3,
  }
);
