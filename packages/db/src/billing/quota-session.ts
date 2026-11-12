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

import type { AiUsageAction, BillingMeasurement, MeterType, ReserveFeature } from '@repo/shared';
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

// 从 @repo/shared 单源派生的 ReserveFeature 重导出
export type { ReserveFeature } from '@repo/shared';

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

/** 结算结果契约（ADR-0051 决策 3） */
export interface SettlementResult {
  /** 结算是否成功闭环（底层 settle/release 物理失败时为 false） */
  settled: boolean;
  /** 最终结算单位数（失败、释放或失败吞错恒为 0；成功/部分为实际结算或兜底额；免预留为归档额） */
  settledUnits: number;
}

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
  private lastSettlementResult: SettlementResult | null = null;

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
   * 返回 SettlementResult 结算结果契约（ADR-0051 决策 3）：
   * - failed：release 成功 → { settled: true, settledUnits: 0 }；release 抛错被吞 → { settled: false, settledUnits: 0 }；
   * - 有预留 success/partial：按既有口径构造 measurement 并 settle；
   *     settle 成功 → { settled: true, settledUnits: measurement.quotaUnits }；
   *     settle 抛错被吞 → { settled: false, settledUnits: 0 }；
   *     measurement 为空（无用量数据）→ 既有行为是释放，返回 { settled: true, settledUnits: 0 }（释放失败则 settled: false）；
   * - 免预留（admin 无预留）：success/partial 走 safeRecordAiUsage 归档 → { settled: true, settledUnits: normalizeUsage(ctx.usage).totalTokens ?? 0 }；
   *     failed → 既有行为直接跳过，返回 { settled: true, settledUnits: 0 }；
   * - 幂等守卫：若会话已完成结算/释放（this.settled 为 true），重复调用为 no-op，返回已终态结果以反映终态事实。
   */
  async finalize(outcome: QuotaOutcome, ctx: QuotaFinalizeContext): Promise<SettlementResult> {
    if (this.settled) {
      // 已终态幂等守卫：重复调用 no-op，反映已终态事实
      return this.lastSettlementResult ?? { settled: true, settledUnits: 0 };
    }

    if (outcome === 'failed') {
      if (!this.hasReservation) {
        const result: SettlementResult = { settled: true, settledUnits: 0 };
        this.settled = true;
        this.lastSettlementResult = result;
        return result;
      }

      await this.release({ reason: ctx.reason ?? '流式失败', meterType: 'tokens' });
      const result: SettlementResult = {
        settled: this.settled,
        settledUnits: 0,
      };
      if (this.settled) {
        this.lastSettlementResult = result;
      }
      return result;
    }

    if (!this.hasReservation) {
      // 无预留路径（admin）：仍记用量，便于个人中心分项归档；无 userId 时跳过
      if (!ctx.userId) {
        const result: SettlementResult = { settled: true, settledUnits: 0 };
        this.settled = true;
        this.lastSettlementResult = result;
        return result;
      }

      const usage = normalizeUsage(ctx.usage);
      await safeRecordAiUsage({
        userId: ctx.userId,
        feature: ctx.feature ?? 'destiny',
        action: ctx.action,
        provider: ctx.provider,
        model: ctx.model,
        endpoint: ctx.endpoint,
        // requestId 必传：缺省时 recordAiUsage 退化为 create，重试会产生重复审计行
        requestId: ctx.requestId,
        meterType: 'tokens',
        billableUnits: usage.totalTokens,
        billingStatus: 'settled',
        status: outcome === 'partial' ? 'partial' : 'success',
        usage,
        metadata: ctx.metadata,
      });

      const result: SettlementResult = {
        settled: true,
        settledUnits: usage.totalTokens ?? 0,
      };
      this.settled = true;
      this.lastSettlementResult = result;
      return result;
    }

    const fallbackTokens = this.inputUnits + estimateOutputTokens(ctx.outputText);
    const measurement = ctx.usage !== undefined
      ? createTokenMeasurement(ctx.usage, fallbackTokens)
      : null;

    if (!measurement) {
      await this.release({ reason: '无可用用量数据', meterType: 'tokens' });
      const result: SettlementResult = {
        settled: this.settled,
        settledUnits: 0,
      };
      if (this.settled) {
        this.lastSettlementResult = result;
      }
      return result;
    }

    await this.settle({
      action: ctx.action,
      endpoint: ctx.endpoint,
      measurement,
      status: outcome === 'partial' ? 'partial' : 'success',
      metadata: ctx.metadata,
    }, {
      feature: ctx.feature ?? 'destiny',
      provider: ctx.provider,
      model: ctx.model,
      requestId: ctx.requestId,
      userId: ctx.userId,
    });

    if (this.settled) {
      const result: SettlementResult = {
        settled: true,
        settledUnits: measurement.quotaUnits,
      };
      this.lastSettlementResult = result;
      return result;
    }

    return {
      settled: false,
      settledUnits: 0,
    };
  }
}