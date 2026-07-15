import {
  recordAiUsage,
  claimQuotaReservation,
  getAvailableQuota,
  getQuotaReservation,
  markQuotaBillingPending,
  reconcilePendingQuota,
  reserveQuotaBatch,
  reserveQuota,
  settleQuota,
} from '@repo/db';
import type {
  AiUsageFeature,
  AiUsageAction,
  AiUsageRecordInput,
  BillingMeasurement,
  MeterType,
} from '@repo/shared';
import { estimateTextTokens } from '@repo/shared';
import { BillingError } from './billing-errors';

// releaseAiQuota 仅为 releaseQuota 的语义化别名，直接复导出，避免无逻辑的透传包装。
export { releaseQuota as releaseAiQuota } from '@repo/db';

export interface ReserveAiQuotaInput {
  userId: string;
  requestId: string;
  feature: AiUsageFeature;
  provider?: string | null;
  model?: string | null;
  estimatedUnits: number;
  meterType?: MeterType;
  metadata?: Record<string, unknown>;
  expiresAt?: Date;
  /** 仅用于先建会话、后由受信任网关领取执行权的场景。 */
  claimExecution?: boolean;
}

export async function reserveAiQuota(input: ReserveAiQuotaInput) {
  const { claimExecution = true, ...reserveInput } = input;
  const result = await reserveQuota(reserveInput);
  if (!result.success) {
    throw new BillingError(
      result.code === 'QUOTA_INSUFFICIENT' ? 'QUOTA_INSUFFICIENT' : 'QUOTA_LIMIT_REACHED',
      '当前额度不足，无法开始本次请求',
      { requestId: input.requestId }
    );
  }
  if (!claimExecution) return result.reservation;

  return claimExecutionOrThrow(input.userId, result.reservation.id, input.requestId);
}

function createExecutionConflict(
  requestId: string,
  reservationId: string,
  reservation: {
    status: string;
    executionState?: string;
  } | null
): BillingError {
  const isInProgress = reservation?.status === 'reserved' && reservation.executionState === 'processing';
  return new BillingError(
    isInProgress ? 'REQUEST_IN_PROGRESS' : 'REQUEST_ALREADY_PROCESSED',
    isInProgress ? '相同请求正在处理中，请勿重复提交' : '相同请求已处理，不能再次调用模型',
    { requestId, reservationId }
  );
}

/** 领取预留的执行权；领取失败时抛出幂等冲突错误，避免重复调用模型。 */
async function claimExecutionOrThrow(userId: string, reservationId: string, requestId: string) {
  const claim = await claimQuotaReservation({ userId, reservationId });
  if (!claim.claimed || !claim.reservation) {
    throw createExecutionConflict(requestId, reservationId, claim.reservation);
  }
  return claim.reservation;
}

/** 多模型比较使用数据库原子批量预留，任一模型额度不足时全部失败。 */
export async function reserveAiQuotaBatch(input: {
  userId: string;
  reservations: Array<Omit<ReserveAiQuotaInput, 'userId'>>;
}) {
  const result = await reserveQuotaBatch(input);
  if (!result.success) {
    throw new BillingError(
      result.code === 'QUOTA_INSUFFICIENT' ? 'QUOTA_INSUFFICIENT' : 'QUOTA_LIMIT_REACHED',
      '当前额度不足，无法启动多模型比较',
      { requestId: input.reservations.map((reservation) => reservation.requestId).join(',') }
    );
  }
  return result.reservations;
}

/** 为聊天预留“输入上下文 + 当前余额允许的输出上限”，避免流式生成突破余额。 */
export async function reserveChatQuota(input: {
  userId: string;
  requestId: string;
  feature?: 'chat' | 'voice' | 'video_prompt' | 'destiny' | 'resume';
  provider?: string | null;
  model?: string | null;
  messages: Array<{ content?: string }>;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
}) {
  const feature = input.feature ?? 'chat';
  const inputUnits = estimateTextTokens(input.messages);
  const availableUnits = await getAvailableQuota(input.userId);

  if (availableUnits < inputUnits + 1) {
    throw new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以处理本次对话', {
      requestId: input.requestId,
    });
  }

  const outputLimit = Math.min(
    Math.max(1, input.maxOutputTokens ?? 2048),
    Math.max(0, availableUnits - inputUnits)
  );

  const reservation = await reserveAiQuota({
    userId: input.userId,
    requestId: input.requestId,
    feature,
    provider: input.provider,
    model: input.model,
    estimatedUnits: inputUnits + outputLimit,
    meterType: 'tokens',
    metadata: {
      ...input.metadata,
      inputEstimate: inputUnits,
      outputLimit,
    },
  });

  return { reservation, inputUnits, outputLimit };
}

export async function reserveChatQuotaBatch(input: {
  userId: string;
  feature?: 'chat' | 'voice' | 'video_prompt' | 'destiny' | 'resume';
  messages: Array<{ content?: string }>;
  models: Array<{ requestId: string; provider?: string | null; model?: string | null }>;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
}) {
  const feature = input.feature ?? 'chat';
  const inputUnits = estimateTextTokens(input.messages);
  const availableUnits = await getAvailableQuota(input.userId);
  const outputLimit = Math.max(1, input.maxOutputTokens ?? 2048);
  const requiredUnits = input.models.length * (inputUnits + outputLimit);
  if (availableUnits < requiredUnits) {
    throw new BillingError('QUOTA_INSUFFICIENT', '当前额度不足以启动全部比较模型', {
      requestId: input.models.map((model) => model.requestId).join(','),
    });
  }
  const reservations = await reserveAiQuotaBatch({
    userId: input.userId,
    reservations: input.models.map((model) => ({
      requestId: model.requestId,
      feature,
      provider: model.provider,
      model: model.model,
      estimatedUnits: inputUnits + outputLimit,
      meterType: 'tokens' as const,
      metadata: {
        ...input.metadata,
        inputEstimate: inputUnits,
        outputLimit,
        batchSize: input.models.length,
      },
    })),
  });
  return { reservations, inputUnits, outputLimit };
}

export async function useExistingAiQuota(input: {
  userId: string;
  reservationId: string;
  requestId: string;
}) {
  const reservation = await getQuotaReservation(input.userId, input.reservationId);
  if (
    !reservation ||
    reservation.requestId !== input.requestId ||
    reservation.status !== 'reserved'
  ) {
    throw new BillingError('QUOTA_LIMIT_REACHED', '额度预留无效或已失效', {
      requestId: input.requestId,
      reservationId: input.reservationId,
    });
  }
  return claimExecutionOrThrow(input.userId, input.reservationId, input.requestId);
}

export async function settleAiQuota(input: {
  reservationId: string;
  requestId: string;
  feature: AiUsageFeature;
  provider?: string | null;
  model?: string | null;
  endpoint?: string | null;
  action: AiUsageAction;
  measurement: BillingMeasurement;
  status?: AiUsageRecordInput['status'];
  metadata?: Record<string, unknown>;
}) {
  const isProviderTokenUsage =
    input.measurement.meterType !== 'tokens' || input.measurement.source === 'provider';
  let reservation = isProviderTokenUsage
    ? await settleQuota({
        reservationId: input.reservationId,
        measurement: input.measurement,
      })
    : await markQuotaBillingPending({
        reservationId: input.reservationId,
        meterType: input.measurement.meterType,
        reason: '供应商未返回可审计 Token 用量，等待后续对账',
      });

  // 实时语音会在首段音频真正转发后先标记为 billing_pending，避免超时任务误退款。
  // 最终拿到可审计秒数后立即走统一补账结算，而不是一直停留在待处理状态。
  if (reservation.status === 'billing_pending' && isProviderTokenUsage) {
    const reconciled = await reconcilePendingQuota({
      reservationId: input.reservationId,
      actualUnits: input.measurement.quotaUnits,
      meterType: input.measurement.meterType,
    });
    reservation = reconciled.reservation;
  }
  const isBillingPending = reservation.status === 'billing_pending';
  const hasAuditableUsage = input.measurement.source === 'provider';
  const hideUnverifiableUsage = isBillingPending && !hasAuditableUsage;
  await recordAiUsage({
    userId: reservation.userId,
    feature: input.feature,
    action: input.action,
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint,
    requestId: input.requestId,
    usage: {
      inputTokens: hideUnverifiableUsage ? null : (input.measurement.inputUnits ?? null),
      outputTokens: hideUnverifiableUsage ? null : (input.measurement.outputUnits ?? null),
      totalTokens: hideUnverifiableUsage ? null : input.measurement.sourceUnits,
      cachedTokens: null,
      reasoningTokens: null,
      taskCount: 1,
      rawUsage: input.measurement.rawUsage,
    },
    status: isBillingPending ? 'billing_pending' : (input.status ?? 'success'),
    meterType: input.measurement.meterType,
    billableUnits: hideUnverifiableUsage ? null : input.measurement.sourceUnits,
    billingStatus: reservation.status,
    reservationId: input.reservationId,
    metadata: input.metadata,
  });
  return reservation;
}

/** 图片和视频不占用 Token 余额，只记录一次成功任务。 */
export async function recordMediaTask(input: {
  userId: string;
  requestId: string;
  feature: 'image' | 'video';
  provider?: string;
  model?: string;
  action: AiUsageAction;
  endpoint: string;
  metadata?: Record<string, unknown>;
}) {
  const meterType = input.feature === 'image' ? 'image_task' : 'video_task';
  return recordAiUsage({
    userId: input.userId,
    feature: input.feature,
    action: input.action,
    provider: input.provider,
    model: input.model,
    endpoint: input.endpoint,
    requestId: input.requestId,
    status: 'success',
    meterType,
    billableUnits: 1,
    billingStatus: 'settled',
    usage: {
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: null,
      taskCount: 1,
    },
    metadata: input.metadata,
  });
}
