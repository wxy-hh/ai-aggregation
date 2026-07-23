'use client';

import React from 'react';
import xinggeIcon from '@/assets/image/xingge.svg';
import type { CSSProperties } from 'react';
import { BookOpen, Scale, Sparkles, Users, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TenGodDomainKey, PartialDestinyReport } from '../types';
import { GlassCard } from '../layout/glass-card';

type DomainTheme = {
  Icon: LucideIcon;
  hint: string;
  accent: string;
  track: string;
  /** 左侧语义色条，避免整块铺色 */
  accentEdgeClass: string;
  iconClass: string;
  /** 悬停背光圈（对齐紫微模块卡片） */
  orbClass: string;
  hoverClass: string;
};

/** 五域十神：中性玻璃底 + 轻语义点缀 */
const DOMAIN_THEME: Record<TenGodDomainKey, DomainTheme> = {
  self: {
    Icon: Users,
    hint: '主见与行动力',
    accent: '#818CF8',
    track: 'rgba(99, 102, 241, 0.1)',
    accentEdgeClass: 'border-l-indigo-400/35',
    iconClass: 'text-indigo-500/80 dark:text-indigo-300/80',
    orbClass: 'from-indigo-500/14 to-violet-500/10',
    hoverClass:
      'hover:border-indigo-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(99,102,241,0.16),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  expression: {
    Icon: Sparkles,
    hint: '创意与表达',
    accent: '#38BDF8',
    track: 'rgba(14, 165, 233, 0.1)',
    accentEdgeClass: 'border-l-sky-400/35',
    iconClass: 'text-sky-500/80 dark:text-sky-300/80',
    orbClass: 'from-sky-500/14 to-cyan-500/10',
    hoverClass:
      'hover:border-sky-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(14,165,233,0.16),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  wealth: {
    Icon: Wallet,
    hint: '求财与掌控',
    accent: '#FBBF24',
    track: 'rgba(245, 158, 11, 0.1)',
    accentEdgeClass: 'border-l-amber-400/35',
    iconClass: 'text-amber-600/75 dark:text-amber-300/75',
    orbClass: 'from-amber-500/14 to-orange-500/10',
    hoverClass:
      'hover:border-amber-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(245,158,11,0.16),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  order: {
    Icon: Scale,
    hint: '规则与担当',
    accent: '#94A3B8',
    track: 'rgba(100, 116, 139, 0.1)',
    accentEdgeClass: 'border-l-slate-400/35',
    iconClass: 'text-slate-500/80 dark:text-slate-300/75',
    orbClass: 'from-slate-400/12 to-sky-300/8',
    hoverClass:
      'hover:border-slate-300/60 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(100,116,139,0.14),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
  resource: {
    Icon: BookOpen,
    hint: '学习与贵人',
    accent: '#34D399',
    track: 'rgba(16, 185, 129, 0.1)',
    accentEdgeClass: 'border-l-emerald-400/35',
    iconClass: 'text-emerald-500/80 dark:text-emerald-300/80',
    orbClass: 'from-emerald-500/14 to-teal-500/10',
    hoverClass:
      'hover:border-emerald-200/55 hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.35),0_12px_20px_-8px_rgba(16,185,129,0.16),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  },
};

/** 与紫微宫位/模块卡片一致的悬停位移与阴影层级 */
const domainCardShellClass = cn(
  'group relative overflow-hidden rounded-[18px] border border-slate-200/45 border-l-[3px]',
  'bg-white/40 px-3.5 py-3.5 backdrop-blur-md transform-gpu',
  'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04),0_2px_6px_-1px_rgba(15,23,42,0.03)]',
  'transition-all duration-200',
  'hover:-translate-y-0.5 hover:scale-[1.01] hover:bg-white/58',
  'hover:shadow-[0_12px_20px_-8px_rgba(15,23,42,0.08),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
  'active:translate-y-0 active:scale-[0.995]',
  'motion-reduce:transition-none motion-reduce:hover:transform-none',
  'dark:border-white/[0.07] dark:bg-slate-900/28 dark:hover:bg-slate-900/40',
  'sm:rounded-[20px] sm:px-4 sm:py-4'
);

function TraitLine({
  kind,
  text,
  className,
}: {
  kind: '优势' | '规避';
  text: string;
  className: string;
}) {
  const trimmed = text.trim();
  const prefix = `${kind}：`;
  const body = trimmed.startsWith(prefix)
    ? trimmed.slice(prefix.length).trim()
    : trimmed.startsWith(`${kind}:`)
      ? trimmed.slice(kind.length + 1).trim()
      : trimmed;

  return (
    <p
      className={cn(
        'rounded-lg border px-2.5 py-1.5 text-[10px] leading-5 sm:text-[11px]',
        className
      )}
    >
      <span className="font-bold">{prefix}</span>
      {body}
    </p>
  );
}

export function PersonalityDashboardCard({
  tenGodDomains,
  className,
}: {
  tenGodDomains?: PartialDestinyReport['tenGodDomains'];
  className?: string;
}) {
  const hasData =
    tenGodDomains &&
    tenGodDomains.length === 5 &&
    tenGodDomains.every((item) => Boolean(item.description?.trim()));

  return (
    <GlassCard
      variant="hero"
      className={cn(
        'overflow-hidden p-4 sm:p-5',
        // 中屏也保持透光，避免 lg 以下退化为实色白底
        '!bg-white/38 !from-white/48 !via-white/24 !to-white/10',
        'supports-[backdrop-filter]:!bg-white/30',
        'dark:!bg-slate-900/40 dark:!from-slate-900/55 dark:!via-slate-900/30 dark:!to-slate-900/12',
        'dark:supports-[backdrop-filter]:!bg-slate-900/32',
        className
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 z-[1] h-px bg-gradient-to-r from-transparent via-white/80 to-transparent dark:via-white/25"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(99,102,241,0.14),transparent_62%)] dark:bg-[radial-gradient(ellipse_80%_55%_at_50%_-10%,rgba(99,102,241,0.18),transparent_62%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-24 top-8 z-0 h-52 w-52 rounded-full bg-violet-400/18 blur-3xl dark:bg-violet-500/14"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-20 bottom-4 z-0 h-44 w-44 rounded-full bg-blue-400/14 blur-3xl dark:bg-blue-500/12"
        aria-hidden
      />

      <div className="relative z-10">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/60 bg-white/70 shadow-sm dark:border-white/10 dark:bg-slate-800/60">
            <AssetToneIcon className="h-4 w-4 text-[#5D7CFA]" src={xinggeIcon} />
          </div>
          <div className="min-w-0">
            <div className="font-heading text-base font-bold text-slate-900 dark:text-slate-100 sm:text-lg">
              十神能量结构
            </div>
            <p className="mt-0.5 text-[11px] leading-5 text-slate-500 dark:text-slate-400 sm:text-xs">
              回答「我习惯怎么做事」：比劫、食伤、财星等在命局中的占比（百分比≠能力高低）
            </p>
          </div>
        </div>

        <div className="mt-4 sm:mt-5 flex flex-col gap-3 sm:gap-4">
          {hasData ? (
            tenGodDomains!.map((item) => {
              const theme = DOMAIN_THEME[item.key];
              const Icon = theme.Icon;

              return (
                <div
                  key={item.key}
                  className={cn(domainCardShellClass, theme.accentEdgeClass, theme.hoverClass)}
                >
                  <span
                    className="pointer-events-none absolute inset-x-0 top-0 z-0 h-px bg-gradient-to-r from-transparent via-white/75 to-transparent opacity-50 transition-opacity duration-200 group-hover:opacity-95 dark:via-white/20"
                    aria-hidden
                  />
                  <span
                    className={cn(
                      'pointer-events-none absolute -right-10 -top-10 z-0 h-32 w-32 rounded-full bg-gradient-to-br blur-3xl',
                      'opacity-20 transition-opacity duration-200 group-hover:opacity-50',
                      theme.orbClass
                    )}
                    aria-hidden
                  />
                  <div className="relative z-10">
                    <div className="flex items-start gap-3">
                      <div
                        className={cn(
                          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
                          'border border-white/70 bg-white/55 backdrop-blur-sm',
                          'transition-transform duration-200 group-hover:scale-105',
                          'dark:border-white/[0.08] dark:bg-slate-800/45'
                        )}
                      >
                        <Icon
                          className={cn(
                            'h-4 w-4 transition-transform duration-200 group-hover:scale-110',
                            theme.iconClass
                          )}
                          aria-hidden
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-extrabold text-slate-800 dark:text-slate-100 sm:text-sm">
                              {item.label}
                              <span className="ml-1 font-semibold text-slate-400 dark:text-slate-500">
                                （{item.technicalLabel}）
                              </span>
                            </div>
                            <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                              {theme.hint}
                            </p>
                          </div>
                          <div className="shrink-0 rounded-full border border-white/60 bg-white/50 px-2 py-0.5 text-xs font-bold tabular-nums text-slate-700 dark:border-white/10 dark:bg-slate-900/40 dark:text-slate-200 sm:text-sm">
                            {item.value}%
                          </div>
                        </div>

                        <div
                          className="mt-2.5 h-2.5 overflow-hidden rounded-full shadow-inner sm:mt-3 sm:h-3"
                          style={{ backgroundColor: theme.track }}
                        >
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{
                              width: `${Math.min(100, Math.max(0, item.value))}%`,
                              background: `linear-gradient(90deg, ${theme.accent}99, ${theme.accent}cc)`,
                            }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="mt-2.5 space-y-1.5 sm:mt-3">
                      {item.positive ? (
                        <TraitLine
                          kind="优势"
                          text={item.positive}
                          className="border-emerald-200/35 bg-emerald-50/45 text-emerald-800/90 dark:border-emerald-500/15 dark:bg-emerald-950/20 dark:text-emerald-200/90"
                        />
                      ) : null}
                      {item.negative ? (
                        <TraitLine
                          kind="规避"
                          text={item.negative}
                          className="border-amber-200/35 bg-amber-50/40 text-amber-800/90 dark:border-amber-500/15 dark:bg-amber-950/20 dark:text-amber-200/90"
                        />
                      ) : null}
                      {!item.positive && !item.negative && item.description ? (
                        <p className="text-[10px] leading-5 text-slate-500 dark:text-slate-400 sm:text-[11px]">
                          {item.description}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div data-testid="ten-god-domains-skeleton" className="space-y-3 sm:space-y-4">
              {Array.from({ length: 5 }).map((_, index) => (
                <div
                  key={`ten-god-domain-skeleton-${index}`}
                  className="rounded-[18px] border border-slate-200/40 bg-white/35 px-4 py-4 backdrop-blur-md dark:border-white/10 dark:bg-slate-800/30 sm:rounded-[20px]"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="h-4 w-40 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
                    <div className="h-4 w-10 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
                  </div>
                  <div className="mt-3 h-3 animate-pulse rounded-full bg-slate-100 dark:bg-slate-700" />
                  <div className="mt-3 h-3 w-full animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
                  <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/50" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </GlassCard>
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
