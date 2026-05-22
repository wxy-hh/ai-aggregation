'use client';

import React, { type CSSProperties } from 'react';
import baziIcon from '@/assets/image/bazi.svg';
import { cn } from '@/lib/utils';
import type { DestinyCoreTone, DestinyProfile } from '../types';
import { GlassCard } from '../layout/glass-card';

export function CoreToneCard({
  coreTone,
  profile,
  className,
}: {
  coreTone?: DestinyCoreTone;
  profile?: DestinyProfile;
  className?: string;
}) {
  return (
    <GlassCard className={cn('shrink-0 overflow-hidden p-3 sm:p-4', className)}>
      <div className="relative flex items-start gap-3 sm:gap-4">
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
              {coreTone?.tag ?? '核心命理定调'}
            </span>
            {profile && (
              <span className="text-xs font-medium text-[#94A3B8]">
                {profile.name}
                {' · '}
                {profile.genderLabel}
                {' · '}
                {profile.birthText?.replace(/\(.*?\)/g, '').trim()}
              </span>
            )}
          </div>

          {/* 核心定调 headline */}
          <h2
            className={cn(
              'mt-2 break-words font-heading font-bold leading-[1.2] tracking-tight',
              'text-[1.25rem] sm:text-[1.5rem] lg:text-[1.75rem]',
              'text-[#23318C] dark:text-[#9BADFF]'
            )}
          >
            {coreTone?.headline ?? '正在推演你的人生底色'}
          </h2>

          {/* 一句话总结 */}
          {coreTone?.chartSummary && (
            <p className="mt-1 text-xs font-semibold text-[#64748B] sm:text-sm">
              {coreTone.chartSummary}
            </p>
          )}

          {/* 详细描述 */}
          {coreTone?.description && (
            <p className="mt-1.5 text-xs leading-5 text-[#475569] sm:text-[13px] sm:leading-6">
              {coreTone.description}
            </p>
          )}

          {/* 骨架描述 */}
          {!coreTone?.description && coreTone?.headline && (
            <div className="mt-1.5 space-y-1.5">
              <div className="h-3 w-full animate-pulse rounded bg-[#E2E8F0]/70" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-[#E2E8F0]/70" />
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
