'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { HistoryItem, HistoryType, HistoryFilter, HistoryStats } from '@/types/history';
import { authHeaders } from '@/lib/api/client';

// ==================== 类型定义 ====================

interface HistoryState {
  // 状态
  items: HistoryItem[];
  isLoading: boolean;
  error: string | null;
  filter: HistoryFilter;
  isInitialized: boolean;

  // Actions
  setFilter: (filter: Partial<HistoryFilter>) => void;
  addItem: (item: HistoryItem) => void;
  updateItem: (id: string, updates: Partial<HistoryItem>) => void;
  deleteItem: (id: string, _isSyncDelete?: boolean) => void;
  deleteItems: (ids: string[], _isSyncDelete?: boolean) => void;
  clearHistory: (type?: HistoryType) => void;
  fetchHistory: () => Promise<void>;

  // Computed
  getFilteredItems: () => HistoryItem[];
  getStats: () => HistoryStats;
  getItemById: (id: string) => HistoryItem | undefined;
}

// ==================== 工具函数 ====================

function formatDate(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays === 1) return '昨天';
  if (diffDays < 7) return `${diffDays}天前`;

  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function matchesFilter(item: HistoryItem, filter: HistoryFilter): boolean {
  // Type filter
  if (filter.type && filter.type !== 'all' && item.type !== filter.type) {
    return false;
  }

  // Search filter
  if (filter.search) {
    const searchLower = filter.search.toLowerCase();
    const titleMatch = item.title.toLowerCase().includes(searchLower);
    const previewMatch = 'preview' in item && item.preview.toLowerCase().includes(searchLower);
    if (!titleMatch && !previewMatch) {
      return false;
    }
  }

  // Date filters
  if (filter.dateFrom) {
    const itemDate = new Date(item.createdAt);
    const fromDate = new Date(filter.dateFrom);
    if (itemDate < fromDate) return false;
  }

  if (filter.dateTo) {
    const itemDate = new Date(item.createdAt);
    const toDate = new Date(filter.dateTo);
    if (itemDate > toDate) return false;
  }

  return true;
}

function getItemTimestamp(item: HistoryItem): number {
  const updatedAt = new Date(item.updatedAt).getTime();
  if (!Number.isNaN(updatedAt)) {
    return updatedAt;
  }

  const createdAt = new Date(item.createdAt).getTime();
  return Number.isNaN(createdAt) ? 0 : createdAt;
}

function dedupeHistoryItems(items: HistoryItem[]): HistoryItem[] {
  const latestItemMap = new Map<string, HistoryItem>();

  items.forEach((item) => {
    const existing = latestItemMap.get(item.id);
    if (!existing || getItemTimestamp(item) >= getItemTimestamp(existing)) {
      latestItemMap.set(item.id, item);
    }
  });

  return Array.from(latestItemMap.values());
}

// ==================== Store 实现 ====================

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => ({
      // 初始状态
      items: [],
      isLoading: false,
      error: null,
      filter: { type: 'all' },
      isInitialized: false,

      // 设置筛选条件
      setFilter: (newFilter) => {
        set((state) => ({
          filter: { ...state.filter, ...newFilter },
        }));
      },

      // 添加历史记录
      addItem: (item) => {
        set((state) => ({
          // 同一条记录重复写入时按最新内容覆盖，避免出现重复 key
          items: [item, ...state.items.filter((historyItem) => historyItem.id !== item.id)],
        }));
      },

      // 更新历史记录
      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id
              ? ({ ...item, ...updates, updatedAt: new Date().toISOString() } as HistoryItem)
              : item
          ),
        }));
      },

      // 删除单个历史记录
      deleteItem: (id, _isSyncDelete = false) => {
        // 先获取要删除的项，用于判断类型
        const itemToDelete = get().items.find((item) => item.id === id);

        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));

        // 避免循环调用
        if (!_isSyncDelete) {
          // 同步删除 conversations-store 中的对应对话（chat 类型）
          try {
            const { useConversationsStore } = require('./conversations-store');
            const conversationsStore = useConversationsStore.getState();
            const conversation = conversationsStore.conversations.find((c: {id: string}) => c.id === id);
            if (conversation) {
              conversationsStore.deleteConversation(id, true);
            }
          } catch (e) {
            console.warn('Failed to sync delete with conversations store:', e);
          }

          // 同步删除 audio-history-store 中的记录（voice 类型）
          if (itemToDelete?.type === 'voice') {
            try {
              const { useAudioHistoryStore } = require('./audio-history-store');
              const audioHistoryStore = useAudioHistoryStore.getState();
              audioHistoryStore.deleteItem(id);
            } catch (e) {
              console.warn('Failed to sync delete with audio history store:', e);
            }
          }
        }
      },

      // 批量删除历史记录
      deleteItems: (ids, _isSyncDelete = false) => {
        // 先获取要删除的项，用于判断类型
        const itemsToDelete = get().items.filter((item) => ids.includes(item.id));
        const voiceIdsToDelete = itemsToDelete.filter((item) => item.type === 'voice').map((item) => item.id);

        set((state) => ({
          items: state.items.filter((item) => !ids.includes(item.id)),
        }));

        // 避免循环调用
        if (!_isSyncDelete) {
          // 同步删除 conversations-store 中的对应对话（chat 类型）
          try {
            const { useConversationsStore } = require('./conversations-store');
            const conversationsStore = useConversationsStore.getState();
            ids.forEach((id) => {
              const conversation = conversationsStore.conversations.find((c: {id: string}) => c.id === id);
              if (conversation) {
                conversationsStore.deleteConversation(id, true);
              }
            });
          } catch (e) {
            console.warn('Failed to sync batch delete with conversations store:', e);
          }

          // 同步删除 audio-history-store 中的记录（voice 类型）
          if (voiceIdsToDelete.length > 0) {
            try {
              const { useAudioHistoryStore } = require('./audio-history-store');
              const audioHistoryStore = useAudioHistoryStore.getState();
              voiceIdsToDelete.forEach((id) => {
                audioHistoryStore.deleteItem(id);
              });
            } catch (e) {
              console.warn('Failed to sync batch delete with audio history store:', e);
            }
          }
        }
      },

      // 清空历史记录
      clearHistory: (type) => {
        // 获取要被删除的记录 ID，用于同步删除
        const state = get();
        const chatIdsToDelete = type === 'chat' || !type
          ? state.items.filter((item) => (type ? item.type === type : item.type === 'chat')).map((item) => item.id)
          : [];
        const voiceIdsToDelete = type === 'voice' || !type
          ? state.items.filter((item) => (type ? item.type === type : item.type === 'voice')).map((item) => item.id)
          : [];

        if (type) {
          set((state) => ({
            items: state.items.filter((item) => item.type !== type),
          }));
        } else {
          set({ items: [] });
        }

        // 同步清空 conversations-store 中的对应对话（chat 类型）
        if (chatIdsToDelete.length > 0) {
          try {
            const { useConversationsStore } = require('./conversations-store');
            const conversationsStore = useConversationsStore.getState();
            chatIdsToDelete.forEach((id) => {
              conversationsStore.deleteConversation(id, true);
            });
          } catch (e) {
            console.warn('Failed to sync clear history with conversations store:', e);
          }
        }

        // 同步清空 audio-history-store 中的记录（voice 类型）
        if (voiceIdsToDelete.length > 0) {
          try {
            const { useAudioHistoryStore } = require('./audio-history-store');
            const audioHistoryStore = useAudioHistoryStore.getState();
            voiceIdsToDelete.forEach((id) => {
              audioHistoryStore.deleteItem(id);
            });
          } catch (e) {
            console.warn('Failed to sync clear history with audio history store:', e);
          }
        }
      },

      // 从服务器获取历史记录
      fetchHistory: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/history', { headers: authHeaders() });
          if (!response.ok) throw new Error('Failed to fetch history');

          const data = await response.json();
          set({
            items: data.items || [],
            isLoading: false,
            isInitialized: true,
          });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : 'Unknown error',
            isLoading: false,
          });
        }
      },

      // 获取过滤后的项目
      getFilteredItems: () => {
        const { items, filter } = get();
        return dedupeHistoryItems(items)
          .filter((item) => matchesFilter(item, filter))
          .sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));
      },

      // 获取统计信息
      getStats: () => {
        const items = dedupeHistoryItems(get().items);
        return {
          total: items.length,
          chat: items.filter((item) => item.type === 'chat').length,
          voice: items.filter((item) => item.type === 'voice').length,
          image: items.filter((item) => item.type === 'image').length,
        };
      },

      // 根据 ID 获取项目
      getItemById: (id) => {
        const items = dedupeHistoryItems(get().items);
        return items.find((item) => item.id === id);
      },
    }),
    {
      name: 'ai-history-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        items: state.items,
      }),
    }
  )
);

// ==================== Hooks ====================

export const useHistoryItems = () => useHistoryStore((state) => state.items);
export const useHistoryLoading = () => useHistoryStore((state) => state.isLoading);
export const useHistoryError = () => useHistoryStore((state) => state.error);
export const useHistoryFilter = () => useHistoryStore((state) => state.filter);
export const useHistoryInitialized = () => useHistoryStore((state) => state.isInitialized);

export const useHistoryActions = () =>
  useHistoryStore((state) => ({
    setFilter: state.setFilter,
    addItem: state.addItem,
    updateItem: state.updateItem,
    deleteItem: state.deleteItem,
    deleteItems: state.deleteItems,
    clearHistory: state.clearHistory,
    fetchHistory: state.fetchHistory,
    getFilteredItems: state.getFilteredItems,
    getStats: state.getStats,
    getItemById: state.getItemById,
  }));
