import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import {
  QimenAnalysisStore,
  generateQimenSectionResult,
  resolveArkConfig,
  resolveRedisConnectionOptions,
} from '@repo/shared';
import type { QimenSectionJobData } from '@repo/queue';

export const qimenSectionWorker = new Worker<QimenSectionJobData>(
  'qimen-section',
  async (job) => {
    const { analysisId, sectionKey, input } = job.data;
    const store = new QimenAnalysisStore();
    const startedAt = Date.now();

    try {
      logger.info('处理奇门分块任务', { analysisId, sectionKey });

      const existing = await store.getSectionResult(analysisId, sectionKey);
      if (existing) {
        logger.info('奇门分块结果已存在，跳过重复生成', { analysisId, sectionKey });
        return existing;
      }

      await store.markSectionPending(analysisId, sectionKey);
      const result = await generateQimenSectionResult(
        sectionKey,
        input,
        resolveArkConfig(process.env),
        {
          analysisId,
          stage: sectionKey,
          sectionKey,
          hooks: {
            onRequestStart: (meta) => logger.info('奇门模型请求开始', meta),
            onRequestSuccess: (meta) => logger.info('奇门模型请求完成', meta),
            onRequestNonOk: (meta) => logger.warn('奇门模型请求返回非成功状态', meta),
            onRequestTimeout: (meta) => logger.warn('奇门模型请求超时', meta),
            onRequestError: (meta) =>
              logger.error('奇门模型请求失败', new Error(String(meta.error ?? '未知错误')), meta),
          },
        }
      );
      const saved = await store.saveSectionResult(analysisId, sectionKey, result);

      logger.info('奇门分块结果已写入存储', {
        analysisId,
        sectionKey,
        saved,
        durationMs: Date.now() - startedAt,
      });
      logger.info('奇门分块任务完成', {
        analysisId,
        sectionKey,
        durationMs: Date.now() - startedAt,
      });
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : '奇门分块生成失败';
      await store.markSectionFailed(analysisId, sectionKey, message);
      logger.error('奇门分块任务失败', error as Error, {
        analysisId,
        sectionKey,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    } finally {
      await store.disconnect();
    }
  },
  {
    autorun: false,
    connection: resolveRedisConnectionOptions(process.env),
    concurrency: 3,
  }
);
