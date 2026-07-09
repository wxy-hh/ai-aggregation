import { checkAndDeductTokens, deductTokens, refundTokens } from '@repo/db';

export interface DeductAiQuotaInput {
  userId: string;
  user: { role: string; isAnonymous: boolean };
  anonymousCost: number;
  realUserCost?: number;
}

export interface DeductAiQuotaSuccess {
  success: true;
  deductedAmount: number;
}

export interface DeductAiQuotaFailure {
  success: false;
  reason: 'QUOTA_EXHAUSTED' | 'INSUFFICIENT_TOKENS';
}

export type DeductAiQuotaResult = DeductAiQuotaSuccess | DeductAiQuotaFailure;

/**
 * 统一处理 AI 功能调用的额度扣减。
 *
 * 规则：
 * - admin 直接放行，不扣减额度
 * - 匿名用户：原子扣减 anonymousCost，余额不足返回 QUOTA_EXHAUSTED
 * - 真实用户：扣减 realUserCost（默认 1），扣减失败返回 INSUFFICIENT_TOKENS
 */
export async function deductAiQuotaForRoute(
  input: DeductAiQuotaInput
): Promise<DeductAiQuotaResult> {
  const { userId, user, anonymousCost, realUserCost = 1 } = input;

  if (user.role === 'admin') {
    return { success: true, deductedAmount: 0 };
  }

  if (user.isAnonymous) {
    const deduction = await checkAndDeductTokens(userId, anonymousCost);
    if (!deduction.success) {
      return { success: false, reason: 'QUOTA_EXHAUSTED' };
    }
    return { success: true, deductedAmount: anonymousCost };
  }

  const result = await deductTokens(userId, realUserCost);
  if (!result.success) {
    return { success: false, reason: 'INSUFFICIENT_TOKENS' };
  }
  return { success: true, deductedAmount: realUserCost };
}

/**
 * 失败时根据已扣额度执行退款。
 * 静默处理错误，避免退款失败覆盖原始错误。
 */
export async function maybeRefund(
  userId: string | null | undefined,
  amount: number
): Promise<void> {
  if (!userId || amount <= 0) return;

  try {
    await refundTokens(userId, amount);
  } catch (error) {
    console.error('[quota] 退款失败:', { userId, amount, error });
  }
}
