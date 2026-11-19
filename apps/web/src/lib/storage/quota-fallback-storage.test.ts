import { describe, it, expect } from 'vitest';
import type { Artifact } from '@repo/shared';
import { createQuotaFallbackStorage } from './quota-fallback-storage';

function chain(id: string, n: number): Artifact {
  const versions = Array.from({ length: n }, (_, i) => ({
    id: `v${i + 1}`,
    seq: i + 1,
    content: `${id}-版本${i + 1}-` + 'x'.repeat(100),
    createdAt: i,
    source: { kind: 'generated' as const },
  }));
  return {
    id,
    type: 'markdown',
    title: id,
    content: versions[n - 1].content,
    status: 'complete',
    versions,
  };
}

function persisted(conversations: Array<{ id: string; updatedAt: number; artifacts: Artifact[] }>) {
  return JSON.stringify({
    state: {
      conversations: conversations.map((c) => ({ ...c, title: c.id, messages: [] })),
      mode: 'single',
    },
    version: 0,
  });
}

/** 模拟 localStorage：写入值长度超过 limit 即抛 QuotaExceededError */
function makeBacking(limit: number) {
  const data = new Map<string, string>();
  const writes: number[] = [];
  return {
    data,
    writes,
    storage: {
      getItem: (k: string) => data.get(k) ?? null,
      removeItem: (k: string) => void data.delete(k),
      setItem: (k: string, v: string) => {
        writes.push(v.length);
        if (v.length > limit) throw new DOMException('quota', 'QuotaExceededError');
        data.set(k, v);
      },
    },
  };
}

describe('createQuotaFallbackStorage 超配额降级（工单 02）', () => {
  it('配额充足时原样写入，不改动内容', () => {
    const { storage, data } = makeBacking(1_000_000);
    const value = persisted([{ id: 'c1', updatedAt: 1, artifacts: [chain('a', 5)] }]);
    createQuotaFallbackStorage(storage).setItem('k', value);
    expect(data.get('k')).toBe(value);
  });

  it('超配额时淘汰最旧会话产物的最旧中间版本后重试，整体写入成功且最近会话版本更完整', () => {
    const oldConv = { id: 'old', updatedAt: 1, artifacts: [chain('a', 5)] };
    const newConv = { id: 'new', updatedAt: 9, artifacts: [chain('b', 5)] };
    const full = persisted([oldConv, newConv]);
    const { storage, data } = makeBacking(full.length - 200);
    createQuotaFallbackStorage(storage).setItem('k', full);

    const saved = JSON.parse(data.get('k')!);
    const convs = saved.state.conversations as Array<{ id: string; artifacts: Artifact[] }>;
    const oldVersions = convs.find((c) => c.id === 'old')!.artifacts[0].versions!;
    const newVersions = convs.find((c) => c.id === 'new')!.artifacts[0].versions!;
    expect(oldVersions.length).toBeLessThan(5);
    expect(newVersions).toHaveLength(5);
    // 首版与当前版永不被淘汰
    expect(oldVersions[0].seq).toBe(1);
    expect(oldVersions[oldVersions.length - 1].seq).toBe(5);
    // 会话列表其他内容未丢失
    expect(convs).toHaveLength(2);
  });

  it('只要还能淘汰就继续淘汰；全部只剩首版与当前版仍超配额时抛出原错误，不静默丢会话', () => {
    const value = persisted([{ id: 'c1', updatedAt: 1, artifacts: [chain('a', 5)] }]);
    const { storage } = makeBacking(10);
    expect(() => createQuotaFallbackStorage(storage).setItem('k', value)).toThrow();
  });

  it('非配额类错误不拦截，直接抛出', () => {
    const storage = {
      getItem: () => null,
      removeItem: () => {},
      setItem: () => {
        throw new Error('其他错误');
      },
    };
    expect(() => createQuotaFallbackStorage(storage).setItem('k', persisted([]))).toThrow('其他错误');
  });

  it('getItem / removeItem 透传', () => {
    const { storage, data } = makeBacking(1_000_000);
    data.set('k', 'v');
    const wrapped = createQuotaFallbackStorage(storage);
    expect(wrapped.getItem('k')).toBe('v');
    wrapped.removeItem('k');
    expect(data.has('k')).toBe(false);
  });
});
