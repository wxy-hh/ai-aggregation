'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  AudioHistoryItem,
  AudioHistoryFilter,
  AudioHistoryStats,
  ProcessingStatus,
} from '../types/audio-history';
import { AudioHistoryService } from '../lib/services/audio-history-service';
import { createIndexedDBStorage } from '../lib/storage';

// ==================== 类型定义 ====================

export interface AudioHistoryState {
  // 数据状态
  items: AudioHistoryItem[];
  currentItem: AudioHistoryItem | null;
  filter: AudioHistoryFilter;
  stats: AudioHistoryStats | null;

  // UI 状态
  isLoading: boolean;
  error: string | null;
  selectedIds: string[];
  isInitialized: boolean;

  // 服务实例
  service: AudioHistoryService | null;

  // Actions - 初始化
  initializeService: () => Promise<void>;

  // Actions - 数据操作
  loadItems: (filter?: AudioHistoryFilter) => Promise<void>;
  createItem: (
    file: File,
    transcriptionText?: string,
    translationText?: string
  ) => Promise<AudioHistoryItem>;
  updateItem: (id: string, updates: Partial<AudioHistoryItem>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteSelectedItems: () => Promise<void>;
  updateProcessingStatus: (
    id: string,
    status: ProcessingStatus,
    data?: {
      transcriptionText?: string;
      translationText?: string;
      segments?: AudioHistoryItem['segments'];
      errorMessage?: string;
    }
  ) => Promise<void>;

  // Actions - UI 状态管理
  setCurrentItem: (item: AudioHistoryItem | null) => void;
  setFilter: (filter: AudioHistoryFilter) => void;
  setSelectedIds: (ids: string[]) => void;
  toggleSelection: (id: string) => void;
  clearSelection: () => void;
  selectAll: () => void;

  // Actions - 统计和信息
  loadStats: () => Promise<void>;
  getStorageInfo: () => Promise<{ used: number; available: number; total: number } | null>;

  // Actions - 错误处理
  clearError: () => void;

  // Actions - 清理
  clearAll: () => Promise<void>;
  cleanOldRecords: (options: {
    olderThanDays?: number;
    keepCount?: number;
    targetSizeBytes?: number;
  }) => Promise<number>;
  validateAndRepairData: () => Promise<{
    totalItems: number;
    corruptedItems: number;
    repairedItems: number;
    deletedItems: number;
  }>;
  migrateData: () => Promise<{
    itemsProcessed: number;
    itemsMigrated: number;
    itemsFailed: number;
    errors: string[];
  }>;
  reset: () => void;
}

// ==================== Store 实现 ====================

export const useAudioHistoryStore = create<AudioHistoryState>()(
  devtools(
    (set, get) => ({
      // 初始状态
      items: [],
      currentItem: null,
      filter: {},
      stats: null,
      isLoading: false,
      error: null,
      selectedIds: [],
      isInitialized: false,
      service: null,

      // 初始化服务
      initializeService: async () => {
        const { isInitialized } = get();
        if (isInitialized) {
          return;
        }

        try {
          set({ isLoading: true, error: null });

          // Check if IndexedDB is supported
          const { isIndexedDBSupported } = await import('../lib/storage');
          if (!isIndexedDBSupported()) {
            throw new Error(
              '您的浏览器不支持历史记录功能。请使用现代浏览器（Chrome、Firefox、Edge等）。'
            );
          }

          // 创建 IndexedDB 存储
          const storage = await createIndexedDBStorage();

          // 创建服务实例
          const service = new AudioHistoryService({
            storage,
            maxRetries: 3,
            retryDelay: 1000,
          });

          set({
            service,
            isInitialized: true,
            isLoading: false,
          });

          // 初始化后自动加载数据
          await get().loadItems();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : '初始化音频历史记录服务失败';
          console.error('[AudioHistoryStore] Initialization error:', error);
          set({
            error: errorMessage,
            isLoading: false,
            isInitialized: false,
          });
        }
      },

      // 加载历史记录
      loadItems: async (filter?: AudioHistoryFilter) => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          console.warn('[AudioHistoryStore] Service not initialized, skipping loadItems');
          return;
        }

        set({ isLoading: true, error: null });

        try {
          const filterToUse = filter || get().filter;
          const items = await service.searchHistory(filterToUse);

          set({
            items,
            isLoading: false,
            filter: filterToUse,
          });
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '加载历史记录失败';
          console.error('[AudioHistoryStore] Load items error:', error);
          set({
            error: errorMessage,
            isLoading: false,
          });
        }
      },

      // 创建历史记录
      createItem: async (file: File, transcriptionText?: string, translationText?: string) => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          throw new Error('服务未初始化');
        }

        set({ isLoading: true, error: null });

        try {
          const item = await service.createFromUpload(file, transcriptionText, translationText);

          set((state) => ({
            items: [item, ...state.items],
            isLoading: false,
          }));

          // 更新统计信息
          get().loadStats();

          return item;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '创建历史记录失败';
          console.error('[AudioHistoryStore] Create item error:', error);
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      // 更新历史记录
      updateItem: async (id: string, updates: Partial<AudioHistoryItem>) => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          console.warn('[AudioHistoryStore] Service not initialized');
          return;
        }

        try {
          const updatedItem = await service.updateItem(id, updates);

          set((state) => ({
            items: state.items.map((item) => (item.id === id ? updatedItem : item)),
            currentItem: state.currentItem?.id === id ? updatedItem : state.currentItem,
          }));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '更新历史记录失败';
          console.error('[AudioHistoryStore] Update item error:', error);
          set({ error: errorMessage });
          throw error;
        }
      },

      // 更新处理状态
      updateProcessingStatus: async (
        id: string,
        status: ProcessingStatus,
        data?: {
          transcriptionText?: string;
          translationText?: string;
          segments?: AudioHistoryItem['segments'];
          errorMessage?: string;
        }
      ) => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          console.warn('[AudioHistoryStore] Service not initialized');
          return;
        }

        try {
          const updatedItem = await service.updateProcessingStatus(id, status, data);

          set((state) => ({
            items: state.items.map((item) => (item.id === id ? updatedItem : item)),
            currentItem: state.currentItem?.id === id ? updatedItem : state.currentItem,
          }));

          // 如果状态变为完成或错误，更新统计信息
          if (status === 'completed' || status === 'error') {
            get().loadStats();
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '更新处理状态失败';
          console.error('[AudioHistoryStore] Update status error:', error);
          set({ error: errorMessage });
        }
      },

      // 删除历史记录
      deleteItem: async (id: string) => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          console.warn('[AudioHistoryStore] Service not initialized');
          return;
        }

        try {
          await service.deleteItem(id);

          set((state) => ({
            items: state.items.filter((item) => item.id !== id),
            currentItem: state.currentItem?.id === id ? null : state.currentItem,
            selectedIds: state.selectedIds.filter((selectedId) => selectedId !== id),
          }));

          // 同步删除 history-store 中的对应记录
          try {
            const { useHistoryStore } = require('./history-store');
            const historyStore = useHistoryStore.getState();
            historyStore.deleteItem(id, true); // 传入 true 表示是同步删除，避免循环
          } catch (e) {
            console.warn('Failed to sync delete with history store:', e);
          }

          // 更新统计信息
          get().loadStats();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '删除历史记录失败';
          console.error('[AudioHistoryStore] Delete item error:', error);
          set({ error: errorMessage });
          throw error;
        }
      },

      // 删除选中的历史记录
      deleteSelectedItems: async () => {
        const { service, selectedIds, isInitialized } = get();

        if (!isInitialized || !service) {
          console.warn('[AudioHistoryStore] Service not initialized');
          return;
        }

        if (selectedIds.length === 0) {
          return;
        }

        // 保存 selectedIds 的副本，因为 set 后会清空
        const idsToDelete = [...selectedIds];

        try {
          await service.deleteMultiple(idsToDelete);

          set((state) => ({
            items: state.items.filter((item) => !idsToDelete.includes(item.id)),
            currentItem: idsToDelete.includes(state.currentItem?.id || '')
              ? null
              : state.currentItem,
            selectedIds: [],
          }));

          // 同步删除 history-store 中的对应记录
          try {
            const { useHistoryStore } = require('./history-store');
            const historyStore = useHistoryStore.getState();
            historyStore.deleteItems(idsToDelete, true); // 传入 true 表示是同步删除，避免循环
          } catch (e) {
            console.warn('Failed to sync batch delete with history store:', e);
          }

          // 更新统计信息
          get().loadStats();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '批量删除失败';
          console.error('[AudioHistoryStore] Delete selected error:', error);
          set({ error: errorMessage });
          throw error;
        }
      },

      // 设置当前项目
      setCurrentItem: (item: AudioHistoryItem | null) => {
        set({ currentItem: item });
      },

      // 设置过滤条件
      setFilter: (filter: AudioHistoryFilter) => {
        set({ filter });
        get().loadItems(filter);
      },

      // 设置选中项目
      setSelectedIds: (ids: string[]) => {
        set({ selectedIds: ids });
      },

      // 切换选中状态
      toggleSelection: (id: string) => {
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selectedId) => selectedId !== id)
            : [...state.selectedIds, id],
        }));
      },

      // 清除选中
      clearSelection: () => {
        set({ selectedIds: [] });
      },

      // 全选
      selectAll: () => {
        const { items } = get();
        set({ selectedIds: items.map((item) => item.id) });
      },

      // 加载统计信息
      loadStats: async () => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          return;
        }

        try {
          const stats = await service.getStatistics();
          set({ stats });
        } catch (error) {
          console.error('[AudioHistoryStore] Load stats error:', error);
          // 不设置错误状态，因为统计信息加载失败不应该影响主要功能
        }
      },

      // 获取存储信息
      getStorageInfo: async () => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          return null;
        }

        try {
          return await service.getStorageInfo();
        } catch (error) {
          console.error('[AudioHistoryStore] Get storage info error:', error);
          return null;
        }
      },

      // 清除错误
      clearError: () => {
        set({ error: null });
      },

      // 清除所有历史记录
      clearAll: async () => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          console.warn('[AudioHistoryStore] Service not initialized');
          return;
        }

        // 获取所有 ID 用于同步删除
        const allIds = get().items.map((item) => item.id);

        try {
          set({ isLoading: true, error: null });

          await service.clearAll();

          set({
            items: [],
            currentItem: null,
            selectedIds: [],
            stats: {
              totalItems: 0,
              totalSize: 0,
              completedItems: 0,
              errorItems: 0,
            },
            isLoading: false,
          });

          // 同步删除 history-store 中的 voice 类型记录
          if (allIds.length > 0) {
            try {
              const { useHistoryStore } = require('./history-store');
              const historyStore = useHistoryStore.getState();
              historyStore.deleteItems(allIds, true); // 传入 true 表示是同步删除，避免循环
            } catch (e) {
              console.warn('Failed to sync clear all with history store:', e);
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '清除历史记录失败';
          console.error('[AudioHistoryStore] Clear all error:', error);
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      // 清理旧记录
      cleanOldRecords: async (options: {
        olderThanDays?: number;
        keepCount?: number;
        targetSizeBytes?: number;
      }) => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          throw new Error('服务未初始化');
        }

        try {
          set({ isLoading: true, error: null });

          const deletedCount = await service.cleanOldRecords(options);

          // Reload items and stats after cleanup
          await get().loadItems();
          await get().loadStats();

          set({ isLoading: false });

          return deletedCount;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '清理旧记录失败';
          console.error('[AudioHistoryStore] Clean old records error:', error);
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      // 验证和修复数据
      validateAndRepairData: async () => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          throw new Error('服务未初始化');
        }

        try {
          set({ isLoading: true, error: null });

          const result = await service.validateAndRepairData();

          // Reload items and stats after validation
          await get().loadItems();
          await get().loadStats();

          set({ isLoading: false });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '验证数据失败';
          console.error('[AudioHistoryStore] Validate and repair error:', error);
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      // 迁移数据
      migrateData: async () => {
        const { service, isInitialized } = get();

        if (!isInitialized || !service) {
          throw new Error('服务未初始化');
        }

        try {
          set({ isLoading: true, error: null });

          const result = await service.migrateData();

          // Reload items and stats after migration
          await get().loadItems();
          await get().loadStats();

          set({ isLoading: false });

          return result;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : '数据迁移失败';
          console.error('[AudioHistoryStore] Migrate data error:', error);
          set({
            error: errorMessage,
            isLoading: false,
          });
          throw error;
        }
      },

      // 重置状态
      reset: () => {
        set({
          items: [],
          currentItem: null,
          filter: {},
          stats: null,
          isLoading: false,
          error: null,
          selectedIds: [],
          // 保持 isInitialized 和 service，因为它们可以被重用
        });
      },
    }),
    {
      name: 'audio-history-store',
    }
  )
);

// ==================== 选择器 Hooks ====================

/**
 * Hook to get all history items
 */
export const useHistoryItems = () => useAudioHistoryStore((state) => state.items);

/**
 * Hook to get current item
 */
export const useCurrentHistoryItem = () => useAudioHistoryStore((state) => state.currentItem);

/**
 * Hook to get loading state
 */
export const useHistoryLoading = () => useAudioHistoryStore((state) => state.isLoading);

/**
 * Hook to get error state
 */
export const useHistoryError = () => useAudioHistoryStore((state) => state.error);

/**
 * Hook to get selected IDs
 */
export const useSelectedHistoryIds = () => useAudioHistoryStore((state) => state.selectedIds);

/**
 * Hook to get statistics
 */
export const useHistoryStats = () => useAudioHistoryStore((state) => state.stats);

/**
 * Hook to get filter
 */
export const useHistoryFilter = () => useAudioHistoryStore((state) => state.filter);

/**
 * Hook to get initialization state
 */
export const useHistoryInitialized = () => useAudioHistoryStore((state) => state.isInitialized);

/**
 * Hook to get all actions
 * Returns a stable reference to prevent infinite loops
 */
export const useHistoryActions = () => {
  const initializeService = useAudioHistoryStore((state) => state.initializeService);
  const loadItems = useAudioHistoryStore((state) => state.loadItems);
  const createItem = useAudioHistoryStore((state) => state.createItem);
  const updateItem = useAudioHistoryStore((state) => state.updateItem);
  const deleteItem = useAudioHistoryStore((state) => state.deleteItem);
  const deleteSelectedItems = useAudioHistoryStore((state) => state.deleteSelectedItems);
  const updateProcessingStatus = useAudioHistoryStore((state) => state.updateProcessingStatus);
  const setCurrentItem = useAudioHistoryStore((state) => state.setCurrentItem);
  const setFilter = useAudioHistoryStore((state) => state.setFilter);
  const setSelectedIds = useAudioHistoryStore((state) => state.setSelectedIds);
  const toggleSelection = useAudioHistoryStore((state) => state.toggleSelection);
  const clearSelection = useAudioHistoryStore((state) => state.clearSelection);
  const selectAll = useAudioHistoryStore((state) => state.selectAll);
  const loadStats = useAudioHistoryStore((state) => state.loadStats);
  const getStorageInfo = useAudioHistoryStore((state) => state.getStorageInfo);
  const clearError = useAudioHistoryStore((state) => state.clearError);
  const clearAll = useAudioHistoryStore((state) => state.clearAll);
  const cleanOldRecords = useAudioHistoryStore((state) => state.cleanOldRecords);
  const validateAndRepairData = useAudioHistoryStore((state) => state.validateAndRepairData);
  const migrateData = useAudioHistoryStore((state) => state.migrateData);
  const reset = useAudioHistoryStore((state) => state.reset);

  return {
    initializeService,
    loadItems,
    createItem,
    updateItem,
    deleteItem,
    deleteSelectedItems,
    updateProcessingStatus,
    setCurrentItem,
    setFilter,
    setSelectedIds,
    toggleSelection,
    clearSelection,
    selectAll,
    loadStats,
    getStorageInfo,
    clearError,
    clearAll,
    cleanOldRecords,
    validateAndRepairData,
    migrateData,
    reset,
  };
};
