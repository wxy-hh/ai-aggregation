/**
 * 配额结算管理器
 *
 * 封装 reserve → settle/release 的完整生命周期，
 * 避免每个 provider 分支重复写配额逻辑。
 *
 * 结算决策唯一权威见 finalizeChatStream：三个适配器流结束时都必须经由它结算，
 * 不再散落各自 settle/recordUsage 分支（评审 C2：结算生命周期单点定义）。
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
import { createTokenMeasurement, estimateOutputTokens } from '@/lib/billing/usage-measurement';
import { safeRecordAiUsage } from '@/lib/ai-usage';
import { normalizeUsage } from '@/lib/ai-usage';

/** 结算状态：成功 / 部分成功（有输出但异常结束）。failed 不走 settle，走 release */
export type ChatSettleStatus = 'success' | 'partial';

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

  /**
   * 结算预留（流正常/部分结束时调用）。
   * 注意：adapter 一般不直接调用，统一走 finalizeChatStream。
   */
  settle(rawUsage: unknown, fallbackTokens?: number, status?: ChatSettleStatus): Promise<void>;
  /**
   * 释放预留（失败且无产出/取消时调用）。已结算或无预留时自动跳过。
   * 注意：adapter 一般不直接调用，统一走 finalizeChatStream。
   */
  release(reason: string): Promise<void>;
  /**
   * 无配额模式（admin）下仅记录用量。adapter 一般不直接调用，统一走 finalizeChatStream。
   */
  recordUsage(rawUsage: unknown, status?: ChatSettleStatus): Promise<void>;
}

/**
 * 聊天流结束结果（三个 adapter → finalizeChatStream 的唯一输入）。
 *
 * - outcome='success'：流正常结束（收到终止事件且无异常）。
 * - outcome='partial'：流异常结束但已有部分输出文本（上游截断、网络中断、用户中断）。
 * - outcome='failed'：流异常结束且没有任何输出文本（上游空流、取消、初始化失败）。
 */
export interface ChatStreamFinish {
  outcome: 'success' | 'partial' | 'failed';
  /** 上游返回的 usage（可为 null；无效时按兜底估算结算） */
  usage: unknown;
  /** 累计的输出文本（用于输出 token 估算兜底） */
  outputText: string;
  /** 失败/取消原因（release 记录与日志用） */
  reason?: string;
}

/**
 * 统一流结算决策 — 三个 adapter 流结束的唯一入口（评审 C2）。
 *
 * 决策表（唯一权威，消除三份散落实现）：
 * - success    → settle(usage, input + 输出估算, status='success')；admin 记录用量
 * - partial    → settle(usage, input + 输出估算, status='partial')；admin 记录用量
 * - failed     → release('cancel 应退款')；admin 无预留自动跳过
 *
 * fallback 兜底口径统一为「输入估算 + 输出估算」（修复 generic 只按 input 结算的漂移）。
 * settle/release 内部块幂等（finalized 守卫），多路回调/重复调用不会重复结算。
 */
export async function finalizeChatStream(
  billing: BillingManager,
  finish: ChatStreamFinish
): Promise<void> {
  // 统一兜底口径：输入估算 + 输出估算（输出文本为空时估算为 0）
  const fallbackTokens = billing.inputUnits + estimateOutputTokens(finish.outputText);

  if (finish.outcome === 'failed') {
    // 无任何产出（上游空流/取消/初始化失败）：释放预留，返回用户额度
    await billing.release(finish.reason ?? '回答流失败');
    return;
  }

  if (billing.hasReservation) {
    await billing.settle(finish.usage, fallbackTokens, finish.outcome);
  } else {
    await billing.recordUsage(finish.usage, finish.outcome);
  }
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

    async settle(rawUsage: unknown, fallbackOverride?: number, status: ChatSettleStatus = 'success') {
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
          status,
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

    async recordUsage(rawUsage: unknown, status: ChatSettleStatus = 'success') {
      await safeRecordAiUsage({
        userId: ctx.userId,
        feature: 'chat',
        action: 'chat-stream',
        provider: ctx.provider,
        model: ctx.model,
        endpoint: '/api/chat',
        status,
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
