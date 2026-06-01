'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const ELEMENT_LABELS: Record<FiveElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

const ELEMENT_COLORS: Record<FiveElementKey, { bg: string; text: string; bar: string }> = {
  metal: { bg: 'bg-amber-50/70 dark:bg-amber-950/30', text: 'text-amber-700 dark:text-amber-300', bar: 'bg-amber-500 dark:bg-amber-600' },
  wood: { bg: 'bg-emerald-50/70 dark:bg-emerald-950/30', text: 'text-emerald-700 dark:text-emerald-300', bar: 'bg-emerald-500 dark:bg-emerald-600' },
  water: { bg: 'bg-blue-50/70 dark:bg-blue-950/30', text: 'text-blue-700 dark:text-blue-300', bar: 'bg-blue-500 dark:bg-blue-600' },
  fire: { bg: 'bg-rose-50/70 dark:bg-rose-950/30', text: 'text-rose-700 dark:text-rose-300', bar: 'bg-rose-500 dark:bg-rose-600' },
  earth: { bg: 'bg-stone-50/70 dark:bg-stone-950/30', text: 'text-stone-700 dark:text-stone-300', bar: 'bg-stone-500 dark:bg-stone-600' },
};

/** 五行在命理中的象征意义 */
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

/** 十神大白话映射 */
const TEN_GOD_FRIENDLY_LABELS: Record<string, string> = {
  bijian: '自我表达',
  jiecai: '自我表达',
  shishen: '创造才能',
  shangguan: '创造才能',
  zhengcai: '财富积累',
  piancai: '财富积累',
  zhengguan: '事业成就',
  qisha: '事业成就',
  zhengyin: '资源支持',
  pianyin: '资源支持',
};

/** 归并维度在命理中的实际含义 */
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

  // 推导喜用神和忌神
  const { favorable, unfavorable, favorableReason } = useMemo(() => {
    const totalValue = elementStats.reduce((s, e) => s + e.value, 0);
    const avgValue = totalValue / elementStats.length;
    const aboveAvg = elementStats.filter((e) => e.value > avgValue).map((e) => e.key);
    const belowAvg = elementStats.filter((e) => e.value < avgValue).map((e) => e.key);

    // 生扶日主 = 同五行（比劫帮身）+ 生我之五行（印星生扶）
    const supporting = [dayMasterElement, ...producedBy(dayMasterElement)];
    const favorableEls = supporting.filter((k) => belowAvg.includes(k) || !aboveAvg.includes(k));

    const restraining = [...overcomes(dayMasterElement), ...overcomeBy(dayMasterElement)];
    const highRestraining = aboveAvg.filter((k) => restraining.includes(k));
    const unfavEls = highRestraining.length > 0 ? highRestraining : restraining.slice(0, 1);

    // 推导依据文案
    const dayElLabel = ELEMENT_LABELS[dayMasterElement];
    const supportNames = favorableEls.map((k) => ELEMENT_LABELS[k]).join('、');
    const reason = `日主${dayStem}属${dayElLabel}，${supportNames}能生扶${dayElLabel}且当前盘面中不过旺，可作为补益方向`;

    return {
      favorable: [...new Set(favorableEls)],
      unfavorable: [...new Set(unfavEls)],
      favorableReason: reason,
    };
  }, [elementStats, dayMasterElement, dayStem]);

  const mergedTenGods = useMemo(() => {
    const groups = new Map<string, { friendlyLabel: string; labels: string[]; value: number }>();
    for (const item of tenGodStats) {
      const friendlyLabel = TEN_GOD_FRIENDLY_LABELS[item.key] ?? item.label;
      const existing = groups.get(friendlyLabel);
      if (existing) {
        existing.value += item.value;
        existing.labels.push(item.label);
      } else {
        groups.set(friendlyLabel, { friendlyLabel, labels: [item.label], value: item.value });
      }
    }
    return Array.from(groups.entries()).map(([key, data]) => ({ key, ...data }));
  }, [tenGodStats]);

  const [showTenGodDetail, setShowTenGodDetail] = useState(false);

  // 切换命盘时重置展开状态
  useEffect(() => {
    setShowFavorableIntro(false);
    setShowTenGodDetail(false);
  }, [baziBasis]);

  // 日主强弱概述
  const dayMasterStrength = useMemo(() => {
    const dmStat = elementStats.find((e) => e.key === dayMasterElement);
    const val = dmStat?.value ?? 0;
    const avg = elementStats.reduce((s, e) => s + e.value, 0) / elementStats.length;
    if (val > avg * 1.3) return '偏强，自我驱动力足，适合主动出击';
    if (val < avg * 0.7) return '偏弱，善于借力与合作，需注意能量管理';
    return '中和，刚柔并济，适应力强';
  }, [elementStats, dayMasterElement]);

  return (
    <GlassCard className={cn('shrink-0 overflow-hidden p-4 sm:p-5', className)}>
      <div className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
        五行数据概览
      </div>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        日主{dayStem}属{ELEMENT_LABELS[dayMasterElement]} · {dayMasterStrength}
      </p>

      {/* 喜用神 */}
      <div className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-50/70 to-blue-50/70 dark:from-emerald-950/20 dark:to-blue-950/20 px-3 sm:px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-2 sm:gap-x-3 gap-y-1">
            <span className="text-xs sm:text-sm font-extrabold text-emerald-700 dark:text-emerald-300">喜用神</span>
            {favorable.length > 0 ? (
              favorable.map((k) => (
                <span
                  key={k}
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold',
                    ELEMENT_COLORS[k].bg,
                    ELEMENT_COLORS[k].text
                  )}
                >
                  {ELEMENT_LABELS[k]}
                </span>
              ))
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">五行均衡</span>
            )}
            {unfavorable.length > 0 && (
              <>
                <span className="text-xs sm:text-sm font-extrabold text-amber-700 dark:text-amber-300">忌神</span>
                {unfavorable.map((k) => (
                  <span
                    key={k}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-bold',
                      ELEMENT_COLORS[k].bg,
                      ELEMENT_COLORS[k].text
                    )}
                  >
                    {ELEMENT_LABELS[k]}
                  </span>
                ))}
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowFavorableIntro(!showFavorableIntro)}
            className="shrink-0 text-[10px] font-medium text-slate-400 dark:text-slate-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
          >
            {showFavorableIntro ? '收起' : '是什么？'}
          </button>
        </div>
        {showFavorableIntro && (
          <div className="mt-2 border-t border-emerald-100/60 dark:border-emerald-800/30 pt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            <p>
              <span className="font-bold text-emerald-700 dark:text-emerald-300">喜用神</span>
              ：能平衡命局的五行。当某个元素过弱而日主需要它生扶时，该元素即为喜用神。
               生活中可多接触喜用神对应的颜色、方位、行业，有助于增强运势。
              <br />
              {favorableReason}
            </p>
            <p className="mt-1.5">
              <span className="font-bold text-amber-700 dark:text-amber-300">忌神</span>
              ：命局中过旺且克制日主的五行，容易造成失衡与压力，需要留意但不代表不好——旺
              的能量也可以转化为优势，关键是找到合适的使用方式。
            </p>
          </div>
        )}
      </div>

      {/* 左右分栏：五行 + 十神 */}
      <div className="mt-4 sm:mt-5 grid gap-4 sm:gap-6 lg:grid-cols-2">
        {/* 五行统计 */}
        <div>
          <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                五行分布
              </span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600">命局中各元素相对强弱</span>
          </div>
          <div className="mt-3 space-y-3">
            {elementStats.map((item) => {
              const count = item.sources.stems + item.sources.branches + item.sources.hiddenStems;
              const pct = Math.round(item.value);
              const palette = ELEMENT_COLORS[item.key];
              const isMax = item.value >= maxElementValue;
              const hasSeasonalBonus = item.sources.seasonalBonus > 0;

              return (
                <div key={item.key}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className={cn(
                              'inline-flex items-center justify-center rounded-md px-2 py-0.5 text-xs font-black shrink-0 cursor-help',
                              palette.bg,
                              palette.text
                            )}
                          >
                            {ELEMENT_LABELS[item.key]}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                          align="start"
                          className="w-56 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                        >
                          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                            {ELEMENT_LABELS[item.key]}元素
                          </div>
                          <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                            {ELEMENT_MEANINGS[item.key]}
                          </p>
                        </PopoverContent>
                      </Popover>
                      <Popover>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-help truncate"
                          >
                            权重 {pct}%
                            {hasSeasonalBonus && (
                              <span className="text-[10px] text-amber-500 shrink-0">+月令</span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                        className="w-52 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                      >
                        <div className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2">
                          权重来源（合计 {count} 点）
                        </div>
                        <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
                            <div className="flex justify-between">
                              <span>天干（显性特质）</span>
                              <span className="font-semibold">{item.sources.stems}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>地支（隐性根基）</span>
                              <span className="font-semibold">{item.sources.branches}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>藏干（潜在能量）</span>
                              <span className="font-semibold">{item.sources.hiddenStems}</span>
                            </div>
                          <div className="flex justify-between border-t border-slate-100 dark:border-white/5 pt-1.5 mt-1.5">
                            <span>月令（季节加成）</span>
                            <span
                              className={cn(
                                'font-semibold',
                                hasSeasonalBonus ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'
                              )}
                            >
                                +{item.sources.seasonalBonus}
                              </span>
                            </div>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                    <span
                      className={cn(
                        'text-xs font-black shrink-0',
                        isMax ? palette.text : 'text-slate-600 dark:text-slate-300'
                      )}
                    >
                      {pct}%
                    </span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <div
                      className={cn(
                        'h-full rounded-full transition-all',
                        palette.bar,
                        isMax && 'ring-1 ring-white/50'
                      )}
                      style={{ width: `${Math.min(100, Math.max(4, pct))}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 十神统计 */}
        <div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                十神分布
              </span>
              <span className="text-[10px] text-slate-300 dark:text-slate-600">各维度能量占比</span>
            </div>
            <button
              type="button"
              onClick={() => setShowTenGodDetail((v) => !v)}
              className="text-[10px] font-bold text-slate-400 dark:text-slate-500 hover:text-[#5D7CFA] dark:hover:text-[#5D7CFA] transition-colors"
            >
              {showTenGodDetail ? '归并视图' : '展开详情'}
            </button>
          </div>
          <div className="mt-3 space-y-3">
            {showTenGodDetail
              ? tenGodStats.map((item) => {
                  const pct = Math.round(item.value);
                  const domainLabel = TEN_GOD_FRIENDLY_LABELS[item.key] ?? item.label;
                  return (
                    <div key={item.key}>
                      <div className="flex items-center justify-between gap-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-help text-left"
                            >
                              {item.label}
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            className="w-52 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                          >
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">{item.label}</div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                              属于"{domainLabel}"维度的能量。{item.label}
                              数值越高，说明该十神在命局中的作用越突出，对该维度的外在表现与内在倾向均有直接影响。
                            </p>
                          </PopoverContent>
                        </Popover>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          {domainLabel}
                        </span>
                        <span className="text-xs font-black text-slate-900 dark:text-slate-100">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-[#5D7CFA] dark:bg-[#6D8CFF]"
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              : mergedTenGods.map((item) => {
                  const pct = Math.round(item.value);
                  return (
                    <div key={item.key}>
                      <div className="flex items-center justify-between gap-3">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              className="text-sm font-semibold text-slate-700 dark:text-slate-200 cursor-help text-left"
                            >
                              {item.friendlyLabel}
                              <span className="ml-1 text-slate-400 font-normal">
                                （{item.labels.join('、')}）
                              </span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            side="top"
                            className="w-56 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 p-3 shadow-lg dark:shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
                          >
                            <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                              {item.friendlyLabel}
                            </div>
                            <p className="mt-1 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                              {DOMAIN_MEANINGS[item.friendlyLabel] || '该维度的十神能量占比'}
                            </p>
                            <div className="mt-2 border-t border-slate-100 dark:border-white/5 pt-2 text-[11px] text-slate-400 dark:text-slate-500">
                              包含十神：{item.labels.join('、')}
                            </div>
                          </PopoverContent>
                        </Popover>
                        <span className="text-xs font-black text-slate-900 dark:text-slate-100">{pct}%</span>
                      </div>
                      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                          className="h-full rounded-full bg-[#5D7CFA] dark:bg-[#6D8CFF]"
                          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
