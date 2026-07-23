'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { PartialDestinyReport } from '../types';

export const BAZI_SECTION_IDS = {
  tone: 'bazi-section-tone',
  pillars: 'bazi-section-pillars',
  basis: 'bazi-section-basis',
  elements: 'bazi-section-elements',
  decade: 'bazi-section-decade',
  personality: 'bazi-section-personality',
  life: 'bazi-section-life',
} as const;

type SectionKey = keyof typeof BAZI_SECTION_IDS;

const SECTION_LABELS: Record<SectionKey, string> = {
  tone: '格局',
  pillars: '四柱',
  basis: '依据',
  elements: '五行',
  decade: '大运',
  personality: '十神',
  life: '生活',
};

function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function buildChips(report: PartialDestinyReport): { key: SectionKey; hint?: string }[] {
  const chips: { key: SectionKey; hint?: string }[] = [
    { key: 'tone', hint: report.coreTone?.tag?.slice(0, 8) },
    { key: 'pillars' },
    { key: 'basis' },
    { key: 'elements' },
    { key: 'decade' },
    { key: 'personality' },
    { key: 'life' },
  ];

  const pillars = report.pillars?.filter((p): p is Extract<typeof p, { stem: string }> => 'stem' in p) ?? [];
  if (pillars.length === 4) {
    const idx = chips.findIndex((c) => c.key === 'pillars');
    if (idx >= 0) {
      chips[idx] = {
        key: 'pillars',
        hint: pillars.map((p) => `${p.stem}${p.branch}`).join(' '),
      };
    }
  }

  const activeDecade = report.baziBasis?.decadeFortunes?.find((d) => d.active);
  if (activeDecade) {
    const idx = chips.findIndex((c) => c.key === 'decade');
    if (idx >= 0) chips[idx] = { key: 'decade', hint: activeDecade.name };
  }

  return chips;
}

/** 八字主栏 sticky 区块导航 */
export function ChartSectionNav({
  report,
  className,
}: {
  report: PartialDestinyReport;
  className?: string;
}) {
  const chips = buildChips(report);

  return (
    <nav
      aria-label="盘面区块导航"
      className={cn(
        'flex min-h-11 shrink-0 flex-nowrap items-center gap-1.5 overflow-x-auto',
        '[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className
      )}
    >
      {chips.map(({ key, hint }) => (
        <button
          key={key}
          type="button"
          onClick={() => scrollToSection(BAZI_SECTION_IDS[key])}
          className={cn(
            'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5',
            'border-slate-200/70 bg-white/90 text-xs font-semibold text-slate-700',
            'shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-colors',
            'hover:border-blue-200/80 hover:bg-blue-50/90 hover:text-blue-700',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40',
            'dark:border-white/10 dark:bg-slate-900/80 dark:text-slate-200',
            'dark:hover:border-blue-500/30 dark:hover:bg-blue-950/40 dark:hover:text-blue-300'
          )}
        >
          <span>{SECTION_LABELS[key]}</span>
          {hint ? (
            <span className="max-w-[5.5rem] truncate text-[10px] font-medium text-slate-400 dark:text-slate-500">
              {hint}
            </span>
          ) : null}
        </button>
      ))}
    </nav>
  );
}
