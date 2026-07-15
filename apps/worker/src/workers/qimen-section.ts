import { Worker } from 'bullmq';
import { logger } from '@repo/logger';
import {
  claimQuotaReservation,
  getAvailableQuota,
  markQuotaBillingPending,
  normalizeUsage,
  recordAiUsage,
  releaseQuota,
  reserveQuota,
  settleQuota,
} from '@repo/db';
import {
  QimenAnalysisStore,
  estimateTextTokens,
  generateQimenSectionResult,
  resolveModelConfig,
} from '@repo/shared';
import { resolveRedisConnectionOptions } from '@repo/shared/server';
import type { QimenSectionJobData } from '@repo/queue';

export const qimenSectionWorker = new Worker<QimenSectionJobData>(
  'qimen-section',
  async (job) => {
    const { analysisId, sectionKey, input, userId } = job.data;
    const store = new QimenAnalysisStore();
    const startedAt = Date.now();
    const billingState: { reservation: { id: string } | null } = { reservation: null };

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
              if (!userId || !job.data.billingRequestId) return;

              const messages = Array.isArray(meta.messages)
                ? (meta.messages as Array<{ content?: string }>)
                : [];
              const inputUnits = estimateTextTokens(messages);
              const maxOutputTokens = Number(meta.maxOutputTokens);
              const availableUnits = await getAvailableQuota(userId);
              if (!Number.isInteger(maxOutputTokens) || maxOutputTokens <= 0) {
                throw new Error('奇门模型输出上限无效');
              }
              if (availableUnits < inputUnits + 1) {
                throw new Error('当前额度不足以处理奇门分析');
              }
              const outputLimit = Math.min(maxOutputTokens, availableUnits - inputUnits);
              const quota = await reserveQuota({
                userId,
                requestId: job.data.billingRequestId,
                feature: 'destiny',
                provider: config.provider,
                model: config.model,
                estimatedUnits: inputUnits + outputLimit,
                meterType: 'tokens',
                metadata: { analysisId, sectionKey, inputEstimate: inputUnits, outputLimit },
              });
              if (!quota.success) {
                throw new Error('当前额度不足以处理奇门分析');
              }
              if (quota.reservation.status !== 'reserved') {
                throw new Error('奇门分析的额度预留已被处理，请重新发起任务');
              }
              const claim = await claimQuotaReservation({
                userId,
                reservationId: quota.reservation.id,
              });
              if (!claim.claimed || !claim.reservation) {
                throw new Error('奇门分析请求正在处理或已完成，请勿重复执行');
              }
              billingState.reservation = claim.reservation;
              return { maxOutputTokens: outputLimit };
            },
            onRequestSuccess: async (meta) => {
              logger.info('奇门模型请求完成', meta);
              if (!userId) return;
              try {
                const rawUsage = (
                  (meta as { payload?: unknown }).payload as Record<string, unknown>
                )?.usage;
                const usage = normalizeUsage(rawUsage);
                if (billingState.reservation && job.data.billingRequestId) {
                  const billing =
                    usage.totalTokens === null
                      ? await markQuotaBillingPending({
                          reservationId: billingState.reservation.id,
                          meterType: 'tokens',
                          reason: '奇门供应商未返回可审计 Token 用量，等待后续对账',
                        })
                      : await settleQuota({
                          reservationId: billingState.reservation.id,
                          measurement: {
                            meterType: 'tokens',
                            sourceUnits: usage.totalTokens,
                            quotaUnits: usage.totalTokens,
                            inputUnits: usage.inputTokens,
                            outputUnits: usage.outputTokens,
                            source: 'provider',
                            rawUsage,
                          },
                        });
                  await recordAiUsage({
                    userId,
                    feature: 'destiny',
                    action,
                    provider: config.provider,
                    model: config.model,
                    endpoint: 'worker:qimen-section',
                    requestId: job.data.billingRequestId,
                    usage,
                    status: billing.status === 'billing_pending' ? 'billing_pending' : 'success',
                    meterType: 'tokens',
                    billableUnits: billing.status === 'billing_pending' ? null : usage.totalTokens,
                    billingStatus: billing.status,
                    reservationId: billingState.reservation.id,
                    metadata: {
                      analysisId,
                      sectionKey,
                    },
                  });
                } else {
                  await recordAiUsage({
                    userId,
                    feature: 'destiny',
                    action,
                    provider: config.provider,
                    model: config.model,
                    endpoint: 'worker:qimen-section',
                    usage,
                    metadata: { analysisId, sectionKey },
                  });
                }
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
      if (billingState.reservation) {
        await releaseQuota({
          reservationId: billingState.reservation.id,
          meterType: 'tokens',
          reason: '奇门分块任务失败',
        }).catch((releaseError) =>
          logger.error('奇门分块额度释放失败', releaseError as Error, { analysisId, sectionKey })
        );
      }
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
