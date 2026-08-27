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

/** reserveChatQuota 支持的 feature 子集（不含 'image' | 'video'） */
type ReserveFeature = 'chat' | 'voice' | 'video_prompt' | 'destiny' | 'resume';
import {
  reserveChatQuota,
  releaseAiQuota,
  settleAiQuota,
  useExistingAiQuota,
} from '@/lib/billing/quota-service';
import { createTokenMeasurement, createAudioMeasurement } from '@/lib/billing/usage-measurement';

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

export class QuotaSession {
  private settled = false;

  private constructor(
    public readonly reservationId: string,
    public readonly hasReservation: boolean,
    public readonly inputUnits: number,
    public readonly outputLimit: number
  ) {}

  /**
   * 预留配额。admin 用户返回空会话（hasReservation=false）。
   */
  static async reserve(
    input: QuotaSessionReserveInput,
    userRole?: string
  ): Promise<QuotaSession> {
    if (userRole === 'admin') {
      return new QuotaSession('', false, 0, input.maxOutputTokens ?? 2048);
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
        Number.isInteger(outputLimit) && outputLimit > 0 ? outputLimit : 2048
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
      quota.outputLimit
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
}
