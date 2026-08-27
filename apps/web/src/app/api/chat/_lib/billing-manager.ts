/**
 * 配额结算管理器
 *
 * 封装 reserve → settle/release 的完整生命周期，
 * 避免每个 provider 分支重复写配额逻辑。
 */

import type { ProviderName } from '@repo/providers';
import type { Message as ChatMessage } from '@/stores/chat-store';
import type { BillingMeasurement } from '@repo/shared';
import {
  reserveChatQuota,
  releaseAiQuota,
  settleAiQuota,
  useExistingAiQuota,
} from '@/lib/billing/quota-service';
import { createTokenMeasurement } from '@/lib/billing/usage-measurement';
import { safeRecordAiUsage } from '@/lib/ai-usage';
import { normalizeUsage } from '@/lib/ai-usage';

export interface BillingContext {
  userId: string;
  errorId: string;
  provider: ProviderName;
  model: string;
  messages: ChatMessage[];
  requestId: string;
  userRole: string;
  reservationId?: string;
}

export interface BillingManager {
  /** 额度是否已结算/释放（防止重复操作） */
  finalized: boolean;
  /** 预留是否已生效 */
  hasReservation: boolean;
  /** 输入 token 估算值 */
  inputUnits: number;
  /** 输出 token 上限 */
  outputLimit: number;

  /** 流正常结束时调用 */
  settle(rawUsage: unknown, fallbackTokens?: number): Promise<void>;
  /** 流异常/用户取消时调用 */
  release(reason: string): Promise<void>;
  /** 无配额模式（admin）下仅记录用量 */
  recordUsage(rawUsage: unknown): Promise<void>;
}

export async function createBillingManager(ctx: BillingContext): Promise<BillingManager> {
  let reservation: Awaited<ReturnType<typeof reserveChatQuota>>['reservation'] | null = null;
  let inputUnits = 0;
  let outputLimit = 2048;
  let finalized = false;

  if (ctx.userRole !== 'admin') {
    if (ctx.reservationId) {
      const existing = await useExistingAiQuota({
        userId: ctx.userId,
        reservationId: ctx.reservationId,
        requestId: ctx.requestId,
      });
      reservation = existing;
      inputUnits = Number(existing.metadata?.inputEstimate ?? 0);
      const reservedOutputLimit = Number(existing.metadata?.outputLimit);
      if (Number.isInteger(reservedOutputLimit) && reservedOutputLimit > 0) {
        outputLimit = reservedOutputLimit;
      }
    } else {
      const quota = await reserveChatQuota({
        userId: ctx.userId,
        requestId: ctx.requestId,
        provider: ctx.provider,
        model: ctx.model,
        messages: ctx.messages,
        metadata: {
          messagesCount: ctx.messages.length,
          attachmentCount: ctx.messages.reduce(
            (count, m) => count + (m.attachments?.length ?? 0), 0
          ),
        },
      });
      reservation = quota.reservation;
      inputUnits = quota.inputUnits;
      outputLimit = quota.outputLimit;
    }
  }

  return {
    finalized,
    hasReservation: !!reservation,
    inputUnits,
    outputLimit,

    async settle(rawUsage: unknown, fallbackOverride?: number) {
      if (!reservation || finalized) return;
      finalized = true;
      try {
        const measurement = createTokenMeasurement(
          rawUsage,
          fallbackOverride ?? inputUnits
        );
        await settleAiQuota({
          reservationId: reservation.id,
          requestId: ctx.requestId,
          feature: 'chat',
          provider: ctx.provider,
          model: ctx.model,
          action: 'chat-stream',
          endpoint: '/api/chat',
          measurement,
          metadata: { errorId: ctx.errorId },
        });
      } catch (err) {
        finalized = false;
        console.error('[chat] 额度结算失败:', { errorId: ctx.errorId, err });
      }
    },

    async release(reason: string) {
      if (!reservation || finalized) return;
      finalized = true;
      try {
        await releaseAiQuota({ reservationId: reservation.id, reason, meterType: 'tokens' });
      } catch (err) {
        finalized = false;
        console.error('[chat] 额度释放失败:', { errorId: ctx.errorId, err });
      }
    },

    async recordUsage(rawUsage: unknown) {
      await safeRecordAiUsage({
        userId: ctx.userId,
        feature: 'chat',
        action: 'chat-stream',
        provider: ctx.provider,
        model: ctx.model,
        endpoint: '/api/chat',
        requestId: ctx.errorId,
        usage: normalizeUsage(rawUsage),
        metadata: {
          messagesCount: ctx.messages.length,
          attachmentCount: ctx.messages.reduce(
            (count, m) => count + (m.attachments?.length ?? 0), 0
          ),
        },
      });
    },
  };
}
