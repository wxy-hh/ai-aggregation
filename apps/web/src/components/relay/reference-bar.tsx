'use client';

/**
 * ReferenceBar — 目标页引用条（REQ-004/005/006/014/015）
 *
 * 展示来源类型 + 标题 + 摘要/缩略图 + 「查看来源」「移除」。
 * 状态：默认 / 来源删除（隐藏查看来源 + 提示快照可用）/ 替换确认 / 恢复中骨架 / 媒体失效。
 * 草稿可编辑、快照不可改；到达不自动执行。
 */

import { FileText, Image as ImageIcon, Mic, Video, Sparkles, Eye, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RELAY_COPY } from '@/lib/relay/copy';
import type { RelayBundle } from '@repo/shared';

const TYPE_ICON = {
  text: FileText,
  transcript: Mic,
  image: ImageIcon,
  video: Video,
  destiny_report_section: Sparkles,
} as const;

const TYPE_LABEL = {
  text: '文本',
  transcript: '转写',
  image: '图片',
  video: '视频',
  destiny_report_section: '命理段落',
} as const;

export interface ReferenceBarProps {
  bundle: RelayBundle;
  /** 查看来源（来源已删除时不显示） */
  onViewSource?: () => void;
  /** 移除引用（只解来源，不清草稿） */
  onRemove: () => void;
  /** 目标字段已有内容时，显式「填入…」（不自动覆盖） */
  onFill?: () => void;
  /** 「填入…」按钮文案（默认「填入输入框」，图像用「填入 Prompt」） */
  fillLabel?: string;
  /** 是否显示「填入…」（目标字段非空时为 true） */
  showFill?: boolean;
  /** 替换确认态 */
  isReplaceCandidate?: boolean;
  onConfirmReplace?: () => void;
  onCancelReplace?: () => void;
  className?: string;
}

export function ReferenceBar({
  bundle,
  onViewSource,
  onRemove,
  onFill,
  fillLabel,
  showFill,
  isReplaceCandidate,
  onConfirmReplace,
  onCancelReplace,
  className,
}: ReferenceBarProps) {
  const item = bundle.items[0];
  if (!item) return null;

  const sourceDeleted = !item.sourceId;
  const mediaInvalid = item.mediaInvalid === true;
  const Icon = TYPE_ICON[item.sourceType];
  const copy = RELAY_COPY.referenceBar;

  // 替换确认态
  if (isReplaceCandidate) {
    return (
      <div
        role="alertdialog"
        aria-label={copy.replaceTitle}
        className={cn(
          'rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-500/30 dark:bg-amber-500/10',
          className,
        )}
      >
        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">{copy.replaceTitle}</p>
        <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">{copy.replaceDesc}</p>
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            onClick={onConfirmReplace}
            className="min-h-[44px] rounded-lg bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700"
          >
            {copy.replaceConfirm}
          </button>
          <button
            type="button"
            onClick={onCancelReplace}
            className="min-h-[44px] rounded-lg border border-amber-300 px-4 text-sm text-amber-800 hover:bg-amber-100 dark:border-amber-500/40 dark:text-amber-200 dark:hover:bg-amber-500/20"
          >
            {copy.replaceCancel}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      role="region"
      aria-label={`${RELAY_COPY.action}引用：${item.sourceTitle}`}
      className={cn(
        // Z-3 悬浮指令层：G-2 玻璃 + 顶部 1px 高光 + Z-2 柔光阴影（DESIGN.md §2.1 / §3.1）
        'relative flex items-center gap-3 overflow-hidden rounded-xl border px-3 py-2',
        'border-white/60 bg-white/60 backdrop-blur-xl',
        'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)]',
        'dark:border-white/10 dark:bg-slate-900/60',
        className,
      )}
    >
      {/* 顶部 1px 高光切线 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/60 dark:bg-white/10"
      />

      {/* 来源缩略图 / 类型图标（蓝色光晕方块，对齐 DESIGN.md §8.3 图标容器） */}
      {item.snapshotMediaUrl && !mediaInvalid ? (

        <img
          src={item.snapshotMediaUrl}
          alt={item.sourceTitle}
          className="h-10 w-10 flex-none rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-10 w-10 flex-none items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
      )}

      {/* 来源信息 */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-slate-400">
          <span>{TYPE_LABEL[item.sourceType]}</span>
          {item.sourceModel && <span className="truncate">· {item.sourceModel}</span>}
        </div>
        <p className="truncate text-sm text-slate-700 dark:text-slate-200">
          {item.snapshotText || item.sourceTitle}
        </p>
        {sourceDeleted && <p className="text-[11px] text-slate-400">{copy.sourceDeleted}</p>}
        {mediaInvalid && <p className="text-[11px] text-amber-600 dark:text-amber-400">{copy.mediaInvalid}</p>}
      </div>

      {/* 操作 */}
      <div className="flex flex-none items-center gap-1">
        {showFill && onFill && (
          <button
            type="button"
            onClick={onFill}
            className={cn(
              // 主按钮：蓝色渐变 + 蓝色发光悬浮阴影（DESIGN.md §8.1 primary）
              'min-h-[44px] rounded-lg px-3 text-xs font-semibold text-white',
              'bg-gradient-to-r from-blue-600 to-indigo-600',
              'shadow-md shadow-blue-500/15 transition-all duration-200',
              'hover:shadow-lg hover:shadow-blue-500/25 hover:brightness-110 active:scale-[0.98]',
            )}
          >
            {fillLabel ?? copy.fillInput}
          </button>
        )}
        {!sourceDeleted && onViewSource && (
          <button
            type="button"
            onClick={onViewSource}
            aria-label={copy.viewSource}
            title={copy.viewSource}
            className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <Eye className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          onClick={onRemove}
          aria-label={copy.remove}
          title={copy.remove}
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
