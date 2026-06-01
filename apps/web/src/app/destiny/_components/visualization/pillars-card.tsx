'use client';

import React, { type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport, BaZiPillar } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { HelpCircle } from 'lucide-react';

const elementStyles: Record<
  FiveElementKey,
  { bg: string; text: string; ring: string; orb: string; hoverClass: string }
> = {
  metal: {
    bg: 'bg-amber-50/70 dark:bg-amber-950/30',
    text: 'text-amber-700 dark:text-amber-300',
    ring: 'ring-amber-200/60 dark:ring-amber-800/30',
    orb: 'from-amber-500/14 to-orange-500/8',
    hoverClass:
      'hover:border-amber-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(245,158,11,0.14),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  wood: {
    bg: 'bg-emerald-50/70 dark:bg-emerald-950/30',
    text: 'text-emerald-700 dark:text-emerald-300',
    ring: 'ring-emerald-200/60 dark:ring-emerald-800/30',
    orb: 'from-emerald-500/14 to-teal-500/8',
    hoverClass:
      'hover:border-emerald-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(16,185,129,0.14),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  water: {
    bg: 'bg-slate-50/70 dark:bg-slate-800/40',
    text: 'text-slate-700 dark:text-slate-300',
    ring: 'ring-slate-200/60 dark:ring-white/5',
    orb: 'from-blue-500/12 to-slate-400/8',
    hoverClass:
      'hover:border-slate-300/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(59,130,246,0.12),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  fire: {
    bg: 'bg-rose-50/70 dark:bg-rose-950/30',
    text: 'text-rose-700 dark:text-rose-300',
    ring: 'ring-rose-200/60 dark:ring-rose-800/30',
    orb: 'from-rose-500/14 to-orange-500/8',
    hoverClass:
      'hover:border-rose-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(244,63,94,0.14),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  earth: {
    bg: 'bg-stone-50/70 dark:bg-stone-950/30',
    text: 'text-stone-700 dark:text-stone-300',
    ring: 'ring-stone-200/60 dark:ring-stone-800/30',
    orb: 'from-stone-500/12 to-amber-600/8',
    hoverClass:
      'hover:border-stone-300/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(120,113,108,0.12),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
};

/** 四柱卡悬停动效（对齐紫微宫位卡） */
const pillarCardMotionClass = cn(
  'transform-gpu transition-all duration-200',
  'hover:-translate-y-0.5 hover:scale-[1.01]',
  'active:translate-y-0 active:scale-[0.995]',
  'motion-reduce:transition-none motion-reduce:hover:transform-none'
);

export function PillarsCard({
  pillars,
  balanceInsight,
  patternHighlights,
  baziBasis,
}: {
  pillars?: PartialDestinyReport['pillars'];
  balanceInsight?: PartialDestinyReport['balanceInsight'];
  patternHighlights?: PartialDestinyReport['patternHighlights'];
  baziBasis?: PartialDestinyReport['baziBasis'];
}) {
  const balanceInsightTitle = balanceInsight?.title?.trim() || '';
  const balanceInsightValue = balanceInsight?.value?.trim() || '';
  const balanceInsightTooltip = balanceInsight?.tooltip?.trim() || '';
  const hasBalanceInsight = Boolean(
    balanceInsightTitle && balanceInsightValue && balanceInsightTooltip
  );

  return (
    <GlassCard className="shrink-0 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
            四柱命盘
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            点击各柱查看藏干与十神详解
          </p>
        </div>

        {hasBalanceInsight ? (
          <ClickHintPopover align="end" title={balanceInsightTitle} body={balanceInsightTooltip}>
            <button
              type="button"
              aria-label={`查看${balanceInsightTitle}说明`}
              className={cn(
                'shrink-0 rounded-xl border border-slate-200/60 bg-white/60 px-2.5 py-2 text-right',
                'transition-colors hover:border-blue-200/80 hover:bg-blue-50/80',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/40',
                'dark:border-white/10 dark:bg-slate-800/50 dark:hover:border-blue-500/30 dark:hover:bg-blue-950/30'
              )}
            >
              <div className="text-[10px] font-bold leading-tight tracking-wide text-slate-400 dark:text-slate-500">
                {balanceInsightTitle}
              </div>
              <div className="mt-1 flex items-center justify-end gap-1.5">
                <span className="text-sm font-extrabold text-slate-700 dark:text-slate-200">
                  {balanceInsightValue}
                </span>
                <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                  <HelpCircle className="h-3 w-3 shrink-0" aria-hidden />
                  点击查看
                </span>
              </div>
            </button>
          </ClickHintPopover>
        ) : (
          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-300 dark:text-slate-600 font-bold tracking-[0.18em] uppercase">
              旺衰解析
            </div>
            <div className="mt-2 h-4 w-16 rounded bg-slate-200/70 dark:bg-slate-700/50" />
          </div>
        )}
      </div>

      <div className="mt-4 sm:mt-6 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-4">
        {(pillars && pillars.length > 0
          ? pillars
          : Array.from({ length: 4 }).map((_, idx) => ({
              label: ['年柱', '月柱', '日柱', '时柱'][idx],
            }))
        ).map((p, idx) => {
          if (!('stem' in p)) {
            return (
              <div
                key={p.label}
                className="rounded-2xl sm:rounded-3xl border border-white/50 dark:border-white/5 bg-white/55 dark:bg-slate-800/40 px-3 py-3 sm:py-4 shadow-sm sm:px-4"
              >
                <div className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">{p.label}</div>
                <div className="mt-2 sm:mt-3 h-6 sm:h-8 w-16 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
                <div className="mt-2 sm:mt-3 h-2.5 sm:h-3 w-24 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
              </div>
            );
          }
          const pillar = p as BaZiPillar;
          const style = elementStyles[pillar.element];
          const isFocus = idx === 2;

          // 从 pillar.tooltip 中提取十神标签（如"比劫助身"）
          const pillarTag = extractTenGodLabel(pillar.tooltip);

          const isInteractive = Boolean(pillar.tooltip);

          const pillarContent = (
            <div
              className={cn(
                'group relative overflow-hidden rounded-2xl sm:rounded-3xl border border-white/50 dark:border-white/5',
                'px-3 py-3 sm:px-4 sm:py-4 text-left',
                'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)]',
                isInteractive && pillarCardMotionClass,
                isInteractive && 'hover:bg-white/72 dark:hover:bg-slate-800/55',
                isInteractive && style.hoverClass,
                !isInteractive && 'cursor-default',
                isFocus
                  ? 'bg-[#5D7CFA]/6 dark:bg-[#5D7CFA]/15 ring-[3px] ring-[#5D7CFA]/75 dark:ring-[#5D7CFA]/40 shadow-lg hover:ring-[#5D7CFA]/85'
                  : 'bg-white/55 dark:bg-slate-800/40'
              )}
            >
              {isInteractive ? (
                <>
                  <span
                    className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-50 transition-opacity duration-200 group-hover:opacity-95 dark:via-white/20"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'pointer-events-none absolute -right-8 -top-8 z-0 h-28 w-28 rounded-full bg-gradient-to-br blur-2xl',
                      'opacity-25 transition-opacity duration-200 group-hover:opacity-50',
                      style.orb
                    )}
                    aria-hidden
                  />
                </>
              ) : null}

              <div className="relative z-[2]">
              {/* 日主标签 */}
              {isFocus && (
                <div className="absolute -top-2 -right-2 sm:-top-2.5 sm:-right-2.5 z-10 rounded-full bg-[#5D7CFA] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-[0_4px_10px_-4px_rgba(47,107,255,0.6)]">
                  日主
                </div>
              )}

              {/* 十神标签移到顶部 */}
              {pillarTag && (
                <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/60 dark:border-white/10 bg-white/80 dark:bg-slate-800/60 px-1.5 sm:px-2 py-0.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                    <ElementDot element={pillar.element} />
                    {pillarTag}
                  </span>
                </div>
              )}

              <div className="text-[10px] sm:text-xs font-bold text-slate-400 dark:text-slate-500">{pillar.label}</div>
              <div className="mt-1.5 sm:mt-2 flex items-center justify-between gap-2">
                <div
                  className={cn('text-[1.4rem] font-black tracking-tight sm:text-3xl', style.text)}
                >
                  {pillar.stem}
                </div>
                <div
                  className={cn('text-[1.4rem] font-black tracking-tight sm:text-3xl', style.text)}
                >
                  {pillar.branch}
                </div>
              </div>

              {/* 底部：五行标签 + 纳音 */}
              <div className="mt-2 sm:mt-3 flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span
                  className={cn(
                    'inline-flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-0.5 text-[10px] font-bold',
                    style.bg,
                    style.text
                  )}
                >
                  <ElementDot element={pillar.element} />
                  {elementLabel(pillar.element)}
                </span>
                {(() => {
                  const chartPillar = baziBasis?.pillars?.find((bp) => bp.label === pillar.label);
                  if (!chartPillar?.sound) return null;
                  return (
                    <span className="text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                      {chartPillar.sound}
                    </span>
                  );
                })()}
              </div>
              </div>

              <div
                className={cn(
                  'pointer-events-none absolute inset-0 rounded-2xl sm:rounded-3xl ring-1 transition-all duration-200',
                  style.ring,
                  isInteractive && 'group-hover:ring-2'
                )}
              />
              <div
                className={cn(
                  'pointer-events-none absolute inset-0 -z-10 rounded-2xl sm:rounded-3xl blur-2xl opacity-40 transition-opacity duration-200',
                  style.bg,
                  isInteractive && 'group-hover:opacity-55'
                )}
              />
            </div>
          );

          if (!pillar.tooltip) {
            return <div key={pillar.label}>{pillarContent}</div>;
          }

          return (
            <Popover key={pillar.label}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="w-full rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30 dark:focus-visible:ring-[#5D7CFA]/50"
                >
                  {pillarContent}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className={cn(
                  'w-72 rounded-2xl border border-slate-200/90 dark:border-white/10 bg-white/88 dark:bg-slate-900/90 backdrop-blur-[26px]',
                  'ring-1 ring-[#5D7CFA]/12 dark:ring-[#5D7CFA]/20',
                  'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)] dark:shadow-[0_28px_70px_-30px_rgba(0,0,0,0.55)]',
                  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                )}
                side="top"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                    深度解析：{pillar.label}
                  </div>
                  {hasBalanceInsight && (
                    <span className="rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50/90 dark:bg-slate-800/60 px-2.5 py-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                      命局重心 {balanceInsightValue}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{pillar.tooltip}</div>
                {(() => {
                  const chartPillar = baziBasis?.pillars?.find((bp) => bp.label === pillar.label);
                  if (!chartPillar?.hiddenStems?.length) return null;
                  return (
                    <div className="mt-3 border-t border-slate-100 dark:border-white/5 pt-3">
                      <div className="text-[11px] font-bold text-slate-400 dark:text-slate-500 mb-2">藏干</div>
                      <div className="flex flex-wrap gap-1.5">
                        {chartPillar.hiddenStems.map((hs) => (
                          <span
                            key={`${pillar.label}-${hs.stem}-${hs.type}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 dark:border-white/10 bg-slate-50 dark:bg-slate-800/50 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                          >
                            {hs.stem}
                            <span className="text-slate-400 dark:text-slate-500 font-normal">{hs.tenGod}</span>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </PopoverContent>
            </Popover>
          );
        })}
      </div>

      {patternHighlights && patternHighlights.length > 0 && (
        <div className="mt-4 sm:mt-6 border-t border-slate-200/60 pt-4 dark:border-white/10">
          <p className="mb-2.5 text-[11px] font-medium text-slate-400 dark:text-slate-500">
            格局要点
            <span className="mx-1.5 text-slate-300 dark:text-slate-600" aria-hidden>
              ·
            </span>
            点击标签查看说明
          </p>
          <div className="flex flex-wrap gap-2">
            {patternHighlights.map((item) => (
              <LegendDot key={item.label} label={item.label} tooltip={item.tooltip} />
            ))}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function ElementDot({ element }: { element: FiveElementKey }) {
  const colors: Record<FiveElementKey, string> = {
    metal: 'bg-amber-500',
    wood: 'bg-emerald-500',
    water: 'bg-blue-500',
    fire: 'bg-rose-500',
    earth: 'bg-stone-500',
  };
  return <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', colors[element])} />;
}

function elementLabel(k: FiveElementKey) {
  switch (k) {
    case 'metal':
      return '金';
    case 'wood':
      return '木';
    case 'water':
      return '水';
    case 'fire':
      return '火';
    case 'earth':
      return '土';
  }
}

/** 从 tooltip 文本中提取十神关键词（如"比劫助身"等四字短语） */
function extractTenGodLabel(tooltip?: string): string {
  if (!tooltip) return '';
  // 尝试匹配常用十神关键词
  const match = tooltip.match(/([一-龥]{2,6}(?:助身|生身|帮身|克身|耗身|泄身|制身))/);
  return match?.[1] ?? '';
}

function LegendDot({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <ClickHintPopover title={label} body={tooltip}>
      <button
        type="button"
        aria-label={`查看${label}说明`}
        aria-haspopup="dialog"
        className={cn(
          'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-2.5 py-1.5',
          'border-slate-200/70 bg-white/85 text-[11px] font-semibold text-slate-600 sm:text-xs',
          'shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors',
          'hover:border-blue-200/80 hover:bg-blue-50/90 hover:text-blue-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/40',
          'dark:border-white/10 dark:bg-slate-800/70 dark:text-slate-300',
          'dark:hover:border-blue-500/30 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
        )}
      >
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#5D7CFA]/70" aria-hidden />
        <span>{label}</span>
        <HelpCircle className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" aria-hidden />
      </button>
    </ClickHintPopover>
  );
}

/** 点击触发的说明弹层（避免 hover 导致多个 Popover 互相抢焦点） */
function ClickHintPopover({
  title,
  body,
  children,
  align = 'center',
}: {
  title: string;
  body: string;
  children: React.ReactNode;
  align?: 'center' | 'end';
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align={align}
        side="top"
        sideOffset={8}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          'z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 p-3 text-left',
          'bg-white dark:border-white/10 dark:bg-slate-900',
          'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.35)] dark:shadow-[0_28px_70px_-30px_rgba(0,0,0,0.55)]',
          'ring-1 ring-slate-200/80 dark:ring-white/10'
        )}
      >
        <span className="block text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</span>
        <span className="mt-2 block text-sm leading-relaxed text-slate-600 dark:text-slate-300">{body}</span>
      </PopoverContent>
    </Popover>
  );
}
