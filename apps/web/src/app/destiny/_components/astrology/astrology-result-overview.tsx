'use client';

/**
 * 星座寰宇 · 结果总览
 *
 * 「先生活语言、后专业证据」：一句主轴 → 大三要素/核心要素 → 五个生活模块 →
 * 本周行动三角。桌面 ≥960px 时主内容 8 栏 + 洞察轨 4 栏；不足时单列。
 * 未知/约时不稳定时不渲染上升占位，标题切换为「核心要素」。
 */

import React from 'react';
import { motion, useReducedMotion, type Variants } from 'framer-motion';
import { Sun, Moon, Sunrise, Compass, Heart, Briefcase, Sparkles, CalendarRange } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAstrologyWorkspaceStore } from '@/stores/astrology-workspace-store';
import { AstrologyPassportHeader } from './astrology-passport-header';
import { AstrologyModuleCard } from './astrology-module-card';
import type { AstrologyReport, ChartFacts } from './astrology-types';

const MODULE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  self: Compass,
  relationship: Heart,
  love: Heart,
  career: Briefcase,
  spirit: Sparkles,
  wealth: Sparkles,
  health: Sparkles,
  study: Sparkles,
};

type AstrologyResultOverviewProps = {
  chartFacts: ChartFacts;
  report: AstrologyReport;
  className?: string;
};

export function AstrologyResultOverview({ chartFacts, report, className }: AstrologyResultOverviewProps) {
  const reduceMotion = useReducedMotion();
  const formData = useAstrologyWorkspaceStore((s) => s.formData);
  const hasHouses = chartFacts.houses.length > 0;
  const timePrecision = formData.timePrecision;

  const bigThree = chartFacts.bigThree;
  // 大三要素卡：含宫位时太阳/月亮/上升三张；无宫位时仅稳定可计算项（太阳/月亮）
  const elementCards = [
    { key: 'sun', label: '太阳', sub: '核心驱动力', sign: bigThree.sun, icon: Sun, color: 'text-amber-500' },
    { key: 'moon', label: '月亮', sub: '情绪安全感', sign: bigThree.moon, icon: Moon, color: 'text-indigo-400' },
    ...(hasHouses
      ? [{ key: 'ascendant', label: '上升', sub: '他人初见的你', sign: bigThree.ascendant, icon: Sunrise, color: 'text-cyan-500' }]
      : []),
  ];

  const container: Variants = reduceMotion
    ? { hidden: {}, show: {} }
    : { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
  const item: Variants = reduceMotion
    ? { hidden: {}, show: {} }
    : { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

  return (
    <div className={cn('space-y-4 sm:space-y-6', className)}>
      {/* 宇宙护照头 */}
      <AstrologyPassportHeader
        name={formData.name}
        timePrecision={timePrecision}
        chartFacts={chartFacts}
      />

      {/* 一句主轴 */}
      {report.coreTone && (
        <motion.div
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-[24px] border border-white/60 bg-gradient-to-br from-white/60 via-white/30 to-white/10 p-5 backdrop-blur-xl sm:p-6 dark:border-white/10 dark:from-slate-900/60 dark:via-slate-900/30 dark:to-slate-900/10"
        >
          <p className="font-heading text-lg font-bold leading-snug text-slate-900 sm:text-xl dark:text-slate-100">
            {report.coreTone}
          </p>
        </motion.div>
      )}

      {/* 大三要素 / 核心要素 */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {hasHouses ? '大三要素' : '核心要素'}
          </h3>
          {!hasHouses && (
            <span className="text-[11px] text-slate-400">当前资料范围已隐藏上升、天顶与宫位</span>
          )}
        </div>
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className={cn('grid gap-3', elementCards.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2')}
        >
          {elementCards.map((card) => {
            const Icon = card.icon;
            return (
              <motion.div
                key={card.key}
                variants={item}
                className="relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08)] dark:border-white/10 dark:bg-slate-900/92"
              >
                <div className="flex items-center gap-2">
                  <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800/60', card.color)}>
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="text-xs font-medium text-slate-400">{card.sub}</div>
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-100">
                      {card.label}落{card.sign.label}
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      </section>

      {/* 五个生活模块 */}
      {report.readings.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            生活模块
          </h3>
          <div className="grid gap-3 sm:gap-4 lg:grid-cols-2">
            {report.readings.map((reading, i) => {
              const Icon = MODULE_ICONS[reading.key] ?? Compass;
              return (
                <AstrologyModuleCard
                  key={reading.key + i}
                  title={reading.title}
                  icon={<Icon className="h-4 w-4" />}
                  summary={reading.summary}
                  tags={reading.highlights}
                  basis={reading.caution ? [reading.caution] : []}
                  defaultOpen={i < 3}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 本周行动三角 */}
      {report.transits.length > 0 && (
        <section>
          <h3 className="mb-3 flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <CalendarRange className="h-4 w-4" />
            本周宇宙提示
          </h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {report.transits.slice(0, 3).map((transit, i) => {
              const labels = ['机会', '留意', '行动'];
              const colors = [
                'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
                'border-amber-500/25 bg-amber-500/5 text-amber-700 dark:text-amber-300',
                'border-blue-500/25 bg-blue-500/5 text-blue-700 dark:text-blue-300',
              ];
              return (
                <div
                  key={i}
                  className={cn('rounded-2xl border p-4', colors[i % 3].split(' ').slice(0, 2).join(' '), 'dark:border-white/10')}
                >
                  <div className={cn('text-xs font-bold', colors[i % 3].split(' ').slice(2).join(' '))}>
                    {labels[i] ?? transit.title}
                  </div>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                    {transit.opportunities[0] ?? transit.summary}
                  </p>
                  <div className="mt-2 text-[10px] text-slate-400">{transit.period}</div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
