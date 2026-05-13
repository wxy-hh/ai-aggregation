import { prisma } from './client';

export interface DeductionResult {
  success: boolean;
  remaining: number;
}

/**
 * 原子化扣减用户 Token 额度。
 * 使用 updateMany 保证并发安全，不会重复扣减。
 * 不设 gte 守卫（允许透支），因为 post-deduction 场景（chat）中
 * AI 调用已完成，必须扣减；pre-deduction 场景即使并发抢跑导致透支，
 * 下次调用也会被 tokens <= 0 检查拦截。
 */
export async function deductTokens(
  userId: string,
  amount: number
): Promise<DeductionResult> {
  if (amount <= 0) {
    return { success: true, remaining: 0 };
  }

  const result = await prisma.user.updateMany({
    where: { id: userId },
    data: { tokens: { decrement: amount } },
  });

  if (result.count === 0) {
    return { success: false, remaining: 0 };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { tokens: true },
  });

  return { success: true, remaining: user?.tokens ?? 0 };
}

/**
 * 退还 Token（扣减失败后调用）。
 * 内部静默处理错误——仅用于回滚，不应抛异常干扰主流程。
 */
export async function refundTokens(
  userId: string,
  amount: number
): Promise<void> {
  if (amount <= 0) return;

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { tokens: { increment: amount } },
    });
  } catch (error) {
    console.error('退还 Token 失败:', { userId, amount, error });
  }
}
