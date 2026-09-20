/**
 * history-store.test.ts —— 统一历史 store 的身份兜底
 *
 * 锁定的外部行为（首页两个 key 警告的根因修复）：
 * - 写入不含 id / 时间戳的记录（视频链路就是这样产出的）时，store 补齐 id 与 createdAt/updatedAt，
 *   避免列表按 id 去重互相覆盖、渲染缺 key；
 * - 已有 id 的记录原样入库，不做无谓改写。
 */

import '@testing-library/jest-dom/vitest';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHistoryStore } from './history-store';
import type { HistoryItem } from '@/types/history';

function baseItem(overrides: Partial<HistoryItem> = {}) {
  return {
    type: 'video',
    title: '齐天大圣脚踩七彩祥云大闹天空',
    preview: '齐天大圣脚踩七彩祥云大闹天空',
    date: '刚刚',
    model: 'cogvideox',
    videoUrl: 'https://example.com/v.mp4',
    prompt: '齐天大圣脚踩七彩祥云大闹天空',
    ...overrides,
  } as unknown as HistoryItem;
}

describe('useHistoryStore.addItem（身份兜底）', () => {
  beforeEach(() => {
    useHistoryStore.setState({ items: [], isInitialized: true });
  });

  it('无 id / 无时间戳的记录：补 id 与 createdAt、updatedAt 后入库', () => {
    useHistoryStore.getState().addItem(baseItem());

    const [stored] = useHistoryStore.getState().items;
    expect(typeof stored.id).toBe('string');
    expect(stored.id.length).toBeGreaterThan(0);
    expect(stored.createdAt).toBeTruthy();
    expect(stored.updatedAt).toBeTruthy();
  });

  it('两条无 id 的记录各自独立：不会按 id 互相覆盖', () => {
    useHistoryStore.getState().addItem(baseItem({ title: '第一条' }));
    useHistoryStore.getState().addItem(baseItem({ title: '第二条' }));

    const items = useHistoryStore.getState().items;
    expect(items).toHaveLength(2);
    expect(new Set(items.map((item) => item.id)).size).toBe(2);
  });

  it('已有 id 的记录：id 与时间戳保持原样（同 id 覆盖更新）', () => {
    useHistoryStore.getState().addItem(baseItem({ id: 'video-1', createdAt: '2026-01-01T00:00:00.000Z' }));
    useHistoryStore.getState().addItem(baseItem({ id: 'video-1', title: '改过标题' }));

    const items = useHistoryStore.getState().items;
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe('video-1');
    expect(items[0].title).toBe('改过标题');
    expect(items[0].createdAt).toBe('2026-01-01T00:00:00.000Z');
  });
});
