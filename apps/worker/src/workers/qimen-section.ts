import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import { QuotaSession } from '@repo/db';
import {
  generateQimenSectionResult,
  resolveModelConfig,
} from '@repo/shared';
import { resolveBullMQConnectionOptions } from '@repo/shared/server';
import { QimenAnalysisStore, getRedisClient } from '@repo/redis';
import type { QimenSectionJobData } from '@repo/queue';

export const qimenSectionWorker = new Worker<QimenSectionJobData>(
  'qimen-section',
  async (job) => {
    const { analysisId, sectionKey, input, userId } = job.data;
    const store = new QimenAnalysisStore(getRedisClient());
    const startedAt = Date.now();
    // 结算会话：由 onRequestStart 创建，onRequestSuccess finalize / catch release。
    // 评审 C3：与 web 端共用 QuotaSession，消除奇门 worker 手写 reserve/claim/settle 序列。
    // 用对象 holder 承载会话：闭包内赋值不干扰顶层 catch 的属性类型窄化（TS 不会把属性判为 never）。
    const billing = { session: null as QuotaSession | null };

    try {
      logger.info('处理奇门分块任务', { analysisId, sectionKey });

      const existing = await store.getSectionResult(analysisId, sectionKey);
      if (existing) {
        logger.info('奇门分块结果已存在，跳过重复生成', { analysisId, sectionKey });
        return existing;
      }

      await store.markSectionPending(analysisId, sectionKey);

      // 尝试读取本地预计算的盘局数据
      const chart = (await store.getBaseResult(analysisId)) ?? undefined;
      if (chart) {
        logger.info('奇门分块任务使用预计算盘局', { analysisId, sectionKey });
      }

      const config = resolveModelConfig(job.data.provider ?? 'doubao', process.env);
      const action =
        sectionKey === 'strategyOverview'
          ? 'destiny-qimen-strategy-overview'
          : sectionKey === 'timingWindows'
            ? 'destiny-qimen-timing-windows'
            : 'destiny-qimen-chart-summary';
      const result = await generateQimenSectionResult(
        sectionKey,
        input,
        config,
        {
          analysisId,
          stage: sectionKey,
          sectionKey,
          hooks: {
            onRequestStart: async (meta) => {
              logger.info('奇门模型请求开始', meta);
              if (!userId) return;

              const messages = Array.isArray(meta.messages)
                ? (meta.messages as Array<{ content?: string }>)
                : [];
              const maxOutputTokens = Number(meta.maxOutputTokens);
              if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
                throw new Error('奇门模型输出上限无效');
              }

              // 有计费幂等键 = 普通用户预留扣费；无 = admin 免扣（空会话仅归档用量）。
              // 与 web 路由同构：reserve → finalize/release 由 QuotaSession 统一决策（评审 C3）。
              const isAdmin = !job.data.billingRequestId;
              const requestId = job.data.billingRequestId ?? `qimen-${analysisId}-${sectionKey}`;
              billing.session = await QuotaSession.reserve({
                userId,
                requestId,
                feature: 'destiny',
                provider: config.provider,
                model: config.model,
                messages,
                maxOutputTokens,
                metadata: { analysisId, sectionKey },
              }, isAdmin ? 'admin' : undefined);

              return billing.session.hasReservation
                ? { maxOutputTokens: billing.session.outputLimit }
                : undefined;
            },
            onRequestSuccess: async (meta) => {
              logger.info('奇门模型请求完成', meta);
              if (!billing.session) return;
              try {
                const rawUsage = (
                  (meta as { payload?: unknown }).payload as Record<string, unknown>
                )?.usage;
                await billing.session.finalize('success', {
                  requestId: job.data.billingRequestId ?? `qimen-${analysisId}-${sectionKey}`,
                  action,
                  endpoint: 'worker:qimen-section',
                  usage: rawUsage,
                  outputText: '',
                  provider: config.provider,
                  model: config.model,
                  userId,
                  feature: 'destiny',
                  metadata: { analysisId, sectionKey },
                });
              } catch (usageError) {
                logger.warn('奇门分块资源记录失败', {
                  analysisId,
                  sectionKey,
                  error: usageError instanceof Error ? usageError.message : String(usageError),
                });
              }
            },
            onRequestNonOk: (meta) => logger.warn('奇门模型请求返回非成功状态', meta),
            onRequestTimeout: (meta) => logger.warn('奇门模型请求超时', meta),
            onRequestError: (meta) =>
              logger.error('奇门模型请求失败', new Error(String(meta.error ?? '未知错误')), meta),
          },
        },
        chart
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
      if (billing.session) {
        await billing.session.release({ reason: '奇门分块任务失败', meterType: 'tokens' });
      }
      const message = error instanceof Error ? error.message : '奇门分块生成失败';
      await store.markSectionFailed(analysisId, sectionKey, message);
      logger.error('奇门分块任务失败', error as Error, {
        analysisId,
        sectionKey,
        durationMs: Date.now() - startedAt,
      });
      throw error;
    }
  },
  {
    autorun: false,
    connection: resolveBullMQConnectionOptions(process.env),
    concurrency: 3,
  }
);