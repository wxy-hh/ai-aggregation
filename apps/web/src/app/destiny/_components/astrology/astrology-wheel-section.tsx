'use client';

/**
 * astrology-wheel-section.tsx —— 结果页交互星盘轮章节带（3D 舞台 + 白话清单 + 事实解构台 + 移动端抽屉）
 *
 * 承接星盘章节段（全宽深色渐变舞台）全部内容：
 * 1. 3D 轮盘主角（基于深模块 AstrologyWheel 与 AstrologyWheelTransition，自适应 WebGL 场景与视差控制）
 * 2. 右列等价文本清单与星体解构台（桌面端原位切换，无跳动撑高）
 * 3. 移动端浮动事实卡抽屉（悬浮视口底部，绝不挤压 DOM 流）
 * 4. 内联 50+ 行星体反查与相位派生 useMemo 群下沉自持
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AstrologyChartFacts, PlanetBody, ZodiacSign } from '@/lib/astrology/chart-facts';
import {
  ASPECT_PLAIN,
  MOON_READINGS,
  moduleIdsForBody,
  planetPlainSentence,
  SUN_READINGS,
  type ElementReading,
  type ModuleId,
  type ModuleReading,
} from '@/lib/astrology/interpretation';
import {
  ASPECT_CN,
  PLANET_CN,
  PLANET_GLYPH,
  ZODIAC_CN,
} from './astrology-chart-wheel';
import { AstrologyWheel } from './astrology-wheel';
import { AstrologyWheelTransition } from './astrology-wheel-transition';
import { formatDegreeMinute } from './astrology-mappers';
import { houseSystemLabel } from './astrology-passport-header';
import { PlanetFactCard } from './astrology-planet-fact-card';

export type AstrologyWheelSectionProps = {
  chartFacts: AstrologyChartFacts;
  modules: ModuleReading[];
  selectedBody: PlanetBody | null;
  onSelectBody: (body: PlanetBody | null) => void;
  onLocateModule: (id: ModuleId) => void;
  reduceMotion: boolean | null;
};

export function AstrologyWheelSection({
  chartFacts,
  modules,
  selectedBody,
  onSelectBody,
  onLocateModule,
  reduceMotion,
}: AstrologyWheelSectionProps) {
  const [showAllTerms, setShowAllTerms] = useState(false);
  /** 白话清单默认只露前 4 颗（防长页）；展开后显示全部行星 */
  const [showAllPlanets, setShowAllPlanets] = useState(false);

  const withHouses = chartFacts.dataCompleteness === 'with-houses';
  const degradeReason = chartFacts.factStability.houses.reason;

  /** 选中星体的真值与关联相位（白话先行事实卡数据源） */
  const selectedPlacement = useMemo(() => {
    if (!chartFacts || !selectedBody) return null;
    return chartFacts.planets.find((p) => p.body === selectedBody && p.sign !== null) ?? null;
  }, [chartFacts, selectedBody]);

  const selectedAspects = useMemo(() => {
    if (!chartFacts || !selectedBody) return [];
    return chartFacts.aspects
      .filter(
        (a) => a.stability === 'stable' && (a.source === selectedBody || a.target === selectedBody)
      )
      .slice(0, 3);
  }, [chartFacts, selectedBody]);

  /** 选中星体的大三要素解读（若属于日/月则附白话+动作层） */
  const selectedReading: ElementReading | null = useMemo(() => {
    if (!selectedPlacement?.sign) return null;
    if (selectedBody === 'sun') return SUN_READINGS[selectedPlacement.sign];
    if (selectedBody === 'moon') return MOON_READINGS[selectedPlacement.sign];
    return null;
  }, [selectedPlacement, selectedBody]);

  /** 等价文本清单（白话默认；点击行联动轮上选中） */
  const textListItems = useMemo(() => {
    if (!chartFacts) return [];
    return chartFacts.planets
      .filter((p) => p.sign !== null)
      .map((p) => ({
        body: p.body,
        sign: p.sign!,
        degree: p.degree,
        house: p.house,
        retrograde: p.retrograde,
        plain: planetPlainSentence(p.body, p.sign!),
      }));
  }, [chartFacts]);

  /** 选中星体 → 引用它的生活模块（事实卡「相关模块」标签，反向定位；解读在途时为空，标签随解读到达出现） */
  const relatedModuleIds = useMemo(
    () => (selectedBody ? moduleIdsForBody(modules, selectedBody) : []),
    [modules, selectedBody]
  );

  /** 月亮缺席说明：未知/约时档月亮当日跨座会被整颗隐藏，白话说明「为什么不在名单里」（诚实做到底）。
   *  只在降级原因是已知两种时给对应文案，其余原因不写说明——宁缺毋假，不假定「缺时间」 */
  const moonHiddenNote =
    chartFacts.planets.find((p) => p.body === 'moon')?.sign === null
      ? degradeReason === 'unstable-in-range'
        ? '月亮在所选时段内跨越星座，无法判定，本次未列出。'
        : degradeReason === 'time-unknown'
          ? '月亮在出生当日跨越星座，缺少准确时间无法判定，本次未列出。'
          : null
      : null;

  return (
    <section
      id="astrology-wheel-section"
      aria-label="交互星盘轮"
      className="order-2 relative -mx-5 overflow-hidden border-y border-indigo-100/80 bg-[radial-gradient(ellipse_at_top_left,rgba(224,231,255,0.7),transparent_50%),radial-gradient(ellipse_at_bottom_right,rgba(245,243,255,0.8),transparent_50%),linear-gradient(135deg,#F6F8FF_0%,#FFFFFF_50%,#F3F5FF_100%)] p-5 shadow-[0_24px_64px_-32px_rgba(30,41,82,0.15)] dark:border-white/[0.08] dark:bg-[radial-gradient(ellipse_at_20%_20%,rgba(67,56,202,0.18),transparent_48%),radial-gradient(ellipse_at_80%_80%,rgba(147,51,234,0.12),transparent_48%),linear-gradient(155deg,#040711_0%,#090E20_50%,#0C132B_100%)] sm:mx-0 sm:rounded-[32px] sm:border sm:p-8 xl:order-3 xl:col-span-12 xl:p-10"
    >
      {/* 章节带氛围：顶缘微晶星光线 + 轮盘列后方双层液态星云辉光（纯装饰） */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-indigo-400/60 to-transparent dark:via-indigo-300/40"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-28 top-1/2 hidden h-[480px] w-[480px] -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(99,102,241,0.18)_0%,rgba(147,51,234,0.10)_45%,transparent_70%)] blur-3xl dark:bg-[radial-gradient(circle,rgba(129,140,248,0.22)_0%,rgba(168,85,247,0.14)_50%,transparent_72%)] xl:block"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-20 -bottom-20 hidden h-[380px] w-[380px] rounded-full bg-indigo-400/10 blur-3xl dark:bg-sky-500/[0.08] xl:block"
      />

      <div className="relative flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">
          你的星盘
        </h3>
        <span className="text-xs text-day-muted dark:text-night-faint">
          点选任一星体，查看它在你生活里的样子
        </span>
      </div>

      <div className="relative mt-6 xl:mt-8 xl:grid xl:grid-cols-2 xl:items-center xl:gap-10">
        {/* 左列：轮盘主角 */}
        <div className="relative mx-auto w-full max-w-[min(100%,420px)] sm:max-w-[520px]">
          <div
            aria-hidden
            className="absolute inset-[6%] rounded-full bg-indigo-400/10 blur-2xl dark:bg-indigo-500/15"
          />
          {/* 3D 舞台与视差互斥已内收深模块，转场外壳不影响穿入测量 */}
          <AstrologyWheelTransition className="relative mx-auto w-full">
            <AstrologyWheel facts={chartFacts} selectedBody={selectedBody} onSelectBody={onSelectBody} />
          </AstrologyWheelTransition>
        </div>

        {/* 右列：等价文本清单与星体深度解构台（桌面端原位切换，彻底消除底部撑开与页面跳动） */}
        <div className="mt-6 min-w-0 rounded-2xl border border-slate-200/80 bg-white/95 p-4 shadow-[0_16px_44px_-24px_rgba(30,41,82,0.25)] dark:border-white/[0.12] dark:bg-[#0D1226]/[0.88] dark:shadow-[0_20px_50px_-24px_rgba(0,0,0,0.85)] sm:p-5 xl:mt-0 xl:flex xl:min-h-[500px] xl:flex-col">
          <AnimatePresence mode="wait" initial={false}>
            {selectedPlacement?.sign && selectedBody ? (
              <motion.div
                key={selectedBody}
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                className="flex-1"
              >
                <PlanetFactCard
                  body={selectedBody}
                  placement={
                    selectedPlacement as NonNullable<typeof selectedPlacement> & {
                      sign: ZodiacSign;
                    }
                  }
                  reading={selectedReading}
                  aspects={selectedAspects}
                  relatedModuleIds={relatedModuleIds}
                  modules={modules}
                  allPlanets={textListItems}
                  onSelectBody={(b) => onSelectBody(b)}
                  onLocateModule={onLocateModule}
                  onClose={() => onSelectBody(null)}
                />
              </motion.div>
            ) : (
              <motion.div
                key="list-view"
                initial={reduceMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.2, ease: 'easeOut' }}
                className="flex-1"
              >
                <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  看不懂星盘？每一颗星的白话位置都在这里
                </p>
                <p className="mt-0.5 text-[11px] text-day-muted dark:text-night-faint">
                  点选星体可在右侧直接查看深度解读与相位
                </p>
                <ul className="mt-3 space-y-1">
                  {(showAllPlanets ? textListItems : textListItems.slice(0, 4)).map(
                    (item) => {
                      const Glyph = PLANET_GLYPH[item.body];
                      const active = selectedBody === item.body;
                      return (
                        <li key={item.body}>
                          <button
                            type="button"
                            onClick={() => onSelectBody(active ? null : item.body)}
                            aria-pressed={active}
                            className={cn(
                              'flex min-h-11 w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
                              active
                                ? 'bg-indigo-50 dark:bg-indigo-400/10'
                                : 'hover:bg-slate-50 dark:hover:bg-white/[0.04]'
                            )}
                          >
                            <Glyph
                              width={15}
                              height={15}
                              className={cn(
                                'mt-1 shrink-0',
                                active
                                  ? 'stroke-indigo-500 dark:stroke-indigo-300'
                                  : 'stroke-slate-400 dark:stroke-slate-500'
                              )}
                            />
                            <span className="text-xs leading-relaxed text-slate-600 dark:text-slate-300 sm:text-sm">
                              <span className="font-semibold tabular-nums text-slate-800 dark:text-slate-100">
                                {PLANET_CN[item.body]}在{ZODIAC_CN[item.sign]}
                                {item.degree !== null &&
                                  ` ${formatDegreeMinute(item.degree)}`}
                                {item.house !== null && ` · 第 ${item.house} 宫`}
                                {item.retrograde === true && ' · 逆行中'}
                              </span>
                              <br />
                              {item.plain}
                            </span>
                          </button>
                        </li>
                      );
                    }
                  )}
                </ul>
                {/* 月亮缺席注明：无宫位档月亮跨座被整颗隐藏，白话说明为什么名单里没有它 */}
                {moonHiddenNote && (
                  <p className="mt-2 text-[11px] leading-relaxed text-day-muted dark:text-night-faint">
                    {moonHiddenNote}
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                  {/* 清单折叠：默认只露前 4 颗，展开看全部行星 */}
                  {textListItems.length > 4 && (
                    <button
                      type="button"
                      onClick={() => setShowAllPlanets((v) => !v)}
                      aria-expanded={showAllPlanets}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                    >
                      {showAllPlanets
                        ? '收起清单'
                        : `展开其余 ${textListItems.length - 4} 颗星`}
                      <ChevronDown
                        className={cn(
                          'h-3.5 w-3.5 transition-transform duration-200',
                          showAllPlanets && 'rotate-180'
                        )}
                        strokeWidth={2.2}
                      />
                    </button>
                  )}
                  {/* 术语层折叠：容许度/强度等完整数据 */}
                  <button
                    type="button"
                    onClick={() => setShowAllTerms((v) => !v)}
                    aria-expanded={showAllTerms}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA] focus-visible:ring-offset-2 focus-visible:ring-offset-transparent dark:text-indigo-300 dark:hover:bg-white/5 sm:min-h-0 sm:py-1.5"
                  >
                    {showAllTerms ? '收起术语数据' : '查看全部术语数据'}
                    <ChevronDown
                      className={cn(
                        'h-3.5 w-3.5 transition-transform duration-200',
                        showAllTerms && 'rotate-180'
                      )}
                      strokeWidth={2.2}
                    />
                  </button>
                </div>
                <AnimatePresence initial={false}>
                  {showAllTerms && (
                    <motion.div
                      initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                      animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                      exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                      transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: 'easeOut' }}
                      className="overflow-hidden"
                    >
                      <ul className="mt-2 space-y-1.5 rounded-xl bg-slate-50/90 p-3.5 text-[11px] leading-relaxed text-slate-500 dark:bg-[#090E20] dark:text-night-muted">
                        {chartFacts.aspects
                          .filter((a) => a.stability === 'stable')
                          .map((a) => (
                            <li key={`${a.source}-${a.target}-${a.type}`}>
                              {PLANET_CN[a.source]} {ASPECT_CN[a.type]} {PLANET_CN[a.target]}
                              {a.orb !== null && ` · 偏差 ${a.orb.toFixed(1)}°`}
                              {a.strength !== null &&
                                ` · 强度 ${Math.round(a.strength * 100)}%`}
                              ——{ASPECT_PLAIN[a.type]}
                            </li>
                          ))}
                        <li className="border-t border-slate-200/70 pt-2 dark:border-white/[0.08]">
                          回归黄道 · {withHouses ? houseSystemLabel(chartFacts) : '无宫位'} ·
                          容许度表 {chartFacts.orbTableVersion}
                        </li>
                      </ul>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* 移动端专属浮动抽屉（<xl）：悬浮于视口底部，绝不撑大或推挤 DOM 文档流，彻底杜绝跳动 */}
      <AnimatePresence>
        {selectedPlacement?.sign && selectedBody && (
          <div className="xl:hidden">
            {/* 背景微晶暗色遮罩 */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => onSelectBody(null)}
              className="fixed inset-0 z-40 bg-slate-950/50 backdrop-blur-md"
              aria-hidden
            />
            {/* 底部抽屉主体 */}
            <motion.div
              key={`mobile-fact-${selectedBody}`}
              initial={reduceMotion ? { opacity: 1 } : { opacity: 0, y: '100%' }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: '100%' }}
              transition={{ duration: reduceMotion ? 0.01 : 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-50 max-h-[82vh] overflow-y-auto custom-scrollbar rounded-[24px] border border-white/40 bg-white/95 p-5 shadow-[0_24px_60px_-15px_rgba(15,23,42,0.45)] backdrop-blur-xl backdrop-saturate-150 dark:border-white/10 dark:bg-[#0E1430]/[0.92]"
              role="dialog"
              aria-label={`${PLANET_CN[selectedBody]}事实卡`}
            >
              {/* 顶部手柄条 */}
              <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-slate-300/80 dark:bg-slate-600/80" />
              <PlanetFactCard
                body={selectedBody}
                placement={
                  selectedPlacement as NonNullable<typeof selectedPlacement> & {
                    sign: ZodiacSign;
                  }
                }
                reading={selectedReading}
                aspects={selectedAspects}
                relatedModuleIds={relatedModuleIds}
                modules={modules}
                allPlanets={textListItems}
                onSelectBody={(b) => onSelectBody(b)}
                onLocateModule={(id) => {
                  onSelectBody(null);
                  onLocateModule(id);
                }}
                onClose={() => onSelectBody(null)}
                isDrawer
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </section>
  );
}
