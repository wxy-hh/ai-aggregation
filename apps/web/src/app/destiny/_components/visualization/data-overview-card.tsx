'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport, TenGodDomainKey } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ELEMENT_LABELS: Record<FiveElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

/** 进度条轨道（略深底，衬托实色填充） */
const SOFT_BAR_TRACK =
  'bg-slate-200/80 ring-1 ring-inset ring-slate-300/35 dark:bg-slate-800/80 dark:ring-white/8';

/** 最高项末端柔光，避免整段洗白 */
const SOFT_BAR_SHINE =
  'relative overflow-hidden after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-[22%] after:bg-gradient-to-l after:from-white/20 after:to-transparent dark:after:from-white/10';

type DistributionPalette = {
  chip: string;
  text: string;
  indicator: string;
  bar: string;
  barGlow: string;
};

/**
 * 五行配色：400 档实色渐变（不用透明度修饰，避免进度条不渲染）
 */
const ELEMENT_COLORS: Record<FiveElementKey, DistributionPalette> = {
  metal: {
    chip: 'bg-zinc-100/95 ring-zinc-300/55 dark:bg-zinc-800/50 dark:ring-zinc-500/40',
    text: 'text-zinc-600 dark:text-zinc-300',
    indicator: 'bg-zinc-400 dark:bg-zinc-500',
    bar: 'bg-gradient-to-r from-zinc-400 via-zinc-300 to-slate-300 dark:from-zinc-500 dark:via-zinc-400 dark:to-zinc-300',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(113,113,122,0.22)]',
  },
  wood: {
    chip: 'bg-emerald-50/95 ring-emerald-300/50 dark:bg-emerald-950/45 dark:ring-emerald-700/35',
    text: 'text-emerald-600 dark:text-emerald-300',
    indicator: 'bg-emerald-400 dark:bg-emerald-500',
    bar: 'bg-gradient-to-r from-emerald-400 via-emerald-400 to-green-300 dark:from-emerald-500 dark:via-emerald-400 dark:to-green-400',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(16,185,129,0.2)]',
  },
  water: {
    chip: 'bg-blue-50/95 ring-blue-300/50 dark:bg-blue-950/45 dark:ring-blue-700/35',
    text: 'text-blue-600 dark:text-blue-300',
    indicator: 'bg-blue-400 dark:bg-blue-500',
    bar: 'bg-gradient-to-r from-blue-400 via-blue-400 to-indigo-300 dark:from-blue-500 dark:via-blue-400 dark:to-indigo-400',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(59,130,246,0.2)]',
  },
  fire: {
    chip: 'bg-red-50/95 ring-red-300/50 dark:bg-red-950/45 dark:ring-red-800/35',
    text: 'text-red-600 dark:text-red-300',
    indicator: 'bg-red-400 dark:bg-red-500',
    bar: 'bg-gradient-to-r from-red-400 via-red-400 to-orange-300 dark:from-red-500 dark:via-red-400 dark:to-orange-400',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(248,113,113,0.2)]',
  },
  earth: {
    chip: 'bg-amber-100/90 ring-amber-800/25 dark:bg-amber-950/50 dark:ring-amber-700/35',
    text: 'text-amber-700 dark:text-amber-200',
    indicator: 'bg-amber-500 dark:bg-amber-500',
    bar: 'bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 dark:from-amber-500 dark:via-amber-400 dark:to-yellow-600',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(217,119,6,0.18)]',
  },
};

/** 十神五维：与五行同亮度体系 */
const DOMAIN_COLORS: Record<string, DistributionPalette> = {
  资源支持: {
    chip: 'bg-indigo-50 ring-indigo-200/60 dark:bg-indigo-950/50 dark:ring-indigo-700/35',
    text: 'text-indigo-600 dark:text-indigo-300',
    indicator: 'bg-indigo-400 dark:bg-indigo-500',
    bar: 'bg-gradient-to-r from-indigo-400 via-indigo-400 to-violet-300 dark:from-indigo-500 dark:via-indigo-400 dark:to-violet-400',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(99,102,241,0.2)]',
  },
  创造才能: {
    chip: 'bg-teal-50 ring-teal-200/60 dark:bg-teal-950/50 dark:ring-teal-700/35',
    text: 'text-teal-600 dark:text-teal-300',
    indicator: 'bg-teal-400 dark:bg-teal-500',
    bar: 'bg-gradient-to-r from-teal-400 via-emerald-400 to-cyan-300 dark:from-teal-500 dark:via-emerald-400 dark:to-cyan-400',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(20,184,166,0.2)]',
  },
  自我表达: {
    chip: 'bg-sky-50 ring-sky-200/60 dark:bg-sky-950/50 dark:ring-sky-700/35',
    text: 'text-sky-600 dark:text-sky-300',
    indicator: 'bg-sky-400 dark:bg-sky-500',
    bar: 'bg-gradient-to-r from-sky-400 via-blue-400 to-[#9badff] dark:from-sky-500 dark:via-blue-400 dark:to-[#9badff]',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(56,189,248,0.2)]',
  },
  财富积累: {
    chip: 'bg-amber-50 ring-amber-200/60 dark:bg-amber-950/50 dark:ring-amber-700/35',
    text: 'text-amber-600 dark:text-amber-300',
    indicator: 'bg-amber-400 dark:bg-amber-500',
    bar: 'bg-gradient-to-r from-amber-400 via-amber-400 to-orange-300 dark:from-amber-500 dark:via-amber-400 dark:to-orange-400',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(245,158,11,0.2)]',
  },
  事业成就: {
    chip: 'bg-rose-50 ring-rose-200/60 dark:bg-rose-950/50 dark:ring-rose-700/35',
    text: 'text-rose-600 dark:text-rose-300',
    indicator: 'bg-rose-400 dark:bg-rose-500',
    bar: 'bg-gradient-to-r from-rose-400 via-red-400 to-rose-300 dark:from-rose-500 dark:via-red-400 dark:to-rose-500',
    barGlow: 'shadow-[0_2px_8px_-2px_rgba(244,63,94,0.2)]',
  },
};

const DEFAULT_DOMAIN_PALETTE: DistributionPalette = {
  chip: 'bg-slate-100 ring-slate-200/60 dark:bg-slate-800 dark:ring-slate-600/35',
  text: 'text-slate-600 dark:text-slate-300',
  indicator: 'bg-slate-400 dark:bg-slate-500',
  bar: 'bg-gradient-to-r from-slate-400 via-slate-400 to-slate-300',
  barGlow: 'shadow-[0_2px_8px_-2px_rgba(100,116,139,0.18)]',
};

function getDomainPalette(label: string): DistributionPalette {
  return DOMAIN_COLORS[label] ?? DEFAULT_DOMAIN_PALETTE;
}

const DOMAIN_FRIENDLY: Record<TenGodDomainKey, string> = {
  resource: '资源支持',
  expression: '创造才能',
  self: '自我表达',
  wealth: '财富积累',
  order: '事业成就',
};

const DOMAIN_DISPLAY_ORDER: TenGodDomainKey[] = [
  'resource',
  'expression',
  'self',
  'wealth',
  'order',
];

/** 十神明细：同维度内深浅不同，色相跟随五维体系 */
const TEN_GOD_BAR: Record<string, { indicator: string; bar: string }> = {
  zhengyin: {
    indicator: 'bg-indigo-400 dark:bg-indigo-500',
    bar: 'bg-gradient-to-r from-indigo-400 via-indigo-400 to-violet-300 dark:from-indigo-500 dark:to-violet-400',
  },
  pianyin: {
    indicator: 'bg-violet-400 dark:bg-violet-500',
    bar: 'bg-gradient-to-r from-violet-400 via-purple-400 to-indigo-300 dark:from-violet-500 dark:to-indigo-400',
  },
  shishen: {
    indicator: 'bg-teal-400 dark:bg-teal-500',
    bar: 'bg-gradient-to-r from-teal-400 via-emerald-400 to-green-300 dark:from-teal-500 dark:to-green-400',
  },
  shangguan: {
    indicator: 'bg-cyan-400 dark:bg-cyan-500',
    bar: 'bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-300 dark:from-cyan-500 dark:to-emerald-400',
  },
  bijian: {
    indicator: 'bg-sky-400 dark:bg-sky-500',
    bar: 'bg-gradient-to-r from-sky-400 via-blue-400 to-[#9badff] dark:from-sky-500 dark:to-[#9badff]',
  },
  jiecai: {
    indicator: 'bg-blue-400 dark:bg-blue-500',
    bar: 'bg-gradient-to-r from-blue-400 via-cyan-400 to-blue-300 dark:from-blue-500 dark:to-cyan-400',
  },
  zhengcai: {
    indicator: 'bg-amber-400 dark:bg-amber-500',
    bar: 'bg-gradient-to-r from-amber-400 via-amber-400 to-yellow-300 dark:from-amber-500 dark:to-yellow-400',
  },
  piancai: {
    indicator: 'bg-orange-400 dark:bg-orange-500',
    bar: 'bg-gradient-to-r from-orange-400 via-orange-400 to-amber-400 dark:from-orange-500 dark:to-amber-500',
  },
  zhengguan: {
    indicator: 'bg-red-400 dark:bg-red-500',
    bar: 'bg-gradient-to-r from-red-400 via-red-400 to-rose-300 dark:from-red-500 dark:to-rose-400',
  },
  qisha: {
    indicator: 'bg-rose-500 dark:bg-rose-500',
    bar: 'bg-gradient-to-r from-rose-400 via-red-400 to-red-400 dark:from-rose-500 dark:to-red-500',
  },
};

const DEFAULT_TEN_GOD_BAR = {
  indicator: 'bg-slate-400 dark:bg-slate-500',
  bar: 'bg-gradient-to-r from-slate-400 via-slate-400 to-slate-300',
};

const ELEMENT_MEANINGS: Record<FiveElementKey, string> = {
  wood: '代表生长、变通与创造力，关联肝胆与筋骨健康，对应春季与东方。木旺则思维灵活有韧性，木弱则决策易犹豫',
  fire: '代表热情、表达与行动力，关联心脏与血液循环，对应夏季与南方。火旺则感染力强善于社交，火弱则动力不足',
  earth:
    '代表稳定、承载与诚信，关联脾胃与肌肉，对应季末与中央。土旺则踏实可靠能成事，土弱则缺乏根基感',
  metal:
    '代表规则、决断与执行，关联肺与皮肤，对应秋季与西方。金旺则条理清晰敢于取舍，金弱则原则感不足',
  water:
    '代表智慧、变通与内省，关联肾与泌尿系统，对应冬季与北方。水旺则悟性高善于适应，水弱则思维固化',
};

const DOMAIN_MEANINGS: Record<string, string> = {
  自我表达:
    '比肩与劫财的能量占比。反映你坚持主见、主动争取位置的倾向，数值越高越独立自主、边界感强',
  创造才能: '食神与伤官的能量占比。反映你输出创意、表达自我的天赋，数值越高越擅长靠才华吸引机会',
  财富积累:
    '正财与偏财的能量占比。反映你对资源的感知力和结果导向，数值越高越看重效率与可落地的回报',
  事业成就:
    '正官与七杀的能量占比。反映你的规则意识、责任担当与抗压能力，数值越高越能以目标驱动自己',
  资源支持: '正印与偏印的能量占比。反映你的学习吸收力、贵人缘与自我修复力，数值越高越能靠积累站稳',
};

function producedBy(el: FiveElementKey): FiveElementKey[] {
  const map: Record<FiveElementKey, FiveElementKey[]> = {
    metal: ['earth'],
    wood: ['water'],
    water: ['metal'],
    fire: ['wood'],
    earth: ['fire'],
  };
  return map[el];
}
function overcomes(el: FiveElementKey): FiveElementKey[] {
  const map: Record<FiveElementKey, FiveElementKey[]> = {
    metal: ['wood'],
    wood: ['earth'],
    water: ['fire'],
    fire: ['metal'],
    earth: ['water'],
  };
  return map[el];
}
function overcomeBy(el: FiveElementKey): FiveElementKey[] {
  const map: Record<FiveElementKey, FiveElementKey[]> = {
    metal: ['fire'],
    wood: ['metal'],
    water: ['earth'],
    fire: ['water'],
    earth: ['wood'],
  };
  return map[el];
}

export function DataOverviewCard({
  baziBasis,
  className,
}: {
  baziBasis: NonNullable<PartialDestinyReport['baziBasis']>;
  className?: string;
}) {
  const dayMasterElement = baziBasis.dayMaster.element;
  const dayStem = baziBasis.dayMaster.stem;
  const elementStats = baziBasis.elementStats;
  const tenGodStats = baziBasis.tenGodStats;
  const [showFavorableIntro, setShowFavorableIntro] = useState(false);

  const maxElementValue = Math.max(...elementStats.map((e) => e.value), 1);
  /** 命局五行总权重（百分比的分母） */
  const elementTotalWeight = useMemo(
    () => elementStats.reduce((sum, item) => sum + item.weight, 0),
    [elementStats]
  );

  const { favorable, unfavorable, favorableReason } = useMemo(() => {
    const totalValue = elementStats.reduce((s, e) => s + e.value, 0);
    const avgValue = totalValue / elementStats.length;
    const aboveAvg = elementStats.filter((e) => e.value > avgValue).map((e) => e.key);
    const belowAvg = elementStats.filter((e) => e.value < avgValue).map((e) => e.key);

    const supporting = [dayMasterElement, ...producedBy(dayMasterElement)];
    const favorableEls = supporting.filter((k) => belowAvg.includes(k) || !aboveAvg.includes(k));

    const restraining = [...overcomes(dayMasterElement), ...overcomeBy(dayMasterElement)];
    const highRestraining = aboveAvg.filter((k) => restraining.includes(k));
    const unfavEls = highRestraining.length > 0 ? highRestraining : restraining.slice(0, 1);

    const dayElLabel = ELEMENT_LABELS[dayMasterElement];
    const supportNames = favorableEls.map((k) => ELEMENT_LABELS[k]).join('、');
    const reason = `日主${dayStem}属${dayElLabel}，${supportNames}能生扶${dayElLabel}且当前盘面中不过旺，可作为补益方向`;

    return {
      favorable: [...new Set(favorableEls)],
      unfavorable: [...new Set(unfavEls)],
      favorableReason: reason,
    };
  }, [elementStats, dayMasterElement, dayStem]);

  const mergedTenGods = useMemo(() => mergeTenGods(tenGodStats), [tenGodStats]);

  const tenGodDetailGroups = useMemo(
    () => groupTenGodsByDomain(tenGodStats),
    [tenGodStats]
  );

  const [showTenGodDetail, setShowTenGodDetail] = useState(false);

  useEffect(() => {
    setShowFavorableIntro(false);
    setShowTenGodDetail(false);
  }, [baziBasis]);

  const dayMasterStrength = useMemo(() => {
    const dmStat = elementStats.find((e) => e.key === dayMasterElement);
    const val = dmStat?.value ?? 0;
    const avg = elementStats.reduce((s, e) => s + e.value, 0) / elementStats.length;
    if (val > avg * 1.3) return '偏强，主动出击型';
    if (val < avg * 0.7) return '偏弱，宜借力合作';
    return '中和，刚柔并济';
  }, [elementStats, dayMasterElement]);

  const tenGodMax = Math.max(
    ...mergedTenGods.map((g) => g.value),
    ...tenGodStats.map((t) => t.value),
    1
  );

  return (
    <GlassCard className={cn('relative shrink-0 overflow-hidden p-4 sm:p-5', className)}>
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-indigo-400/12 blur-3xl dark:bg-indigo-500/18"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-6 bottom-4 h-24 w-24 rounded-full bg-emerald-400/10 blur-3xl dark:bg-emerald-500/12"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4969E9]/15 to-[#7B8FFF]/25 ring-1 ring-[#5D7CFA]/20">
            <BarChart3 className="h-4 w-4 text-[#5D7CFA] dark:text-[#9BADFF]" aria-hidden />
          </div>
          <div className="min-w-0">
            <h3 className="font-heading text-base font-bold text-slate-900 sm:text-lg dark:text-slate-100">
              五行数据概览
            </h3>
            <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">
              日主{dayStem}
              {ELEMENT_LABELS[dayMasterElement]} · {dayMasterStrength}
            </p>
          </div>
        </div>
      </div>

      {/* 喜用神条：G-2 实体底 + 边框高光 */}
      <div
        className={cn(
          'relative mt-4 rounded-2xl border px-3 py-3 sm:px-4',
          'border-white/60 bg-white/75 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.05)]',
          'dark:border-white/10 dark:bg-slate-900/55',
          'ring-1 ring-inset ring-white/40 dark:ring-white/5'
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <FavorableGroup
              label="喜用神"
              labelClass="text-emerald-700 dark:text-emerald-300"
              elements={favorable}
              emptyText="五行均衡"
            />
            {unfavorable.length > 0 ? (
              <span className="hidden h-4 w-px bg-slate-200 sm:block dark:bg-slate-700" aria-hidden />
            ) : null}
            {unfavorable.length > 0 ? (
              <FavorableGroup
                label="忌神"
                labelClass="text-amber-700 dark:text-amber-300"
                elements={unfavorable}
              />
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setShowFavorableIntro((v) => !v)}
            className={cn(
              'inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold transition-colors',
              'border-slate-200/80 bg-slate-50/90 text-slate-500',
              'hover:border-[#5D7CFA]/30 hover:text-[#5D7CFA]',
              'dark:border-white/10 dark:bg-slate-800/80 dark:text-slate-400 dark:hover:text-[#9BADFF]'
            )}
          >
            <HelpCircle className="h-3.5 w-3.5" aria-hidden />
            {showFavorableIntro ? '收起说明' : '是什么？'}
          </button>
        </div>
        {showFavorableIntro ? (
          <div className="mt-3 border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-500 dark:border-white/5 dark:text-slate-400">
            <p>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">喜用神</span>
              ：能平衡命局的五行，可多接触对应颜色、方位与行业。
              {favorableReason}
            </p>
            <p className="mt-1.5">
              <span className="font-bold text-amber-700 dark:text-amber-300">忌神</span>
              ：过旺且克制日主的五行，宜留意压力来源，旺亦可化为行动力。
            </p>
          </div>
        ) : null}
      </div>

      <div className="relative mt-4 grid gap-3 sm:mt-5 sm:gap-4 lg:grid-cols-2 lg:items-stretch">
        <MetricPanel title="五行分布" subtitle="命局元素强弱">
          <div className={DISTRIBUTION_LIST_CLASS}>
            {elementStats.map((item) => {
              const pct = Math.round(item.value);
              const palette = ELEMENT_COLORS[item.key];
              const isMax = item.value >= maxElementValue;
              const hasSeasonalBonus = item.sources.seasonalBonus > 0;

              return (
                <DistributionRow
                  key={item.key}
                  indicatorClass={palette.indicator}
                  title={ELEMENT_LABELS[item.key]}
                  badge={
                    hasSeasonalBonus ? (
                      <span className="rounded-md bg-amber-100/90 px-1.5 py-px text-[10px] font-semibold leading-none text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                        月令
                      </span>
                    ) : null
                  }
                  pct={pct}
                  barClass={palette.bar}
                  isMax={isMax}
                  maxGlowClass={palette.barGlow}
                  pctClassName={palette.text}
                  popoverTitle={`${ELEMENT_LABELS[item.key]}元素`}
                  popoverBody={ELEMENT_MEANINGS[item.key]}
                  popoverExtra={
                    <div className="mt-2 border-t border-slate-100 pt-2 dark:border-white/5">
                      <WeightSourcePopover
                        item={item}
                        pct={pct}
                        chartTotalWeight={elementTotalWeight}
                        hasSeasonalBonus={hasSeasonalBonus}
                      />
                    </div>
                  }
                />
              );
            })}
          </div>
        </MetricPanel>

        <MetricPanel
          title="十神分布"
          subtitle="五维能量占比"
          action={
            <button
              type="button"
              onClick={() => setShowTenGodDetail((v) => !v)}
              className={cn(
                'inline-flex min-h-8 items-center gap-0.5 rounded-full px-2.5 text-[11px] font-bold transition-colors',
                showTenGodDetail
                  ? 'bg-[#5D7CFA]/12 text-[#5D7CFA] dark:bg-[#5D7CFA]/20 dark:text-[#9BADFF]'
                  : 'text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
              )}
            >
              {showTenGodDetail ? '五维归并' : '各十神明细'}
              {showTenGodDetail ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          }
        >
          <div className={showTenGodDetail ? 'space-y-4' : DISTRIBUTION_LIST_CLASS}>
            {showTenGodDetail
              ? tenGodDetailGroups.map((group) => (
                  <div key={group.domain} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div
                        className={cn('h-3.5 w-1 shrink-0 rounded-full', group.indicatorClass)}
                        aria-hidden
                      />
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        {group.label}
                      </span>
                    </div>
                    <div className={cn(DISTRIBUTION_LIST_CLASS, 'pl-1')}>
                      {group.items.map((item) => {
                        const pct = Math.round(item.value);
                        const tenGodStyle = TEN_GOD_BAR[item.key] ?? DEFAULT_TEN_GOD_BAR;
                        const domainPalette = getDomainPalette(group.label);
                        const isMax = item.value >= tenGodMax;

                        return (
                          <DistributionRow
                            key={item.key}
                            indicatorClass={tenGodStyle.indicator}
                            title={item.label}
                            pct={pct}
                            barClass={tenGodStyle.bar}
                            isMax={isMax}
                            maxGlowClass={domainPalette.barGlow}
                            pctClassName={domainPalette.text}
                            dimmed={pct === 0}
                            popoverTitle={item.label}
                            popoverBody={`属于「${group.label}」维度（${group.labelsHint}）。${item.label}占比 ${pct}%，反映该十神在命局中的相对分量。`}
                          />
                        );
                      })}
                    </div>
                  </div>
                ))
              : mergedTenGods.map((item) => {
                  const pct = Math.round(item.value);
                  const palette = getDomainPalette(item.friendlyLabel);
                  const isMax = item.value >= tenGodMax;

                  return (
                    <DistributionRow
                      key={item.key}
                      indicatorClass={palette.indicator}
                      title={item.friendlyLabel}
                      subtitle={item.labels.join('、')}
                      pct={pct}
                      barClass={palette.bar}
                      isMax={isMax}
                      maxGlowClass={palette.barGlow}
                      pctClassName={palette.text}
                      popoverTitle={item.friendlyLabel}
                      popoverBody={
                        DOMAIN_MEANINGS[item.friendlyLabel] || '该维度的十神能量占比'
                      }
                      popoverFooter={`包含：${item.labels.join('、')}`}
                    />
                  );
                })}
          </div>
        </MetricPanel>
      </div>
    </GlassCard>
  );
}

/** 两栏列表统一行距 */
const DISTRIBUTION_LIST_CLASS = 'space-y-2.5';

function mergeTenGods(tenGodStats: NonNullable<PartialDestinyReport['baziBasis']>['tenGodStats']) {
  const groups = new Map<string, { friendlyLabel: string; labels: string[]; value: number }>();
  for (const item of tenGodStats) {
    const friendlyLabel = DOMAIN_FRIENDLY[item.domain];
    const existing = groups.get(friendlyLabel);
    if (existing) {
      existing.value += item.value;
      existing.labels.push(item.label);
    } else {
      groups.set(friendlyLabel, { friendlyLabel, labels: [item.label], value: item.value });
    }
  }
  return Array.from(groups.entries())
    .map(([key, data]) => ({ key, ...data }))
    .sort((a, b) => b.value - a.value);
}

function groupTenGodsByDomain(
  tenGodStats: NonNullable<PartialDestinyReport['baziBasis']>['tenGodStats']
) {
  return DOMAIN_DISPLAY_ORDER.map((domain) => {
    const label = DOMAIN_FRIENDLY[domain];
    const items = tenGodStats
      .filter((item) => item.domain === domain)
      .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'zh-CN'));
    const labelsHint = items.map((i) => i.label).join('、');
    const palette = getDomainPalette(label);
    return {
      domain,
      label,
      labelsHint,
      indicatorClass: palette.indicator,
      items,
    };
  }).filter((group) => group.items.length > 0);
}

function MetricPanel({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-[20px] border border-white/55 bg-white/72 p-3 sm:p-3.5',
        'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)]',
        'ring-1 ring-inset ring-white/50',
        'dark:border-white/8 dark:bg-slate-900/45 dark:ring-white/5'
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p className="min-w-0 text-[13px] leading-tight text-slate-800 dark:text-slate-100">
          <span className="font-bold">{title}</span>
          <span className="font-normal text-slate-400 dark:text-slate-500"> · {subtitle}</span>
        </p>
        {action}
      </div>
      <div className="mt-2.5 flex-1">{children}</div>
    </div>
  );
}

/** 五行 / 十神统一行：色条 + 标题行 + 进度条 */
function DistributionRow({
  indicatorClass,
  title,
  subtitle,
  badge,
  pct,
  barClass,
  isMax,
  maxGlowClass,
  pctClassName,
  popoverTitle,
  popoverBody,
  popoverFooter,
  popoverExtra,
  dimmed = false,
}: {
  indicatorClass: string;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  pct: number;
  barClass: string;
  isMax: boolean;
  maxGlowClass?: string;
  pctClassName?: string;
  popoverTitle: string;
  popoverBody: string;
  popoverFooter?: string;
  popoverExtra?: React.ReactNode;
  dimmed?: boolean;
}) {
  const width = pct === 0 ? '0%' : `${Math.min(100, Math.max(4, pct))}%`;

  return (
    <div className={cn('flex gap-2', dimmed && 'opacity-55')}>
      <div
        className={cn('mt-0.5 w-1 shrink-0 rounded-full', indicatorClass)}
        style={{ minHeight: subtitle ? '2.5rem' : '2rem' }}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button type="button" className="min-w-0 flex-1 cursor-help text-left">
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-[13px] font-semibold leading-tight text-slate-800 dark:text-slate-100">
                    {title}
                  </span>
                  {badge}
                </div>
                {subtitle ? (
                  <p className="mt-0.5 truncate text-[11px] leading-tight text-slate-500 dark:text-slate-400">
                    {subtitle}
                  </p>
                ) : null}
              </button>
            </PopoverTrigger>
            <PopoverContent
              side="top"
              align="start"
              className="w-56 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-white/10 dark:bg-slate-900"
            >
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{popoverTitle}</div>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {popoverBody}
              </p>
              {popoverFooter ? (
                <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] text-slate-400 dark:border-white/5">
                  {popoverFooter}
                </p>
              ) : null}
              {popoverExtra}
            </PopoverContent>
          </Popover>
          <span
            className={cn(
              'shrink-0 pt-px tabular-nums text-[13px] leading-none',
              pctClassName ?? 'text-slate-600 dark:text-slate-300',
              isMax ? 'font-black' : 'font-bold'
            )}
          >
            {pct}%
          </span>
        </div>
        <div className={cn('mt-1.5 h-2.5 overflow-hidden rounded-full', SOFT_BAR_TRACK)}>
          <div
            className={cn(
              'h-full min-w-[4px] rounded-full transition-[width] duration-500 ease-out',
              SOFT_BAR_SHINE,
              barClass,
              isMax && maxGlowClass
            )}
            style={{ width }}
          />
        </div>
      </div>
    </div>
  );
}

function FavorableGroup({
  label,
  labelClass,
  elements,
  emptyText,
}: {
  label: string;
  labelClass: string;
  elements: FiveElementKey[];
  emptyText?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={cn('text-xs font-bold', labelClass)}>{label}</span>
      {elements.length > 0 ? (
        elements.map((k) => (
          <span
            key={k}
            className={cn(
              'inline-flex h-7 min-w-[1.75rem] items-center justify-center rounded-lg px-2 text-xs font-black ring-1',
              ELEMENT_COLORS[k].chip,
              ELEMENT_COLORS[k].text
            )}
          >
            {ELEMENT_LABELS[k]}
          </span>
        ))
      ) : emptyText ? (
        <span className="text-xs text-slate-500 dark:text-slate-400">{emptyText}</span>
      ) : null}
    </div>
  );
}

function WeightSourcePopover({
  item,
  pct,
  chartTotalWeight,
  hasSeasonalBonus,
}: {
  item: NonNullable<PartialDestinyReport['baziBasis']>['elementStats'][number];
  pct: number;
  chartTotalWeight: number;
  hasSeasonalBonus: boolean;
}) {
  return (
    <>
      <div className="text-xs font-bold text-slate-500 dark:text-slate-400">
        权重来源（本行合计 {item.weight} 点）
      </div>
      <div className="mt-2 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        <div className="flex justify-between">
          <span>天干</span>
          <span className="font-semibold">{item.sources.stems}</span>
        </div>
        <div className="flex justify-between">
          <span>地支</span>
          <span className="font-semibold">{item.sources.branches}</span>
        </div>
        <div className="flex justify-between">
          <span>藏干</span>
          <span className="font-semibold">{item.sources.hiddenStems}</span>
        </div>
        <div className="flex justify-between border-t border-slate-100 pt-1.5 dark:border-white/5">
          <span>月令加成</span>
          <span
            className={cn(
              'font-semibold',
              hasSeasonalBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
            )}
          >
            {hasSeasonalBonus ? `+${item.sources.seasonalBonus}` : '0'}
          </span>
        </div>
      </div>
      <p className="mt-2 border-t border-slate-100 pt-2 text-[11px] leading-relaxed text-slate-500 dark:border-white/5 dark:text-slate-400">
        进度条 {pct}% = 本行 {item.weight} ÷ 命局五行总权重 {chartTotalWeight}（天干 10、地支 8、藏干按主/中/余
        4/2/1 计，月支另 +4）。五项占比四舍五入后合计约 100%。
      </p>
    </>
  );
}

