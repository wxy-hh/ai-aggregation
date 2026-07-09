import { prisma } from './client';

export interface QuotaCheckResult {
  success: true;
  remaining: number;
}

export interface QuotaCheckFailure {
  success: false;
  reason: 'USER_NOT_FOUND' | 'NOT_ANONYMOUS' | 'INSUFFICIENT_TOKENS';
}

export type CheckAndDeductTokensResult = QuotaCheckResult | QuotaCheckFailure;

/**
 * 检查并原子扣减匿名用户额度。
 *
 * 规则：
 * - 仅对 isAnonymous = true 的用户扣减；真实用户直接返回当前余额且不扣减。
 * - 使用 updateMany + tokens: { gte: amount } 做原子条件更新，防止并发超扣。
 * - 余额不足、用户不存在或非匿名用户时返回失败原因，不会扣减。
 */
export async function checkAndDeductTokens(
  userId: string,
  amount: number
): Promise<CheckAndDeductTokensResult> {
  if (!Number.isFinite(amount) || amount <= 0 || !Number.isInteger(amount)) {
    throw new Error('扣减额度必须为正整数');
  }

  const result = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.updateMany({
      where: {
        id: userId,
        isAnonymous: true,
        tokens: { gte: amount },
      },
      data: {
        tokens: { decrement: amount },
      },
    });

    if (updated.count === 0) {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { isAnonymous: true, tokens: true },
      });

      if (!user) return { status: 'USER_NOT_FOUND' as const };
      if (!user.isAnonymous) return { status: 'NOT_ANONYMOUS' as const };
      return { status: 'INSUFFICIENT_TOKENS' as const };
    }

    const user = await tx.user.findUnique({
      where: { id: userId },
      select: { tokens: true },
    });

    return { status: 'SUCCESS' as const, remaining: user?.tokens ?? 0 };
  });

  if (result.status === 'SUCCESS') {
    return { success: true, remaining: result.remaining };
  }

  return { success: false, reason: result.status };
}

/**
 * 获取匿名用户当前剩余额度。
 * 对真实用户返回当前 tokens（不限制）。
 */
export async function getAnonymousTokenBalance(
  userId: string
): Promise<{ tokens: number; isAnonymous: boolean } | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokens: true, isAnonymous: true },
  });

  return user ?? null;
}

/**
 * 判断用户是否为匿名用户且额度已耗尽。
 */
export async function isAnonymousQuotaExhausted(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAnonymous: true, tokens: true },
  });

  return user?.isAnonymous === true && user.tokens <= 0;
}

/**
 * 统一 AI 调用入口的额度检查。
 * - 真实用户：不扣减，直接允许。
 * - 匿名用户：原子扣减指定额度，余额不足返回 QUOTA_EXHAUSTED。
 * - 未提供 userId（理论上不应发生，因为 requireAuth 已校验）视为失败。
 */
export async function deductAiQuota(
  userId: string | null,
  amount: number
): Promise<{ ok: true; remaining: number } | { ok: false; code: 'QUOTA_EXHAUSTED' }> {
  if (!userId) {
    return { ok: false, code: 'QUOTA_EXHAUSTED' };
  }

  const result = await checkAndDeductTokens(userId, amount);

  if (result.success) {
    return { ok: true, remaining: result.remaining };
  }

  // 非匿名用户也允许通过（兼容真实用户的旧逻辑）
  if (result.reason === 'NOT_ANONYMOUS') {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { tokens: true },
    });
    return { ok: true, remaining: user?.tokens ?? 0 };
  }

  return { ok: false, code: 'QUOTA_EXHAUSTED' };
}
