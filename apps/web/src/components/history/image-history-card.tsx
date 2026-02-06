'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ImageHistoryItem } from '@/types/history';
import { Trash2 } from 'lucide-react';

interface ImageHistoryCardProps {
  item: ImageHistoryItem;
  onPreview?: (item: ImageHistoryItem) => void;
  onDelete?: (id: string) => void;
}

/**
 * 图片历史记录卡片组件
 * 支持预览、下载和删除功能
 */
export function ImageHistoryCard({ item, onPreview, onDelete }: ImageHistoryCardProps) {
  const [imageError, setImageError] = useState(false);

  // 处理图片下载
  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
  };

  // 处理删除
  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onDelete) {
      onDelete(item.id);
    }
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-700 hover:shadow-lg hover:border-blue-200 dark:hover:border-blue-900 transition-all cursor-pointer group h-full flex flex-col relative">
      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        className="absolute top-3 right-12 z-10 p-1.5 bg-black/40 backdrop-blur-md rounded-lg text-white/70 hover:text-red-400 hover:bg-red-500/30 transition-all opacity-0 group-hover:opacity-100"
        title="删除"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>

      <div className="aspect-square relative overflow-hidden bg-slate-100 dark:bg-slate-900">
        {/* 使用 img 标签显示图片，支持 base64 和 URL */}
        {!imageError && item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt={item.title || '生成的图片'}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-2">
            <svg
              className="w-12 h-12 opacity-30"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span className="text-xs font-medium opacity-50">图片已过期</span>
          </div>
        )}

        {/* 悬浮操作栏 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-4">
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 bg-white/20 backdrop-blur-md rounded-lg text-white hover:bg-white/30 transition-colors"
              title="下载"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onPreview?.(item);
              }}
              className="p-2 bg-white/20 backdrop-blur-md rounded-lg text-white hover:bg-white/30 transition-colors"
              title="预览"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* 模型标签 */}
        <div className="absolute top-3 left-3">
          <div className="flex items-center gap-1.5 px-2 py-1 bg-black/40 backdrop-blur-md rounded-lg text-white text-[10px] font-medium border border-white/10">
            <svg
              className="w-3 h-3 text-purple-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            {item.model}
          </div>
        </div>

        {/* 日期标签 */}
        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
          <span className="text-[10px] text-white/80 bg-black/40 backdrop-blur-md px-1.5 py-0.5 rounded">
            {item.date}
          </span>
        </div>
      </div>

      {/* 描述区域 */}
      <div className="p-4 flex-1">
        <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2 leading-relaxed font-medium">
          {item.preview || item.prompt}
        </p>
      </div>
    </div>
  );
}
