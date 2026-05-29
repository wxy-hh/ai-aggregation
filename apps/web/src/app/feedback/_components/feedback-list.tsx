'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { FeedbackItem } from '../page';
import { TYPE_CONFIG, STATUS_CONFIG, PRIORITY_CONFIG } from './feedback-constants';
import { MessageCircle, Pin, Loader2 } from 'lucide-react';

interface FeedbackListProps {
  items: FeedbackItem[];
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onSelect: (item: FeedbackItem) => void;
  isAdmin: boolean;
}

export function FeedbackList({
  items,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onSelect,
  isAdmin,
}: FeedbackListProps) {

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-[#5D7CFA] animate-spin" />
        <p className="mt-3 text-sm text-slate-400">加载中...</p>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center w-full py-20 text-center">
        <div className="w-16 h-16 rounded-3xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-4">
          <MessageCircle className="w-7 h-7 text-slate-400" />
        </div>
        <h3 className="text-base font-semibold text-slate-700 dark:text-slate-200">暂无反馈</h3>
        <p className="text-sm text-slate-400 mt-1 max-w-xs">
          还没有提交过反馈，点击右上角按钮提交第一条吧！
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const tcfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.OTHER;
        const scfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.PENDING;
        const pcfg = PRIORITY_CONFIG[item.priority] || PRIORITY_CONFIG.MEDIUM;
        const TypeIcon = tcfg.icon;

        return (
          <div
            key={item.id}
            onClick={() => onSelect(item)}
            className={cn(
              'group relative rounded-3xl p-5 cursor-pointer transition-all duration-300',
              'bg-white/80 dark:bg-[#1a1f3a]/60',
              'backdrop-blur-xl',
              'border border-white/60 dark:border-white/10',
              'hover:shadow-[0_8px_32px_rgba(93,124,250,0.12)]',
              'hover:border-[#CDD7FF]/60 dark:hover:border-[#6277E8]/40',
              'active:scale-[0.99]'
            )}
          >
            {/* 置顶标记 */}
            {item.isPinned && (
              <div className="absolute -top-0.5 -right-0.5">
                <div className="bg-gradient-to-r from-[#4969E9] to-[#7B8FFF] text-white px-2.5 py-0.5 rounded-bl-2xl rounded-tr-2xl text-[10px] font-bold shadow-md flex items-center gap-1">
                  <Pin className="w-2.5 h-2.5 fill-current" />
                  置顶
                </div>
              </div>
            )}

            <div className="flex items-start gap-3">
              {/* 类型图标 */}
              <div className={cn('w-10 h-10 rounded-2xl flex items-center justify-center shrink-0', tcfg.bg)}>
                <TypeIcon className={cn('w-5 h-5', tcfg.color)} />
              </div>

              <div className="flex-1 min-w-0">
                {/* 标题行 */}
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {item.title}
                  </h3>
                  <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full', scfg.bg)}>
                    <span className={cn('inline-block w-1.5 h-1.5 rounded-full mr-1', scfg.dot)} />
                    {scfg.label}
                  </span>
                  {(item.priority === 'HIGH' || item.priority === 'CRITICAL') && (
                    <span className={cn('text-[10px] font-semibold', pcfg.color)}>
                      {pcfg.label}优先级
                    </span>
                  )}
                </div>

                {/* 内容摘要 */}
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 line-clamp-2 leading-relaxed">
                  {item.content}
                </p>

                {/* 标签 */}
                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-medium"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* 底部信息 */}
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#4969E9] to-[#7B8FFF] flex items-center justify-center text-white text-[8px] font-bold">
                      {(item.user.name || item.user.username).charAt(0).toUpperCase()}
                    </div>
                    <span className="font-medium text-slate-500 dark:text-slate-400">{item.user.name || item.user.username}</span>
                    <span className="text-slate-300">·</span>
                    <span>{new Date(item.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <MessageCircle className="w-3.5 h-3.5" />
                    {item.replyCount}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      {/* 加载更多 */}
      {hasMore && (
        <div className="flex justify-center pt-6 pb-4">
          <button
            onClick={onLoadMore}
            disabled={loadingMore}
            className={cn(
              'px-8 py-3 rounded-2xl text-sm font-medium transition-all min-h-[48px]',
              'bg-white/80 dark:bg-[#1a1f3a]/60 backdrop-blur-md',
              'border border-[#E8ECF5] dark:border-[#2d3454]',
              'text-slate-500 dark:text-slate-400',
              'hover:bg-slate-50 dark:hover:bg-slate-800',
              'hover:border-[#7B8FFF]/40 hover:text-[#5D7CFA]',
              'active:scale-[0.98]',
              'disabled:opacity-50'
            )}
          >
            {loadingMore ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                加载中...
              </span>
            ) : (
              '加载更多'
            )}
          </button>
        </div>
      )}
      {!hasMore && items.length > 0 && (
        <p className="text-center text-xs text-slate-400 pt-6 pb-4">没有更多了</p>
      )}
    </div>
  );
}
