'use client';

import React, { useState } from 'react';
import { VideoHistoryItem } from '@/types/history';
import { Trash2, Play } from 'lucide-react';
import { DerivationBadge } from './derivation-badge';

interface VideoHistoryCardProps {
  item: VideoHistoryItem;
  onDelete?: (id: string) => void;
}

/**
 * 视频历史记录卡片组件（REQ-013）
 * 支持播放预览与删除，含接力派生来源展示
 */
export function VideoHistoryCard({ item, onDelete }: VideoHistoryCardProps) {
  const [videoError, setVideoError] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete?.(item.id);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white transition-all hover:border-blue-200 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800 dark:hover:border-blue-900">
      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        className="absolute right-3 top-3 z-10 rounded-lg bg-black/40 p-1.5 text-white/70 opacity-100 backdrop-blur-md transition-all hover:bg-red-500/30 hover:text-red-400 md:opacity-0 md:group-hover:opacity-100"
        title="删除"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      <div className="relative aspect-video overflow-hidden bg-slate-100 dark:bg-slate-900">
        {!videoError && item.videoUrl ? (
          <video
            src={item.videoUrl}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setVideoError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Play className="h-10 w-10 opacity-30" />
            <span className="text-xs font-medium opacity-50">视频已过期</span>
          </div>
        )}

        {/* 模型标签 */}
        <div className="absolute left-3 top-3">
          <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-[10px] font-medium text-white backdrop-blur-md">
            {item.model}
          </div>
        </div>

        {/* 日期标签 */}
        <div className="absolute right-3 top-3 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100">
          <span className="rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur-md">
            {item.date}
          </span>
        </div>
      </div>

      {/* 描述区域 */}
      <div className="p-4">
        <p className="line-clamp-2 text-sm font-medium leading-relaxed text-slate-600 dark:text-slate-300">
          {item.preview || item.prompt}
        </p>
        <DerivationBadge item={item} />
      </div>
    </div>
  );
}
