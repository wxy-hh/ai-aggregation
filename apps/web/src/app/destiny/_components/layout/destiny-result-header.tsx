'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** 命理结果页 G-3 玻璃容器（顶栏与大面板共用） */
export const destinyG3ShellClass = cn(
  'relative overflow-hidden rounded-[32px] border border-white/60',
  'bg-gradient-to-b from-white/60 via-white/30 to-white/10',
  'shadow-[0_20px_40px_-15px_rgba(59,130,246,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'backdrop-blur-xl lg:backdrop-blur-2xl',
  'bg-white/92 lg:from-white/60 lg:via-white/30 lg:to-white/10 lg:bg-transparent',
  'dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/30 dark:to-slate-900/10',
  'dark:bg-slate-900/92 lg:dark:bg-transparent'
);

/** 结果内容区略紧凑的 G-3 壳（奇门等分块内容） */
export const destinyG3ContentShellClass = cn(
  'relative overflow-hidden rounded-[24px] border border-white/60 p-4 backdrop-blur-xl sm:rounded-[28px] sm:p-5 md:p-6',
  'bg-gradient-to-b from-white/60 via-white/30 to-white/10',
  'shadow-[0_20px_40px_-15px_rgba(124,58,237,0.12),0_8px_20px_-10px_rgba(0,0,0,0.05)]',
  'dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/30 dark:to-slate-900/10',
  'dark:shadow-[0_14px_32px_rgba(0,0,0,0.28)]'
);

export const destinyPrimaryBtnClass = cn(
  'relative inline-flex min-h-11 shrink-0 items-center justify-center overflow-hidden rounded-full px-5 text-sm font-semibold text-white',
  'bg-gradient-to-r from-blue-600 to-indigo-600',
  'shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  'transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_12px_20px_-8px_rgba(59,130,246,0.25)]',
  'active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-950'
);

export const destinySecondaryBtnClass = cn(
  'min-h-11 rounded-full border border-slate-200/50 bg-white/40 px-4 text-sm font-semibold text-slate-700',
  'backdrop-blur-xl shadow-[0_1px_2px_0_rgba(0,0,0,0.03)]',
  'transition-all duration-200 hover:scale-[1.02] hover:bg-white/60',
  'dark:border-slate-800/50 dark:bg-slate-900/40 dark:text-slate-200 dark:hover:bg-slate-800/60'
);

export type DestinyResultModuleTone = 'blue' | 'violet' | 'indigo';

const MODULE_BADGE_CLASS: Record<DestinyResultModuleTone, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400',
};

export type DestinyResultHeaderProps = {
  /** 主标题（产品名或局名） */
  title: React.ReactNode;
  /** 模块徽章，如「八字格局精批」 */
  moduleBadge: string;
  tone?: DestinyResultModuleTone;
  /** 副标题一行说明 */
  subtitle?: React.ReactNode;
  /** 标题右侧附加控件（如奇门标题说明） */
  titleTrailing?: React.ReactNode;
  /** 副标题下方的状态徽章行 */
  metaChips?: React.ReactNode;
  onRecalculate?: () => void;
  recalculateLabel?: string;
  /** 主按钮左侧的次要操作（如八字「深度报告」） */
  leadingActions?: React.ReactNode;
  className?: string;
};

/** 八字 / 紫微 / 奇门 结果页统一顶栏 */
export function DestinyResultHeader({
  title,
  moduleBadge,
  tone = 'blue',
  subtitle,
  titleTrailing,
  metaChips,
  onRecalculate,
  recalculateLabel = '重新排盘',
  leadingActions,
  className,
}: DestinyResultHeaderProps) {
  return (
    <header
      className={cn(
        destinyG3ShellClass,
        'flex shrink-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-6',
        className
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20"
        aria-hidden
      />
      <div className="relative z-10 min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <h1 className="font-heading text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
            {title}
          </h1>
          {titleTrailing}
          <span
            className={cn(
              'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold',
              MODULE_BADGE_CLASS[tone]
            )}
          >
            {moduleBadge}
          </span>
        </div>
        {subtitle ? (
          <div className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{subtitle}</div>
        ) : null}
        {metaChips ? (
          <div className="mt-2.5 flex flex-wrap items-center gap-2">{metaChips}</div>
        ) : null}
      </div>

      {(leadingActions || onRecalculate) && (
        <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-2 sm:pt-0.5">
          {leadingActions}
          {onRecalculate ? (
            <Button type="button" onClick={onRecalculate} className={destinyPrimaryBtnClass}>
              <span
                className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/20"
                aria-hidden
              />
              {recalculateLabel}
            </Button>
          ) : null}
        </div>
      )}
    </header>
  );
}
