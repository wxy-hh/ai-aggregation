import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import {
  QimenAnalysisStore,
  generateQimenBaseResult,
  resolveArkConfig,
  resolveRedisConnectionOptions,
} from '@repo/shared';
import type { QimenBaseJobData } from '@repo/queue';

export const qimenBaseWorker = new Worker<QimenBaseJobData>(
  'qimen-base',
  async (job) => {
    const { analysisId, input } = job.data;
    const store = new QimenAnalysisStore();
    const startedAt = Date.now();

    try {
      logger.info('处理奇门基础盘面任务', { analysisId });
      const baseResult = await generateQimenBaseResult(input, resolveArkConfig(process.env), {
        analysisId,
        stage: 'baseResult',
        hooks: {
          onRequestStart: (meta) => logger.info('奇门模型请求开始', meta),
          onRequestSuccess: (meta) => logger.info('奇门模型请求完成', meta),
          onRequestNonOk: (meta) => logger.warn('奇门模型请求返回非成功状态', meta),
          onRequestTimeout: (meta) => logger.warn('奇门模型请求超时', meta),
          onRequestError: (meta) =>
            logger.error('奇门模型请求失败', new Error(String(meta.error ?? '未知错误')), meta),
        },
      });
      const saved = await store.saveBaseResult(analysisId, baseResult);
      logger.info('奇门基础盘面结果已写入存储', {
        analysisId,
        saved,
        durationMs: Date.now() - startedAt,
      });
      logger.info('奇门基础盘面任务完成', { analysisId, durationMs: Date.now() - startedAt });
    } catch (error) {
      const message = error instanceof Error ? error.message : '奇门基础盘面生成失败';
      await store.markBaseResultFailed(analysisId, message);
      logger.error('奇门基础盘面任务失败', error as Error, {
        analysisId,
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
    concurrency: 2,
  }
);
