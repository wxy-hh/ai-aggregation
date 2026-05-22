'use client';

import React from 'react';
import xinggeIcon from '@/assets/image/xingge.svg';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { TenGodDomainKey, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';

const tenGodDomainStyles: Record<TenGodDomainKey, { color: string; track: string }> = {
  self: { color: '#6576F8', track: 'rgba(101, 118, 248, 0.2)' },
  expression: { color: '#7CA7FF', track: 'rgba(124, 167, 255, 0.2)' },
  wealth: { color: '#B9AEFF', track: 'rgba(185, 174, 255, 0.22)' },
  order: { color: '#95A7C8', track: 'rgba(149, 167, 200, 0.22)' },
  resource: { color: '#3F5DFF', track: 'rgba(63, 93, 255, 0.22)' },
};

export function PersonalityDashboardCard({
  tenGodDomains,
  className,
}: {
  tenGodDomains?: PartialDestinyReport['tenGodDomains'];
  className?: string;
}) {
  const hasData =
    tenGodDomains &&
    tenGodDomains.length === 5 &&
    tenGodDomains.every((item) => Boolean(item.description?.trim()));

  return (
    <GlassCard className={cn('p-6 min-h-[480px]', className)}>
      <div className="flex items-center gap-2">
        <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]" src={xinggeIcon} />
        <div className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
          性格与潜能仪表盘
        </div>
      </div>
      <p className="mt-1 text-xs text-slate-400">
        百分比为该领域十神能量在命局中的相对占比，不代表能力高低
      </p>

      <div className="mt-5 flex h-full min-h-[400px] flex-col gap-4">
        {hasData ? (
          tenGodDomains!.map((item) => {
            const palette = tenGodDomainStyles[item.key];
            return (
              <div
                key={item.key}
                className={cn(
                  'group rounded-[24px] border border-white/45 bg-white/52 px-4 py-4 backdrop-blur-[18px]',
                  'shadow-sm transition duration-200 hover:bg-white/66 hover:shadow-md'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-extrabold text-slate-700">
                      {item.label}
                      <span className="ml-1 text-slate-400">（{item.technicalLabel}）</span>
                    </div>
                  </div>
                  <div
                    className="shrink-0 text-sm font-black"
                    style={{ color: palette.color }}
                  >
                    {item.value}%
                  </div>
                </div>
                <div
                  className="mt-3 h-3 overflow-hidden rounded-full shadow-inner"
                  style={{ backgroundColor: palette.track }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(100, Math.max(0, item.value))}%`,
                      backgroundColor: palette.color,
                    }}
                  />
                </div>
                {item.positive && (
                  <p className="mt-3 text-[11px] leading-5 text-emerald-600 font-medium">
                    优势：{item.positive}
                  </p>
                )}
                {item.negative && (
                  <p className="mt-1 text-[11px] leading-5 text-amber-600">
                    规避：{item.negative}
                  </p>
                )}
                {/* 兜底：模型未返回 positive/negative 时显示 description */}
                {!item.positive && !item.negative && item.description && (
                  <p className="mt-3 text-[11px] leading-5 text-slate-400 transition-colors group-hover:text-slate-600">
                    {item.description}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <div data-testid="ten-god-domains-skeleton" className="space-y-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={`ten-god-domain-skeleton-${index}`}
                className="rounded-[24px] border border-white/45 bg-white/52 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="h-4 w-40 animate-pulse rounded bg-slate-200/70" />
                  <div className="h-4 w-10 animate-pulse rounded bg-slate-200/70" />
                </div>
                <div className="mt-3 h-3 animate-pulse rounded-full bg-slate-100" />
                <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200/70" />
                <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-200/70" />
              </div>
            ))}
          </div>
        )}
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
