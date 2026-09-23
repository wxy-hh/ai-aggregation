'use client';

/**
 * astrology-passport-header.tsx —— 星座寰宇宇宙护照微晶印鉴头组件
 *
 * 核心职责：
 * - 呈现天命档案微晶印鉴与入场扫描光动效；
 * - 呈现用户昵称、资料摘要、时间精度标签与夜幕观星模式开关；
 * - 自闭环「盘面依据」折叠展开状态（basisOpen），呈现回归黄道、分宫制与容许度口径。
 */

import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, Compass } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyChartFacts } from '@/lib/astrology/chart-facts';
import { ZODIAC_CN } from './astrology-chart-wheel';
import { ZodiacSignGlyph } from './astrology-glyphs';
import { AstrologyNightToggle } from './astrology-night-toggle';
import {
  birthSummary,
  houseSystemLabel,
  placementTermLine,
  precisionBadge,
} from '@/lib/astrology/presentation';

export type AstrologyPassportHeaderProps = {
  formData: AstrologyFormData;
  chartFacts: AstrologyChartFacts;
  reduceMotion?: boolean;
};

/** 计算时刻格式化（护照头「计算于」） */
function formatCalculatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * 宇宙护照头深组件
 */
export function AstrologyPassportHeader({
  formData,
  chartFacts,
  reduceMotion = false,
}: AstrologyPassportHeaderProps) {
  const [basisOpen, setBasisOpen] = useState(false);

  const name = formData.name.trim() || '星盘主人';
  const badge = precisionBadge(formData, chartFacts);
  const withHouses = chartFacts.dataCompleteness === 'with-houses';
  const sunPlacement = chartFacts.planets.find((p) => p.body === 'sun');

  return (
    <header className="night-card relative overflow-hidden rounded-[28px] border border-white/70 bg-gradient-to-br from-white/90 via-white/80 to-indigo-50/30 p-5 shadow-[0_20px_56px_-28px_rgba(30,41,82,0.22)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:from-white/[0.06] dark:via-white/[0.04] dark:to-indigo-950/20 sm:rounded-[32px] sm:p-6">
      {/* 玻璃壳顶端 1px 高光线 */}
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/20"
        aria-hidden="true"
      />
      {/* 背景微星轨经纬装饰线 */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full border border-indigo-400/10 dark:border-indigo-300/[0.06]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 rounded-full border border-indigo-400/15 dark:border-indigo-300/[0.08]"
      />
      {!reduceMotion && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-indigo-300/25 to-transparent dark:via-indigo-200/[0.12]"
          initial={{ x: '-140%' }}
          animate={{ x: '560%' }}
          transition={{ duration: 1.25, ease: 'easeOut', delay: 0.15 }}
        />
      )}
      <div className="relative">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200/80 bg-indigo-50/80 text-indigo-600 shadow-xs dark:border-indigo-300/20 dark:bg-indigo-400/10 dark:text-indigo-300">
              <Compass className="h-4 w-4" strokeWidth={2} />
            </span>
            <h1 className="font-heading text-xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-2xl">
              {name}的宇宙护照
            </h1>
          </div>
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide',
              badge.className
            )}
          >
            {badge.text}
          </span>
          {/* 夜幕观星切换：护照头行内右端 */}
          <div className="ml-auto">
            <AstrologyNightToggle />
          </div>
        </div>

        {/* 移动端突出太阳星座；桌面端展示完整摘要行 */}
        {sunPlacement?.sign && (
          <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-indigo-700 dark:text-indigo-200 xl:hidden">
            <ZodiacSignGlyph
              sign={sunPlacement.sign}
              width={16}
              height={16}
              className="stroke-indigo-500 dark:stroke-indigo-300"
            />
            太阳 · {ZODIAC_CN[sunPlacement.sign]}
          </p>
        )}

        <p className="mt-2 text-xs leading-relaxed text-slate-500 dark:text-night-muted sm:text-sm">
          {birthSummary(formData)}
          {formatCalculatedAt(chartFacts.calculatedAt) &&
            ` · 计算于 ${formatCalculatedAt(chartFacts.calculatedAt)}`}
        </p>

        {/* 盘面依据：折叠展开口径详情 */}
        <button
          type="button"
          onClick={() => setBasisOpen((v) => !v)}
          aria-expanded={basisOpen}
          className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
        >
          盘面依据
          <ChevronDown
            className={cn(
              'h-3.5 w-3.5 transition-transform duration-200',
              basisOpen && 'rotate-180'
            )}
            strokeWidth={2.2}
          />
        </button>

        <AnimatePresence initial={false}>
          {basisOpen && (
            <motion.div
              initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
              animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <dl className="mt-2 space-y-1.5 rounded-2xl bg-slate-50/90 p-4 text-xs leading-relaxed text-slate-600 dark:bg-[#090E20] dark:text-slate-300">
                {(['sun', 'moon', 'ascendant'] as const).map((k) => {
                  const term = placementTermLine(chartFacts, k);
                  if (!term) return null;
                  const label = k === 'sun' ? '太阳' : k === 'moon' ? '月亮' : '上升';
                  return (
                    <div key={k} className="flex gap-2">
                      <dt className="w-10 shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                        {label}
                      </dt>
                      <dd>{term}</dd>
                    </div>
                  );
                })}
                <div className="flex gap-2 border-t border-slate-200/70 pt-2 dark:border-white/[0.08]">
                  <dt className="w-10 shrink-0 font-semibold text-slate-700 dark:text-slate-200">
                    口径
                  </dt>
                  <dd>
                    回归黄道 · {withHouses ? houseSystemLabel(chartFacts) : '无宫位行星盘'}{' '}
                    · 容许度表 {chartFacts.orbTableVersion} · 引擎{' '}
                    {chartFacts.engineVersion} · 修订 {chartFacts.calculationRevision}
                  </dd>
                </div>
              </dl>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
}
