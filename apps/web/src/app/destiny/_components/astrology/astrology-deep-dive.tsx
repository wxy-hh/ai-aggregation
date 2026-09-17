'use client';

/**
 * astrology-deep-dive.tsx —— P0 深度区：星盘轮（完整盘面清单）与关键相位（设计文档 §6.6，08 工单）
 *
 * 位于结果页五大生活模块之后（首屏之外的全宽区）。只提供两个页内标签：
 * - 「星盘轮」：行星落点 / 轴线与宫位 / 相位总表的完整盘面清单（白话先行、术语俱全），
 *   点击任意行星或相位行可定位回首屏交互轮并选中对应星体；无宫位档不出现轴线与宫位组（不置灰占位）。
 * - 「关键相位」：强度前 5 条的三段式解读（能量关系 / 生活表现 / 练习建议），可展开完整列表。
 *
 * P1 标签（宫位地图 / 近期星运 / 术语百科）不以任何形式出现（标签、占位或禁用控件均不可）。
 * 顶部迷你护照条随本区 sticky，不丢失身份与返回路径（回到顶部）。
 * 键盘：标签栏 ←/→/Home/End 漫游选中；所有行星/相位行均为真实按钮可聚焦定位。
 */

import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUp, ChevronDown, Footprints, LocateFixed, Star, Sunrise } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AspectType, AstrologyChartFacts, PlanetBody, ZodiacSign } from '@/lib/astrology/chart-facts';
import {
  buildKeyAspects,
  planetPlainSentence,
  PLANET_THEME,
  type KeyAspectReading,
} from '@/lib/astrology/mock-interpretation';
import { ASPECT_CN, PLANET_CN, ZODIAC_CN } from '@/lib/astrology/zh-names';
import { PLANET_GLYPH, ZODIAC_GLYPH } from './astrology-chart-wheel';
import { ASTROLOGY_CTA_GRADIENT_CLASS } from './astrology-cta-button';
import { formatDegreeMinute } from './astrology-mappers';

/* ---------- 标签与视觉基调 ---------- */

type DeepTab = 'wheel' | 'aspects';

/** P0 仅两个页内标签（§6.6）；P1 标签名不出现 */
const TABS: Array<{ id: DeepTab; label: string; hint: string }> = [
  { id: 'wheel', label: '星盘轮', hint: '完整盘面清单' },
  { id: 'aspects', label: '关键相位', hint: '最有解释力的能量关系' },
];

/** 相位类型语义色（与行动三角同族的克制配色：和谐偏冷绿、紧张偏暖、合相偏紫） */
const ASPECT_TONE: Record<AspectType, { text: string; bar: string; chip: string }> = {
  conjunction: {
    text: 'text-indigo-600 dark:text-indigo-300',
    bar: 'from-indigo-500 to-sky-500',
    chip: 'bg-indigo-100/80 text-indigo-700 dark:bg-indigo-400/[0.12] dark:text-indigo-200',
  },
  sextile: {
    text: 'text-emerald-600 dark:text-emerald-300',
    bar: 'from-emerald-400 to-teal-500',
    chip: 'bg-emerald-100/80 text-emerald-700 dark:bg-emerald-400/[0.12] dark:text-emerald-200',
  },
  square: {
    text: 'text-amber-600 dark:text-amber-300',
    bar: 'from-amber-400 to-orange-500',
    chip: 'bg-amber-100/80 text-amber-700 dark:bg-amber-400/[0.12] dark:text-amber-200',
  },
  trine: {
    text: 'text-teal-600 dark:text-teal-300',
    bar: 'from-teal-400 to-cyan-500',
    chip: 'bg-teal-100/80 text-teal-700 dark:bg-teal-400/[0.12] dark:text-teal-200',
  },
  opposition: {
    text: 'text-rose-600 dark:text-rose-300',
    bar: 'from-rose-400 to-pink-500',
    chip: 'bg-rose-100/80 text-rose-700 dark:bg-rose-400/[0.12] dark:text-rose-200',
  },
};

/** 迷你护照条所需的最小身份字段（由结果页护照头同口径数据传入） */
export type DeepDivePassport = {
  name: string;
  sunSign: ZodiacSign | null;
  badgeText: string;
  badgeClassName: string;
};

export type AstrologyDeepDiveProps = {
  facts: AstrologyChartFacts;
  passport: DeepDivePassport;
  /** 定位回首屏交互轮：选中星体并平滑滚动（angle/house 传 null 仅滚动） */
  onLocateBody: (body: PlanetBody | null) => void;
};

export function AstrologyDeepDive({ facts, passport, onLocateBody }: AstrologyDeepDiveProps) {
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<DeepTab>('wheel');
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /** 标签栏键盘漫游（←/→/Home/End，自动激活并移动焦点） */
  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const idx = TABS.findIndex((t) => t.id === tab);
    let next = -1;
    if (e.key === 'ArrowRight') next = (idx + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') next = (idx - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = TABS.length - 1;
    if (next >= 0) {
      e.preventDefault();
      setTab(TABS[next].id);
      tabRefs.current[next]?.focus();
    }
  };

  const backToTop = () => window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });

  return (
    <section className="mt-12 sm:mt-14" aria-label="深入你的星盘">
      {/* 区标题 */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-heading text-lg font-bold text-slate-900 dark:text-white">深入你的星盘</h3>
        <span className="text-xs text-day-muted dark:text-night-faint">
          完整盘面与关键相位——每一条都能定位回盘面的真实位置
        </span>
      </div>

      {/* 迷你护照条：随本区粘性悬浮，不丢失身份与返回路径（§6.6） */}
      <div className="sticky top-3 z-20 mt-5 flex justify-center">
        <div className="flex max-w-full items-center gap-2.5 rounded-full border border-white/70 bg-white/90 py-1.5 pl-2.5 pr-2 shadow-[0_12px_36px_-12px_rgba(30,41,82,0.30)] ring-1 ring-black/[0.03] backdrop-blur-2xl transition-all duration-300 hover:shadow-[0_16px_44px_-12px_rgba(79,70,229,0.35)] dark:border-white/[0.14] dark:bg-[#0B1021]/[0.92] dark:ring-white/[0.05] dark:shadow-[0_16px_40px_-14px_rgba(0,0,0,0.85)]">
          {passport.sunSign && (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-500/[0.12] shadow-xs dark:bg-indigo-400/[0.14]">
              {(() => {
                const Glyph = ZODIAC_GLYPH[passport.sunSign];
                return <Glyph width={14} height={14} className="stroke-indigo-600 dark:stroke-indigo-300" />;
              })()}
            </span>
          )}
          <span className="truncate text-xs font-bold text-slate-800 dark:text-slate-100">{passport.name}</span>
          <span
            className={cn(
              'hidden shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold sm:inline-flex',
              passport.badgeClassName
            )}
          >
            {passport.badgeText}
          </span>
          <button
            type="button"
            onClick={backToTop}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-indigo-300 dark:hover:bg-white/[0.08]"
          >
            <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.2} />
            回到顶部
          </button>
        </div>
      </div>

      {/* P0 标签栏（仅两个；滑动选中胶囊） */}
      <div className="mt-5 flex justify-center">
        <div
          role="tablist"
          aria-label="深度探索标签"
          onKeyDown={onTabKeyDown}
          className="inline-flex rounded-full border border-slate-200/80 bg-slate-100/80 p-1 dark:border-white/10 dark:bg-white/[0.05]"
        >
          {TABS.map((t, i) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`deep-tab-${t.id}`}
                aria-selected={active}
                aria-controls={`deep-panel-${t.id}`}
                tabIndex={active ? 0 : -1}
                onClick={() => setTab(t.id)}
                className={cn(
                  'relative min-h-10 rounded-full px-5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 sm:px-7',
                  active ? 'text-white' : 'text-slate-500 hover:text-slate-700 dark:text-night-muted dark:hover:text-slate-200'
                )}
              >
                {active && (
                  <motion.span
                    layoutId="deep-tab-pill"
                    transition={reduceMotion ? { duration: 0.01 } : { type: 'spring', stiffness: 420, damping: 34 }}
                    className={cn(
                      'absolute inset-0 rounded-full shadow-[0_8px_20px_-8px_rgba(73,105,233,0.6)]',
                      ASTROLOGY_CTA_GRADIENT_CLASS
                    )}
                  />
                )}
                <span className="relative z-10">{t.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 标签面板（一次一面，淡出淡入不跳版） */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          id={`deep-panel-${tab}`}
          aria-labelledby={`deep-tab-${tab}`}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6 }}
          transition={{ duration: reduceMotion ? 0.01 : 0.22, ease: 'easeOut' }}
          className="mt-6"
        >
          {tab === 'wheel' ? (
            <WheelInventory facts={facts} onLocateBody={onLocateBody} />
          ) : (
            <KeyAspectsPanel facts={facts} onLocateBody={onLocateBody} />
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  );
}

/* ---------- 共享：分组卡壳 ---------- */

function InventoryGroup({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_-20px_rgba(30,41,82,0.25)] dark:border-white/10 dark:bg-[#0D1226] sm:p-5">
      <div className="flex flex-wrap items-baseline gap-x-2.5">
        <h4 className="text-sm font-bold text-slate-900 dark:text-white">{title}</h4>
        {hint && <span className="text-[11px] text-day-muted dark:text-night-faint">{hint}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/* ---------- 面板一：星盘轮（完整盘面清单） ---------- */

function WheelInventory({
  facts,
  onLocateBody,
}: {
  facts: AstrologyChartFacts;
  onLocateBody: (body: PlanetBody | null) => void;
}) {
  // 只列稳定可见事实：星座为 null 的星体直接缺项（不虚构、不留空位）
  const planets = useMemo(() => facts.planets.filter((p) => p.sign !== null), [facts]);
  const aspects = useMemo(
    () =>
      facts.aspects
        .filter((a) => a.stability === 'stable')
        .sort((a, b) => (b.strength ?? 0) - (a.strength ?? 0)),
    [facts]
  );
  const withHouses = facts.dataCompleteness === 'with-houses';
  const { ascendant, midheaven } = facts.angles;

  return (
    // 全宽叠放三卡（无宫位档缺「轴线与宫位」卡）：列表卡内双列，根除左右栏高差留白
    <div className="space-y-4">
      {/* 行星落点（点击定位回轮） */}
      <InventoryGroup title="行星落点" hint="点击任一行，在首屏星盘轮上查看它的位置">
        <ul className="grid gap-1 lg:grid-cols-2">
          {planets.map((p) => {
            const Glyph = PLANET_GLYPH[p.body];
            return (
              <li key={p.body}>
                <button
                  type="button"
                  onClick={() => onLocateBody(p.body)}
                  className="group flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-indigo-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:hover:bg-white/[0.04]"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-indigo-100 dark:bg-white/[0.06] dark:group-hover:bg-indigo-400/[0.12]">
                    <Glyph
                      width={15}
                      height={15}
                      className="stroke-slate-500 transition-colors group-hover:stroke-indigo-500 dark:stroke-slate-400 dark:group-hover:stroke-indigo-300"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {PLANET_CN[p.body]}
                      <span className="ml-1.5 text-xs font-normal text-day-muted dark:text-night-faint">
                        {PLANET_THEME[p.body]}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-slate-500 dark:text-night-muted">
                      {planetPlainSentence(p.body, p.sign!)}
                    </span>
                  </span>
                  <span className="flex shrink-0 basis-full items-center gap-1.5 pl-11 text-xs tabular-nums text-slate-500 dark:text-night-muted sm:basis-auto sm:pl-0">
                    {ZODIAC_CN[p.sign!]}
                    {p.degree !== null && ` ${formatDegreeMinute(p.degree)}`}
                    {p.house !== null && ` · 第 ${p.house} 宫`}
                    {p.retrograde === true && (
                      <span className="rounded-full bg-amber-100/80 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-400/[0.12] dark:text-amber-300">
                        逆行
                      </span>
                    )}
                  </span>
                  <LocateFixed
                    className="h-3.5 w-3.5 shrink-0 text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-indigo-300"
                    strokeWidth={2}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      </InventoryGroup>

      <div className="space-y-4">
        {/* 轴线与宫位（无宫位档整组缺项，不置灰占位） */}
        {withHouses && (
          <InventoryGroup title="轴线与宫位" hint="整宫制 · 宫头即星座起点">
            <ul className="grid gap-1 sm:grid-cols-2">
              {[
                { label: '上升', desc: '外在表达', angle: ascendant, Icon: Sunrise },
                { label: '天顶', desc: '事业坐标', angle: midheaven, Icon: Star },
              ].map(({ label, desc, angle, Icon }) =>
                angle.sign ? (
                  <li key={label}>
                    <button
                      type="button"
                      onClick={() => onLocateBody(null)}
                      className="group flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-indigo-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:hover:bg-white/[0.04]"
                    >
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 transition-colors group-hover:bg-indigo-100 dark:bg-white/[0.06] dark:group-hover:bg-indigo-400/[0.12]">
                        <Icon className="h-4 w-4 text-slate-500 transition-colors group-hover:text-indigo-500 dark:text-night-muted dark:group-hover:text-indigo-300" strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {label}
                          <span className="ml-1.5 text-xs font-normal text-day-muted dark:text-night-faint">{desc}</span>
                        </span>
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500 dark:text-night-muted">
                        {ZODIAC_CN[angle.sign]}
                        {angle.degree !== null && ` ${formatDegreeMinute(angle.degree)}`}
                      </span>
                    </button>
                  </li>
                ) : null
              )}
            </ul>
            {/* 十二宫头一览（静态事实，不参与点选；全宽卡内六列排布） */}
            <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-6">
              {facts.houses.map((h) => {
                const Glyph = ZODIAC_GLYPH[h.sign];
                return (
                  <div
                    key={h.number}
                    className="flex items-center gap-1.5 rounded-lg bg-slate-50/90 px-2.5 py-1.5 text-[11px] text-slate-500 dark:bg-white/[0.04] dark:text-night-muted"
                  >
                    <Glyph width={11} height={11} className="shrink-0 stroke-slate-400 dark:stroke-slate-500" />
                    第 {h.number} 宫 · {ZODIAC_CN[h.sign]}
                  </div>
                );
              })}
            </div>
          </InventoryGroup>
        )}

        {/* 相位总表（强度降序；点击定位 source 星体） */}
        <InventoryGroup title={`相位总表 · ${aspects.length} 条`} hint="按强度排序，点击可在轮上查看">
          <ul className="grid gap-1 lg:grid-cols-2">
            {aspects.map((a) => {
              const tone = ASPECT_TONE[a.type];
              return (
                <li key={`${a.source}-${a.target}-${a.type}`}>
                  <button
                    type="button"
                    onClick={() => onLocateBody(a.source)}
                    className="group flex min-h-11 w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-indigo-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:hover:bg-white/[0.04]"
                  >
                    <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                      {PLANET_CN[a.source]}
                      <span className={cn('mx-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', tone.chip)}>
                        {ASPECT_CN[a.type]}
                      </span>
                      {PLANET_CN[a.target]}
                    </span>
                    <span className="shrink-0 text-[11px] tabular-nums text-day-muted dark:text-night-faint">
                      {a.orb !== null && `偏差 ${a.orb.toFixed(1)}°`}
                      {a.strength !== null && ` · 强度 ${Math.round(a.strength * 100)}%`}
                    </span>
                    <LocateFixed
                      className="h-3.5 w-3.5 shrink-0 text-indigo-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 dark:text-indigo-300"
                      strokeWidth={2}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        </InventoryGroup>
      </div>
    </div>
  );
}

/* ---------- 面板二：关键相位 ---------- */

function KeyAspectsPanel({
  facts,
  onLocateBody,
}: {
  facts: AstrologyChartFacts;
  onLocateBody: (body: PlanetBody | null) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [showRest, setShowRest] = useState(false);
  const { top, rest } = useMemo(() => buildKeyAspects(facts), [facts]);

  // 稳定相位一条都没有时如实说明（理论上罕见；绝不凑数虚构）
  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200/80 bg-white p-5 text-sm leading-relaxed text-slate-500 dark:border-white/10 dark:bg-[#0D1226] dark:text-night-muted">
        当前资料下没有可确认的主要相位——行星之间的能量关系需要更精确的出生时间才能判断；上方行星落点解读不受影响。
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-day-muted dark:text-night-faint">
        最有解释力的 {top.length} 条相位（按强度排序）——每条都说明能量关系、生活表现与一个可练习的小动作
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {top.map((a, i) => (
          <KeyAspectCard key={a.refKey} aspect={a} index={i} onLocateBody={onLocateBody} reduceMotion={Boolean(reduceMotion)} />
        ))}
      </div>

      {/* 完整列表折叠（其余稳定相位紧凑列出） */}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowRest((v) => !v)}
            aria-expanded={showRest}
            className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:text-indigo-300 dark:hover:bg-white/[0.06] sm:min-h-0 sm:py-1.5"
          >
            {showRest ? '收起完整相位列表' : `展开其余 ${rest.length} 条相位`}
            <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200', showRest && 'rotate-180')} strokeWidth={2.2} />
          </button>
          <AnimatePresence initial={false}>
            {showRest && (
              <motion.div
                initial={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: reduceMotion ? 0.01 : 0.26, ease: 'easeOut' }}
                className="overflow-hidden"
              >
                <ul className="mt-2 space-y-1 rounded-2xl border border-slate-200/80 bg-white p-3 dark:border-white/10 dark:bg-[#0D1226]">
                  {rest.map((a) => {
                    const tone = ASPECT_TONE[a.type];
                    return (
                      <li key={a.refKey}>
                        <button
                          type="button"
                          onClick={() => onLocateBody(a.source)}
                          className="group flex min-h-11 w-full flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl px-3 py-2 text-left transition-colors hover:bg-indigo-50/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:hover:bg-white/[0.04]"
                        >
                          <span className="min-w-0 flex-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {PLANET_CN[a.source]}
                            <span className={cn('mx-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold', tone.chip)}>
                              {ASPECT_CN[a.type]}
                            </span>
                            {PLANET_CN[a.target]}
                          </span>
                          <span className="shrink-0 text-[11px] tabular-nums text-day-muted dark:text-night-faint">
                            {a.orb !== null && `偏差 ${a.orb.toFixed(1)}°`}
                            {a.strength !== null && ` · 强度 ${Math.round(a.strength * 100)}%`}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/** 单张关键相位卡：序号 + 两端星体 + 类型徽章 + 强度条 + 三段式解读 + 定位入口 */
function KeyAspectCard({
  aspect: a,
  index,
  onLocateBody,
  reduceMotion,
}: {
  aspect: KeyAspectReading;
  index: number;
  onLocateBody: (body: PlanetBody | null) => void;
  reduceMotion: boolean;
}) {
  const tone = ASPECT_TONE[a.type];
  const SrcGlyph = PLANET_GLYPH[a.source];
  const TgtGlyph = PLANET_GLYPH[a.target];
  const strengthPct = Math.round((a.strength ?? 0) * 100);

  return (
    <motion.article
      initial={reduceMotion ? false : { opacity: 0, y: 16 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay: (index % 2) * 0.06, ease: 'easeOut' }}
      className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-[0_10px_30px_-20px_rgba(30,41,82,0.25)] dark:border-white/10 dark:bg-[#0D1226] sm:p-5"
    >
      {/* 标题行：序号 · 源星体 徽章 目标星体 · 偏差/强度 */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-2">
        <span className="font-heading text-xs font-bold tabular-nums text-slate-300 dark:text-slate-600">
          {String(index + 1).padStart(2, '0')}
        </span>
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <SrcGlyph width={15} height={15} className="stroke-indigo-500 dark:stroke-indigo-300" />
          {PLANET_CN[a.source]}
        </span>
        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', tone.chip)}>{ASPECT_CN[a.type]}</span>
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-white">
          <TgtGlyph width={15} height={15} className="stroke-indigo-500 dark:stroke-indigo-300" />
          {PLANET_CN[a.target]}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-day-muted dark:text-night-faint">
          {a.orb !== null && `偏差 ${a.orb.toFixed(1)}°`}
        </span>
      </div>

      {/* 强度条（宽度 = 真实强度百分比） */}
      <div
        className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-white/[0.06]"
        role="img"
        aria-label={`相位强度 ${strengthPct}%`}
      >
        <motion.div
          initial={reduceMotion ? undefined : { width: 0 }}
          whileInView={reduceMotion ? undefined : { width: `${strengthPct}%` }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: 0.15 }}
          style={reduceMotion ? { width: `${strengthPct}%` } : undefined}
          className={cn('h-full rounded-full bg-gradient-to-r', tone.bar)}
        />
      </div>

      {/* 三段式：能量关系 → 生活表现 → 练习建议 */}
      <p className={cn('mt-3 text-sm font-semibold leading-relaxed', tone.text)}>{a.energy}</p>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a.life}</p>
      <p className="mt-3 flex items-start gap-1.5 border-t border-slate-100 pt-3 text-xs leading-relaxed text-slate-500 dark:border-white/[0.08] dark:text-night-muted">
        <Footprints className="mt-0.5 h-3.5 w-3.5 shrink-0" strokeWidth={2} />
        {a.practice}
      </p>

      {/* 定位回首屏星盘轮（选中 source 星体） */}
      <button
        type="button"
        onClick={() => onLocateBody(a.source)}
        className="mt-3 inline-flex min-h-9 items-center gap-1.5 rounded-full border border-indigo-200/70 px-3 text-[11px] font-semibold text-indigo-600 transition-colors hover:bg-indigo-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40 dark:border-indigo-300/20 dark:text-indigo-200 dark:hover:bg-indigo-400/10"
      >
        <LocateFixed className="h-3.5 w-3.5" strokeWidth={2} />
        在星盘轮上查看
      </button>
    </motion.article>
  );
}
