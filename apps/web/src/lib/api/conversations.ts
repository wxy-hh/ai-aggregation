import { authFetch } from './client';

/**
 * 幂等删除服务端记忆会话（ADR-0058）。
 * 空数组直接返回 0；失败抛出中文错误，由调用方决定提示与重试。
 */
export async function deleteConversations(ids: string[]): Promise<number> {
  const uniqueIds = [...new Set(ids.filter(Boolean))];
  if (uniqueIds.length === 0) return 0;

  const response = await authFetch(
    `/api/conversations?ids=${encodeURIComponent(uniqueIds.join(','))}`,
    { method: 'DELETE' }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new Error(
      typeof data?.error === 'string' ? data.error : '服务端记忆清理失败，请重试'
    );
  }

  const data = await response.json();
  return typeof data?.deleted === 'number' ? data.deleted : 0;
}
