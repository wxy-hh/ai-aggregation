import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { QimenAnalysisStore } from '@repo/shared';
import { resolveRedisConnectionOptions } from '@repo/shared/server';
import type { QimenBaseJobData } from '@repo/queue';

export const qimenBaseWorker = new Worker<QimenBaseJobData>(
  'qimen-base',
  async (job) => {
    const { analysisId, precomputedChart } = job.data;
    const store = new QimenAnalysisStore();
    const startedAt = Date.now();

    try {
      // 本地排盘模式下，盘局已在 API 路由中计算并存入 Redis，Worker 无需再调用 LLM
      if (precomputedChart) {
        const existing = await store.getBaseResult(analysisId);
        if (existing) {
          logger.info('奇门基础盘面已在本地完成排盘（跳过 LLM）', {
            analysisId,
            durationMs: Date.now() - startedAt,
          });
          return;
        }
      }

      logger.warn('奇门基础盘面未预计算，降级到 LLM 排盘（不推荐）', { analysisId });
      // 降级路径保留（向后兼容）：调用 LLM 排盘
      const { generateQimenBaseResult, resolveArkConfig } = await import('@repo/shared');
      const baseResult = await generateQimenBaseResult(job.data.input, resolveArkConfig(process.env), {
        analysisId,
        stage: 'baseResult',
      });
      await store.saveBaseResult(analysisId, baseResult);
      logger.info('奇门基础盘面降级完成', {
        analysisId,
        durationMs: Date.now() - startedAt,
      });
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
