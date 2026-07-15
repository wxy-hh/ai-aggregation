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
      // 基础盘面只允许由本地算法生成，禁止遗留的 LLM 排盘降级路径绕过统一计费。
      if (!precomputedChart) {
        throw new Error('奇门基础盘面必须在创建任务时完成本地排盘');
      }

      const existing = await store.getBaseResult(analysisId);
      if (!existing) {
        throw new Error('奇门基础盘面不存在，无法启动分块分析');
      }

      logger.info('奇门基础盘面已在本地完成排盘（跳过 LLM）', {
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
