'use client';

import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { FiveElementRadar } from './five-element-radar';

const elementStyles: Record<FiveElementKey, { bg: string; text: string; ring: string }> = {
  metal: { bg: 'bg-amber-50/70', text: 'text-amber-700', ring: 'ring-amber-200/60' },
  wood: { bg: 'bg-emerald-50/70', text: 'text-emerald-700', ring: 'ring-emerald-200/60' },
  water: { bg: 'bg-slate-50/70', text: 'text-slate-700', ring: 'ring-slate-200/60' },
  fire: { bg: 'bg-rose-50/70', text: 'text-rose-700', ring: 'ring-rose-200/60' },
  earth: { bg: 'bg-stone-50/70', text: 'text-stone-700', ring: 'ring-stone-200/60' },
};

export function ChartCenterPanel({
  report,
  streaming = false,
  className,
}: {
  report: PartialDestinyReport;
  streaming?: boolean;
  className?: string;
}) {
  const profile = report.profile;
  const pillars = report.pillars ?? [];
  const elements = report.elements ?? [];
  const tenGods = report.tenGods ?? [];

  return (
    <div className={cn('flex flex-col gap-6 min-h-0', className)}>
      {/* 排盘卡 */}
      <GlassCard className="p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-white/60 border border-white/50 text-slate-700">
                {profile?.genderLabel ?? '命盘生成中'}
              </span>
              <div className="text-lg font-extrabold text-slate-900 truncate">
                {profile?.name ?? '基础信息整理中'}
              </div>
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {profile?.birthText ?? '正在整理生辰信息与首批分析'}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-slate-400 font-bold tracking-[0.18em] uppercase">
              命局偏强
            </div>
            <div className="mt-1 text-sm font-extrabold text-slate-700">金、水</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-4 gap-4">
          {(pillars.length > 0 ? pillars : Array.from({ length: 4 }).map((_, idx) => ({ label: ['年柱', '月柱', '日柱', '时柱'][idx] }))).map((p, idx) => {
            if (!('stem' in p)) {
              return (
                <div
                  key={p.label}
                  className="rounded-3xl border border-white/50 bg-white/55 px-4 py-4 shadow-sm"
                >
                  <div className="text-xs font-bold text-slate-400">{p.label}</div>
                  <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200/70" />
                  <div className="mt-3 h-3 w-24 animate-pulse rounded bg-slate-200/70" />
                </div>
              );
            }
            const style = elementStyles[p.element];
            const isFocus = idx === 2;
            return (
              <Popover key={p.label}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'relative rounded-3xl border border-white/50 bg-white/55 backdrop-blur-[18px]',
                      'px-4 py-4 text-left shadow-sm transition',
                      'hover:bg-white/70 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/30',
                      isFocus && 'ring-2 ring-[#2F6BFF]/60 shadow-lg'
                    )}
                  >
                    <div className="text-xs font-bold text-slate-400">{p.label}</div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className={cn('text-3xl font-black tracking-tight', style.text)}>
                        {p.stem}
                      </div>
                      <div className={cn('text-3xl font-black tracking-tight', style.text)}>
                        {p.branch}
                      </div>
                    </div>
                    <div className={cn('mt-3 text-xs font-bold', style.text)}>
                      {p.stem}
                      {p.branch}（{elementLabel(p.element)}）
                    </div>
                    <div className={cn('absolute inset-0 rounded-3xl ring-1', style.ring)} />
                    <div
                      className={cn(
                        'absolute inset-0 rounded-3xl -z-10 blur-2xl opacity-40',
                        style.bg
                      )}
                    />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  className={cn(
                    'w-72 rounded-2xl border border-slate-200/90 bg-white/88 backdrop-blur-[26px]',
                    'ring-1 ring-[#2F6BFF]/12',
                    'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)]',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                  )}
                  side="top"
                >
                  <div className="text-sm font-extrabold text-slate-900">{p.label}含义</div>
                  <div className="mt-2 text-sm text-slate-600 leading-relaxed">{p.tooltip}</div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-6 text-xs font-semibold text-slate-500">
          <LegendDot label="伤官配印" />
          <LegendDot label="偏印夺食" />
          <LegendDot label="甲子辰三合水局" />
        </div>
      </GlassCard>

      {/* 下方可视化区（先占位，后续接图表库细化） */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <GlassCard className="p-6 min-h-[260px]">
          <div className="text-sm font-extrabold text-slate-900">五行能量雷达</div>
          <div className="mt-4">
            {elements.length > 0 ? (
              <FiveElementRadar data={elements} />
            ) : (
              <div className="h-[220px] animate-pulse rounded-2xl bg-slate-100/80" />
            )}
          </div>
        </GlassCard>

        <GlassCard className="p-6 min-h-[260px]">
          <div className="text-sm font-extrabold text-slate-900">十神分布图</div>
          <div className="mt-3 space-y-3">
            {(tenGods.length > 0
              ? tenGods
              : Array.from({ length: 4 }).map((_, index) => ({
                  key: `ten-god-skeleton-${index}`,
                  label: '十神解析生成中',
                  value: 0,
                  tooltip: '',
                }))
            ).map((t) => (
              <Popover key={t.key}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'w-full text-left rounded-2xl border border-white/45 bg-white/50 backdrop-blur-[18px]',
                      'px-4 py-3 shadow-sm hover:bg-white/65 transition',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/30'
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-extrabold text-slate-800">{t.label}</div>
                      <div className="text-xs font-black text-slate-500">{t.value}%</div>
                    </div>
                    <div className="mt-2 h-2 rounded-full bg-slate-200/80 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-[#2F6BFF]/70"
                        style={{ width: `${Math.min(100, Math.max(0, t.value))}%` }}
                      />
                    </div>
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  hidden={!t.tooltip}
                  className={cn(
                    'w-80 rounded-2xl border border-slate-200/90 bg-white/88 backdrop-blur-[26px]',
                    'ring-1 ring-[#2F6BFF]/12',
                    'shadow-[0_28px_70px_-30px_rgba(15,23,42,0.45)]',
                    'data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95',
                    'data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95'
                  )}
                  side="left"
                >
                  <div className="text-sm font-extrabold text-slate-900">{t.label}</div>
                  <div className="mt-2 text-sm text-slate-600 leading-relaxed">{t.tooltip}</div>
                </PopoverContent>
              </Popover>
            ))}
          </div>
        </GlassCard>
      </div>
    </div>
  );
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

function LegendDot({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full bg-[#2F6BFF]/70" />
      <span>{label}</span>
    </div>
  );
}
