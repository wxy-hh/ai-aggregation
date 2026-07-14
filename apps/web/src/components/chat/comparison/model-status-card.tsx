'use client';

/**
 * 模型状态卡 — 模型概览轨道中的单个模型摘要
 *
 * 展示：Provider 标识 + 模型名 + 状态点（带中文文字，满足无障碍）+ 耗时 + 聚焦描边 + 替换操作。
 * 遵循 DESIGN.md：G-2 玻璃卡片、柔光阴影、科技蓝聚焦环、8px 网格。
 */

import { memo } from 'react';
import {
  Check,
  Loader2,
  AlertCircle,
  Circle,
  Square,
  ArrowLeftToLine,
  ArrowRightToLine,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ModelRun, ModelRunStatus } from '@/types/comparison';

// 状态点 + 中文文案配置（颜色 + 文字双通道，避免只靠颜色区分）
const STATUS_CONFIG: Record<
  ModelRunStatus,
  { label: string; dot: string; text: string; spin?: boolean; pulse?: boolean }
> = {
  queued: { label: '等待发送', dot: 'bg-slate-300 dark:bg-slate-600', text: 'text-slate-400' },
  streaming: {
    label: '生成中',
    dot: 'bg-blue-500',
    text: 'text-blue-600 dark:text-blue-400',
    pulse: true,
  },
  completed: {
    label: '已完成',
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  failed: { label: '失败', dot: 'bg-rose-500', text: 'text-rose-600 dark:text-rose-400' },
  stopped: { label: '已停止', dot: 'bg-slate-400 dark:bg-slate-500', text: 'text-slate-500' },
};

// 状态图标
function StatusIcon({ status }: { status: ModelRunStatus }) {
  const cls = 'h-3.5 w-3.5';
  switch (status) {
    case 'streaming':
      return <Loader2 className={cn(cls, 'animate-spin text-blue-500')} />;
    case 'completed':
      return <Check className={cn(cls, 'text-emerald-500')} />;
    case 'failed':
      return <AlertCircle className={cn(cls, 'text-rose-500')} />;
    case 'stopped':
      return <Square className={cn(cls, 'text-slate-400')} />;
    default:
      return <Circle className={cn(cls, 'text-slate-300')} />;
  }
}

// 计算耗时展示（毫秒 → "X.X 秒"）
function formatDuration(run: ModelRun): string | null {
  if (run.status === 'completed' && run.startedAt && run.completedAt) {
    return `${((run.completedAt - run.startedAt) / 1000).toFixed(1)} 秒`;
  }
  return null;
}

interface ModelStatusCardProps {
  run: ModelRun;
  isFocused: boolean;
  focusedSlot?: 'left' | 'right';
  onReplace?: (slot: 'left' | 'right', modelKey: string) => void;
}

export const ModelStatusCard = memo(function ModelStatusCard({
  run,
  isFocused,
  focusedSlot,
  onReplace,
}: ModelStatusCardProps) {
  const cfg = STATUS_CONFIG[run.status];
  const duration = formatDuration(run);

  return (
    <div
      className={cn(
        'group relative flex min-w-[180px] flex-col gap-2 rounded-2xl p-3 transition-all duration-200',
        'border bg-white/60 backdrop-blur-xl dark:bg-slate-900/60',
        'shadow-[0_4px_12px_-2px_rgba(76,95,154,0.08)]',
        isFocused
          ? 'border-blue-400/60 ring-2 ring-blue-500/40 dark:border-blue-500/40 dark:ring-blue-500/30'
          : 'border-white/60 hover:border-slate-300/80 dark:border-white/10 dark:hover:border-slate-700/80'
      )}
    >
      {/* 聚焦角标：悬浮在卡片右上角边框外，不遮挡模型名 */}
      {isFocused && (
        <span className="absolute -top-2.5 right-3 z-10 rounded-full bg-gradient-to-r from-blue-600 to-indigo-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-[0_2px_6px_rgba(59,130,246,0.35)]">
          {focusedSlot === 'left' ? '左列' : '右列'}
        </span>
      )}

      {/* 头部：状态点 + 模型名 */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'h-2 w-2 shrink-0 rounded-full',
            cfg.dot,
            cfg.pulse && 'animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.6)]'
          )}
        />
        <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
          {run.label}
        </span>
      </div>

      {/* 状态行：图标 + 中文状态 + 耗时 */}
      <div className="flex items-center gap-1.5">
        <StatusIcon status={run.status} />
        <span className={cn('text-xs font-medium', cfg.text)}>{cfg.label}</span>
        {duration && <span className="text-[11px] text-slate-400">{duration}</span>}
        {run.status === 'failed' && run.error && (
          <span className="truncate text-[11px] text-rose-400" title={run.error}>
            {run.error.split('：')[1] ?? run.error}
          </span>
        )}
      </div>

      {/* 未聚焦：替换操作（明确文字，非纯图标） */}
      {!isFocused && onReplace && (
        <div className="mt-0.5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onReplace('left', run.modelKey)}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-white/60 bg-white/50 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-600 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-blue-500/15"
          >
            <ArrowLeftToLine className="h-3 w-3" />
            替换左列
          </button>
          <button
            type="button"
            onClick={() => onReplace('right', run.modelKey)}
            className="flex h-7 flex-1 items-center justify-center gap-1 rounded-lg border border-white/60 bg-white/50 text-[11px] font-medium text-slate-600 transition-colors hover:border-blue-300 hover:bg-blue-50/60 hover:text-blue-600 dark:border-white/10 dark:bg-slate-800/50 dark:text-slate-300 dark:hover:bg-blue-500/15"
          >
            <ArrowRightToLine className="h-3 w-3" />
            替换右列
          </button>
        </div>
      )}
    </div>
  );
});
