'use client';

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createDexieStorage } from '@/lib/storage/zustand-dexie-storage';
import { HistoryItem, HistoryType, HistoryFilter, HistoryStats } from '@/types/history';
import { generateUUID } from '@/lib/utils/uuid';
import { authFetch } from '@/lib/api/client';
import { emit, StoreEvents } from './store-events';

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

/**
 * 历史项兜底：补齐 id 与时间戳。
 *
 * 视频链路的历史项由 createVideoHistoryItem 产出（类型上就不含 id/时间戳），调用方直接 addItem，
 * 于是库里存在无 id 的记录，后果是列表按 id 去重后互相覆盖、渲染时 key 缺失（React 报
 * 「Each child in a list should have a unique "key" prop」）。写入与读取两侧都过这道兜底：
 * 新记录当场补 id，水合时把存量脏数据一并修好，不动其它字段。
 *
 * @param existing 同 id 的既有记录：重写同一条时保留它的 createdAt（首次写入时间不变）
 */
function ensureHistoryItemIdentity(item: HistoryItem, existing?: HistoryItem): HistoryItem {
  const now = new Date().toISOString();
  const missingId = typeof item.id !== 'string' || item.id.length === 0;
  if (!missingId && item.createdAt && item.updatedAt) return item;
  return {
    ...item,
    id: missingId ? generateUUID() : item.id,
    createdAt: item.createdAt ?? existing?.createdAt ?? now,
    updatedAt: item.updatedAt ?? now,
  } as HistoryItem;
}

// 在模块顶层保存 set 引用，用于 persist 中间件的 onRehydrateStorage 回调
// onRehydrateStorage 在 useHistoryStore 赋值前执行，不能直接引用 useHistoryStore.setState
let _storeSet: ((partial: Partial<HistoryState>) => void) | null = null;
/** 水合时是否修补过脏数据（见 merge）：用于在 onRehydrateStorage 里决定是否回写一次 */
let repairedOnHydrate = false;

export const useHistoryStore = create<HistoryState>()(
  persist(
    (set, get) => {
      _storeSet = set;
      return {
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
        set((state) => {
          const existing =
            typeof item.id === 'string' ? state.items.find((historyItem) => historyItem.id === item.id) : undefined;
          // 入库前补齐 id 与时间戳：调用方（如视频链路）可能给出不含 id 的记录
          const normalized = ensureHistoryItemIdentity(item, existing);
          return {
            // 同一条记录重复写入时按最新内容覆盖，避免出现重复 key
            items: [normalized, ...state.items.filter((historyItem) => historyItem.id !== normalized.id)],
          };
        });
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

        // 通过事件总线同步（避免循环依赖）
        if (!_isSyncDelete) {
          emit(StoreEvents.CONVERSATION_DELETED, { id });
          emit(StoreEvents.RELAY_SOURCES_INVALIDATED, { ids: [id] });

          if (itemToDelete?.type === 'voice') {
            emit(StoreEvents.AUDIO_HISTORY_DELETED, { id });
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

        // 通过事件总线同步（避免循环依赖）
        if (!_isSyncDelete) {
          emit(StoreEvents.RELAY_SOURCES_INVALIDATED, { ids });

          ids.forEach((id) => {
            emit(StoreEvents.CONVERSATION_DELETED, { id });
          });

          voiceIdsToDelete.forEach((id) => {
            emit(StoreEvents.AUDIO_HISTORY_DELETED, { id });
          });
        }
      },

      // 清空历史记录
      clearHistory: (type) => {
        // 获取要被删除的记录 ID，用于同步删除与接力失效标记
        const state = get();
        const deletedIds = Array.from(
          new Set(state.items.filter((item) => (type ? item.type === type : true)).map((item) => item.id))
        );
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

        // 通过事件总线同步（避免循环依赖）
        emit(StoreEvents.RELAY_SOURCES_INVALIDATED, { ids: deletedIds });

        chatIdsToDelete.forEach((id) => {
          emit(StoreEvents.CONVERSATION_DELETED, { id });
        });

        voiceIdsToDelete.forEach((id) => {
          emit(StoreEvents.AUDIO_HISTORY_DELETED, { id });
        });
      },

      // 从服务器获取历史记录（远端未接入时保留本地 IndexedDB 数据）
      fetchHistory: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await authFetch('/api/history');
          if (!response.ok) throw new Error('Failed to fetch history');

          const data = await response.json();
          const remoteItems = Array.isArray(data.items) ? (data.items as HistoryItem[]) : [];

          // 远端 API 仍为占位实现时返回空数组，不能覆盖本地已持久化的记录
          if (remoteItems.length === 0) {
            set({ isLoading: false, isInitialized: true });
            return;
          }

          const localItems = get().items;
          const mergedMap = new Map<string, HistoryItem>();

          [...localItems, ...remoteItems].forEach((item) => {
            const existing = mergedMap.get(item.id);
            if (!existing || getItemTimestamp(item) >= getItemTimestamp(existing)) {
              mergedMap.set(item.id, item);
            }
          });

          set({
            items: Array.from(mergedMap.values()),
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
          video: items.filter((item) => item.type === 'video').length,
          destiny: items.filter((item) => item.type === 'destiny').length,
        };
      },

      // 根据 ID 获取项目
      getItemById: (id) => {
        const items = dedupeHistoryItems(get().items);
        return items.find((item) => item.id === id);
      },
    };
    },
    {
      name: 'ai-history-store',
      storage: createJSONStorage(() => createDexieStorage('ai-history-db')),
      partialize: (state) => ({
        items: state.items,
      }),
      /**
       * 水合即修补存量脏数据（必须发生在 merge：onRehydrateStorage 回调晚于首次渲染，
       * 那时脏数据已经渲染过一轮，key 警告照样会打出来）。
       * 修补过的数据在 onRehydrateStorage 里回写一次，后续启动无需再补。
       */
      merge: (persistedState, currentState) => {
        const persisted = persistedState as Partial<HistoryState> | undefined;
        const persistedItems = persisted?.items;
        if (!Array.isArray(persistedItems)) return { ...currentState, ...persisted } as HistoryState;
        const repaired = persistedItems.map((item) => ensureHistoryItemIdentity(item));
        repairedOnHydrate = repaired.some((item, index) => item !== persistedItems[index]);
        return { ...currentState, ...persisted, items: repaired } as HistoryState;
      },
      // IndexedDB 数据水合完成后标记为已初始化，确保 historyId 恢复能在刷新后正常触发
      onRehydrateStorage: () => (state) => {
        if (repairedOnHydrate) {
          repairedOnHydrate = false;
          // 回写修补结果：只有确实补过内容时才多写一次 IndexedDB
          if (state?.items) _storeSet?.({ items: state.items });
        }
        _storeSet?.({ isInitialized: true });
      },
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
  useHistoryStore(
    useShallow((state) => ({
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
    }))
  );
