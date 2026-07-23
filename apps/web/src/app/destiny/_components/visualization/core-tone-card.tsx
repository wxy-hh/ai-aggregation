'use client';

import React, { type CSSProperties } from 'react';
import baziIcon from '@/assets/image/bazi.svg';
import { cn } from '@/lib/utils';
import { resolveCoreToneDisplay } from '@/lib/destiny/core-tone-display';
import type { DestinyCoreTone } from '../types';
import { GlassCard } from '../layout/glass-card';

export function CoreToneCard({
  coreTone,
  className,
}: {
  coreTone?: DestinyCoreTone;
  className?: string;
}) {
  const display = resolveCoreToneDisplay(coreTone);

  return (
    <GlassCard variant="hero" className={cn('shrink-0 p-4 sm:p-5', className)}>
      <div className="relative z-10 flex items-start gap-3 sm:gap-4">
        {/* 左侧：图标区 */}
        <div className="shrink-0">
          <div
            className={cn(
              'flex h-9 w-9 items-center justify-center rounded-xl',
              'border border-white/60 bg-white/78 shadow-[0_8px_20px_-16px_rgba(47,107,255,0.35)]',
              'dark:border-white/[0.08] dark:bg-[#1E293B]/60',
              'sm:h-10 sm:w-10'
            )}
          >
            <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]/70 sm:h-5 sm:w-5" src={baziIcon} />
          </div>
        </div>

        {/* 右侧：内容区 - 左对齐，充分利用宽度 */}
        <div className="min-w-0 flex-1">
          {/* 标签 + 基础摘要 */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex w-fit items-center rounded-full bg-[#F3F6FF] px-2.5 py-0.5',
                'text-[11px] font-bold text-[#3C58D8]',
                'border border-[#C9D4FF]/80 dark:bg-[#1E2A55] dark:text-[#9BADFF] dark:border-[#3144B7]/40'
              )}
            >
              {coreTone?.tag ?? '一句话看懂'}
            </span>
            {display.patternLabel ? (
              <span
                className={cn(
                  'inline-flex max-w-full items-center rounded-full px-2 py-0.5',
                  'text-[10px] font-medium text-slate-500',
                  'border border-slate-200/80 bg-slate-50/90 dark:border-white/10 dark:bg-slate-800/60 dark:text-slate-400'
                )}
                title="专业格局称谓，仅供参考"
              >
                术语：{display.patternLabel}
              </span>
            ) : null}
          </div>

          {/* 主标题：大白话 */}
          <h2
            className={cn(
              'mt-2 break-words font-heading font-bold leading-[1.2] tracking-tight',
              'text-[1.25rem] sm:text-[1.5rem] lg:text-[1.75rem]',
              'bg-gradient-to-r from-blue-700 via-indigo-600 to-indigo-500 bg-clip-text text-transparent',
              'dark:from-blue-300 dark:via-indigo-300 dark:to-indigo-400'
            )}
          >
            {display.primaryTitle}
          </h2>

          {/* 乾造等基础摘要 */}
          {display.chartSummary ? (
            <p className="mt-1 text-xs font-semibold text-[#64748B] sm:text-sm">
              {display.chartSummary}
            </p>
          ) : null}

          {/* 详细描述（已从主标题抽离白话句时仍展示全文） */}
          {display.description ? (
            <div className="mt-3 rounded-2xl border border-slate-200/70 bg-white/92 px-3 py-2.5 dark:border-white/10 dark:bg-slate-950/50">
              <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                {display.description}
              </p>
            </div>
          ) : null}

          {/* 骨架描述 */}
          {!display.description && coreTone?.headline && (
             <div className="mt-1.5 space-y-1.5">
              <div className="h-3 w-full animate-pulse rounded bg-[#E2E8F0]/70 dark:bg-slate-700/60" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#E2E8F0]/70 dark:bg-slate-700/60" />
            </div>
          )}
        </div>
      </div>
    </GlassCard>
  );
}

function AssetToneIcon({ className, src }: { className?: string; src: { src: string } }) {
  const maskStyle = {
    WebkitMaskImage: `url(${src.src})`,
    maskImage: `url(${src.src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  } satisfies CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 bg-current', className)}
      style={maskStyle}
    />
  );
}
