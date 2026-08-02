'use client';

import React from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Briefcase,
  Check,
  Gift,
  Heart,
  Hourglass,
  Info,
  MessageCircle,
  Rocket,
  Shield,
  Sparkles,
  Users,
  Wrench,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassCard } from '../../layout/glass-card';
import { destinySecondaryBtnClass } from '../../layout/destiny-result-header';
import type {
  CompatibilityChartFacts,
  CompatibilityViewPayload,
  CompatibilityWeeklyAction,
} from '../types';

/** 内容卡：G-2 玻璃 + 桌面 hover 微升（移动端不 scale，避免误触抖动） */
export const reportCardClass = cn(
  'rounded-[1.5rem] p-5',
  'transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
  'hover:border-white/80 hover:shadow-[0_12px_28px_-10px_rgba(59,130,246,0.14),0_6px_14px_-6px_rgba(15,23,42,0.08)]',
  'dark:hover:border-white/20 dark:hover:shadow-[0_16px_36px_-12px_rgba(0,0,0,0.35)]',
  'md:hover:-translate-y-0.5'
);

/** 摘要条 / 次级玻璃条 */
export const reportBarClass = cn(
  'rounded-2xl border border-white/60 bg-white/70 px-4 py-3 backdrop-blur-xl',
  'shadow-[0_4px_16px_-8px_rgba(15,23,42,0.08)]',
  'supports-[backdrop-filter]:bg-white/55',
  'dark:border-white/10 dark:bg-slate-900/70 dark:supports-[backdrop-filter]:bg-slate-900/55',
  'transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
  'hover:bg-white/80 dark:hover:bg-slate-900/80'
);

/** 维度小格基础：低光玻璃，不叠 blur（避免玻璃套玻璃） */
export const dimensionTileBaseClass = cn(
  'rounded-2xl border p-3.5 backdrop-blur-md',
  'shadow-[0_1px_2px_0_rgba(15,23,42,0.03)]',
  'transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)]',
  'md:hover:-translate-y-0.5'
);

export type DimensionTone = {
  /** 小卡底色 + 边框 + hover */
  tile: string;
  /** 图标容器 */
  iconWrap: string;
  /** 分数字色 */
  score: string;
  /** 进度条渐变 */
  bar: string;
};

/**
 * 维度色板：低饱和、克制发光，浅/深色均可读
 * 四类关系各自 6 维度共用此表按 key 取色
 */
export const DIMENSION_TONES: Record<string, DimensionTone> = {
  // 恋爱
  expression: {
    tile: cn(
      'border-rose-200/45 bg-gradient-to-br from-rose-50/80 via-white/55 to-white/40',
      'hover:border-rose-300/55 hover:shadow-[0_8px_18px_-10px_rgba(244,63,94,0.18)]',
      'dark:border-rose-400/15 dark:from-rose-950/35 dark:via-slate-950/40 dark:to-slate-950/30',
      'dark:hover:border-rose-400/25'
    ),
    iconWrap: 'bg-rose-500/12 text-rose-500 dark:bg-rose-400/15 dark:text-rose-300',
    score: 'text-rose-500 dark:text-rose-300',
    bar: 'from-rose-400 to-rose-500',
  },
  pace: {
    tile: cn(
      'border-sky-200/45 bg-gradient-to-br from-sky-50/80 via-white/55 to-white/40',
      'hover:border-sky-300/55 hover:shadow-[0_8px_18px_-10px_rgba(14,165,233,0.16)]',
      'dark:border-sky-400/15 dark:from-sky-950/35 dark:via-slate-950/40 dark:to-slate-950/30',
      'dark:hover:border-sky-400/25'
    ),
    iconWrap: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
    score: 'text-sky-600 dark:text-sky-300',
    bar: 'from-sky-400 to-cyan-500',
  },
  intimacy: {
    tile: cn(
      'border-violet-200/45 bg-gradient-to-br from-violet-50/80 via-white/55 to-white/40',
      'hover:border-violet-300/55 hover:shadow-[0_8px_18px_-10px_rgba(139,92,246,0.16)]',
      'dark:border-violet-400/15 dark:from-violet-950/35 dark:via-slate-950/40 dark:to-slate-950/30',
      'dark:hover:border-violet-400/25'
    ),
    iconWrap: 'bg-violet-500/12 text-violet-600 dark:bg-violet-400/15 dark:text-violet-300',
    score: 'text-violet-600 dark:text-violet-300',
    bar: 'from-violet-400 to-indigo-500',
  },
  practical: {
    tile: cn(
      'border-amber-200/45 bg-gradient-to-br from-amber-50/75 via-white/55 to-white/40',
      'hover:border-amber-300/55 hover:shadow-[0_8px_18px_-10px_rgba(245,158,11,0.16)]',
      'dark:border-amber-400/15 dark:from-amber-950/30 dark:via-slate-950/40 dark:to-slate-950/30',
      'dark:hover:border-amber-400/25'
    ),
    iconWrap: 'bg-amber-500/12 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
    score: 'text-amber-600 dark:text-amber-300',
    bar: 'from-amber-400 to-orange-500',
  },
  repair: {
    tile: cn(
      'border-teal-200/45 bg-gradient-to-br from-teal-50/80 via-white/55 to-white/40',
      'hover:border-teal-300/55 hover:shadow-[0_8px_18px_-10px_rgba(20,184,166,0.16)]',
      'dark:border-teal-400/15 dark:from-teal-950/35 dark:via-slate-950/40 dark:to-slate-950/30',
      'dark:hover:border-teal-400/25'
    ),
    iconWrap: 'bg-teal-500/12 text-teal-600 dark:bg-teal-400/15 dark:text-teal-300',
    score: 'text-teal-600 dark:text-teal-300',
    bar: 'from-teal-400 to-emerald-500',
  },
  stability: {
    tile: cn(
      'border-indigo-200/45 bg-gradient-to-br from-indigo-50/80 via-white/55 to-white/40',
      'hover:border-indigo-300/55 hover:shadow-[0_8px_18px_-10px_rgba(99,102,241,0.16)]',
      'dark:border-indigo-400/15 dark:from-indigo-950/35 dark:via-slate-950/40 dark:to-slate-950/30',
      'dark:hover:border-indigo-400/25'
    ),
    iconWrap: 'bg-indigo-500/12 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300',
    score: 'text-indigo-600 dark:text-indigo-300',
    bar: 'from-indigo-400 to-blue-500',
  },
  // 婚姻 / 友谊 / 协作 等扩展维度
  bond: {
    tile: cn(
      'border-rose-200/45 bg-gradient-to-br from-rose-50/80 via-white/55 to-white/40',
      'hover:border-rose-300/55 hover:shadow-[0_8px_18px_-10px_rgba(244,63,94,0.16)]',
      'dark:border-rose-400/15 dark:from-rose-950/35 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-rose-500/12 text-rose-500 dark:bg-rose-400/15 dark:text-rose-300',
    score: 'text-rose-500 dark:text-rose-300',
    bar: 'from-rose-400 to-pink-500',
  },
  chores: {
    tile: cn(
      'border-orange-200/45 bg-gradient-to-br from-orange-50/75 via-white/55 to-white/40',
      'hover:border-orange-300/55 hover:shadow-[0_8px_18px_-10px_rgba(249,115,22,0.14)]',
      'dark:border-orange-400/15 dark:from-orange-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-orange-500/12 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300',
    score: 'text-orange-600 dark:text-orange-300',
    bar: 'from-orange-400 to-amber-500',
  },
  finance: {
    tile: cn(
      'border-emerald-200/45 bg-gradient-to-br from-emerald-50/75 via-white/55 to-white/40',
      'hover:border-emerald-300/55 hover:shadow-[0_8px_18px_-10px_rgba(16,185,129,0.14)]',
      'dark:border-emerald-400/15 dark:from-emerald-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
    score: 'text-emerald-600 dark:text-emerald-300',
    bar: 'from-emerald-400 to-teal-500',
  },
  boundary: {
    tile: cn(
      'border-slate-200/55 bg-gradient-to-br from-slate-50/85 via-white/55 to-white/40',
      'hover:border-slate-300/60 hover:shadow-[0_8px_18px_-10px_rgba(100,116,139,0.14)]',
      'dark:border-slate-500/20 dark:from-slate-900/50 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-slate-500/12 text-slate-600 dark:bg-slate-400/15 dark:text-slate-300',
    score: 'text-slate-600 dark:text-slate-300',
    bar: 'from-slate-400 to-slate-500',
  },
  vision: {
    tile: cn(
      'border-fuchsia-200/45 bg-gradient-to-br from-fuchsia-50/75 via-white/55 to-white/40',
      'hover:border-fuchsia-300/55 hover:shadow-[0_8px_18px_-10px_rgba(217,70,239,0.14)]',
      'dark:border-fuchsia-400/15 dark:from-fuchsia-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-fuchsia-500/12 text-fuchsia-600 dark:bg-fuchsia-400/15 dark:text-fuchsia-300',
    score: 'text-fuchsia-600 dark:text-fuchsia-300',
    bar: 'from-fuchsia-400 to-violet-500',
  },
  trust: {
    tile: cn(
      'border-blue-200/45 bg-gradient-to-br from-blue-50/80 via-white/55 to-white/40',
      'hover:border-blue-300/55 hover:shadow-[0_8px_18px_-10px_rgba(59,130,246,0.14)]',
      'dark:border-blue-400/15 dark:from-blue-950/35 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-blue-500/12 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300',
    score: 'text-blue-600 dark:text-blue-300',
    bar: 'from-blue-400 to-indigo-500',
  },
  contact: {
    tile: cn(
      'border-cyan-200/45 bg-gradient-to-br from-cyan-50/80 via-white/55 to-white/40',
      'hover:border-cyan-300/55 hover:shadow-[0_8px_18px_-10px_rgba(6,182,212,0.14)]',
      'dark:border-cyan-400/15 dark:from-cyan-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-cyan-500/12 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300',
    score: 'text-cyan-600 dark:text-cyan-300',
    bar: 'from-cyan-400 to-sky-500',
  },
  support: {
    tile: cn(
      'border-pink-200/45 bg-gradient-to-br from-pink-50/80 via-white/55 to-white/40',
      'hover:border-pink-300/55 hover:shadow-[0_8px_18px_-10px_rgba(236,72,153,0.14)]',
      'dark:border-pink-400/15 dark:from-pink-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-pink-500/12 text-pink-600 dark:bg-pink-400/15 dark:text-pink-300',
    score: 'text-pink-600 dark:text-pink-300',
    bar: 'from-pink-400 to-rose-500',
  },
  interest: {
    tile: cn(
      'border-purple-200/45 bg-gradient-to-br from-purple-50/80 via-white/55 to-white/40',
      'hover:border-purple-300/55 hover:shadow-[0_8px_18px_-10px_rgba(168,85,247,0.14)]',
      'dark:border-purple-400/15 dark:from-purple-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-purple-500/12 text-purple-600 dark:bg-purple-400/15 dark:text-purple-300',
    score: 'text-purple-600 dark:text-purple-300',
    bar: 'from-purple-400 to-fuchsia-500',
  },
  alignment: {
    tile: cn(
      'border-indigo-200/45 bg-gradient-to-br from-indigo-50/80 via-white/55 to-white/40',
      'hover:border-indigo-300/55 hover:shadow-[0_8px_18px_-10px_rgba(99,102,241,0.14)]',
      'dark:border-indigo-400/15 dark:from-indigo-950/35 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-indigo-500/12 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300',
    score: 'text-indigo-600 dark:text-indigo-300',
    bar: 'from-indigo-400 to-violet-500',
  },
  decision: {
    tile: cn(
      'border-sky-200/45 bg-gradient-to-br from-sky-50/80 via-white/55 to-white/40',
      'hover:border-sky-300/55 hover:shadow-[0_8px_18px_-10px_rgba(14,165,233,0.14)]',
      'dark:border-sky-400/15 dark:from-sky-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-sky-500/12 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300',
    score: 'text-sky-600 dark:text-sky-300',
    bar: 'from-sky-400 to-blue-500',
  },
  execution: {
    tile: cn(
      'border-amber-200/45 bg-gradient-to-br from-amber-50/75 via-white/55 to-white/40',
      'hover:border-amber-300/55 hover:shadow-[0_8px_18px_-10px_rgba(245,158,11,0.14)]',
      'dark:border-amber-400/15 dark:from-amber-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-amber-500/12 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300',
    score: 'text-amber-600 dark:text-amber-300',
    bar: 'from-amber-400 to-yellow-500',
  },
  feedback: {
    tile: cn(
      'border-cyan-200/45 bg-gradient-to-br from-cyan-50/80 via-white/55 to-white/40',
      'hover:border-cyan-300/55 hover:shadow-[0_8px_18px_-10px_rgba(6,182,212,0.14)]',
      'dark:border-cyan-400/15 dark:from-cyan-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-cyan-500/12 text-cyan-600 dark:bg-cyan-400/15 dark:text-cyan-300',
    score: 'text-cyan-600 dark:text-cyan-300',
    bar: 'from-cyan-400 to-teal-500',
  },
  risk: {
    tile: cn(
      'border-orange-200/45 bg-gradient-to-br from-orange-50/75 via-white/55 to-white/40',
      'hover:border-orange-300/55 hover:shadow-[0_8px_18px_-10px_rgba(249,115,22,0.14)]',
      'dark:border-orange-400/15 dark:from-orange-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-orange-500/12 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300',
    score: 'text-orange-600 dark:text-orange-300',
    bar: 'from-orange-400 to-rose-400',
  },
  credit: {
    tile: cn(
      'border-emerald-200/45 bg-gradient-to-br from-emerald-50/75 via-white/55 to-white/40',
      'hover:border-emerald-300/55 hover:shadow-[0_8px_18px_-10px_rgba(16,185,129,0.14)]',
      'dark:border-emerald-400/15 dark:from-emerald-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
    ),
    iconWrap: 'bg-emerald-500/12 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300',
    score: 'text-emerald-600 dark:text-emerald-300',
    bar: 'from-emerald-400 to-green-500',
  },
};

export const DEFAULT_DIMENSION_TONE: DimensionTone = {
  tile: cn(
    'border-blue-200/45 bg-gradient-to-br from-blue-50/75 via-white/55 to-white/40',
    'hover:border-blue-300/55 hover:shadow-[0_8px_18px_-10px_rgba(59,130,246,0.14)]',
    'dark:border-blue-400/15 dark:from-blue-950/30 dark:via-slate-950/40 dark:to-slate-950/30'
  ),
  iconWrap: 'bg-blue-500/12 text-blue-600 dark:bg-blue-400/15 dark:text-blue-300',
  score: 'text-blue-600 dark:text-blue-300',
  bar: 'from-blue-400 to-indigo-500',
};

/** 六维维度图标映射 */
export const DIMENSION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  expression: Heart,
  pace: MessageCircle,
  intimacy: Users,
  practical: Briefcase,
  repair: Wrench,
  stability: Shield,
  bond: Heart,
  chores: Briefcase,
  finance: Briefcase,
  boundary: Shield,
  vision: Sparkles,
  trust: Shield,
  contact: MessageCircle,
  support: Heart,
  interest: Sparkles,
  alignment: Sparkles,
  decision: MessageCircle,
  execution: Briefcase,
  feedback: MessageCircle,
  risk: Shield,
  credit: Shield,
};

export function toneLabel(tone: 'warm' | 'patience' | 'advance') {
  if (tone === 'warm') return '升温';
  if (tone === 'advance') return '推进';
  return '耐心';
}

export function rhythmIcon(tone: 'warm' | 'patience' | 'advance') {
  if (tone === 'warm') return ArrowUpRight;
  if (tone === 'advance') return Rocket;
  return Hourglass;
}

export function rhythmIconBg(tone: 'warm' | 'patience' | 'advance') {
  if (tone === 'warm') return 'bg-rose-500/10';
  if (tone === 'advance') return 'bg-violet-500/10';
  return 'bg-amber-500/10';
}

export function rhythmIconColor(tone: 'warm' | 'patience' | 'advance') {
  if (tone === 'warm') return 'text-rose-500';
  if (tone === 'advance') return 'text-violet-500';
  return 'text-amber-600';
}

/** 四视角共用的 Props：各 View 组件只关心当前激活视角的数据与交互回调 */
export type RelationViewProps = {
  view: CompatibilityViewPayload;
  facts: CompatibilityChartFacts;
  /** 适配分档位文案（由 feel.scoreBand 派生，非命盘底分档位） */
  band: { title: string; hint: string };
  /** 本视角适配分档位 */
  scoreBand: 'high' | 'mid' | 'low';
  /** 本视角适配分（动画展示值） */
  scoreShown: number;
  /** 命盘底分（四视角共用，确定性） */
  baseScore: number;
  partnerLabel: string;
  whyOpen: string | null;
  onToggleWhy: (id: string) => void;
  onToggleAction: (actionId: string) => void;
};

export function buildScoreHintText(bandHint: string, scoreHints: string[]) {
  return `${bandHint}${scoreHints.length ? ` ${scoreHints.join('；')}` : ''}`;
}

/** 中心环下方：本视角适配分 + 命盘底分对照 */
export function ScoreBaseCaption({
  baseScore,
  scoreLabel,
}: {
  baseScore: number;
  scoreLabel: string;
}) {
  return (
    <p className="mt-2 text-center text-[10px] leading-relaxed text-slate-400 sm:text-[11px]">
      <span className="font-medium text-slate-500 dark:text-slate-300">
        {scoreLabel}
      </span>
      <span className="mx-1.5 text-slate-300 dark:text-slate-600">·</span>
      命盘底分 {baseScore}
    </p>
  );
}

/** "为什么" 展开/收起小控件：吸引/摩擦列表项通用 */
export function WhyNote({
  id,
  why,
  whyOpen,
  onToggle,
}: {
  id: string;
  why?: string;
  whyOpen: string | null;
  onToggle: (id: string) => void;
}) {
  if (!why) return null;
  return (
    <>
      <button
        type="button"
        className="mt-1 text-[11px] font-medium text-slate-400 transition hover:text-blue-500"
        onClick={() => onToggle(id)}
      >
        为什么
      </button>
      {whyOpen === id ? (
        <p className="mt-1.5 rounded-xl border border-white/50 bg-white/60 p-2 text-[11px] leading-relaxed text-slate-500 backdrop-blur-md dark:border-white/5 dark:bg-slate-950/50 dark:text-slate-400">
          {why}
        </p>
      ) : null}
    </>
  );
}

/** 首屏关系底色卡：ornate（恋爱大图）与 compact（其余三类简化仪表）两种版式共用外壳 */
export function RelationHero({
  variant,
  toneClass,
  eyebrow,
  title,
  oneLiner,
  hintText,
  whyOpen,
  onToggleWhy,
  visual,
}: {
  variant: 'ornate' | 'compact';
  toneClass: string;
  eyebrow?: React.ReactNode;
  title: string;
  oneLiner: string;
  hintText: string;
  whyOpen: string | null;
  onToggleWhy: (id: string) => void;
  visual: React.ReactNode;
}) {
  const open = whyOpen === 'score';
  return (
    <section
      className={cn(
        // h-full：与右侧节奏/KPI 并排时拉伸对齐，不留上下错位
        'group relative col-span-12 h-full overflow-visible rounded-[1.5rem] p-5 sm:p-6 xl:col-span-8',
        'border backdrop-blur-xl lg:backdrop-blur-2xl',
        'transition-all duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] md:hover:-translate-y-0.5',
        toneClass
      )}
    >
      <span
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/20"
        aria-hidden
      />
      {variant === 'ornate' ? (
        <div className="relative flex h-full min-h-[200px] flex-col gap-6 sm:min-h-[240px] lg:min-h-[268px] lg:block">
          <div
            className="pointer-events-none absolute -right-8 -top-10 hidden h-48 w-48 rounded-full bg-gradient-to-br from-blue-400/25 to-indigo-400/10 opacity-50 blur-3xl transition-opacity duration-300 group-hover:opacity-90 md:block"
            aria-hidden
          />
          <div className="relative z-[1] min-w-0 lg:max-w-[46%] lg:pr-4">
            {eyebrow}
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {oneLiner}
            </p>
            <WhyScoreToggle open={open} hintText={hintText} onToggle={() => onToggleWhy('score')} />
          </div>
          <div className="relative z-0 flex w-full justify-center lg:absolute lg:inset-y-0 lg:right-0 lg:flex lg:w-[56%] lg:items-center lg:justify-center">
            {visual}
          </div>
        </div>
      ) : (
        <div className="relative flex h-full flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex-1">
            {eyebrow}
            <h2 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-2xl">
              {title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {oneLiner}
            </p>
            <WhyScoreToggle open={open} hintText={hintText} onToggle={() => onToggleWhy('score')} />
          </div>
          <div className="flex shrink-0 justify-center sm:justify-end">{visual}</div>
        </div>
      )}
    </section>
  );
}

/** 首屏左右等高行：hero + 侧卡统一 stretch，避免上下错位 */
export const reportHeroRowClass =
  'col-span-12 grid grid-cols-12 items-stretch gap-4 sm:gap-5';

/** 首屏侧卡：填满行高，内部纵向排布 */
export const reportSideCardClass = cn(
  reportCardClass,
  'flex h-full flex-col col-span-12 xl:col-span-4'
);

function WhyScoreToggle({
  open,
  hintText,
  onToggle,
}: {
  open: boolean;
  hintText: string;
  onToggle: () => void;
}) {
  return (
    <div className="relative mt-3">
      <button
        type="button"
        className="inline-flex min-h-[44px] items-center gap-1 text-sm font-medium text-blue-600 transition hover:text-blue-500 dark:text-blue-400"
        onClick={onToggle}
        aria-expanded={open}
      >
        为什么这么说？
        <Info className="h-3.5 w-3.5 opacity-70" />
      </button>
      {open ? (
        <p className="relative z-20 mt-2 w-full max-w-md rounded-xl border border-white/70 bg-white/95 p-3 text-xs leading-relaxed text-slate-500 shadow-[0_8px_24px_-8px_rgba(15,23,42,0.12)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/95 dark:text-slate-400 lg:absolute lg:left-0 lg:top-full lg:mt-1">
          {hintText}
        </p>
      ) : null}
    </div>
  );
}

/** 简化版合拍指数环：图标居中，弱化"打分感"（兼容旧调用，优先用 RelationDuoScoreVisual） */
export function RelationScoreGauge({
  score,
  icon: Icon,
  fromColor,
  toColor,
  iconWrapClass,
  label,
}: {
  score: number;
  icon: React.ComponentType<{ className?: string }>;
  fromColor: string;
  toColor: string;
  iconWrapClass: string;
  label: string;
}) {
  const gradId = React.useId();
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  return (
    <div className="flex flex-col items-center gap-2.5">
      <div className="relative flex h-28 w-28 items-center justify-center sm:h-32 sm:w-32">
        <svg
          className="absolute inset-0 h-full w-full -rotate-90"
          viewBox="0 0 100 100"
          aria-hidden
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={fromColor} />
              <stop offset="100%" stopColor={toColor} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="6" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <span
          className={cn(
            'flex h-14 w-14 items-center justify-center rounded-full sm:h-16 sm:w-16',
            iconWrapClass
          )}
        >
          <Icon className="h-6 w-6" />
        </span>
      </div>
      <div className="text-center">
        <span className="text-2xl font-black tabular-nums text-slate-900 dark:text-white">
          {score}
        </span>
        <p className="mt-0.5 text-[11px] font-medium text-slate-400">{label}</p>
      </div>
    </div>
  );
}

/** 双人主视觉主题：恋爱 / 朋友 / 婚姻 / 合作 各自色板与连线语感 */
export type DuoScoreTheme = 'romance' | 'friendship' | 'marriage' | 'partnership';

type DuoScoreThemeTokens = {
  /** 中心环文案 */
  scoreLabel: string;
  /** 连线语感：romance 柔金流线 / friendship 虚线轻连 / marriage 稳弧 / partnership 折线 */
  linkStyle: 'flow' | 'dash' | 'stable' | 'angular';
  selfFrom: string;
  selfTo: string;
  partnerFrom: string;
  partnerTo: string;
  selfGlow: string;
  partnerGlow: string;
  flowA: string;
  flowB: string;
  ringFrom: string;
  ringTo: string;
  selfRing: string;
  selfRingOuter: string;
  partnerRing: string;
  partnerRingOuter: string;
  accent: string;
  accentSoft: string;
  centerShadow: string;
  selfShadow: string;
  partnerShadow: string;
};

const DUO_SCORE_THEMES: Record<DuoScoreTheme, DuoScoreThemeTokens> = {
  romance: {
    scoreLabel: '合拍指数',
    linkStyle: 'flow',
    selfFrom: '#5B8DEF',
    selfTo: '#3B6FE8',
    partnerFrom: '#F08A8A',
    partnerTo: '#E86B6B',
    selfGlow: '#3B82F6',
    partnerGlow: '#FB7185',
    flowA: '#F59E0B',
    flowB: '#FBBF24',
    ringFrom: '#60A5FA',
    ringTo: '#818CF8',
    selfRing: '#93C5FD',
    selfRingOuter: '#BFDBFE',
    partnerRing: '#FECDD3',
    partnerRingOuter: '#FECDD3',
    accent: '#F59E0B',
    accentSoft: '#FBBF24',
    centerShadow: 'shadow-[0_14px_40px_-10px_rgba(37,99,235,0.3)]',
    selfShadow: 'shadow-[0_12px_32px_-6px_rgba(59,111,232,0.5)]',
    partnerShadow: 'shadow-[0_12px_32px_-6px_rgba(232,107,107,0.5)]',
  },
  friendship: {
    scoreLabel: '相处舒适度',
    linkStyle: 'dash',
    selfFrom: '#34D399',
    selfTo: '#10B981',
    partnerFrom: '#2DD4BF',
    partnerTo: '#14B8A6',
    selfGlow: '#10B981',
    partnerGlow: '#14B8A6',
    flowA: '#34D399',
    flowB: '#5EEAD4',
    ringFrom: '#34D399',
    ringTo: '#14B8A6',
    selfRing: '#6EE7B7',
    selfRingOuter: '#A7F3D0',
    partnerRing: '#5EEAD4',
    partnerRingOuter: '#99F6E4',
    accent: '#10B981',
    accentSoft: '#2DD4BF',
    centerShadow: 'shadow-[0_14px_40px_-10px_rgba(16,185,129,0.28)]',
    selfShadow: 'shadow-[0_12px_32px_-6px_rgba(16,185,129,0.45)]',
    partnerShadow: 'shadow-[0_12px_32px_-6px_rgba(20,184,166,0.45)]',
  },
  marriage: {
    scoreLabel: '经营稳度',
    linkStyle: 'stable',
    selfFrom: '#818CF8',
    selfTo: '#6366F1',
    partnerFrom: '#FBBF24',
    partnerTo: '#F59E0B',
    selfGlow: '#6366F1',
    partnerGlow: '#F59E0B',
    flowA: '#818CF8',
    flowB: '#FBBF24',
    ringFrom: '#818CF8',
    ringTo: '#F59E0B',
    selfRing: '#A5B4FC',
    selfRingOuter: '#C7D2FE',
    partnerRing: '#FCD34D',
    partnerRingOuter: '#FDE68A',
    accent: '#6366F1',
    accentSoft: '#F59E0B',
    centerShadow: 'shadow-[0_14px_40px_-10px_rgba(79,70,229,0.28)]',
    selfShadow: 'shadow-[0_12px_32px_-6px_rgba(99,102,241,0.45)]',
    partnerShadow: 'shadow-[0_12px_32px_-6px_rgba(245,158,11,0.45)]',
  },
  partnership: {
    scoreLabel: '协作指数',
    linkStyle: 'angular',
    selfFrom: '#64748B',
    selfTo: '#475569',
    partnerFrom: '#A78BFA',
    partnerTo: '#8B5CF6',
    selfGlow: '#64748B',
    partnerGlow: '#8B5CF6',
    flowA: '#94A3B8',
    flowB: '#A78BFA',
    ringFrom: '#64748B',
    ringTo: '#8B5CF6',
    selfRing: '#94A3B8',
    selfRingOuter: '#CBD5E1',
    partnerRing: '#C4B5FD',
    partnerRingOuter: '#DDD6FE',
    accent: '#8B5CF6',
    accentSoft: '#A78BFA',
    centerShadow: 'shadow-[0_14px_40px_-10px_rgba(139,92,246,0.28)]',
    selfShadow: 'shadow-[0_12px_32px_-6px_rgba(71,85,105,0.45)]',
    partnerShadow: 'shadow-[0_12px_32px_-6px_rgba(139,92,246,0.45)]',
  },
};

/**
 * 双人合拍主视觉：我 — 分数环 — TA
 * 恋爱沿用柔金流线；朋友虚线轻连；婚姻稳弧托底；合作折线对齐
 */
export function RelationDuoScoreVisual({
  theme,
  score,
  selfLabel,
  partnerLabel,
  scoreLabel,
  baseScore,
}: {
  theme: DuoScoreTheme;
  score: number;
  selfLabel: string;
  partnerLabel: string;
  /** 覆盖主题默认中心文案 */
  scoreLabel?: string;
  /** 命盘底分（可选，展示在中心环副文案） */
  baseScore?: number;
}) {
  const t = DUO_SCORE_THEMES[theme];
  const uid = React.useId().replace(/:/g, '');
  const flowId = `duo-flow-${uid}`;
  const selfGlowId = `duo-self-glow-${uid}`;
  const partnerGlowId = `duo-partner-glow-${uid}`;
  const ringId = `duo-ring-${uid}`;
  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (score / 100) * c;
  const label = scoreLabel ?? t.scoreLabel;

  const dots = React.useMemo(() => {
    const n = theme === 'partnership' ? 20 : 28;
    const radius = theme === 'partnership' ? 50 : 52;
    return Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      return { x: 160 + Math.cos(a) * radius, y: 100 + Math.sin(a) * radius };
    });
  }, [theme]);

  const dash =
    t.linkStyle === 'dash' ? '4 5' : t.linkStyle === 'angular' ? '0' : undefined;
  const linkOpacity =
    t.linkStyle === 'dash' ? 0.72 : t.linkStyle === 'stable' ? 0.85 : 1;

  return (
    <div
      className="relative h-[210px] w-full max-w-[440px] sm:h-[260px] sm:max-w-[520px]"
      aria-label={
        typeof baseScore === 'number'
          ? `${label} ${score}，命盘底分 ${baseScore}`
          : `${label} ${score}`
      }
    >
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 320 200"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden
      >
        <defs>
          <linearGradient id={flowId} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={t.flowA} stopOpacity="0.05" />
            <stop offset="22%" stopColor={t.flowB} stopOpacity="0.75" />
            <stop offset="50%" stopColor={t.flowA} stopOpacity="0.35" />
            <stop offset="78%" stopColor={t.flowB} stopOpacity="0.75" />
            <stop offset="100%" stopColor={t.flowA} stopOpacity="0.05" />
          </linearGradient>
          <radialGradient id={selfGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor={t.selfGlow} stopOpacity="0" />
            <stop offset="100%" stopColor={t.selfGlow} stopOpacity="0.22" />
          </radialGradient>
          <radialGradient id={partnerGlowId} cx="50%" cy="50%" r="50%">
            <stop offset="55%" stopColor={t.partnerGlow} stopOpacity="0" />
            <stop offset="100%" stopColor={t.partnerGlow} stopOpacity="0.22" />
          </radialGradient>
        </defs>

        <circle cx="62" cy="100" r="48" fill={`url(#${selfGlowId})`} />
        <circle cx="258" cy="100" r="48" fill={`url(#${partnerGlowId})`} />

        {t.linkStyle === 'angular' ? (
          <>
            {/* 合作：折线式对齐，强调决策路径 */}
            <path
              d="M 78 88 L 118 72 L 160 88"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={linkOpacity}
            />
            <path
              d="M 242 88 L 202 72 L 160 88"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={linkOpacity}
            />
            <path
              d="M 78 112 L 118 128 L 160 112"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={linkOpacity}
            />
            <path
              d="M 242 112 L 202 128 L 160 112"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={linkOpacity}
            />
            <path
              d="M 90 100 L 160 100 L 230 100"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.1"
              strokeLinecap="round"
              opacity="0.45"
            />
          </>
        ) : t.linkStyle === 'stable' ? (
          <>
            {/* 婚姻：更厚、更稳的双弧托底 + 顶梁 */}
            <path
              d="M 78 90 C 115 58, 145 58, 160 86"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.7"
              strokeLinecap="round"
              opacity={linkOpacity}
            />
            <path
              d="M 242 90 C 205 58, 175 58, 160 86"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.7"
              strokeLinecap="round"
              opacity={linkOpacity}
            />
            <path
              d="M 78 110 C 115 142, 145 142, 160 114"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.7"
              strokeLinecap="round"
              opacity={linkOpacity}
            />
            <path
              d="M 242 110 C 205 142, 175 142, 160 114"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.7"
              strokeLinecap="round"
              opacity={linkOpacity}
            />
            <path
              d="M 86 100 C 118 88, 142 88, 160 100"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.15"
              strokeLinecap="round"
              opacity="0.5"
            />
            <path
              d="M 234 100 C 202 88, 178 88, 160 100"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.15"
              strokeLinecap="round"
              opacity="0.5"
            />
          </>
        ) : (
          <>
            {/* 恋爱流线 / 朋友虚线：多层弧 */}
            <path
              d="M 78 88 C 110 48, 130 42, 160 72"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={linkOpacity}
            />
            <path
              d="M 242 88 C 210 48, 190 42, 160 72"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={linkOpacity}
            />
            <path
              d="M 78 94 C 112 62, 132 56, 160 78"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.05"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={t.linkStyle === 'dash' ? 0.5 : 0.65}
            />
            <path
              d="M 242 94 C 208 62, 188 56, 160 78"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.05"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={t.linkStyle === 'dash' ? 0.5 : 0.65}
            />
            <path
              d="M 80 100 C 114 78, 136 74, 160 88"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity="0.45"
            />
            <path
              d="M 240 100 C 206 78, 184 74, 160 88"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity="0.45"
            />
            <path
              d="M 78 112 C 110 152, 130 158, 160 128"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={linkOpacity}
            />
            <path
              d="M 242 112 C 210 152, 190 158, 160 128"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.35"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={linkOpacity}
            />
            <path
              d="M 78 106 C 112 138, 132 144, 160 122"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.05"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={t.linkStyle === 'dash' ? 0.5 : 0.65}
            />
            <path
              d="M 242 106 C 208 138, 188 144, 160 122"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="1.05"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity={t.linkStyle === 'dash' ? 0.5 : 0.65}
            />
            <path
              d="M 80 100 C 114 122, 136 126, 160 112"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity="0.45"
            />
            <path
              d="M 240 100 C 206 122, 184 126, 160 112"
              fill="none"
              stroke={`url(#${flowId})`}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeDasharray={dash}
              opacity="0.45"
            />
          </>
        )}

        <circle cx="108" cy="62" r="1.6" fill={t.accent} opacity="0.75" />
        <circle cx="212" cy="62" r="1.6" fill={t.accent} opacity="0.75" />
        <circle cx="100" cy="138" r="1.4" fill={t.accentSoft} opacity="0.65" />
        <circle cx="220" cy="138" r="1.4" fill={t.accentSoft} opacity="0.65" />
        <circle cx="124" cy="54" r="1.1" fill={t.accent} opacity="0.5" />
        <circle cx="196" cy="54" r="1.1" fill={t.accent} opacity="0.5" />
        <circle cx="130" cy="146" r="1.1" fill={t.accentSoft} opacity="0.45" />
        <circle cx="190" cy="146" r="1.1" fill={t.accentSoft} opacity="0.45" />

        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={i % 3 === 0 ? 1.35 : 0.9}
            fill={t.accent}
            opacity={i % 3 === 0 ? 0.55 : 0.28}
          />
        ))}

        <circle cx="62" cy="100" r="38" fill="none" stroke={t.selfRing} strokeWidth="1" opacity="0.55" />
        <circle cx="62" cy="100" r="44" fill="none" stroke={t.selfRingOuter} strokeWidth="0.8" opacity="0.35" />
        <circle cx="258" cy="100" r="38" fill="none" stroke={t.partnerRing} strokeWidth="1" opacity="0.55" />
        <circle cx="258" cy="100" r="44" fill="none" stroke={t.partnerRingOuter} strokeWidth="0.8" opacity="0.35" />
      </svg>

      <div
        className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2"
        style={{ left: '19.375%' }}
      >
        <div
          className={cn(
            'flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white sm:h-[5.5rem] sm:w-[5.5rem] sm:text-xl',
            t.selfShadow
          )}
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${t.selfFrom}, ${t.selfTo})`,
          }}
        >
          {selfLabel}
        </div>
      </div>

      <div
        className={cn(
          'absolute left-1/2 top-1/2 z-[3] flex h-[6.5rem] w-[6.5rem] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-white/70 bg-white/90 backdrop-blur-xl dark:border-white/10 dark:bg-slate-900/90 sm:h-[7.75rem] sm:w-[7.75rem]',
          t.centerShadow
        )}
      >
        <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <linearGradient id={ringId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={t.ringFrom} />
              <stop offset="100%" stopColor={t.ringTo} />
            </linearGradient>
          </defs>
          <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(148,163,184,0.16)" strokeWidth="3.2" />
          <circle
            cx="50"
            cy="50"
            r={r}
            fill="none"
            stroke={`url(#${ringId})`}
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
          />
        </svg>
        <span className="relative text-[1.85rem] font-black tabular-nums leading-none text-slate-900 dark:text-white sm:text-[2.35rem]">
          {score}
        </span>
        <span className="relative mt-1 flex items-center gap-0.5 text-[10px] font-medium text-slate-400 sm:text-[11px]">
          {label}
          <Info className="h-3 w-3 opacity-50" />
        </span>
        {typeof baseScore === 'number' ? (
          <span className="relative mt-0.5 text-[9px] font-medium tabular-nums text-slate-400/90 sm:text-[10px]">
            底分 {baseScore}
          </span>
        ) : null}
      </div>

      <div
        className="absolute top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2"
        style={{ left: '80.625%' }}
      >
        <div
          className={cn(
            'flex h-[4.75rem] w-[4.75rem] items-center justify-center rounded-full bg-gradient-to-br text-lg font-bold text-white sm:h-[5.5rem] sm:w-[5.5rem] sm:text-xl',
            t.partnerShadow
          )}
          style={{
            backgroundImage: `linear-gradient(to bottom right, ${t.partnerFrom}, ${t.partnerTo})`,
          }}
        >
          {partnerLabel}
        </div>
      </div>
    </div>
  );
}

/**
 * 恋爱视角合拍主视觉（兼容旧 API，内部走双人主题）
 */
export function CompatibilityScoreVisual({
  score,
  selfLabel,
  partnerLabel,
}: {
  score: number;
  selfLabel: string;
  partnerLabel: string;
}) {
  return (
    <RelationDuoScoreVisual
      theme="romance"
      score={score}
      selfLabel={selfLabel}
      partnerLabel={partnerLabel}
    />
  );
}

export function NeedsColumn({
  title,
  tone,
  items,
}: {
  title: string;
  tone: 'blue' | 'rose' | 'indigo' | 'emerald' | 'violet';
  items: Array<{ title: string; detail?: string }>;
}) {
  const toneClass: Record<typeof tone, { dot: string; title: string; icon: string }> = {
    blue: {
      dot: 'bg-blue-500',
      title: 'text-blue-600 dark:text-blue-400',
      icon: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    },
    rose: {
      dot: 'bg-rose-400',
      title: 'text-rose-500',
      icon: 'bg-rose-500/10 text-rose-500',
    },
    indigo: {
      dot: 'bg-indigo-500',
      title: 'text-indigo-600 dark:text-indigo-400',
      icon: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400',
    },
    emerald: {
      dot: 'bg-emerald-500',
      title: 'text-emerald-600 dark:text-emerald-400',
      icon: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    },
    violet: {
      dot: 'bg-violet-500',
      title: 'text-violet-600 dark:text-violet-400',
      icon: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
    },
  };
  const t = toneClass[tone];
  return (
    <div>
      <div className="mb-2.5 flex items-center gap-2">
        <span className={cn('h-1.5 w-1.5 rounded-full', t.dot)} />
        <span className={cn('text-xs font-bold', t.title)}>{title}</span>
      </div>
      <ul className="space-y-3">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2.5">
            <span
              className={cn(
                'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                t.icon
              )}
            >
              {i % 2 === 0 ? <Heart className="h-3.5 w-3.5" /> : <Gift className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <div className="text-xs font-semibold leading-snug text-slate-800 dark:text-slate-100">
                {item.title}
              </div>
              {item.detail ? (
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  {item.detail}
                </p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 六维网格：各视角共用，可覆盖列数与是否展示 note */
export function DimensionGrid({
  dimensions,
  columnsClass = 'grid-cols-2 sm:grid-cols-3',
  showNote = false,
}: {
  dimensions: CompatibilityViewPayload['dimensions'];
  columnsClass?: string;
  showNote?: boolean;
}) {
  return (
    <div className={cn('grid gap-3', columnsClass)}>
      {dimensions.map((d) => {
        const Icon = DIMENSION_ICONS[d.key] ?? Sparkles;
        const tone = DIMENSION_TONES[d.key] ?? DEFAULT_DIMENSION_TONE;
        return (
          <div key={d.key} className={cn(dimensionTileBaseClass, tone.tile)}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
                    tone.iconWrap
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                </span>
                <span className="truncate text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {d.label}
                </span>
              </div>
              <span className={cn('shrink-0 text-base font-bold tabular-nums', tone.score)}>
                {d.value}
              </span>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200/55 dark:bg-slate-700/70">
              <div
                className={cn(
                  'h-full rounded-full bg-gradient-to-r transition-[width] duration-500 ease-out',
                  tone.bar
                )}
                style={{ width: `${Math.min(100, Math.max(0, d.value))}%` }}
              />
            </div>
            {showNote && d.note ? (
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {d.note}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/** 时间线节奏：默认竖向；horizontal 用于恋爱心跳节奏条 */
export function RhythmTimeline({
  rhythm,
  layout = 'vertical',
}: {
  rhythm: CompatibilityViewPayload['rhythm'];
  layout?: 'vertical' | 'horizontal';
}) {
  if (layout === 'horizontal') {
    return (
      <ol className="flex gap-3 overflow-x-auto pb-1 custom-scrollbar">
        {rhythm.map((node, i) => {
          const Icon = rhythmIcon(node.tone);
          return (
            <li
              key={i}
              className={cn(
                'min-w-[9.5rem] flex-1 rounded-2xl border border-white/55 bg-white/55 p-3.5 backdrop-blur-md',
                'shadow-[0_4px_14px_-8px_rgba(15,23,42,0.1)]',
                'dark:border-white/10 dark:bg-slate-950/45'
              )}
            >
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
                    rhythmIconBg(node.tone)
                  )}
                >
                  <Icon className={cn('h-3.5 w-3.5', rhythmIconColor(node.tone))} />
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {toneLabel(node.tone)}期
                  </div>
                  <div className="text-[10px] font-medium text-slate-400">{node.when}</div>
                </div>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                {node.advice}
              </p>
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <ol className="relative space-y-0">
      {rhythm.map((node, i) => {
        const Icon = rhythmIcon(node.tone);
        const isLast = i === rhythm.length - 1;
        return (
          <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
            {!isLast ? (
              <span
                className="absolute bottom-0 left-[15px] top-8 w-px bg-slate-200/80 dark:bg-slate-700/80"
                aria-hidden
              />
            ) : null}
            <span
              className={cn(
                'relative z-[1] flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-200',
                rhythmIconBg(node.tone)
              )}
            >
              <Icon className={cn('h-3.5 w-3.5', rhythmIconColor(node.tone))} />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {toneLabel(node.tone)}期
                </span>
                <span className="text-[11px] font-medium text-slate-400">{node.when}</span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
                {node.advice}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** 吸引列表：icon 与色调可按视角覆盖 */
export function AttractionsList({
  attractions,
  whyOpen,
  onToggleWhy,
  iconWrapClass = 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
}: {
  attractions: CompatibilityViewPayload['attractions'];
  whyOpen: string | null;
  onToggleWhy: (id: string) => void;
  iconWrapClass?: string;
}) {
  return (
    <ul className="space-y-4">
      {attractions.map((a, i) => (
        <li key={i} className="flex gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-200',
              iconWrapClass
            )}
          >
            {i % 2 === 0 ? (
              <Sparkles className="h-3.5 w-3.5" />
            ) : (
              <Users className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{a.title}</div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {a.detail}
            </p>
            <WhyNote
              id={`attr-${i}`}
              why={a.why}
              whyOpen={whyOpen}
              onToggle={onToggleWhy}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** 摩擦列表：trigger → action 结构 */
export function FrictionsList({
  frictions,
  whyOpen,
  onToggleWhy,
  iconAClass = 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  iconBClass = 'bg-rose-500/10 text-rose-500',
}: {
  frictions: CompatibilityViewPayload['frictions'];
  whyOpen: string | null;
  onToggleWhy: (id: string) => void;
  iconAClass?: string;
  iconBClass?: string;
}) {
  return (
    <ul className="space-y-4">
      {frictions.map((f, i) => (
        <li key={i} className="flex gap-3">
          <span
            className={cn(
              'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl',
              i % 2 === 0 ? iconAClass : iconBClass
            )}
          >
            {i % 2 === 0 ? (
              <MessageCircle className="h-3.5 w-3.5" />
            ) : (
              <Heart className="h-3.5 w-3.5" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              {f.trigger}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              {f.action || f.reaction}
            </p>
            <WhyNote
              id={`fric-${i}`}
              why={f.why}
              whyOpen={whyOpen}
              onToggle={onToggleWhy}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "今天/本周就能做的一件事" 行动卡：标题与配色随视角变化，四视角共用结构 */
export function PrimaryActionBanner({
  title,
  action,
  onToggleAction,
  disclaimers,
  doneClass,
  idleClass,
  ctaClass,
}: {
  title: string;
  action?: CompatibilityWeeklyAction;
  onToggleAction: (id: string) => void;
  disclaimers: string[];
  doneClass: string;
  idleClass: string;
  ctaClass?: string;
}) {
  if (!action) {
    return disclaimers.length > 0 ? (
      <div className="col-span-12 space-y-1 px-1">
        {disclaimers.map((d, i) => (
          <p key={i} className="text-[11px] leading-relaxed text-slate-400">
            {d}
          </p>
        ))}
      </div>
    ) : null;
  }
  return (
    <section className="col-span-12">
      <GlassCard
        variant="standard"
        className={cn(
          reportCardClass,
          'flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5'
        )}
      >
        <button
          type="button"
          onClick={() => onToggleAction(action.id)}
          className={cn(
            'flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200',
            action.done ? doneClass : idleClass
          )}
          aria-label={action.done ? '取消完成' : '标记完成'}
          aria-pressed={Boolean(action.done)}
        >
          <Check className="h-4 w-4" strokeWidth={2.5} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{title}</div>
          <p
            className={cn(
              'mt-0.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400',
              action.done && 'line-through opacity-60'
            )}
          >
            {action.text}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            if (!action.done) onToggleAction(action.id);
          }}
          className={cn(
            destinySecondaryBtnClass,
            'h-11 shrink-0 gap-1.5 px-4 text-sm',
            ctaClass
          )}
        >
          加入本周计划
          <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </GlassCard>

      {disclaimers.length > 0 ? (
        <div className="mt-3 space-y-1 px-1">
          {disclaimers.map((d, i) => (
            <p key={i} className="text-[11px] leading-relaxed text-slate-400">
              {d}
            </p>
          ))}
        </div>
      ) : null}
    </section>
  );
}
