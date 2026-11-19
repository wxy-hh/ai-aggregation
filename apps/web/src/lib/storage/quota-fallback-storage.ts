/**
 * quota-fallback-storage.ts
 *
 * 职责（ADR-0037）：
 * 为会话列表的 localStorage 持久化加一层「超配额降级」。产物版本链最多 5 版，体积最坏约为现状 5 倍；
 * 写入抛出配额错误时，不得让会话列表整体写入失败，而是按「最旧会话优先、每次淘汰一个最旧中间版本」
 * 降级后重试。首版与当前版永不淘汰；无可淘汰仍超配额时抛出原错误，不静默丢会话。
 */

import { dropOldestArtifactVersion } from '@repo/shared';
import type { Artifact } from '@repo/shared';

/** 与 zustand `StateStorage` 同形的最小存储接口 */
export interface SyncStateStorage {
  getItem: (name: string) => string | null;
  setItem: (name: string, value: string) => void;
  removeItem: (name: string) => void;
}

interface PersistedConversation {
  updatedAt?: number;
  artifacts?: Artifact[];
}

interface PersistedPayload {
  state?: { conversations?: PersistedConversation[] };
}

/** 是否为存储配额类错误（各浏览器的名称与错误码不同） */
function isQuotaError(error: unknown): boolean {
  if (!(error instanceof Error) && !(typeof DOMException !== 'undefined' && error instanceof DOMException)) {
    return false;
  }
  const e = error as { name?: string; code?: number };
  return (
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e.code === 22 ||
    e.code === 1014
  );
}

/**
 * 在已解析的持久化载荷上原地淘汰一个版本：按会话更新时间从旧到新，选第一个仍可淘汰的产物。
 * 返回是否淘汰成功。
 */
function dropOneVersion(payload: PersistedPayload): boolean {
  const conversations = payload.state?.conversations;
  if (!Array.isArray(conversations)) return false;
  const ordered = [...conversations].sort((a, b) => (a.updatedAt ?? 0) - (b.updatedAt ?? 0));
  for (const conv of ordered) {
    if (!Array.isArray(conv.artifacts)) continue;
    for (let i = 0; i < conv.artifacts.length; i++) {
      const dropped = dropOldestArtifactVersion(conv.artifacts[i]);
      if (dropped) {
        conv.artifacts[i] = dropped;
        return true;
      }
    }
  }
  return false;
}

/** 包装存储：setItem 遇配额错误时逐版本淘汰后重试 */
export function createQuotaFallbackStorage(backing: SyncStateStorage): SyncStateStorage {
  return {
    getItem: (name) => backing.getItem(name),
    removeItem: (name) => backing.removeItem(name),
    setItem: (name, value) => {
      try {
        backing.setItem(name, value);
        return;
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        let payload: PersistedPayload;
        try {
          payload = JSON.parse(value) as PersistedPayload;
        } catch {
          throw error;
        }
        // 每淘汰一个版本就重试一次；淘汰到无可淘汰仍失败则抛出原错误
        while (dropOneVersion(payload)) {
          try {
            backing.setItem(name, JSON.stringify(payload));
            return;
          } catch (retryError) {
            if (!isQuotaError(retryError)) throw retryError;
          }
        }
        throw error;
      }
    },
  };
}
