/**
 * 奇门分块任务处理器（评审 C3）。
 *
 * 配额生命周期全部收口至共享一元管道 withQuotaUnary（ADR-0002 语义，ADR-0049 位置下沉 @repo/db）：
 * run 边界 = 模型生成 + 结果归一化 + 结果持久化（ADR-0049 结算边界 = 交付边界，
 * 保存失败按 failed 释放预留，用户不被扣费）。admin 免计费编码见 resolveQimenBillingContext。
 */
import { logger } from '@repo/logger';
import { withQuotaUnary } from '@repo/db';
import {
  buildQimenSectionMessages,
  generateQimenSectionResult,
  QIMEN_SECTION_MAX_OUTPUT_TOKENS,
  resolveModelConfig,
  type QimenSectionResultMap,
} from '@repo/shared';
import { QimenAnalysisStore, getRedisClient } from '@repo/redis';
import type { QimenSectionJobData } from '@repo/queue';

/**
 * 计费上下文解析（ADR-0049 决策 4：任务协议不变，「计费幂等键缺失 = 管理员」推断的唯一事实位置）。
 * userRole 严格两态（'admin' | undefined），不透传任务载荷中的任意字符串。
 */
export function resolveQimenBillingContext(
  data: Pick<QimenSectionJobData, 'analysisId' | 'sectionKey' | 'billingRequestId'> & {
    userId?: string;
  }
): { userId: string; userRole: 'admin' | undefined; requestId: string } {
  if (!data.userId) {
    throw new Error('奇门分块任务缺少 userId，拒绝执行');
  }
  const isAdmin = !data.billingRequestId;
  return {
    userId: data.userId,
    userRole: isAdmin ? 'admin' : undefined,
    requestId: data.billingRequestId ?? `qimen-${data.analysisId}-${data.sectionKey}`,
  };
}

export async function processQimenSectionJob(
  data: QimenSectionJobData
): Promise<QimenSectionResultMap[QimenSectionJobData['sectionKey']]> {
  const { analysisId, sectionKey, input } = data;
  const store = new QimenAnalysisStore(getRedisClient());
  const startedAt = Date.now();

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

  const config = resolveModelConfig(data.provider ?? 'doubao', process.env);
  const action =
    sectionKey === 'strategyOverview'
      ? 'destiny-qimen-strategy-overview'
      : sectionKey === 'timingWindows'
        ? 'destiny-qimen-timing-windows'
        : 'destiny-qimen-chart-summary';

  const { userId, userRole, requestId } = resolveQimenBillingContext(data);
  // 预留输入估算与模型调用共用同一消息序列（buildQimenSectionMessages 单一事实源）
  const messages = buildQimenSectionMessages(sectionKey, input, chart);

  try {
    const result = await withQuotaUnary({
      reserve: {
        userId,
        requestId,
        feature: 'destiny',
        provider: config.provider,
        model: config.model,
        messages,
        maxOutputTokens: QIMEN_SECTION_MAX_OUTPUT_TOKENS[sectionKey],
        metadata: { analysisId, sectionKey },
      },
      userRole,
      finalize: {
        requestId,
        action,
        endpoint: 'worker:qimen-section',
        provider: config.provider,
        model: config.model,
        userId,
        feature: 'destiny',
        metadata: { analysisId, sectionKey },
      },
      run: async (session) => {
        const { value, usage } = await generateQimenSectionResult(sectionKey, input, config, {
          maxOutputTokens: session.outputLimit,
          trace: { analysisId, stage: sectionKey, sectionKey },
          chart,
        });
        await store.saveSectionResult(analysisId, sectionKey, value);
        return { value, usage, outputText: '' };
      },
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
    logger.error('奇门分块任务失败', error instanceof Error ? error : new Error(String(error)), {
      analysisId,
      sectionKey,
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}
