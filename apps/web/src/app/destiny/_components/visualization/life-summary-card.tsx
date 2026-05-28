'use client';

import React, { useMemo } from 'react';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import renshengIcon from '@/assets/image/rensheng.svg';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { DestinyModule, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';
import { FiveElementRadar } from './five-element-radar';
import { resolveLifeDimensionsForDisplay } from './life-dimension-scores';

export function LifeSummaryCard({
  lifeDimensions,
  lifeDimensionHighlights,
  baziBasis,
  personalityModule,
  className,
}: {
  lifeDimensions?: PartialDestinyReport['lifeDimensions'];
  lifeDimensionHighlights?: PartialDestinyReport['lifeDimensionHighlights'];
  baziBasis?: PartialDestinyReport['baziBasis'];
  personalityModule?: DestinyModule;
  className?: string;
}) {
  const derivedDimensions = useMemo(
    () => resolveLifeDimensionsForDisplay({ lifeDimensions, baziBasis }),
    [lifeDimensions, baziBasis]
  );

  // 从 bias 推导强度/谨慎
  const hasHighlights = Boolean(
    lifeDimensionHighlights?.strength?.trim() && lifeDimensionHighlights?.caution?.trim()
  );

  // 使用性模块描述作为降级亮点
  const strengthText = useMemo(() => {
    if (hasHighlights) return lifeDimensionHighlights!.strength;
    if (personalityModule?.bullets?.length) {
      return personalityModule.bullets.slice(0, 2).join('；');
    }
    return '命局五行偏枯，建议结合大运走势综合分析优势方向。';
  }, [hasHighlights, lifeDimensionHighlights, personalityModule]);

  const cautionText = useMemo(() => {
    if (hasHighlights) return lifeDimensionHighlights!.caution;
    if (personalityModule?.bullets && personalityModule.bullets.length > 2) {
      return personalityModule.bullets.slice(2, 4).join('；');
    }
    return '注意平衡五行，避免过度追求某一方面而忽略整体协调。';
  }, [hasHighlights, lifeDimensionHighlights, personalityModule]);

  return (
    <GlassCard className={cn('p-4 sm:p-6 min-h-0 sm:min-h-[480px]', className)}>
      <div className="flex items-start gap-2">
        <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]" src={renshengIcon} />
        <div className="min-w-0">
          <div className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
            人生五维摘要
          </div>
          <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
            基于排盘五行在命局中的占比，映射到事业、财运、健康、感情、智慧五个领域的
            <span className="font-semibold text-slate-600 dark:text-slate-300">相对能量指数</span>
            （非吉凶打分）。图形展示维度之间的强弱对比。
          </p>
        </div>
      </div>

      {derivedDimensions ? (
        <>
          <div className="mt-3 sm:mt-4 flex min-h-[240px] sm:min-h-[288px] flex-col items-center justify-center gap-3">
            <FiveElementRadar data={derivedDimensions} showScores />
          </div>

          <div className="mt-4 sm:mt-6 space-y-3 sm:space-y-4">
            {/* 优势点：绿色 */}
            <div className="flex items-start gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/60 to-emerald-50/20 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
              <CheckCircle2 className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-emerald-500" />
              <div className="text-xs sm:text-sm leading-6 sm:leading-7 text-slate-600">
                <span className="font-extrabold text-emerald-700">优势点：</span>
                {strengthText}
              </div>
            </div>
            {/* 规避点：橙色 */}
            <div className="flex items-start gap-2.5 sm:gap-3 rounded-xl sm:rounded-2xl border border-amber-200/70 bg-gradient-to-r from-amber-50/60 to-amber-50/20 px-3 sm:px-4 py-2.5 sm:py-3 shadow-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 sm:h-5 sm:w-5 shrink-0 text-amber-500" />
              <div className="text-xs sm:text-sm leading-6 sm:leading-7 text-slate-600">
                <span className="font-extrabold text-amber-700">规避点：</span>
                {cautionText}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div
          data-testid="life-dimensions-skeleton"
          className="mt-6 flex min-h-[240px] sm:min-h-[400px] flex-col justify-between"
        >
          <div className="mx-auto h-[288px] w-full max-w-[320px] animate-pulse rounded-[32px] bg-slate-100/80 dark:bg-slate-800/60" />
          <div className="space-y-4">
            <div className="rounded-2xl border border-white/45 dark:border-white/5 bg-white/52 dark:bg-slate-800/40 p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
              <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
            </div>
            <div className="rounded-2xl border border-white/45 dark:border-white/5 bg-white/52 dark:bg-slate-800/40 p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
              <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
              <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/60" />
            </div>
          </div>
        </div>
      )}
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
