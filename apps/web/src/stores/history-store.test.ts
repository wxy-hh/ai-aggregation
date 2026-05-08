import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HistoryItem } from '@/types/history';
import { useHistoryStore } from './history-store';

function createChatHistoryItem(overrides: Partial<HistoryItem> = {}): HistoryItem {
  return {
    id: 'conv-1',
    type: 'chat',
    title: '第一版标题',
    preview: '第一版摘要',
    date: '刚刚',
    createdAt: '2026-05-08T10:00:00.000Z',
    updatedAt: '2026-05-08T10:00:00.000Z',
    model: 'qwen-max',
    provider: 'dashscope',
    messages: [
      {
        role: 'user',
        content: '你好',
      },
    ],
    ...overrides,
  };
}

describe('history-store', () => {
  beforeEach(() => {
    localStorage.clear();
    useHistoryStore.setState({
      items: [],
      isLoading: false,
      error: null,
      filter: { type: 'all' },
      isInitialized: false,
    });
  });

  afterEach(() => {
    localStorage.clear();
    useHistoryStore.setState({
      items: [],
      isLoading: false,
      error: null,
      filter: { type: 'all' },
      isInitialized: false,
    });
  });

  it('同一个会话重复写入历史时只保留最新一条', () => {
    const firstItem = createChatHistoryItem();
    const latestItem = createChatHistoryItem({
      title: '第二版标题',
      preview: '第二版摘要',
      updatedAt: '2026-05-08T10:05:00.000Z',
      messages: [
        {
          role: 'user',
          content: '继续追问',
        },
        {
          role: 'assistant',
          content: '这里是最新回答',
        },
      ],
    });

    useHistoryStore.getState().addItem(firstItem);
    useHistoryStore.getState().addItem(latestItem);

    const items = useHistoryStore.getState().getFilteredItems();

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('第二版标题');
    expect(items[0]?.preview).toBe('第二版摘要');
  });

  it('读取历史列表时会自动去重旧的重复数据', () => {
    const olderItem = createChatHistoryItem({
      title: '旧标题',
      updatedAt: '2026-05-08T09:00:00.000Z',
    });
    const latestItem = createChatHistoryItem({
      title: '新标题',
      updatedAt: '2026-05-08T11:00:00.000Z',
    });

    useHistoryStore.setState((state) => ({
      ...state,
      items: [olderItem, latestItem],
    }));

    const items = useHistoryStore.getState().getFilteredItems();
    const stats = useHistoryStore.getState().getStats();

    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe('新标题');
    expect(stats.total).toBe(1);
    expect(stats.chat).toBe(1);
  });
});
