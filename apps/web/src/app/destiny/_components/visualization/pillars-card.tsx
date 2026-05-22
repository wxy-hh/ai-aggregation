'use client';

import React, { type CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport, BaZiPillar } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const elementStyles: Record<FiveElementKey, { bg: string; text: string; ring: string }> = {
  metal: { bg: 'bg-amber-50/70', text: 'text-amber-700', ring: 'ring-amber-200/60' },
  wood: { bg: 'bg-emerald-50/70', text: 'text-emerald-700', ring: 'ring-emerald-200/60' },
  water: { bg: 'bg-slate-50/70', text: 'text-slate-700', ring: 'ring-slate-200/60' },
  fire: { bg: 'bg-rose-50/70', text: 'text-rose-700', ring: 'ring-rose-200/60' },
  earth: { bg: 'bg-stone-50/70', text: 'text-stone-700', ring: 'ring-stone-200/60' },
};

export function PillarsCard({
  profile,
  pillars,
  balanceInsight,
  patternHighlights,
  baziBasis,
}: {
  profile?: PartialDestinyReport['profile'];
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
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-white/60 border border-white/50 text-slate-700">
              {profile?.genderLabel ?? '命盘生成中'}
            </span>
            <div className="min-w-0 truncate font-heading text-lg font-bold text-slate-900 dark:text-slate-100">
              {profile?.name ?? '基础信息整理中'}
            </div>
          </div>
          <div className="mt-2 text-xs leading-6 text-slate-500 sm:text-sm">
            {profile?.birthText?.replace(/\(.*?\)/g, '').trim() ?? '正在整理生辰信息'}
          </div>
        </div>

        {hasBalanceInsight ? (
          <HoverHint align="end" title={balanceInsightTitle} body={balanceInsightTooltip}>
            <div className="shrink-0 text-right">
              <div className="text-xs text-slate-400 font-bold tracking-[0.18em] uppercase">
                {balanceInsightTitle}
              </div>
              <div className="mt-1 text-sm font-extrabold text-slate-700">
                {balanceInsightValue}
              </div>
            </div>
          </HoverHint>
        ) : (
          <div className="shrink-0 text-right">
            <div className="text-xs text-slate-300 font-bold tracking-[0.18em] uppercase">
              旺衰解析
            </div>
            <div className="mt-2 h-4 w-16 rounded bg-slate-200/70" />
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
                className="rounded-2xl sm:rounded-3xl border border-white/50 bg-white/55 px-3 py-3 sm:py-4 shadow-sm sm:px-4"
              >
                <div className="text-[10px] sm:text-xs font-bold text-slate-400">{p.label}</div>
                <div className="mt-2 sm:mt-3 h-6 sm:h-8 w-16 animate-pulse rounded bg-slate-200/70" />
                <div className="mt-2 sm:mt-3 h-2.5 sm:h-3 w-24 animate-pulse rounded bg-slate-200/70" />
              </div>
            );
          }
          const pillar = p as BaZiPillar;
          const style = elementStyles[pillar.element];
          const isFocus = idx === 2;

          // 从 pillar.tooltip 中提取十神标签（如"比劫助身"）
          const pillarTag = extractTenGodLabel(pillar.tooltip);

          const pillarContent = (
            <div
              className={cn(
                'relative rounded-2xl sm:rounded-3xl border border-white/50 backdrop-blur-[18px]',
                'px-3 py-3 sm:py-4 text-left shadow-sm transition sm:px-4',
                pillar.tooltip ? 'hover:bg-white/70 hover:shadow-md' : 'cursor-default',
                isFocus ? 'bg-[#5D7CFA]/6 ring-[3px] ring-[#5D7CFA]/75 shadow-lg' : 'bg-white/55'
              )}
            >
              {/* 日主标签 */}
              {isFocus && (
                <div className="absolute -top-2 -right-2 sm:-top-2.5 sm:-right-2.5 z-10 rounded-full bg-[#5D7CFA] px-2 py-0.5 text-[10px] font-extrabold text-white shadow-[0_4px_10px_-4px_rgba(47,107,255,0.6)]">
                  日主
                </div>
              )}

              {/* 十神标签移到顶部 */}
              {pillarTag && (
                <div className="mb-1.5 sm:mb-2 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/60 bg-white/80 px-1.5 sm:px-2 py-0.5 text-[10px] font-bold text-slate-600">
                    <ElementDot element={pillar.element} />
                    {pillarTag}
                  </span>
                </div>
              )}

              <div className="text-[10px] sm:text-xs font-bold text-slate-400">{pillar.label}</div>
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
                    <span className="text-[10px] font-semibold text-slate-400">
                      {chartPillar.sound}
                    </span>
                  );
                })()}
              </div>

              <div
                className={cn('absolute inset-0 rounded-2xl sm:rounded-3xl ring-1', style.ring)}
              />
              <div
                className={cn(
                  'absolute inset-0 rounded-2xl sm:rounded-3xl -z-10 blur-2xl opacity-40',
                  style.bg
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
                  className="rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30"
                >
                  {pillarContent}
                </button>
              </PopoverTrigger>
              <PopoverContent
                className={cn(
                  'w-72 rounded-2xl border border-slate-200/90 bg-white/88 backdrop-blur-[26px]',
                  'ring-1 ring-[#5D7CFA]/12',
                  'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)]',
                  'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                  'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                )}
                side="top"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-extrabold text-slate-900">
                    深度解析：{pillar.label}
                  </div>
                  {hasBalanceInsight && (
                    <span className="rounded-full border border-slate-200/80 bg-slate-50/90 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                      命局重心 {balanceInsightValue}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-sm text-slate-600 leading-relaxed">{pillar.tooltip}</div>
                {(() => {
                  const chartPillar = baziBasis?.pillars?.find((bp) => bp.label === pillar.label);
                  if (!chartPillar?.hiddenStems?.length) return null;
                  return (
                    <div className="mt-3 border-t border-slate-100 pt-3">
                      <div className="text-[11px] font-bold text-slate-400 mb-2">藏干</div>
                      <div className="flex flex-wrap gap-1.5">
                        {chartPillar.hiddenStems.map((hs) => (
                          <span
                            key={`${pillar.label}-${hs.stem}-${hs.type}`}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
                          >
                            {hs.stem}
                            <span className="text-slate-400 font-normal">{hs.tenGod}</span>
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
        <div className="mt-4 sm:mt-6 flex flex-wrap items-center gap-x-4 sm:gap-x-5 gap-y-2 text-[11px] sm:text-xs font-semibold text-slate-500">
          {patternHighlights.map((item) => (
            <LegendDot key={item.label} label={item.label} tooltip={item.tooltip} />
          ))}
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
    <HoverHint title={label} body={tooltip}>
      <div className="flex items-center gap-2 cursor-help">
        <span className="h-2 w-2 rounded-full bg-[#5D7CFA]/70" />
        <span>{label}</span>
      </div>
    </HoverHint>
  );
}

function HoverHint({
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
  const [open, setOpen] = React.useState(false);
  const closeTimerRef = React.useRef<number | null>(null);

  const clearCloseTimer = React.useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const handleOpen = React.useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handleClose = React.useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 90);
  }, [clearCloseTimer]);

  React.useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5D7CFA]/30"
          onMouseEnter={handleOpen}
          onMouseLeave={handleClose}
          onFocus={handleOpen}
          onBlur={handleClose}
        >
          {children}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side="top"
        sideOffset={10}
        onMouseEnter={handleOpen}
        onMouseLeave={handleClose}
        onOpenAutoFocus={(event) => event.preventDefault()}
        className={cn(
          'z-[80] w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-slate-200 bg-white p-3 text-left',
          'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80'
        )}
      >
        <span className="block text-sm font-extrabold text-slate-900">{title}</span>
        <span className="mt-2 block text-sm leading-relaxed text-slate-600">{body}</span>
      </PopoverContent>
    </Popover>
  );
}
