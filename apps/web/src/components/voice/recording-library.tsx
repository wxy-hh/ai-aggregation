'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { useEffect, useMemo, useState } from 'react';
import {
  useHistoryItems,
  useHistoryLoading,
  useHistoryError,
  useHistoryStats,
  useHistoryActions,
  useHistoryInitialized,
  useSelectedHistoryIds,
} from '@/stores/audio-history-store';
import { AudioHistoryItem, ProcessingStatus } from '@/types/audio-history';
import { HistoryEditDialog } from './history-edit-dialog';
import { HistoryDeleteDialog } from './history-delete-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

// Helper function to format duration
function formatDuration(seconds?: number): string {
  if (!seconds) return '--:--';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

// Helper function to format relative time
function formatRelativeTime(date: Date): string {
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

  return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
}

// Helper function to group items by date
function groupItemsByDate(items: AudioHistoryItem[]): Map<string, AudioHistoryItem[]> {
  const groups = new Map<string, AudioHistoryItem[]>();

  items.forEach((item) => {
    const now = new Date();
    const itemDate = new Date(item.createdAt);
    const diffDays = Math.floor((now.getTime() - itemDate.getTime()) / 86400000);

    let groupKey: string;
    if (diffDays === 0) {
      groupKey = '今天';
    } else if (diffDays === 1) {
      groupKey = '昨天';
    } else if (diffDays < 7) {
      groupKey = '本周';
    } else if (diffDays < 30) {
      groupKey = '本月';
    } else {
      groupKey = '更早';
    }

    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(item);
  });

  return groups;
}

type DateFilterOption = 'all' | 'today' | 'week' | 'month';

interface RecordingLibraryProps {
  onHistoryItemClick?: (item: AudioHistoryItem) => void;
}

export function RecordingLibrary({ onHistoryItemClick }: RecordingLibraryProps = {}) {
  const items = useHistoryItems();
  const isLoading = useHistoryLoading();
  const error = useHistoryError();
  const stats = useHistoryStats();
  const isInitialized = useHistoryInitialized();
  const selectedIds = useSelectedHistoryIds();
  const {
    initializeService,
    setCurrentItem,
    clearError,
    getStorageInfo,
    updateItem,
    deleteItem,
    deleteSelectedItems,
    toggleSelection,
    clearSelection,
    selectAll,
  } = useHistoryActions();

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [dateFilter, setDateFilter] = useState<DateFilterOption>('all');
  const [statusFilter, setStatusFilter] = useState<ProcessingStatus[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    available: number;
    total: number;
  } | null>(null);
  const [editingItem, setEditingItem] = useState<AudioHistoryItem | null>(null);
  const [deletingItems, setDeletingItems] = useState<AudioHistoryItem[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Initialize service on mount
  useEffect(() => {
    if (!isInitialized) {
      initializeService();
    }
  }, [isInitialized, initializeService]);

  // Load storage info
  useEffect(() => {
    const loadStorageInfo = async () => {
      const info = await getStorageInfo();
      if (info) {
        setStorageInfo(info);
      }
    };

    if (isInitialized) {
      loadStorageInfo();
    }
  }, [isInitialized, getStorageInfo, stats]);

  // Track searching state
  useEffect(() => {
    if (searchQuery !== debouncedSearchQuery) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [searchQuery, debouncedSearchQuery]);

  // Filter items based on search query, date filter, and status filter
  const filteredItems = useMemo(() => {
    let result = items;

    // Apply search query filter (using debounced value)
    if (debouncedSearchQuery.trim()) {
      const query = debouncedSearchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.fileName.toLowerCase().includes(query) ||
          item.transcriptionText?.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // Apply date filter
    if (dateFilter !== 'all') {
      const now = new Date();
      result = result.filter((item) => {
        const itemDate = new Date(item.createdAt);
        const diffMs = now.getTime() - itemDate.getTime();
        const diffDays = Math.floor(diffMs / 86400000);

        switch (dateFilter) {
          case 'today':
            return diffDays === 0;
          case 'week':
            return diffDays < 7;
          case 'month':
            return diffDays < 30;
          default:
            return true;
        }
      });
    }

    // Apply status filter
    if (statusFilter.length > 0) {
      result = result.filter((item) => statusFilter.includes(item.processingStatus));
    }

    return result;
  }, [items, debouncedSearchQuery, dateFilter, statusFilter]);

  // Group filtered items by date
  const groupedItems = useMemo(() => {
    return groupItemsByDate(filteredItems);
  }, [filteredItems]);

  // Calculate storage percentage
  const storagePercentage = useMemo(() => {
    if (!storageInfo || storageInfo.total === 0) return 0;
    return Math.round((storageInfo.used / storageInfo.total) * 100);
  }, [storageInfo]);

  const handleItemClick = (item: AudioHistoryItem) => {
    if (isSelectionMode) {
      toggleSelection(item.id);
    } else {
      setCurrentItem(item);
      // 调用父组件传入的回调
      onHistoryItemClick?.(item);
    }
  };

  const handleEditItem = (item: AudioHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingItem(item);
  };

  const handleDeleteItem = (item: AudioHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();
    setDeletingItems([item]);
  };

  const handleSaveEdit = async (id: string, updates: { title: string; tags: string[] }) => {
    try {
      await updateItem(id, updates);
      toast.success('历史记录已更新');
    } catch (error) {
      toast.error('更新失败，请重试');
    }
  };

  const handleConfirmDelete = async () => {
    try {
      if (deletingItems.length === 1) {
        await deleteItem(deletingItems[0].id);
        toast.success('历史记录已删除');
      } else {
        await deleteSelectedItems();
        toast.success(`已删除 ${deletingItems.length} 条记录`);
      }
      setDeletingItems([]);
    } catch (error) {
      toast.error('删除失败，请重试');
    }
  };

  const handleBulkDelete = () => {
    const itemsToDelete = items.filter((item) => selectedIds.includes(item.id));
    setDeletingItems(itemsToDelete);
  };

  const handleToggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    if (isSelectionMode) {
      clearSelection();
    }
  };

  const handleSelectAll = () => {
    if (selectedIds.length === filteredItems.length) {
      clearSelection();
    } else {
      selectAll();
    }
  };

  const toggleStatusFilter = (status: ProcessingStatus) => {
    setStatusFilter((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDateFilter('all');
    setStatusFilter([]);
  };

  const hasActiveFilters =
    debouncedSearchQuery.trim() !== '' || dateFilter !== 'all' || statusFilter.length > 0;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 w-80 shrink-0">
      {/* Search Header */}
      <div className="p-4 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wider">录音记录</h2>
          <div className="flex items-center gap-2">
            {isSelectionMode && (
              <button
                onClick={handleSelectAll}
                className="p-1.5 rounded-lg transition-colors text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                title={selectedIds.length === filteredItems.length ? '取消全选' : '全选'}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={handleToggleSelectionMode}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                isSelectionMode
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
              title={isSelectionMode ? '退出选择模式' : '选择模式'}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </button>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={cn(
                'p-1.5 rounded-lg transition-colors',
                showFilters || hasActiveFilters
                  ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400'
                  : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
              )}
              title="过滤选项"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Selection Mode Banner */}
        {isSelectionMode && (
          <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg flex items-center justify-between">
            <span className="text-xs text-blue-700 dark:text-blue-300">
              已选择 {selectedIds.length} 项
            </span>
            <div className="flex items-center gap-2">
              {selectedIds.length > 0 && (
                <button
                  onClick={handleBulkDelete}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  删除选中
                </button>
              )}
              <button
                onClick={() => {
                  setIsSelectionMode(false);
                  clearSelection();
                }}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                取消
              </button>
            </div>
          </div>
        )}

        {/* Search Input */}
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            type="text"
            placeholder="搜索录音..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-10 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all"
          />
          {isSearching && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          )}
        </div>

        {/* Filter Panel */}
        {showFilters && (
          <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg space-y-3">
            {/* Date Filter */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
                时间范围
              </label>
              <div className="flex gap-2">
                {[
                  { value: 'all', label: '全部' },
                  { value: 'today', label: '今天' },
                  { value: 'week', label: '本周' },
                  { value: 'month', label: '本月' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => setDateFilter(option.value as DateFilterOption)}
                    className={cn(
                      'flex-1 px-2 py-1 text-xs rounded transition-colors',
                      dateFilter === option.value
                        ? 'bg-blue-500 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Status Filter */}
            <div>
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-2 block">
                处理状态
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'completed', label: '已完成', color: 'green' },
                  { value: 'transcribing', label: '转录中', color: 'blue' },
                  { value: 'error', label: '错误', color: 'red' },
                ].map((option) => (
                  <button
                    key={option.value}
                    onClick={() => toggleStatusFilter(option.value as ProcessingStatus)}
                    className={cn(
                      'px-2 py-1 text-xs rounded transition-colors',
                      statusFilter.includes(option.value as ProcessingStatus)
                        ? option.color === 'green'
                          ? 'bg-green-500 text-white'
                          : option.color === 'blue'
                            ? 'bg-blue-500 text-white'
                            : 'bg-red-500 text-white'
                        : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-600'
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Clear Filters */}
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="w-full px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
              >
                清除所有过滤条件
              </button>
            )}
          </div>
        )}

        {/* Active Filters Summary */}
        {hasActiveFilters && !showFilters && (
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span>
              已应用 {(searchQuery ? 1 : 0) + (dateFilter !== 'all' ? 1 : 0) + statusFilter.length}{' '}
              个过滤条件
            </span>
            <button
              onClick={clearFilters}
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              清除
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 custom-scrollbar">
        {/* Error State */}
        {error && (
          <div className="mx-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-start gap-2">
              <svg
                className="w-4 h-4 text-red-600 dark:text-red-400 mt-0.5 shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
                <button
                  onClick={clearError}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline mt-1"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Loading State with Skeleton */}
        {isLoading && items.length === 0 && (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                <div className="flex items-start gap-2 mb-2">
                  <Skeleton className="w-8 h-8 rounded-lg" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                </div>
                <Skeleton className="h-3 w-1/3" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && items.length === 0 && !error && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              暂无历史记录
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
              上传音频文件后，历史记录将显示在这里
            </p>
          </div>
        )}

        {/* No Search Results */}
        {!isLoading && items.length > 0 && filteredItems.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-4">
              <svg
                className="w-8 h-8 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
              未找到匹配记录
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center mb-3">
              尝试使用不同的关键词或过滤条件
            </p>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              >
                清除所有过滤条件
              </button>
            )}
          </div>
        )}

        {/* Grouped Items - Use virtual scrolling for large lists */}
        {!isLoading &&
          filteredItems.length > 0 &&
          Array.from(groupedItems.entries()).map(([groupName, groupItems]) => (
            <div key={groupName}>
              <h3 className="text-xs font-semibold text-slate-400 mb-2 px-2">{groupName}</h3>
              <div className="space-y-2">
                {groupItems.map((item) => (
                  <RecordingItem
                    key={item.id}
                    item={item}
                    onClick={() => handleItemClick(item)}
                    onEdit={(e) => handleEditItem(item, e)}
                    onDelete={(e) => handleDeleteItem(item, e)}
                    isSelected={selectedIds.includes(item.id)}
                    isSelectionMode={isSelectionMode}
                  />
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Storage Status */}
      <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-medium text-slate-600 dark:text-slate-300">本地存储</span>
          <span className="text-blue-600 dark:text-blue-400 font-bold">{storagePercentage}%</span>
        </div>
        <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 overflow-hidden">
          <div
            className="bg-blue-500 h-full rounded-full transition-all"
            style={{ width: `${storagePercentage}%` }}
          ></div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5 text-right">
          {storageInfo
            ? `已使用 ${formatFileSize(storageInfo.used)} / ${formatFileSize(storageInfo.total)}`
            : '计算中...'}
        </p>
        {stats && (
          <p className="text-[10px] text-slate-400 mt-1">
            共 {stats.totalItems} 条记录 · {formatFileSize(stats.totalSize)}
          </p>
        )}
      </div>

      {/* Edit Dialog */}
      <HistoryEditDialog
        item={editingItem}
        open={!!editingItem}
        onOpenChange={(open) => !open && setEditingItem(null)}
        onSave={handleSaveEdit}
      />

      {/* Delete Dialog */}
      <HistoryDeleteDialog
        items={deletingItems}
        open={deletingItems.length > 0}
        onOpenChange={(open) => !open && setDeletingItems([])}
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}

function RecordingItem({
  item,
  onClick,
  onEdit,
  onDelete,
  isSelected,
  isSelectionMode,
}: {
  item: AudioHistoryItem;
  onClick: () => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  isSelected: boolean;
  isSelectionMode: boolean;
}) {
  const isActive = false; // TODO: Implement active state based on current item

  // Get status badge info
  const getStatusBadge = () => {
    switch (item.processingStatus) {
      case 'uploading':
        return {
          text: '上传中',
          color: 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/50 dark:text-yellow-300',
        };
      case 'transcribing':
        return {
          text: '转录中',
          color: 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-300',
        };
      case 'translating':
        return {
          text: '翻译中',
          color: 'bg-purple-100 text-purple-600 dark:bg-purple-900/50 dark:text-purple-300',
        };
      case 'completed':
        return {
          text: '已完成',
          color: 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-300',
        };
      case 'error':
        return {
          text: '错误',
          color: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-300',
        };
      default:
        return null;
    }
  };

  const statusBadge = getStatusBadge();

  return (
    <div
      onClick={onClick}
      className={cn(
        'p-3 rounded-xl border transition-all cursor-pointer group relative',
        isActive
          ? 'bg-white dark:bg-blue-900/20 border-blue-500 shadow-md transform scale-[1.02]'
          : isSelected
            ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700'
            : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-blue-200 dark:hover:border-slate-600 hover:shadow-sm'
      )}
    >
      {/* Selection Checkbox */}
      {isSelectionMode && (
        <div className="absolute top-2 left-2 z-10">
          <div
            className={cn(
              'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
              isSelected
                ? 'bg-blue-500 border-blue-500'
                : 'bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600'
            )}
          >
            {isSelected && (
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={3}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </div>
      )}

      <div className="flex items-start justify-between mb-2">
        <div className={cn('flex items-center gap-2 flex-1 min-w-0', isSelectionMode && 'ml-7')}>
          <div
            className={cn(
              'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
              isActive
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400'
                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            )}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <h4
              className={cn(
                'text-sm font-semibold truncate',
                isActive ? 'text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-200'
              )}
              title={item.title}
            >
              {item.title}
            </h4>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>{formatRelativeTime(new Date(item.createdAt))}</span>
              <span>•</span>
              <span>{formatDuration(item.duration)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {statusBadge && (
            <span className={cn('px-1.5 py-0.5 text-[10px] font-bold rounded', statusBadge.color)}>
              {statusBadge.text}
            </span>
          )}
        </div>
      </div>

      {/* File info */}
      <div
        className={cn(
          'flex items-center gap-2 text-[10px] text-slate-400',
          isSelectionMode && 'ml-7'
        )}
      >
        <span>{formatFileSize(item.fileSize)}</span>
        <span>•</span>
        <span>{item.fileMimeType.split('/')[1].toUpperCase()}</span>
      </div>

      {/* Tags */}
      {item.tags.length > 0 && (
        <div className={cn('flex flex-wrap gap-1 mt-2', isSelectionMode && 'ml-7')}>
          {item.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="px-1.5 py-0.5 text-[10px] bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"
            >
              {tag}
            </span>
          ))}
          {item.tags.length > 3 && (
            <span className="px-1.5 py-0.5 text-[10px] text-slate-400">
              +{item.tags.length - 3}
            </span>
          )}
        </div>
      )}

      {/* Action Buttons (visible on hover when not in selection mode) */}
      {!isSelectionMode && (
        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors"
            title="编辑"
          >
            <svg
              className="w-3.5 h-3.5 text-slate-600 dark:text-slate-300"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/30 hover:border-red-300 dark:hover:border-red-700 transition-colors"
            title="删除"
          >
            <svg
              className="w-3.5 h-3.5 text-red-600 dark:text-red-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
