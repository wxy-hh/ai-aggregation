'use client';

import React, { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Clock,
  Compass,
  Image as ImageIcon,
  MessageSquare,
  Mic,
  Plus,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/lib/utils/history-helpers';
import {
  getHistoryItemHref,
  pickRecentHistoryItems,
  RECENT_CREATION_TYPE_META,
} from '@/lib/utils/recent-creation-nav';
import {
  useHistoryInitialized,
  useHistoryItems,
  useHistoryLoading,
  useConversationsStore,
} from '@/stores';
import type { HistoryItem, HistoryType, ImageHistoryItem } from '@/types/history';

const TYPE_ICONS: Record<HistoryType, React.ComponentType<{ className?: string }>> = {
  chat: MessageSquare,
  voice: Mic,
  image: ImageIcon,
  destiny: Compass,
};

type RecentCreationsSectionProps = {
  className?: string;
};

export function RecentCreationsSection({ className }: RecentCreationsSectionProps) {
  const router = useRouter();
  const items = useHistoryItems();
  const isInitialized = useHistoryInitialized();
  const isLoading = useHistoryLoading();
  const createConversation = useConversationsStore((state) => state.createConversation);

  const [previewImage, setPreviewImage] = useState<ImageHistoryItem | null>(null);

  const recentItems = useMemo(
    () => (isInitialized ? pickRecentHistoryItems(items, 3) : []),
    [isInitialized, items]
  );

  const handleOpenItem = useCallback(
    (item: HistoryItem) => {
      if (item.type === 'image') {
        setPreviewImage(item);
        return;
      }
      const href = getHistoryItemHref(item);
      if (href) router.push(href);
    },
    [router]
  );

  const handleNewProject = useCallback(() => {
    createConversation();
    router.push('/chat?new=true');
  }, [createConversation, router]);

  const showSkeleton = !isInitialized || (isLoading && recentItems.length === 0);

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-bold flex items-center gap-2 text-slate-900 dark:text-white">
            <Clock className="w-5 h-5 text-blue-500" />
            最近创作
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            来自统一历史记录，点击继续上次创作
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          asChild
        >
          <Link href="/history" className="flex items-center gap-1">
            查看全部
            <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory no-scrollbar sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4 sm:gap-4 lg:gap-6">
        {showSkeleton &&
          Array.from({ length: 3 }).map((_, index) => (
            <RecentCreationSkeleton key={`skeleton-${index}`} />
          ))}

        {!showSkeleton &&
          recentItems.map((item) => (
            <RecentCreationCard
              key={item.id}
              item={item}
              onOpen={() => handleOpenItem(item)}
            />
          ))}

        {!showSkeleton && recentItems.length === 0 && <RecentCreationEmpty />}

        <button
          type="button"
          onClick={handleNewProject}
          className={cn(
            'min-w-[240px] sm:min-w-0 snap-start shrink-0 sm:shrink',
            'flex min-h-[168px] flex-col items-center justify-center gap-3 rounded-2xl',
            'border border-dashed border-slate-200 dark:border-slate-700',
            'bg-white/40 dark:bg-slate-900/20',
            'text-slate-500 dark:text-slate-400',
            'transition-all duration-200',
            'hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-600',
            'dark:hover:border-blue-700 dark:hover:bg-blue-950/20 dark:hover:text-blue-400',
            'active:scale-[0.98]'
          )}
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm dark:bg-slate-800">
            <Plus className="h-5 w-5" />
          </span>
          <span className="text-sm font-medium">新建对话</span>
        </button>
      </div>

      <Dialog open={!!previewImage} onOpenChange={(open) => !open && setPreviewImage(null)}>
        <DialogContent className="max-w-3xl border-slate-200/80 bg-white/95 p-0 backdrop-blur-xl dark:border-slate-700/80 dark:bg-slate-900/95">
          {previewImage ? (
            <>
              <DialogHeader className="px-5 pt-5 pb-0">
                <DialogTitle className="line-clamp-1 text-left">{previewImage.title}</DialogTitle>
              </DialogHeader>
              <div className="px-5 pb-5 pt-3">
                <div className="overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-950">
                  <img
                    src={previewImage.imageUrl}
                    alt={previewImage.title}
                    className="max-h-[60vh] w-full object-contain"
                  />
                </div>
                <p className="mt-3 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">
                  {previewImage.prompt}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" asChild>
                    <Link href="/image">继续绘图</Link>
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/history">在历史中查看</Link>
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function RecentCreationCard({
  item,
  onOpen,
}: {
  item: HistoryItem;
  onOpen: () => void;
}) {
  const meta = RECENT_CREATION_TYPE_META[item.type];
  const Icon = TYPE_ICONS[item.type];
  const preview =
    'preview' in item && item.preview
      ? item.preview
      : item.type === 'destiny'
        ? (item as { profileSummary?: { name?: string } }).profileSummary?.name || '命理报告'
        : '暂无预览';

  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'min-w-[240px] sm:min-w-0 snap-start shrink-0 sm:shrink text-left',
        'group flex h-full flex-col overflow-hidden rounded-2xl',
        'border border-slate-200/80 dark:border-slate-800/80',
        'bg-white/70 dark:bg-slate-900/50 backdrop-blur-md',
        'shadow-sm transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_28px_-12px_rgba(59,130,246,0.22)]',
        'dark:hover:border-blue-800/60',
        'active:scale-[0.99]'
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden bg-slate-50 dark:bg-slate-950/80">
        {item.type === 'image' && 'imageUrl' in item && item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full flex-col justify-between p-4">
            <span className={cn('inline-flex w-fit rounded-full px-2 py-0.5 text-[10px] font-medium', meta.chip)}>
              {meta.label}
            </span>
            <p className="line-clamp-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {preview}
            </p>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-black/25 to-transparent" />

        <span
          className={cn(
            'absolute left-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur-md',
            item.type === 'image' ? 'bg-black/45 text-white' : meta.chip
          )}
        >
          <Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4 pt-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
          {item.title}
        </h3>
        <div className="mt-auto flex items-center justify-between gap-2 text-xs text-slate-400">
          <span>{formatRelativeTime(item.updatedAt || item.createdAt)}</span>
          <span className={cn('font-medium opacity-0 transition-opacity group-hover:opacity-100', meta.accent)}>
            继续
          </span>
        </div>
      </div>
    </button>
  );
}

function RecentCreationEmpty() {
  return (
    <div
      className={cn(
        'min-w-[280px] sm:min-w-0 snap-start shrink-0 sm:shrink sm:col-span-2 xl:col-span-3',
        'flex flex-col justify-center rounded-2xl border border-slate-200/70 dark:border-slate-800/70',
        'bg-white/50 dark:bg-slate-900/30 px-5 py-8 backdrop-blur-sm'
      )}
    >
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-500 dark:bg-blue-950/40">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">还没有创作记录</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        完成一次对话、语音转写或图像生成后，会在这里自动出现
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="outline" asChild>
          <Link href="/chat?new=true">去对话</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/voice">去转写</Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href="/image">去绘图</Link>
        </Button>
      </div>
    </div>
  );
}

function RecentCreationSkeleton() {
  return (
    <div className="min-w-[240px] sm:min-w-0 snap-start shrink-0 sm:shrink overflow-hidden rounded-2xl border border-slate-200/60 dark:border-slate-800/60 bg-white/60 dark:bg-slate-900/40">
      <div className="aspect-[16/10] animate-pulse bg-slate-100 dark:bg-slate-800/80" />
      <div className="space-y-2 p-4">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}

/** 侧边栏最近文件列表（同样来自统一历史） */
export function RecentFilesSidebarList() {
  const items = useHistoryItems();
  const isInitialized = useHistoryInitialized();
  const recentItems = useMemo(
    () => (isInitialized ? pickRecentHistoryItems(items, 4) : []),
    [isInitialized, items]
  );
  const router = useRouter();

  if (!isInitialized) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-9 animate-pulse rounded-lg bg-slate-100/80 dark:bg-slate-800/50" />
        ))}
      </div>
    );
  }

  if (recentItems.length === 0) {
    return (
      <p className="px-2 py-1 text-xs text-slate-400">暂无最近文件，开始创作后会出现在这里</p>
    );
  }

  return (
    <div className="space-y-1">
      {recentItems.map((item) => {
        const meta = RECENT_CREATION_TYPE_META[item.type];
        const Icon = TYPE_ICONS[item.type];
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              if (item.type === 'image') {
                router.push('/history');
                return;
              }
              const href = getHistoryItemHref(item);
              if (href) router.push(href);
            }}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-slate-100/80 dark:hover:bg-slate-800/50"
          >
            <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', meta.iconBg, meta.accent)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-600 dark:text-slate-300">{item.title}</span>
              <span className="block text-[10px] text-slate-400">{formatRelativeTime(item.updatedAt)}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
