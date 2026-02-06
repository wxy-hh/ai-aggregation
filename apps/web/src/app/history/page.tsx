'use client';

import { AppLayout } from '@/components/layout/app-layout';
import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { ChatHistoryCard } from '@/components/history/chat-history-card';
import { VoiceHistoryCard } from '@/components/history/voice-history-card';
import { ImageHistoryCard } from '@/components/history/image-history-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useHistoryStore } from '@/stores/history-store';
import type { HistoryItem, HistoryType, ImageHistoryItem } from '@/types/history';
import { Download, Share2, X } from 'lucide-react';

const tabs = [
  { id: 'all', label: '全部' },
  { id: 'chat', label: '对话' },
  { id: 'voice', label: '语音' },
  { id: 'image', label: '图片' },
];

export default function HistoryPage() {
  const [previewItem, setPreviewItem] = useState<ImageHistoryItem | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // 从 store 获取状态和操作
  const filter = useHistoryStore((state) => state.filter);
  const isLoading = useHistoryStore((state) => state.isLoading);
  const setFilter = useHistoryStore((state) => state.setFilter);
  const getFilteredItems = useHistoryStore((state) => state.getFilteredItems);
  const getStats = useHistoryStore((state) => state.getStats);
  const deleteItem = useHistoryStore((state) => state.deleteItem);

  const activeTab = filter.type || 'all';
  const searchQuery = filter.search || '';

  const setActiveTab = (type: string) => {
    setFilter({ type: type as HistoryType | 'all' });
  };

  const setSearchQuery = (search: string) => {
    setFilter({ search });
  };

  const filteredHistory = getFilteredItems();
  const stats = getStats();

  // 处理删除历史记录
  const handleDeleteItem = useCallback((id: string) => {
    setDeleteId(id);
    setIsDeleteDialogOpen(true);
  }, []);

  const confirmDelete = useCallback(() => {
    if (deleteId) {
      deleteItem(deleteId);
      setIsDeleteDialogOpen(false);
      setDeleteId(null);
    }
  }, [deleteId, deleteItem]);

  // 处理图片下载
  const handleDownloadImage = useCallback(async (item: ImageHistoryItem) => {
    try {
      // 获取图片数据
      const response = await fetch(item.imageUrl);
      const blob = await response.blob();

      // 创建下载链接
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${item.title || 'image'}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('下载图片失败:', error);
      // 备用方案：直接打开新窗口
      window.open(item.imageUrl, '_blank');
    }
  }, []);

  return (
    <AppLayout>
      <div className="flex w-full h-full bg-slate-50 dark:bg-slate-950 overflow-hidden flex-col">
        {/* 头部 */}
        <header className="flex-none bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex items-center justify-between z-10 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              生成历史
              <Badge
                variant="secondary"
                className="px-2 py-0.5 bg-blue-100/50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-300 text-xs rounded font-normal hover:bg-blue-100 dark:hover:bg-blue-900/40 border-0"
              >
                {stats.total} 条记录
              </Badge>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              文档
            </Button>
            <Button
              variant="ghost"
              className="text-sm font-medium text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors"
            >
              社区
            </Button>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 mx-1"></div>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </Button>
          </div>
        </header>

        {/* 筛选栏 */}
        <div className="flex-none px-6 py-4 flex flex-col sm:flex-row gap-4 justify-between items-center sm:h-20">
          {/* 选项卡 */}
          <div className="bg-slate-100 dark:bg-slate-900/50 p-1 rounded-xl flex items-center gap-1 w-full sm:w-auto">
            {tabs.map((tab) => (
              <Button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                variant={activeTab === tab.id ? 'default' : 'ghost'}
                className={cn(
                  'px-6 py-2 rounded-lg text-sm font-bold transition-all flex-1 sm:flex-none h-9',
                  activeTab !== tab.id &&
                    'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-800/50'
                )}
              >
                {tab.label}
                {tab.id !== 'all' && (
                  <span className="ml-1.5 text-xs opacity-60">
                    ({stats[tab.id as keyof typeof stats]})
                  </span>
                )}
              </Button>
            ))}
          </div>

          {/* 搜索与筛选 */}
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-80">
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
              <Input
                type="text"
                placeholder={activeTab === 'image' ? '搜索 prompt...' : '搜索历史记录...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-sm focus-visible:ring-blue-500/20 focus-visible:border-blue-500 h-[42px]"
              />
            </div>
            <Button
              variant="outline"
              className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors h-[42px]"
            >
              <svg
                className="w-4 h-4 text-slate-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"
                />
              </svg>
              筛选
            </Button>
          </div>
        </div>

        {/* 内容网格 */}
        <div className="flex-1 overflow-y-auto px-6 pb-6 custom-scrollbar">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <div
              className={cn(
                'grid gap-6',
                activeTab === 'image'
                  ? 'grid-cols-1 md:grid-cols-3 xl:grid-cols-3'
                  : 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
              )}
            >
              {filteredHistory.map((item) => {
                if (item.type === 'chat') {
                  return <ChatHistoryCard key={item.id} item={item} onDelete={handleDeleteItem} />;
                } else if (item.type === 'voice') {
                  return <VoiceHistoryCard key={item.id} item={item} onDelete={handleDeleteItem} />;
                } else if (item.type === 'image') {
                  return (
                    <ImageHistoryCard
                      key={item.id}
                      item={item}
                      onPreview={setPreviewItem}
                      onDelete={handleDeleteItem}
                    />
                  );
                }
                return null;
              })}
            </div>
          )}

          {!isLoading && filteredHistory.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400">
              <svg
                className="w-16 h-16 mb-4 opacity-20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
              <p>没有找到相关历史记录</p>
              <p className="text-sm mt-2">开始使用 AI 功能来创建您的第一条记录</p>
            </div>
          )}
        </div>

        {/* 预览弹窗 */}
        {previewItem && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setPreviewItem(null)}
          >
            {/* 统一的浮动关闭按钮 */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setPreviewItem(null)}
              className="absolute top-6 right-6 md:top-10 md:right-10 z-[60] p-2 md:p-3 text-white/70 hover:text-white transition-all bg-white/10 hover:bg-white/20 rounded-full backdrop-blur-xl border border-white/20 group hover:scale-110 active:scale-95 shadow-2xl h-12 w-12"
              title="关闭预览"
            >
              <svg
                className="w-6 h-6 md:w-8 md:h-8 transform group-hover:rotate-90 transition-transform duration-300"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </Button>

            <div
              className="relative max-w-5xl w-full max-h-[90vh] bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-2xl flex flex-col md:flex-row transform animate-in zoom-in-95 duration-200 border border-white/10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* 左侧：图片容器 */}
              <div className="flex-1 bg-slate-100 dark:bg-slate-950 flex items-center justify-center overflow-hidden min-h-[300px] md:min-h-0">
                <img
                  src={previewItem.imageUrl}
                  alt={previewItem.title}
                  className="max-w-full max-h-full object-contain"
                />
              </div>

              {/* 右侧：信息面板 */}
              <div className="w-full md:w-80 flex flex-col bg-white dark:bg-slate-900 border-l border-slate-100 dark:border-slate-800">
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <Badge
                      variant="outline"
                      className="px-2.5 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs font-bold rounded-lg border-blue-200 dark:border-blue-800/50"
                    >
                      {previewItem.model}
                    </Badge>
                    <span className="text-xs text-slate-400 font-medium">{previewItem.date}</span>
                  </div>

                  <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-6 leading-tight">
                    {previewItem.title || '生成图片'}
                  </h2>

                  <div className="space-y-6">
                    <div>
                      <h3 className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-3">
                        Prompt 描述
                      </h3>
                      <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700/50 text-sm text-slate-600 dark:text-slate-300 rounded-2xl leading-relaxed italic">
                        “{previewItem.prompt}”
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-auto p-6 border-t border-slate-100 dark:border-slate-800 grid grid-cols-2 gap-3 bg-slate-50/50 dark:bg-slate-800/20">
                  <Button
                    variant="outline"
                    onClick={() => handleDownloadImage(previewItem)}
                    className="gap-2 bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-750 shadow-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                    下载
                  </Button>
                  <Button className="gap-2 bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-lg shadow-blue-500/25">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                      />
                    </svg>
                    分享
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        {/* 删除确认弹窗 */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>确认删除</DialogTitle>
              <DialogDescription>
                此操作无法撤销。这将永久删除该历史记录，如果您之前没有备份，数据将无法找回。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-4 gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                取消
              </Button>
              <Button variant="destructive" onClick={confirmDelete}>
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
