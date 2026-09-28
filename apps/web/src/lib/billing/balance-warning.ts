import { authFetch } from '@/lib/api/client';
import { toast } from 'sonner';

/** 低余额预警阈值（Token 数量） */
export const LOW_BALANCE_THRESHOLD = 2000;

/** 全局去重标识（无会话 ID 时使用） */
const GLOBAL_WARNING_KEY = '__global__';

/** 记录当前页面生命周期内已预警过的会话 ID 集合 */
const warnedConversationIds = new Set<string>();

/**
 * 判断是否应触发低余额预警
 *
 * 规则：
 * - 只有有限数值且小于阈值时触发
 * - null（如管理员无限制）、undefined、NaN 等非有限数值均不触发
 */
export function shouldWarnLowBalance(
  remaining: number | null | undefined,
  threshold = LOW_BALANCE_THRESHOLD
): boolean {
  if (typeof remaining !== 'number' || !Number.isFinite(remaining)) {
    return false;
  }
  return remaining < threshold;
}

/**
 * 检查当前用户余额并在低于阈值时发出 Toast 预警
 *
 * 行为：
 * - 同一会话（或无会话 ID 时的全局）每页面生命周期仅预警一次
 * - 发生网络错误或非 200 响应时静默忽略，不中断用户体验
 */
export async function checkAndWarnLowBalance(
  conversationId: string | null | undefined,
  threshold = LOW_BALANCE_THRESHOLD
): Promise<void> {
  const cacheKey = conversationId || GLOBAL_WARNING_KEY;
  if (warnedConversationIds.has(cacheKey)) {
    return;
  }

  try {
    const res = await authFetch('/api/profile/usage');
    if (!res.ok) {
      return;
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return;
    }

    const { tokenRemaining } = data as { tokenRemaining?: unknown };
    if (shouldWarnLowBalance(tokenRemaining as number | null | undefined, threshold)) {
      warnedConversationIds.add(cacheKey);
      const remainingNum = Math.max(0, Number(tokenRemaining));
      toast.warning(`额度剩余不足（约剩 ${remainingNum.toLocaleString()} tokens），请联系管理员充值`);
    }
  } catch (_error) {
    // 静默忽略网络错误与鉴权异常
  }
}

/** 重置预警缓存（供单元测试使用） */
export function resetBalanceWarningCache(): void {
  warnedConversationIds.clear();
}
