'use client';

/**
 * astrology-summary-section.tsx —— 结果页主栏首屏段落（护照头 + 主轴金句 + 大三要素 + 移动端本周行动入口）
 *
 * 承接首屏主栏（8 栏）全部内容：
 * 1. 宇宙护照头（天命档案印鉴与资料依据）
 * 2. 一句主轴（阅读焦点；逐字机自持驱动依据与三卡落定）
 * 3. 大三要素（太阳/月亮/上升三卡排版，支持降级自适应）
 * 4. 移动端本周行动入口（紧随大三要素，定位至下方行动三角）
 */

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ChevronRight,
  Footprints,
  Moon as MoonIcon,
  Sunrise,
  Sun as SunIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AstrologyChartFacts, PlanetBody } from '@/lib/astrology/chart-facts';
import type {
  AstrologyInterpretationReport,
  ModuleId,
  ModuleReading,
} from '@/lib/astrology/interpretation';
import {
  ASPECT_CN,
  PLANET_CN,
  ZODIAC_CN,
} from './astrology-chart-wheel';
import { AstrologyPassportHeader, placementTermLine } from './astrology-passport-header';
import { AstrologyInterpretationNotice } from './astrology-interpretation-notice';
import { TypewriterHeadline } from './astrology-typewriter-headline';
import {
  BigThreeSkeleton,
  HeadlineSkeleton,
  SkeletonBlock,
} from './astrology-skeletons';
import type { AstrologyInterpretationReason } from '@/stores/destiny-workspace-store';
import type { AstrologyFormData } from '../astrology-types';

/** 主轴真值引用键 → 中文依据标签（「依据：太阳天秤 × 月亮巨蟹」） */
function refLabel(ref: string, facts: AstrologyChartFacts): string {
  const parts = ref.split(':');
  if (parts[0] === 'planet') {
    const body = parts[1] as PlanetBody;
    const placement = facts.planets.find((p) => p.body === body);
    const name = PLANET_CN[body] ?? body;
    if (parts[2] === 'retrograde') return `${name}逆行`;
    return placement?.sign ? `${name}${ZODIAC_CN[placement.sign]}` : name;
  }
  if (parts[0] === 'angle') {
    return facts.angles.ascendant.sign ? `上升${ZODIAC_CN[facts.angles.ascendant.sign]}` : '上升';
  }
  if (parts[0] === 'aspect') {
    const [, source, type, target] = parts;
    return `${PLANET_CN[source as PlanetBody] ?? source}${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type}${PLANET_CN[target as PlanetBody] ?? target}`;
  }
  if (parts[0] === 'transit') {
    // 行运引用（本月天象）：标注「行运」，与本命相位区分
    const [, transiting, type, target] = parts;
    return `行运${PLANET_CN[transiting as PlanetBody] ?? transiting}${ASPECT_CN[type as keyof typeof ASPECT_CN] ?? type}${PLANET_CN[target as PlanetBody] ?? target}`;
  }
  return ref;
}

export type AstrologySummarySectionProps = {
  formData: AstrologyFormData;
  chartFacts: AstrologyChartFacts;
  interpretation: AstrologyInterpretationReport | null;
  interpretationUnavailable: boolean;
  interpretationReason: AstrologyInterpretationReason | null;
  modules: ModuleReading[];
  reduceMotion: boolean | null;
  onRetryInterpretation: () => void;
  onLocateBody: (body: PlanetBody | null) => void;
  onLocateModule: (id: ModuleId) => void;
};

export function AstrologySummarySection({
  formData,
  chartFacts,
  interpretation,
  interpretationUnavailable,
  interpretationReason,
  modules,
  reduceMotion,
  onRetryInterpretation,
  onLocateBody,
  onLocateModule,
}: AstrologySummarySectionProps) {
  const headlineReading = interpretation?.headline ?? null;
  const fullHeadline = headlineReading?.text ?? '';

  /** 主轴落定标记：逐字状态由 TypewriterHeadline 自持，落定后触发一次驱动依据标签条与三要素卡入场 */
  const [doneHeadline, setDoneHeadline] = useState<string | null>(null);
  const headlineDone = fullHeadline.length > 0 && doneHeadline === fullHeadline;
  const handleHeadlineDone = useCallback(() => setDoneHeadline(fullHeadline), [fullHeadline]);

  const degradeReason = chartFacts.factStability.houses.reason;
  const sunPlacement = chartFacts.planets.find((p) => p.body === 'sun');
  const withHouses = chartFacts.dataCompleteness === 'with-houses';
  const bigThree = interpretation?.bigThree ?? null;

  /** 本周行动入口文案（移动端首屏精简卡；行运不可用时为 null，入口整块隐藏） */
  const weeklyAction = useMemo(
    () => modules.find((m) => m.id === 'week')?.weekly?.action ?? null,
    [modules]
  );

  /** 大三要素卡片数据（分区未到达或不可用项为 null，直接不渲染；分区未到由骨架占位） */
  const bigThreeCards = [
    bigThree?.sun && sunPlacement?.sign
      ? {
          key: 'sun' as const,
          title: '太阳',
          subtitle: '核心气质',
          Icon: SunIcon,
          reading: bigThree.sun,
          term: placementTermLine(chartFacts, 'sun'),
        }
      : null,
    bigThree?.moon
      ? {
          key: 'moon' as const,
          title: '月亮',
          subtitle: '内在情绪',
          Icon: MoonIcon,
          reading: bigThree.moon,
          term: placementTermLine(chartFacts, 'moon'),
        }
      : null,
    bigThree?.ascendant
      ? {
          key: 'ascendant' as const,
          title: '上升',
          subtitle: '外在表达',
          Icon: Sunrise,
          reading: bigThree.ascendant,
          term: placementTermLine(chartFacts, 'ascendant'),
        }
      : null,
  ].filter((c): c is NonNullable<typeof c> => c !== null);

  /** 降级档只剩 1-2 张要素卡时栅格按数量自适应（单卡横向聚光排版），不留空栅格 */
  const bigThreeCols =
    bigThreeCards.length === 1
      ? 'sm:grid-cols-1'
      : bigThreeCards.length === 2
        ? 'sm:grid-cols-2'
        : 'sm:grid-cols-3';
  /** 仅一张要素卡（时间未知档常见）：横向聚光排版开关 */
  const bigThreeSolo = bigThreeCards.length === 1;

  return (
    <div className="order-1 min-w-0 xl:col-span-8">
      {/* ── 1. 宇宙护照头（天命档案微晶印鉴，下沉深组件自闭环依据折叠） ── */}
      <AstrologyPassportHeader
        formData={formData}
        chartFacts={chartFacts}
        reduceMotion={Boolean(reduceMotion)}
      />

      {/* ── 2. 一句主轴（阅读焦点；逐字浮现，≥2 项真值依据标注）。
              解读降级：诚实的「解读暂不可用」卡 + 重试解读（真值不重算）；
              分区未到：按金句档位预留 min-height 的呼吸骨架 ── */}
      {interpretationUnavailable ? (
        <div className="mt-12">
          <AstrologyInterpretationNotice
            reason={interpretationReason}
            onRetry={onRetryInterpretation}
          />
        </div>
      ) : headlineReading ? (
        <section className="mt-12" aria-label="你的核心主题">
          {/* 逐字机自持状态与定时器（隔离 34ms/字的高频重渲染），落定后回调一次驱动下方依据与三卡。
                移动端降到 text-xl（字重与琥珀金渐变由组件内部保留），sm 起恢复 clamp(40px,4vw,56px) 原档位 */}
          <div className="max-sm:[&_h2]:text-xl max-sm:[&_h2]:leading-[1.25]">
            <TypewriterHeadline text={fullHeadline} onDone={handleHeadlineDone} />
          </div>
          {headlineDone && (
            <motion.div
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0.01 : 0.3 }}
              className="mt-4 flex flex-wrap items-center gap-2"
            >
              <span className="text-[11px] font-semibold tracking-wider text-day-muted dark:text-night-faint">
                依据
              </span>
              {headlineReading.factReferences.map((r) => (
                <span
                  key={r}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/90 bg-white/80 px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-xs dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-200"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500/80 dark:bg-amber-300" />
                  {refLabel(r, chartFacts)}
                </span>
              ))}
            </motion.div>
          )}
        </section>
      ) : (
        <section className="mt-12" aria-label="你的核心主题">
          <HeadlineSkeleton />
        </section>
      )}

      {/* ── 3. 大三要素（主轴落定后 40ms 间隔上浮；时间未知切「核心要素」）。
              解读降级时不占据篇幅：事实层说明与星盘轮已完整呈现盘面，解读区由上方的诚实卡统一说明。
              解读在途：三卡位骨架（完整盘口径）；解读到达即由真实卡替换（含降级档的栏数自适应） ── */}
      {interpretationUnavailable ? null : (
        <section className="mt-12" aria-label={withHouses ? '大三要素' : '核心要素'}>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
              {withHouses ? '大三要素' : '核心要素'}
            </h3>
            <span className="text-xs text-day-muted dark:text-night-faint">
              {withHouses ? '太阳 · 月亮 · 上升' : '只展示可计算且稳定的要素'}
            </span>
          </div>
          {!withHouses && (
            <p className="mt-2 rounded-2xl border border-violet-300/40 bg-violet-50/70 px-4 py-2.5 text-xs leading-relaxed text-violet-700 dark:border-violet-300/20 dark:bg-violet-400/[0.08] dark:text-violet-200">
              {degradeReason === 'unstable-in-range'
                ? '所选时段内上升与宫位不稳定，已按无宫位范围展示——以下结论只基于区间内稳定的事实，不取中点、不补算。'
                : '出生时间未知，上升与宫位已隐藏——以下结论只基于整日内稳定的事实，不猜测、不补算。'}
            </p>
          )}
          {/* 分区未到：三卡位骨架（完整盘口径）；分区到达即由真实卡替换（含降级档的栏数自适应） */}
          {bigThree === null ? (
            <BigThreeSkeleton />
          ) : (
            <div className={cn('mt-4 grid gap-3', bigThreeCols)}>
              {bigThreeCards.map((card, i) => (
                <motion.article
                  key={card.key}
                  initial={reduceMotion || !headlineDone ? false : { opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={
                    reduceMotion
                      ? { duration: 0.01 }
                      : {
                          duration: 0.4,
                          delay: headlineDone ? i * 0.04 + 0.05 : 0,
                          ease: 'easeOut',
                        }
                  }
                  className={cn(
                    'group relative rounded-2xl border bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 dark:bg-[#0D1226]',
                    // 太阳为天生主角：鎏金描边 + 金色光晕；其余星卡保持靛紫体系
                    card.key === 'sun'
                      ? 'border-amber-300/70 shadow-[0_10px_30px_-14px_rgba(180,133,42,0.35)] hover:shadow-[0_20px_44px_-14px_rgba(180,133,42,0.45)] dark:border-[#E7C873]/35 dark:shadow-[0_12px_36px_-14px_rgba(231,200,115,0.30)] dark:hover:shadow-[0_22px_50px_-14px_rgba(231,200,115,0.40)]'
                      : 'border-slate-200/80 shadow-[0_10px_30px_-18px_rgba(30,41,82,0.25)] hover:shadow-[0_20px_44px_-18px_rgba(73,105,233,0.35)] dark:border-white/10 dark:hover:border-indigo-300/25',
                    !headlineDone && !reduceMotion && 'opacity-0',
                    // 单卡聚光：横向排版（左识别区 + 右解读区），不留空栅格
                    bigThreeSolo && 'sm:flex sm:items-start sm:gap-6 sm:p-6'
                  )}
                >
                  <div className={cn(bigThreeSolo && 'sm:w-44 sm:shrink-0')}>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'flex h-8 w-8 items-center justify-center rounded-full',
                          card.key === 'sun'
                            ? 'bg-amber-100/90 text-amber-700 dark:bg-[#E7C873]/[0.14] dark:text-[#E7C873]'
                            : 'bg-indigo-100/80 text-indigo-600 dark:bg-indigo-400/[0.12] dark:text-indigo-300'
                        )}
                      >
                        <card.Icon className="h-4 w-4" strokeWidth={1.9} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">
                          {card.title}
                        </p>
                        <p className="text-[11px] text-day-muted dark:text-night-faint">
                          {card.subtitle}
                        </p>
                      </div>
                    </div>
                    <p
                      className={cn(
                        'mt-3 text-[11px] font-semibold tracking-wide',
                        card.key === 'sun'
                          ? 'text-amber-700 dark:text-[#E7C873]'
                          : 'text-indigo-500 dark:text-indigo-300/90'
                      )}
                    >
                      {card.term}
                    </p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      className={cn(
                        'mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200',
                        bigThreeSolo && 'sm:mt-0'
                      )}
                    >
                      {card.reading.plain}
                    </p>
                    <p className="mt-2.5 border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-500 dark:border-white/[0.08] dark:text-night-muted">
                      {card.reading.action}
                    </p>
                  </div>
                  {/* 整卡可点：卡面上浮即承诺可点，点击在星盘轮上定位这颗星体；上升不是可选星体，只滚到轮盘区不选中 */}
                  <button
                    type="button"
                    onClick={() => onLocateBody(card.key === 'ascendant' ? null : card.key)}
                    aria-label={`在星盘轮上查看${card.title}`}
                    className="absolute inset-0 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent"
                  />
                </motion.article>
              ))}
            </div>
          )}
        </section>
      )}

      {/* ── 3.5 本周行动入口（仅移动端 <xl；设计文档 §6.5 移动端顺序：护照 → 主轴 → 大三要素 → 本周行动入口，星盘轮位于首屏下方。
              点击展开并定位到下方「本周宇宙提示」模块的行动三角；行运不可用时整块隐藏，不假装有数据。
              解读在途：同高档位骨架占位，避免星盘轮章节带随入口出现而整体下移；解读降级：整块隐藏 ── */}
      {interpretationUnavailable ? null : weeklyAction ? (
        <button
          type="button"
          onClick={() => onLocateModule('week')}
          className={cn(
            'mt-6 flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-2.5 text-left shadow-sm backdrop-blur-sm backdrop-saturate-150 xl:hidden',
            'transition-all duration-200 active:scale-[0.98] hover:border-indigo-300 hover:bg-slate-50/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
            'dark:border-white/10 dark:bg-[#0D1226]/80 dark:hover:bg-[#121832]'
          )}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-indigo-600 shadow-sm dark:bg-white/[0.08] dark:text-indigo-300">
            <Footprints className="h-4 w-4" strokeWidth={1.9} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold tracking-[0.18em] text-indigo-500 dark:text-indigo-300/90">
              本周行动
            </span>
            <span className="mt-0.5 block truncate text-xs font-medium text-slate-700 dark:text-slate-200">
              {weeklyAction}
            </span>
          </span>
          <ChevronRight
            className="h-4 w-4 shrink-0 text-indigo-400 dark:text-indigo-300/70"
            strokeWidth={2.2}
          />
        </button>
      ) : interpretation === null ? (
        <div
          aria-hidden
          className="mt-6 flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-slate-200/90 bg-white/85 px-4 py-2.5 shadow-sm dark:border-white/10 dark:bg-[#0D1226]/80 xl:hidden"
        >
          <SkeletonBlock className="h-9 w-9 rounded-full" />
          <span className="min-w-0 flex-1">
            <SkeletonBlock className="h-2.5 w-16" />
            <SkeletonBlock className="mt-2 h-3 w-2/3" />
          </span>
        </div>
      ) : null}
    </div>
  );
}
