'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Compass, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';

const ELEMENT_CHIP: Record<
  FiveElementKey,
  { bg: string; text: string; ring: string }
> = {
  metal: {
    bg: 'bg-amber-50/90 dark:bg-amber-950/40',
    text: 'text-amber-800 dark:text-amber-200',
    ring: 'ring-amber-200/70 dark:ring-amber-800/40',
  },
  wood: {
    bg: 'bg-emerald-50/90 dark:bg-emerald-950/40',
    text: 'text-emerald-800 dark:text-emerald-200',
    ring: 'ring-emerald-200/70 dark:ring-emerald-800/40',
  },
  water: {
    bg: 'bg-blue-50/90 dark:bg-blue-950/40',
    text: 'text-blue-800 dark:text-blue-200',
    ring: 'ring-blue-200/70 dark:ring-blue-800/40',
  },
  fire: {
    bg: 'bg-rose-50/90 dark:bg-rose-950/40',
    text: 'text-rose-800 dark:text-rose-200',
    ring: 'ring-rose-200/70 dark:ring-rose-800/40',
  },
  earth: {
    bg: 'bg-stone-50/90 dark:bg-stone-950/40',
    text: 'text-stone-800 dark:text-stone-200',
    ring: 'ring-stone-200/70 dark:ring-stone-800/40',
  },
};

export function BaziBasisCard({
  baziBasis,
  className,
}: {
  baziBasis: NonNullable<PartialDestinyReport['baziBasis']>;
  className?: string;
}) {
  /** 小白默认只看信任摘要；校正明细与藏干均按需展开 */
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const locationClean = baziBasis.profile.locationText.replace(/\(.*?\)/g, '').trim();
  const chartSummary = baziBasis.profile.chartSummary?.trim();
  const correction = baziBasis.correction;
  const correctionHint =
    correction.applied && Math.abs(correction.offsetMinutes) >= 0.05
      ? `真太阳时${correction.offsetSeconds >= 0 ? '向后' : '向前'} ${Math.abs(correction.offsetMinutes).toFixed(1)} 分钟`
      : null;

  const correctionSteps = useMemo(() => {
    if (!correction.applied) return [];
    const lonMin = Math.abs(correction.longitudeOffset) / 60;
    const eotMin = Math.abs(correction.equationOfTime) / 60;
    const totalMin = Math.abs(correction.offsetMinutes);
    const lonDir = correction.longitudeOffset >= 0 ? '向后' : '向前';
    const eotDir = correction.equationOfTime >= 0 ? '向后' : '向前';
    const totalDir = correction.offsetSeconds >= 0 ? '向后' : '向前';
    return [
      {
        key: 'lon',
        label: '经度修正',
        value: `${lonDir} ${lonMin.toFixed(1)} 分`,
      },
      {
        key: 'eot',
        label: '均时差',
        value: `${eotDir} ${eotMin.toFixed(1)} 分`,
      },
      {
        key: 'total',
        label: '合计',
        value: `${totalDir} ${totalMin.toFixed(1)} 分`,
        highlight: true,
      },
    ];
  }, [correction]);

  return (
    <GlassCard
      className={cn(
        'relative shrink-0 overflow-hidden p-4 sm:p-6',
        className
      )}
    >
      {/* DESIGN.md：卡片背光晕，衬托 G-3 玻璃质感 */}
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-[#5D7CFA]/14 blur-3xl dark:bg-[#5D7CFA]/20"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-6 bottom-0 h-28 w-28 rounded-full bg-indigo-400/8 blur-3xl dark:bg-indigo-500/12"
        aria-hidden
      />

      {/* 标题 + 四柱摘要（一行） */}
      <div className="relative flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#5D7CFA]/10 dark:bg-[#5D7CFA]/20">
          <Compass className="h-3.5 w-3.5 text-[#5D7CFA] dark:text-[#9BADFF]" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-heading text-sm font-bold text-slate-900 dark:text-slate-100">
            排盘依据
          </h3>
          <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
            {chartSummary ?? baziBasis.profile.genderLabel}
            {correctionHint ? ` · ${correctionHint}` : ''}
          </p>
        </div>
      </div>

      {/* 默认：紧凑信任摘要（约 80px），满足小白「算得准不准」 */}
      <div
        className={cn(
          'relative mt-3 rounded-xl border px-3 py-2.5',
          'border-emerald-200/50 bg-emerald-50/50 dark:border-emerald-900/35 dark:bg-emerald-950/25'
        )}
      >
        <div className="flex items-start gap-2">
          <span
            className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white"
            aria-hidden
          >
            ✓
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100">
              已按出生地校正真太阳时
            </p>
            <p className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <MapPin className="h-3 w-3 shrink-0" aria-hidden />
              <span className="truncate">{locationClean}</span>
            </p>
            <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
              <span className="text-slate-400 dark:text-slate-500">录入</span>{' '}
              {compactDateTime(baziBasis.profile.birthText)}
              <span className="mx-1 text-slate-300 dark:text-slate-600">→</span>
              <span className="font-semibold text-[#5D7CFA] dark:text-[#9BADFF]">
                {compactDateTime(baziBasis.solarTime.corrected.text)}
              </span>
            </p>
          </div>
        </div>
      </div>

      <div className="relative mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setDetailsOpen((v) => !v)}
          aria-expanded={detailsOpen}
          className={cn(
            'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[11px] font-bold transition-colors',
            detailsOpen
              ? 'border-[#5D7CFA]/35 bg-[#5D7CFA]/10 text-[#5D7CFA] dark:border-[#9BADFF]/30 dark:bg-[#5D7CFA]/15 dark:text-[#9BADFF]'
              : 'border-white/60 bg-white/70 text-slate-600 hover:bg-white dark:border-white/5 dark:bg-slate-800/70 dark:text-slate-300'
          )}
        >
          {detailsOpen ? '收起校正明细' : '查看校正明细'}
          {detailsOpen ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
        </button>
        {detailsOpen ? (
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-expanded={advancedOpen}
            className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-[11px] font-semibold text-slate-500 hover:text-[#5D7CFA] dark:text-slate-400 dark:hover:text-[#9BADFF]"
          >
            {advancedOpen ? '收起藏干岁运' : '藏干与岁运'}
          </button>
        ) : null}
      </div>

      {detailsOpen ? (
        <div className="animate-in fade-in slide-in-from-top-1 mt-4 flex flex-col gap-4 duration-300 fill-mode-both">
      {/* 核心三卡：专业用户核对录入 / 校正 / 日主起运 */}
      <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <BasisSummaryCard
          label="出生录入"
          value={baziBasis.profile.birthText}
          detail={baziBasis.profile.lunarText}
          accent="input"
        />
        <BasisSummaryCard
          label="真太阳时"
          value={baziBasis.solarTime.corrected.text}
          detail={baziBasis.correction.summary}
          accent="solar"
          footer={
            correction.applied && correctionSteps.length > 0 ? (
              <CorrectionBreakdown steps={correctionSteps} />
            ) : null
          }
        />
        <BasisSummaryCard
          label="日主与起运"
          value={`${baziBasis.dayMaster.stem}${elementLabel(baziBasis.dayMaster.element)}日主`}
          detail={`${baziBasis.dayMaster.yinYang === 'yin' ? '阴' : '阳'} · ${baziBasis.childLimit.forward ? '顺排' : '逆排'}大运 · ${baziBasis.childLimit.startAge} 岁起运`}
          accent="master"
        />
      </div>

      {/* 录入 → 标准时 → 真太阳时 时间轴 */}
      <div className="relative mt-4 rounded-2xl border border-white/50 bg-white/55 px-3 py-3 dark:border-white/5 dark:bg-slate-800/40 sm:px-4">
        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
          排盘时间链
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
          <TimeChainNode label="录入" value={baziBasis.profile.birthText} muted />
          <TimeChainArrow />
          <TimeChainNode
            label="标准时"
            value={baziBasis.solarTime.standard.text}
            muted
          />
          <TimeChainArrow />
          <TimeChainNode
            label="真太阳时"
            value={baziBasis.solarTime.corrected.text}
            highlight
          />
        </div>
      </div>

      <SolarTermTimeline baziBasis={baziBasis} />

      {advancedOpen ? (
          <div
            className={cn(
              'grid gap-4 sm:gap-6 lg:grid-cols-[1.2fr_0.8fr]',
              'animate-in fade-in slide-in-from-top-1 duration-300 fill-mode-both'
            )}
          >
            <div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
                四柱藏干明细
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
                {baziBasis.pillars.map((pillar) => {
                  const isDay = pillar.label === '日柱';
                  const chip = ELEMENT_CHIP[pillar.displayElement];
                  return (
                    <div
                      key={pillar.label}
                      className={cn(
                        'rounded-[20px] border px-3 py-3 sm:rounded-[24px] sm:px-4 sm:py-4',
                        'bg-white/70 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)] dark:bg-slate-800/50',
                        isDay
                          ? 'border-[#5D7CFA]/40 ring-1 ring-[#5D7CFA]/20 dark:border-[#9BADFF]/35'
                          : 'border-white/50 dark:border-white/5'
                      )}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-slate-400">
                          {pillar.label}
                        </span>
                        {isDay ? (
                          <span className="rounded-full bg-[#5D7CFA]/12 px-1.5 py-0.5 text-[9px] font-bold text-[#5D7CFA] dark:bg-[#5D7CFA]/20 dark:text-[#9BADFF]">
                            日主
                          </span>
                        ) : null}
                      </div>
                      <div
                        className={cn(
                          'mt-2 inline-flex rounded-lg px-2 py-1 text-base font-black ring-1',
                          chip.bg,
                          chip.text,
                          chip.ring
                        )}
                      >
                        {pillar.name}
                      </div>
                      <div className="mt-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                        纳音 {pillar.sound}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {pillar.hiddenStems.map((item) => (
                          <span
                            key={`${pillar.label}-${item.stem}-${item.type}`}
                            className="rounded-full border border-white/60 bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:border-white/5 dark:bg-slate-700/70 dark:text-slate-300"
                          >
                            {item.stem}
                            {item.tenGod}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="space-y-4">
              <BasisMetaCard
                title="起运信息"
                rows={[
                  `${baziBasis.childLimit.forward ? '顺排大运' : '逆排大运'}，${baziBasis.childLimit.startAge} 岁起运`,
                  `${baziBasis.childLimit.endTime.text.slice(0, 10)} 起算 · 童限 ${baziBasis.childLimit.duration.years}年${baziBasis.childLimit.duration.months}月`,
                ]}
              />
              <BasisMetaCard
                title="未来三年岁运"
                rows={baziBasis.annualCycles.map(
                  (item) =>
                    `${item.year} · ${item.yearCycle} · ${item.decadeFortune}大运 · 流年 ${item.annualFortune}`
                )}
              />
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            四柱干支见上方卡片；需要核对藏干十神或未来三年岁运时，可点「藏干与岁运」。
          </p>
        )}
        </div>
      ) : (
        <p className="mt-2 text-[11px] leading-relaxed text-slate-400 dark:text-slate-500">
          想看经度、均时差与节气推导？点「查看校正明细」。
        </p>
      )}
    </GlassCard>
  );
}

/** 压缩日期时间展示，避免紧凑区换行过高 */
function compactDateTime(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= 18) return trimmed;
  return trimmed.replace(/:\d{2}$/, '');
}

function CorrectionBreakdown({
  steps,
}: {
  steps: Array<{ key: string; label: string; value: string; highlight?: boolean }>;
}) {
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {steps.map((step) => (
        <span
          key={step.key}
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold',
            step.highlight
              ? 'bg-[#5D7CFA]/12 text-[#5D7CFA] ring-1 ring-[#5D7CFA]/25 dark:bg-[#5D7CFA]/20 dark:text-[#9BADFF]'
              : 'bg-slate-100/90 text-slate-600 dark:bg-slate-700/60 dark:text-slate-300'
          )}
        >
          {step.label} {step.value}
        </span>
      ))}
    </div>
  );
}

function SolarTermTimeline({
  baziBasis,
}: {
  baziBasis: NonNullable<PartialDestinyReport['baziBasis']>;
}) {
  const terms = [
    { role: '上一节气', ...baziBasis.solarTerms.previous },
    { role: '当前节气', ...baziBasis.solarTerms.active, active: true },
    { role: '下一节气', ...baziBasis.solarTerms.next },
  ] as const;

  return (
    <div className="relative mt-4 rounded-2xl border border-white/50 bg-white/55 px-3 py-3 dark:border-white/5 dark:bg-slate-800/40 sm:px-4">
      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
        节气上下文
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
        {terms.map((term) => (
          <div
            key={term.role}
            className={cn(
              'rounded-xl border px-3 py-2.5 transition-colors',
              'active' in term && term.active
                ? 'border-[#5D7CFA]/35 bg-[#5D7CFA]/8 dark:border-[#9BADFF]/30 dark:bg-[#5D7CFA]/12'
                : 'border-transparent bg-white/50 dark:bg-slate-900/30'
            )}
          >
            <div className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
              {term.role}
            </div>
            <div
              className={cn(
                'mt-1 text-sm font-extrabold',
                'active' in term && term.active
                  ? 'text-[#5D7CFA] dark:text-[#9BADFF]'
                  : 'text-slate-800 dark:text-slate-100'
              )}
            >
              {term.name}
            </div>
            <div className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {stripTimeFromSolar(term.solarTime.text)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimeChainNode({
  label,
  value,
  highlight,
  muted,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'min-w-0 flex-1 rounded-xl px-3 py-2',
        highlight
          ? 'bg-[#5D7CFA]/10 ring-1 ring-[#5D7CFA]/25 dark:bg-[#5D7CFA]/15 dark:ring-[#9BADFF]/30'
          : muted
            ? 'bg-slate-50/80 dark:bg-slate-900/40'
            : 'bg-white/60 dark:bg-slate-800/40'
      )}
    >
      <div className="text-[10px] font-bold text-slate-400">{label}</div>
      <div
        className={cn(
          'mt-0.5 truncate text-xs font-semibold sm:text-sm',
          highlight
            ? 'text-[#5D7CFA] dark:text-[#9BADFF]'
            : 'text-slate-700 dark:text-slate-200'
        )}
      >
        {value}
      </div>
    </div>
  );
}

function TimeChainArrow() {
  return (
    <div
      className="hidden shrink-0 text-slate-300 sm:block dark:text-slate-600"
      aria-hidden
    >
      →
    </div>
  );
}

function elementLabel(k: string) {
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
    default:
      return '';
  }
}

function stripTimeFromSolar(text: string): string {
  return text.replace(/\s+\d{2}:\d{2}(:\d{2})?$/, '');
}

function BasisSummaryCard({
  label,
  value,
  detail,
  accent,
  footer,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: 'input' | 'solar' | 'master';
  footer?: React.ReactNode;
}) {
  const accentRing =
    accent === 'solar'
      ? 'ring-[#5D7CFA]/15 dark:ring-[#5D7CFA]/25'
      : accent === 'master'
        ? 'ring-amber-200/40 dark:ring-amber-800/30'
        : 'ring-white/40 dark:ring-white/5';

  return (
    <div
      className={cn(
        'rounded-[20px] border border-white/50 bg-white/70 px-4 py-4 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)] ring-1 dark:border-white/5 dark:bg-slate-800/50',
        accentRing
      )}
    >
      <div className="text-[11px] font-bold tracking-wide text-slate-400 dark:text-slate-500">
        {label}
      </div>
      <div className="mt-2 text-sm font-extrabold leading-snug text-slate-900 dark:text-slate-100">
        {value}
      </div>
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{detail}</div>
      {footer}
    </div>
  );
}

function BasisMetaCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[20px] border border-white/50 bg-white/70 px-4 py-4 shadow-sm dark:border-white/5 dark:bg-slate-800/50">
      <div className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{title}</div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row} className="text-sm leading-6 text-slate-600 dark:text-slate-300">
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}
