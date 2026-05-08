'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { ChatHistoryItem } from '@/types/history';
import { Trash2 } from 'lucide-react';

interface ChatHistoryCardProps {
  item: ChatHistoryItem;
  onDelete?: (id: string) => void;
}

/**
 * 对话历史记录卡片组件
 * 点击后跳转到对话页面查看详细内容
 */
export function ChatHistoryCard({ item, onDelete }: ChatHistoryCardProps) {
  const router = useRouter();

  // 处理卡片点击，跳转到对话页面
  const handleClick = () => {
    // 使用 historyId 参数跳转到对话页面
    router.push(`/chat?historyId=${item.id}`);
  };

  // 处理删除
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(item.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className="bg-white dark:bg-slate-800 rounded-2xl p-4 sm:p-6 border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group flex flex-col h-full relative"
    >
      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        className="absolute top-4 right-4 p-1.5 bg-slate-100 dark:bg-slate-700 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 transition-all opacity-100 md:opacity-0 md:group-hover:opacity-100"
        title="删除"
      >
        <Trash2 className="w-4 h-4" />
      </button>

      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
              />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.model}</span>
        </div>
        <span className="text-xs text-slate-400 mr-8">{item.date}</span>
      </div>

      <h3 className="text-base font-bold text-slate-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
        {item.title}
      </h3>

      <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3 mb-4 flex-1">
        {item.preview}
      </p>

      <div className="flex items-center gap-2 mt-auto">
        {item.tags?.map((tag) => (
          <span
            key={tag}
            className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 text-xs rounded-md"
          >
            {tag}
          </span>
        ))}
      </div>
    </div>
  );
}
