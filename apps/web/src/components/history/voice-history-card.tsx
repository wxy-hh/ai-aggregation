'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { VoiceHistoryItem } from '@/types/history';
import { Trash2 } from 'lucide-react';

interface VoiceHistoryCardProps {
  item: VoiceHistoryItem;
  onDelete?: (id: string) => void;
}

/**
 * 语音历史记录卡片组件
 * 点击后跳转到语音转写页面查看详细内容
 */
export function VoiceHistoryCard({ item, onDelete }: VoiceHistoryCardProps) {
  const router = useRouter();

  // 处理卡片点击，跳转到语音页面
  const handleClick = () => {
    // 使用 historyId 参数跳转到语音页面
    router.push(`/voice?historyId=${item.id}`);
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
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
              />
            </svg>
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{item.model}</span>
        </div>
        <span className="text-xs text-slate-400 mr-8">{item.date}</span>
      </div>

      <div className="flex items-center justify-between mb-2">
        <h3 className="text-base font-bold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
          {item.title}
        </h3>
        <span className="flex items-center gap-1 text-xs font-mono text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 px-1.5 py-0.5 rounded">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          {item.duration}
        </span>
      </div>

      {/* 波形可视化占位符 - 使用确定性高度避免 Hydration 错误 */}
      <div className="h-8 w-full flex items-end gap-0.5 mb-4 opacity-50 group-hover:opacity-100 transition-opacity">
        {Array.from({ length: 30 }).map((_, i) => {
          // 使用确定性的伪随机高度，基于索引计算
          const height = 20 + ((i * 17 + 7) % 80);
          return (
            <div
              key={i}
              className="flex-1 bg-blue-500 rounded-full"
              style={{ height: `${height}%` }}
            ></div>
          );
        })}
      </div>

      <div className="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 flex-1 mb-4">
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">
          <span className="font-bold text-slate-400 mr-1">摘要</span>
          {item.preview}
        </p>
      </div>
    </div>
  );
}
