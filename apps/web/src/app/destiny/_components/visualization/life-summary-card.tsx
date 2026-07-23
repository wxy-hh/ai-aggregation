'use client';

import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, HelpCircle } from 'lucide-react';
import renshengIcon from '@/assets/image/rensheng.svg';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { DestinyLifeDimension, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';
import { FiveElementRadar } from './five-element-radar';
import { resolveLifeDimensionsForDisplay } from './life-dimension-scores';
import {
  getLifeDimensionDisplaySummary,
  LIFE_DIMENSION_LEVEL_LABEL,
  LIFE_DIMENSION_META,
  rankLifeDimensionLevels,
  type LifeDimensionLevel,
} from './life-dimension-meta';

const LEVEL_BADGE_CLASS: Record<LifeDimensionLevel, string> = {
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  mid: 'bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  high: 'bg-[#EEF2FF] text-[#3C58D8] dark:bg-indigo-950/50 dark:text-indigo-300',
};

function LifeDimensionRow({
  dimension,
  level,
  maxValue,
  showInterpretation = true,
}: {
  dimension: DestinyLifeDimension;
  level: LifeDimensionLevel;
  maxValue: number;
  /** 为 false 且无 AI summary 时，仅展示场景说明与指数，避免与十神区块重复长文案 */
  showInterpretation?: boolean;
}) {
  const meta = LIFE_DIMENSION_META[dimension.key];
  const label = dimension.label?.trim() || meta.label;
  const barWidth = maxValue > 0 ? Math.max(8, Math.round((dimension.value / maxValue) * 100)) : 0;
  const aiSummary = dimension.summary?.trim();
  const summary =
    aiSummary || (showInterpretation ? getLifeDimensionDisplaySummary(dimension, level) : '');

  return (
    <article
      className={cn(
        'rounded-2xl border border-slate-200/55 bg-white/50 px-3 py-3',
        'dark:border-white/[0.07] dark:bg-slate-900/35',
        'sm:px-3.5 sm:py-3.5'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{label}</h3>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-bold leading-none',
                LEVEL_BADGE_CLASS[level]
              )}
            >
              {LIFE_DIMENSION_LEVEL_LABEL[level]}
            </span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{meta.hint}</p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-lg font-extrabold tabular-nums text-[#3C58D8] dark:text-[#9BADFF]">
            {dimension.value}
          </div>
          <div className="text-[10px] text-slate-400">相对指数</div>
        </div>
      </div>

      <div
        className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-slate-100/90 dark:bg-slate-800/80"
        role="presentation"
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#93AAFC] to-[#4969E9] transition-[width] duration-500"
          style={{ width: `${barWidth}%` }}
        />
      </div>

      {summary ? (
        <p className="mt-2.5 text-xs leading-5 text-slate-600 dark:text-slate-300">{summary}</p>
      ) : null}
    </article>
  );
}

export function LifeSummaryCard({
  lifeDimensions,
  lifeDimensionHighlights,
  baziBasis,
  hasTenGodSection = false,
  className,
}: {
  lifeDimensions?: PartialDestinyReport['lifeDimensions'];
  lifeDimensionHighlights?: PartialDestinyReport['lifeDimensionHighlights'];
  baziBasis?: PartialDestinyReport['baziBasis'];
  /** 上方已展示十神五域时，弱化重复解读 */
  hasTenGodSection?: boolean;
  className?: string;
}) {
  const [mappingOpen, setMappingOpen] = useState(false);

  const derivedDimensions = useMemo(
    () => resolveLifeDimensionsForDisplay({ lifeDimensions, baziBasis }),
    [lifeDimensions, baziBasis]
  );

  const levelByKey = useMemo(
    () => (derivedDimensions ? rankLifeDimensionLevels(derivedDimensions) : null),
    [derivedDimensions]
  );

  const maxValue = useMemo(
    () => (derivedDimensions ? Math.max(...derivedDimensions.map((d) => d.value), 1) : 1),
    [derivedDimensions]
  );

  const hasApiHighlights = Boolean(
    lifeDimensionHighlights?.strength?.trim() && lifeDimensionHighlights?.caution?.trim()
  );
  /** 十神区块已含分项优劣势时，不再重复展示五维「整体优势/留意」 */
  const showGlobalHighlights = hasApiHighlights && !hasTenGodSection;
  const showRowInterpretation = !hasTenGodSection;

  const strengthText = lifeDimensionHighlights?.strength?.trim() ?? '';
  const cautionText = lifeDimensionHighlights?.caution?.trim() ?? '';

  return (
    <GlassCard className={cn('p-4 sm:p-6', className)}>
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/60 bg-white/70 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
          <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]" src={renshengIcon} />
        </div>
        <div className="min-w-0">
          <div className="font-heading text-lg font-bold leading-tight text-slate-900 dark:text-slate-100">
            人生五维
          </div>
          <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">
            回答「精力更常落在哪」：由五行占比映射到事业、财运、健康、感情、智慧，与上方十神视角不同。
          </p>
        </div>
      </div>

      {derivedDimensions && levelByKey ? (
        <>
          {hasTenGodSection ? (
            <p className="mt-3 rounded-xl border border-slate-200/50 bg-slate-50/70 px-3 py-2 text-[11px] leading-5 text-slate-600 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-300 sm:text-xs">
              上方「十神」看做事习惯；这里「五维」看生活场景分配。两者可能不同频——例如财星占比不高，但事业维仍可能偏强。
            </p>
          ) : null}

          <div
            className="mt-3 rounded-2xl border border-[#4969E9]/15 bg-[#F6F8FF]/80 px-3 py-2.5 dark:border-indigo-500/20 dark:bg-indigo-950/25 sm:px-4 sm:py-3"
            role="note"
          >
            <div className="flex items-start gap-2">
              <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#4969E9] dark:text-indigo-400" />
              <div className="space-y-1.5 text-[11px] leading-5 text-slate-600 dark:text-slate-300 sm:text-xs sm:leading-5">
                <p>
                  <span className="font-bold text-slate-800 dark:text-slate-100">怎么读数字？</span>
                  指数只在五个维度之间做对比，表示相对活跃度，不是吉凶打分，也不是百分制成绩。
                </p>
                <p>
                  <span className="font-bold text-slate-800 dark:text-slate-100">偏高 / 偏低代表什么？</span>
                  「偏强」= 在你这张盘里更常成为发力点；「偏弱」= 相对不占主导，可与强项搭配，不必焦虑。
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-5">
            <div className="w-full shrink-0 lg:w-[248px]">
              <div className="rounded-2xl border border-slate-200/55 bg-white/45 px-3 py-3 dark:border-white/[0.07] dark:bg-slate-900/30 sm:px-4">
                <p className="text-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                  五维对比一览
                </p>
                <p className="mt-1 text-center text-[10px] leading-4 text-slate-400 dark:text-slate-500">
                  只看形状强弱，具体指数在右侧
                </p>
                <div className="relative mx-auto mt-3 h-[168px] w-full max-w-[220px] sm:h-[176px]">
                  <FiveElementRadar
                    data={derivedDimensions}
                    compact
                    showScores={false}
                    className="absolute inset-0 h-full w-full"
                  />
                </div>
              </div>
            </div>

            <div className="min-w-0 flex-1 space-y-2.5 sm:space-y-3">
              {derivedDimensions.map((dimension) => (
                <LifeDimensionRow
                  key={dimension.key}
                  dimension={dimension}
                  level={levelByKey.get(dimension.key) ?? 'mid'}
                  maxValue={maxValue}
                  showInterpretation={showRowInterpretation}
                />
              ))}
            </div>
          </div>

          <div className="mt-3 border-t border-slate-200/50 pt-3 dark:border-white/10">
            <button
              type="button"
              onClick={() => setMappingOpen((open) => !open)}
              className="flex w-full min-h-[44px] items-center justify-between gap-2 rounded-xl px-1 py-2 text-left text-xs font-semibold text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
              aria-expanded={mappingOpen}
            >
              <span>五行与五维是怎么对应的？</span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform duration-200',
                  mappingOpen && 'rotate-180'
                )}
              />
            </button>
            {mappingOpen ? (
              <ul className="mt-1 space-y-1.5 px-1 text-[11px] leading-5 text-slate-500 dark:text-slate-400 sm:text-xs">
                <li>火 → 事业：行动、目标与职场节奏</li>
                <li>金 → 财运：资源、收入与掌控感</li>
                <li>木 → 健康：精力、恢复与身心耐受</li>
                <li>土 → 感情：亲密、稳定与情绪连结</li>
                <li>水 → 智慧：学习、思考与创意输出</li>
              </ul>
            ) : null}
          </div>

          {showGlobalHighlights ? (
            <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-200/70 bg-gradient-to-r from-emerald-50/60 to-emerald-50/20 px-3 py-2.5 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500 sm:h-5 sm:w-5" />
                <div className="text-xs leading-6 text-slate-600 sm:text-sm sm:leading-7">
                  <span className="font-extrabold text-emerald-700">五维小结 · 优势：</span>
                  {strengthText}
                </div>
              </div>
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50/60 to-amber-50/20 px-3 py-2.5 sm:gap-3 sm:rounded-2xl sm:px-4 sm:py-3">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500 sm:h-5 sm:w-5" />
                <div className="text-xs leading-6 text-slate-600 sm:text-sm sm:leading-7">
                  <span className="font-extrabold text-amber-700">五维小结 · 留意：</span>
                  {cautionText}
                </div>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div
          data-testid="life-dimensions-skeleton"
          className="mt-6 flex min-h-[240px] flex-col justify-between sm:min-h-[360px]"
        >
          <div className="flex flex-col gap-3 lg:flex-row">
            <div className="mx-auto h-[220px] w-full max-w-[248px] animate-pulse rounded-2xl bg-slate-100/80 dark:bg-slate-800/60 lg:shrink-0" />
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={index}
                  className="h-[88px] animate-pulse rounded-2xl bg-slate-100/80 dark:bg-slate-800/60"
                />
              ))}
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
