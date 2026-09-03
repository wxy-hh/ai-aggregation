/**
 * 配额会话管理器
 *
 * 封装 reserve → settle/release 的完整生命周期，
 * 消除各路由中重复的配额管理代码。
 *
 * 用法：
 * ```ts
 * const session = await QuotaSession.reserve({ userId, requestId, ... });
 * try {
 *   const result = await doAction();
 *   await session.settle(result.usage);
 *   return result;
 * } catch (error) {
 *   await session.release('操作失败');
 *   throw error;
 * }
 * ```
 */

import type { AiUsageAction, BillingMeasurement, MeterType } from '@repo/shared';
import { normalizeUsage } from '@repo/shared';
import {
  reserveChatQuota,
  releaseAiQuota,
  settleAiQuota,
  useExistingAiQuota,
} from './quota-service';
import {
  createTokenMeasurement,
  createAudioMeasurement,
  estimateOutputTokens,
} from './usage-measurement';
import { safeRecordAiUsage } from './ai-usage';

/** reserveChatQuota 支持的 feature 子集（不含 'image' | 'video'） */
type ReserveFeature = 'chat' | 'voice' | 'video_prompt' | 'destiny' | 'resume';

export interface QuotaSessionReserveInput {
  userId: string;
  requestId: string;
  feature: ReserveFeature;
  provider?: string | null;
  model?: string | null;
  messages: Array<{ content?: string }>;
  maxOutputTokens?: number;
  metadata?: Record<string, unknown>;
  reservationId?: string;
}

export interface QuotaSessionSettleInput {
  action: AiUsageAction;
  endpoint?: string;
  measurement?: BillingMeasurement;
  rawUsage?: unknown;
  fallbackTokens?: number;
  status?: 'success' | 'failed' | 'partial' | 'billing_pending';
  metadata?: Record<string, unknown>;
}

export interface QuotaSessionReleaseInput {
  reason: string;
  meterType?: MeterType;
}

/** 三态结算结果（对齐 chat 侧 ChatStreamFinish 的 outcome 语义） */
export type QuotaOutcome = 'success' | 'partial' | 'failed';

/** finalize 的上下文：结算元数据 + admin 无预留时的用量归档信息 */
export interface QuotaFinalizeContext {
  /** 计费幂等键（与 reserve 时一致或子流派生键） */
  requestId: string;
  action: AiUsageAction;
  endpoint?: string;
  /** 上游返回的 usage（可为 null，finalize 内部按估算兜底） */
  usage: unknown;
  /** 累计输出文本（partial/兜底估算用） */
  outputText: string;
  /** 失败/取消原因（release 记录用） */
  reason?: string;
  provider?: string | null;
  model?: string | null;
  /** admin 等无预留路径归档用量用 */
  userId?: string;
  feature?: ReserveFeature;
  metadata?: Record<string, unknown>;
}

export class QuotaSession {
  private settled = false;

  private constructor(
    public readonly reservationId: string,
    public readonly hasReservation: boolean,
    public readonly inputUnits: number,
    public readonly outputLimit: number,
    private readonly userId: string
  ) {}

  /**
   * 预留配额。admin 用户返回空会话（hasReservation=false）。
   */
  static async reserve(
    input: QuotaSessionReserveInput,
    userRole?: string
  ): Promise<QuotaSession> {
    if (userRole === 'admin') {
      return new QuotaSession('', false, 0, input.maxOutputTokens ?? 2048, input.userId);
    }

    if (input.reservationId) {
      const existing = await useExistingAiQuota({
        userId: input.userId,
        reservationId: input.reservationId,
        requestId: input.requestId,
      });
      const inputUnits = Number(existing.metadata?.inputEstimate ?? 0);
      const outputLimit = Number(existing.metadata?.outputLimit);
      return new QuotaSession(
        existing.id,
        true,
        inputUnits,
        Number.isInteger(outputLimit) && outputLimit > 0 ? outputLimit : 2048,
        input.userId
      );
    }

    const quota = await reserveChatQuota({
      userId: input.userId,
      requestId: input.requestId,
      feature: input.feature,
      provider: input.provider,
      model: input.model,
      messages: input.messages,
      maxOutputTokens: input.maxOutputTokens,
      metadata: input.metadata,
    });

    return new QuotaSession(
      quota.reservation.id,
      true,
      quota.inputUnits,
      quota.outputLimit,
      input.userId
    );
  }

  /**
   * 操作成功后结算配额。
   * measurement 或 rawUsage 至少提供一个；两者都不提供则释放。
   */
  async settle(
    input: QuotaSessionSettleInput,
    settleOpts: {
      feature: ReserveFeature;
      provider?: string | null;
      model?: string | null;
      requestId: string;
      userId?: string;
    }
  ): Promise<void> {
    if (!this.hasReservation || this.settled) return;

    const measurement = input.measurement
      ?? (input.rawUsage !== undefined
        ? createTokenMeasurement(input.rawUsage, input.fallbackTokens ?? this.inputUnits)
        : null);

    if (!measurement) {
      await this.release({ reason: '无可用用量数据', meterType: 'tokens' });
      return;
    }

    try {
      await settleAiQuota({
        reservationId: this.reservationId,
        requestId: settleOpts.requestId,
        feature: settleOpts.feature,
        provider: settleOpts.provider,
        model: settleOpts.model,
        endpoint: input.endpoint,
        action: input.action,
        measurement,
        status: input.status,
        metadata: input.metadata,
      });
      this.settled = true;
    } catch (error) {
      this.settled = false;
      console.error('[QuotaSession] 额度结算失败:', error);
    }
  }

  /**
   * 操作失败后释放预留额度。
   * 已结算或无预留时自动跳过。
   */
  async release(input: QuotaSessionReleaseInput): Promise<void> {
    if (!this.hasReservation || this.settled) return;

    try {
      await releaseAiQuota({
        reservationId: this.reservationId,
        reason: input.reason,
        meterType: input.meterType ?? 'tokens',
      });
      this.settled = true;
    } catch (error) {
      this.settled = false;
      console.error('[QuotaSession] 额度释放失败:', error);
    }
  }

  /**
   * 三态统一结算 — 唯一决策表（chat 与各路由共用；chat 侧 finalizeChatStream 已并入，评审 C1）。
   *
   * - success → 按 usage（缺失时按输入估算 + 输出估算兜底）结算 status='success'；
   * - partial → 流中断但已有部分输出：按同一兜底口径结算 status='partial'（不退款）；
   * - failed  → 无任何产出：释放预留（取消应退款）。
   *
   * admin 等无预留会话：success/partial 降级为用量归档（safeRecordAiUsage），
   * failed 自动跳过。settle/release 内部幂等（settled 守卫），重复调用安全。
   */
  async finalize(outcome: QuotaOutcome, ctx: QuotaFinalizeContext): Promise<void> {
    if (outcome === 'failed') {
      await this.release({ reason: ctx.reason ?? '流式失败', meterType: 'tokens' });
      return;
    }

    if (!this.hasReservation) {
      // 无预留路径（admin）：仍记用量，便于个人中心分项归档
      if (!ctx.userId) return;
      await safeRecordAiUsage({
        userId: ctx.userId,
        feature: ctx.feature ?? 'destiny',
        action: ctx.action,
        provider: ctx.provider,
        model: ctx.model,
        endpoint: ctx.endpoint,
        usage: normalizeUsage(ctx.usage),
        metadata: ctx.metadata,
      });
      return;
    }

    const fallbackTokens = this.inputUnits + estimateOutputTokens(ctx.outputText);
    await this.settle({
      action: ctx.action,
      endpoint: ctx.endpoint,
      rawUsage: ctx.usage,
      fallbackTokens,
      status: outcome === 'partial' ? 'partial' : 'success',
      metadata: ctx.metadata,
    }, {
      feature: ctx.feature ?? 'destiny',
      provider: ctx.provider,
      model: ctx.model,
      requestId: ctx.requestId,
      userId: ctx.userId,
    });
  }
}