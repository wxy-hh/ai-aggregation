'use client';

import React, { type CSSProperties, useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import baziIcon from '@/assets/image/bazi.svg';
import renshengIcon from '@/assets/image/rensheng.svg';
import xinggeIcon from '@/assets/image/xingge.svg';
import { cn } from '@/lib/utils';
import type { FiveElementKey, PartialDestinyReport, BaZiPillar, TenGodDomainKey } from '../types';
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

const tenGodDomainStyles: Record<TenGodDomainKey, { color: string; track: string }> = {
  self: { color: '#6576F8', track: 'rgba(101, 118, 248, 0.2)' },
  expression: { color: '#7CA7FF', track: 'rgba(124, 167, 255, 0.2)' },
  wealth: { color: '#B9AEFF', track: 'rgba(185, 174, 255, 0.22)' },
  order: { color: '#95A7C8', track: 'rgba(149, 167, 200, 0.22)' },
  resource: { color: '#3F5DFF', track: 'rgba(63, 93, 255, 0.22)' },
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
  const coreTone = report.coreTone;
  const baziBasis = report.baziBasis;
  const pillars = report.pillars ?? [];
  const balanceInsight = report.balanceInsight;
  const patternHighlights = report.patternHighlights ?? [];
  const lifeDimensions = report.lifeDimensions ?? [];
  const lifeDimensionHighlights = report.lifeDimensionHighlights;
  const tenGodDomains = report.tenGodDomains ?? [];
  const balanceInsightTitle = balanceInsight?.title?.trim() || '';
  const balanceInsightValue = balanceInsight?.value?.trim() || '';
  const balanceInsightTooltip = balanceInsight?.tooltip?.trim() || '';
  const hasBalanceInsight = Boolean(
    balanceInsightTitle && balanceInsightValue && balanceInsightTooltip
  );
  const hasLifeDimensionSummary =
    lifeDimensions.length === 5 &&
    Boolean(lifeDimensionHighlights?.strength?.trim()) &&
    Boolean(lifeDimensionHighlights?.caution?.trim());
  const hasTenGodDomains =
    tenGodDomains.length === 5 && tenGodDomains.every((item) => Boolean(item.description?.trim()));
  const [basisOpen, setBasisOpen] = useState(false);

  useEffect(() => {
    if (baziBasis && !coreTone?.headline) {
      setBasisOpen(true);
    }
  }, [baziBasis, coreTone?.headline]);

  return (
    <div className={cn('flex flex-col gap-6 min-h-0', className)}>
      <GlassCard className="shrink-0 overflow-hidden p-4 sm:p-6">
        <div className="relative">
          <div className="absolute left-0 top-0">
            <div
              className={cn(
                'flex h-11 w-11 items-center justify-center rounded-2xl',
                'border border-white/60 bg-white/78 shadow-[0_12px_28px_-22px_rgba(47,107,255,0.42)]',
                'sm:h-12 sm:w-12'
              )}
            >
              <AssetToneIcon className="h-5 w-5 text-[#2F6BFF]/70 sm:h-6 sm:w-6" src={baziIcon} />
            </div>
          </div>

          <div className="min-w-0 self-start pl-0 sm:pl-16">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
              <span className="inline-flex w-fit items-center rounded-full bg-[#456DFF] px-3 py-1 text-xs font-extrabold text-white shadow-[0_10px_24px_-16px_rgba(47,107,255,0.75)]">
                {coreTone?.tag ?? '核心命理定调'}
              </span>
              <span className="text-sm font-bold leading-6 text-slate-400">
                {coreTone?.chartSummary ?? '乾造：命盘信息整理中'}
              </span>
            </div>

            <div className="mt-3 break-words text-[1.45rem] font-black leading-[1.24] tracking-tight text-[#14276A] sm:text-[1.95rem] lg:text-[2.2rem]">
              {coreTone?.headline ?? '正在推演你的人生底色'}
            </div>

            <div className="mt-4 max-w-4xl text-sm leading-7 text-slate-600 sm:text-[15px]">
              {coreTone?.description ??
                'AI 正在结合四柱结构、五行强弱与十神重心，为你整理一段更通俗的人生底色总结。'}
            </div>
          </div>
        </div>
      </GlassCard>

      {/* 排盘卡 */}
      <GlassCard className="shrink-0 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-extrabold bg-white/60 border border-white/50 text-slate-700">
                {profile?.genderLabel ?? '命盘生成中'}
              </span>
              <div className="min-w-0 text-base font-extrabold text-slate-900 sm:text-lg truncate">
                {profile?.name ?? '基础信息整理中'}
              </div>
            </div>
            <div className="mt-2 text-xs leading-6 text-slate-500 sm:text-sm">
              {profile?.birthText ?? '正在整理生辰信息与首批分析'}
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

        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
          {(pillars.length > 0
            ? pillars
            : Array.from({ length: 4 }).map((_, idx) => ({
                label: ['年柱', '月柱', '日柱', '时柱'][idx],
              }))
          ).map((p, idx) => {
            // 类型守卫：检查是否是完整的 BaZiPillar 对象
            if (!('stem' in p)) {
              return (
                <div
                  key={p.label}
                  className="rounded-3xl border border-white/50 bg-white/55 px-3 py-4 shadow-sm sm:px-4"
                >
                  <div className="text-xs font-bold text-slate-400">{p.label}</div>
                  <div className="mt-3 h-8 w-16 animate-pulse rounded bg-slate-200/70" />
                  <div className="mt-3 h-3 w-24 animate-pulse rounded bg-slate-200/70" />
                </div>
              );
            }
            // 此时 p 是 BaZiPillar 类型，有 element 属性
            const pillar = p as BaZiPillar;
            const style = elementStyles[pillar.element];
            const isFocus = idx === 2;
            const pillarCard = (
              <div
                className={cn(
                  'relative rounded-3xl border border-white/50 bg-white/55 backdrop-blur-[18px]',
                  'px-3 py-4 text-left shadow-sm transition sm:px-4',
                  pillar.tooltip ? 'hover:bg-white/70 hover:shadow-md' : 'cursor-default',
                  isFocus && 'ring-2 ring-[#2F6BFF]/60 shadow-lg'
                )}
              >
                <div className="text-xs font-bold text-slate-400">{pillar.label}</div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div
                    className={cn('text-[2rem] font-black tracking-tight sm:text-3xl', style.text)}
                  >
                    {pillar.stem}
                  </div>
                  <div
                    className={cn('text-[2rem] font-black tracking-tight sm:text-3xl', style.text)}
                  >
                    {pillar.branch}
                  </div>
                </div>
                <div className={cn('mt-3 text-[11px] font-bold leading-5 sm:text-xs', style.text)}>
                  {pillar.stem}
                  {pillar.branch}（{elementLabel(pillar.element)}）
                </div>
                <div className={cn('absolute inset-0 rounded-3xl ring-1', style.ring)} />
                <div
                  className={cn('absolute inset-0 rounded-3xl -z-10 blur-2xl opacity-40', style.bg)}
                />
              </div>
            );

            if (!pillar.tooltip) {
              return <div key={pillar.label}>{pillarCard}</div>;
            }

            return (
              <Popover key={pillar.label}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="rounded-3xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/30"
                  >
                    {pillarCard}
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
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-extrabold text-slate-900">
                      深度解析：{pillar.label}
                    </div>
                    {hasBalanceInsight ? (
                      <span className="rounded-full border border-slate-200/80 bg-slate-50/90 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                        命局重心 {balanceInsightValue}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm text-slate-600 leading-relaxed">
                    {pillar.tooltip}
                  </div>
                </PopoverContent>
              </Popover>
            );
          })}
        </div>

        {patternHighlights.length > 0 ? (
          <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
            {patternHighlights.map((item) => (
              <LegendDot key={item.label} label={item.label} tooltip={item.tooltip} />
            ))}
          </div>
        ) : null}
      </GlassCard>

      {baziBasis ? (
        <GlassCard className="shrink-0 overflow-hidden p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="text-sm font-extrabold text-slate-900">排盘依据</div>
                <div className="mt-1 text-sm text-slate-500">
                  真太阳时、节气边界、四柱与岁运关系。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setBasisOpen((value) => !value)}
                className={cn(
                  'inline-flex items-center justify-center gap-2 self-start rounded-full border px-3 py-1.5 text-xs font-bold transition-colors',
                  'border-white/60 bg-white/60 text-slate-600 hover:bg-white/75'
                )}
              >
                <span>{basisOpen ? '收起依据' : '展开依据'}</span>
                {basisOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </button>
            </div>

            <div className="grid gap-3 lg:grid-cols-3">
              <BasisSummaryCard
                label="农历录入"
                value={baziBasis.profile.birthText}
                detail={baziBasis.profile.lunarText}
              />
              <BasisSummaryCard
                label="真太阳时"
                value={baziBasis.solarTime.corrected.text}
                detail={baziBasis.correction.summary}
              />
              <BasisSummaryCard
                label="日主与起运"
                value={`${baziBasis.dayMaster.stem}${elementLabel(baziBasis.dayMaster.element)}日主`}
                detail={`${baziBasis.childLimit.forward ? '顺排' : '逆排'}，${baziBasis.childLimit.startAge} 岁起运`}
              />
            </div>

            {basisOpen ? (
              <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                      四柱与藏干
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      {baziBasis.pillars.map((pillar) => (
                        <div
                          key={pillar.label}
                          className="rounded-[24px] border border-white/50 bg-white/55 px-4 py-4 shadow-sm"
                        >
                          <div className="text-xs font-bold text-slate-400">{pillar.label}</div>
                          <div className="mt-2 text-lg font-black text-slate-900">
                            {pillar.name}
                          </div>
                          <div className="mt-1 text-xs font-semibold text-slate-500">
                            纳音 {pillar.sound}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {pillar.hiddenStems.map((item) => (
                              <span
                                key={`${pillar.label}-${item.stem}-${item.type}`}
                                className="rounded-full border border-white/60 bg-white/80 px-2.5 py-1 text-[11px] font-semibold text-slate-600"
                              >
                                {item.stem}
                                {item.tenGod}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <BasisDistributionCard
                      title="五行统计"
                      items={baziBasis.elementStats.map((item) => ({
                        key: item.key,
                        label: item.label,
                        value: item.value,
                        detail: `${item.sources.stems}/${item.sources.branches}/${item.sources.hiddenStems}`,
                      }))}
                    />
                    <BasisDistributionCard
                      title="十神统计"
                      items={baziBasis.tenGodStats.slice(0, 6).map((item) => ({
                        key: item.key,
                        label: item.label,
                        value: item.value,
                        detail: `${item.visibleStems}+${item.hiddenStems}`,
                      }))}
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <BasisMetaCard
                    title="节气上下文"
                    rows={[
                      `上一节气：${baziBasis.solarTerms.previous.name} · ${baziBasis.solarTerms.previous.solarTime.text}`,
                      `当前节气：${baziBasis.solarTerms.active.name} · ${baziBasis.solarTerms.active.solarTime.text}`,
                      `下一节气：${baziBasis.solarTerms.next.name} · ${baziBasis.solarTerms.next.solarTime.text}`,
                    ]}
                  />
                  <BasisMetaCard
                    title="起运信息"
                    rows={[
                      `${baziBasis.childLimit.forward ? '顺排大运' : '逆排大运'}，${baziBasis.childLimit.startAge} 岁起运`,
                      `起运时刻：${baziBasis.childLimit.endTime.text}`,
                      `折算跨度：${formatDuration(baziBasis.childLimit.duration)}`,
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
            ) : null}
          </div>
        </GlassCard>
      ) : null}

      {/* 下方五维摘要与十神仪表盘 */}
      <div className="grid shrink-0 grid-cols-1 gap-6 lg:grid-cols-2">
        <GlassCard className="p-6 min-h-[520px]">
          <div className="flex items-center gap-2">
            <AssetToneIcon className="h-4 w-4 text-[#456DFF]" src={xinggeIcon} />
            <div className="text-sm font-extrabold text-slate-900">性格与潜能仪表盘</div>
          </div>

          <div className="mt-6 flex h-full min-h-[430px] flex-col gap-4">
            {hasTenGodDomains ? (
              tenGodDomains.map((item) => {
                const palette = tenGodDomainStyles[item.key];
                return (
                  <div
                    key={item.key}
                    className={cn(
                      'group rounded-[24px] border border-white/45 bg-white/52 px-4 py-4 backdrop-blur-[18px]',
                      'shadow-sm transition duration-200 hover:bg-white/66 hover:shadow-md'
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-extrabold text-slate-700">
                          {item.label}
                          <span className="ml-1 text-slate-400">（{item.technicalLabel}）</span>
                        </div>
                      </div>
                      <div className="shrink-0 text-sm font-black" style={{ color: palette.color }}>
                        {item.value}%
                      </div>
                    </div>
                    <div
                      className="mt-3 h-3 overflow-hidden rounded-full shadow-inner"
                      style={{ backgroundColor: palette.track }}
                    >
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(0, item.value))}%`,
                          backgroundColor: palette.color,
                        }}
                      />
                    </div>
                    <p className="mt-3 text-[11px] leading-5 text-slate-400 transition-colors group-hover:text-slate-600">
                      {item.description}
                    </p>
                  </div>
                );
              })
            ) : (
              <div data-testid="ten-god-domains-skeleton" className="space-y-4">
                {Array.from({ length: 5 }).map((_, index) => (
                  <div
                    key={`ten-god-domain-skeleton-${index}`}
                    className="rounded-[24px] border border-white/45 bg-white/52 px-4 py-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="h-4 w-40 animate-pulse rounded bg-slate-200/70" />
                      <div className="h-4 w-10 animate-pulse rounded bg-slate-200/70" />
                    </div>
                    <div className="mt-3 h-3 animate-pulse rounded-full bg-slate-100" />
                    <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200/70" />
                    <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-200/70" />
                  </div>
                ))}
              </div>
            )}
          </div>
        </GlassCard>
        <GlassCard className="p-6 min-h-[520px]">
          <div className="flex items-center gap-2">
            <AssetToneIcon className="h-4 w-4 text-[#456DFF]" src={renshengIcon} />
            <div className="text-sm font-extrabold text-slate-900">人生五维摘要</div>
          </div>

          {hasLifeDimensionSummary ? (
            <>
              <div className="mt-6 flex min-h-[288px] items-center justify-center">
                <FiveElementRadar data={lifeDimensions} />
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-start gap-3 rounded-2xl border border-emerald-100/80 bg-emerald-50/45 px-4 py-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <p className="text-sm leading-7 text-slate-600">
                    <span className="font-extrabold text-slate-800">优势点：</span>
                    {lifeDimensionHighlights?.strength}
                  </p>
                </div>
                <div className="flex items-start gap-3 rounded-2xl border border-rose-100/80 bg-rose-50/45 px-4 py-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-400" />
                  <p className="text-sm leading-7 text-slate-600">
                    <span className="font-extrabold text-slate-800">规避点：</span>
                    {lifeDimensionHighlights?.caution}
                  </p>
                </div>
              </div>
            </>
          ) : (
            <div
              data-testid="life-dimensions-skeleton"
              className="mt-6 flex min-h-[430px] flex-col justify-between"
            >
              <div className="mx-auto h-[288px] w-full max-w-[320px] animate-pulse rounded-[32px] bg-slate-100/80" />
              <div className="space-y-4">
                <div className="rounded-2xl border border-white/45 bg-white/52 p-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200/70" />
                  <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-200/70" />
                  <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-200/70" />
                </div>
                <div className="rounded-2xl border border-white/45 bg-white/52 p-4">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200/70" />
                  <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-200/70" />
                  <div className="mt-2 h-4 w-4/5 animate-pulse rounded bg-slate-200/70" />
                </div>
              </div>
            </div>
          )}
        </GlassCard>
      </div>
    </div>
  );
}

function AssetToneIcon({ className, src }: { className?: string; src: { src: string } }) {
  const maskStyle = {
    WebkitMaskImage: `url(${src.src})`,
    maskImage: `url(${src.src})`,
    WebkitMaskRepeat: 'no-repeat',
    maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center',
    maskPosition: 'center',
    WebkitMaskSize: 'contain',
    maskSize: 'contain',
  } satisfies CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={cn('block shrink-0 bg-current', className)}
      style={maskStyle}
    />
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

function LegendDot({ label, tooltip }: { label: string; tooltip: string }) {
  return (
    <HoverHint title={label} body={tooltip}>
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-[#2F6BFF]/70" />
        <span>{label}</span>
      </div>
    </HoverHint>
  );
}

function BasisSummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/50 bg-white/55 px-4 py-4 shadow-sm">
      <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-sm font-extrabold text-slate-900">{value}</div>
      <div className="mt-2 text-xs leading-6 text-slate-500">{detail}</div>
    </div>
  );
}

function BasisDistributionCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ key: string; label: string; value: number; detail: string }>;
}) {
  return (
    <div className="rounded-[24px] border border-white/50 bg-white/55 px-4 py-4 shadow-sm">
      <div className="text-sm font-extrabold text-slate-900">{title}</div>
      <div className="mt-4 space-y-3">
        {items.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-slate-700">{item.label}</span>
              <span className="font-black text-slate-900">{item.value}%</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-[#5D7CFA]"
                style={{ width: `${Math.min(100, Math.max(0, item.value))}%` }}
              />
            </div>
            <div className="mt-1 text-[11px] text-slate-400">{item.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BasisMetaCard({ title, rows }: { title: string; rows: string[] }) {
  return (
    <div className="rounded-[24px] border border-white/50 bg-white/55 px-4 py-4 shadow-sm">
      <div className="text-sm font-extrabold text-slate-900">{title}</div>
      <div className="mt-3 space-y-2">
        {rows.map((row) => (
          <div key={row} className="text-sm leading-6 text-slate-600">
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}

function formatDuration(duration: {
  years: number;
  months: number;
  days: number;
  hours: number;
  minutes: number;
}) {
  return [
    duration.years ? `${duration.years}年` : '',
    duration.months ? `${duration.months}月` : '',
    duration.days ? `${duration.days}天` : '',
    duration.hours ? `${duration.hours}小时` : '',
    duration.minutes ? `${duration.minutes}分` : '',
  ]
    .filter(Boolean)
    .join('')
    .trim();
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
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<number | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current == null) return;
    window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
  }, []);

  const handleOpen = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const handleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 90);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex cursor-help text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F6BFF]/30"
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
