'use client';

import React from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase,
  Heart,
  Home,
  Loader2,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { RELATION_LABEL } from '../constants';
import type { RelationType } from '../types';

type ThemeConfig = {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  tips: string[];
  shell: string;
  glowA: string;
  glowB: string;
  accent: string;
  ring: string;
  chip: string;
  bar: string;
  selfAvatar: string;
  partnerAvatar: string;
  link: string;
  skeleton: string;
};

const THEMES: Record<RelationType, ThemeConfig> = {
  romance: {
    icon: Heart,
    title: '正在编织恋爱视角',
    subtitle: '整理靠近方式、表达节奏与亲密边界…',
    tips: ['梳理双方表达差异', '对齐靠近节奏', '提炼可执行小动作'],
    shell:
      'border-rose-200/55 bg-gradient-to-br from-white/80 via-rose-50/50 to-amber-50/30 dark:border-rose-400/15 dark:from-slate-900/85 dark:via-rose-950/40 dark:to-amber-950/20',
    glowA: 'bg-rose-400/25',
    glowB: 'bg-amber-300/20',
    accent: 'text-rose-500 dark:text-rose-300',
    ring: 'border-rose-300/50 dark:border-rose-400/25',
    chip: 'border-rose-200/50 bg-rose-500/10 text-rose-600 dark:border-rose-400/20 dark:bg-rose-400/15 dark:text-rose-300',
    bar: 'from-rose-400 via-amber-300 to-rose-400',
    selfAvatar: 'from-blue-500 to-indigo-600 shadow-[0_8px_20px_-6px_rgba(59,130,246,0.45)]',
    partnerAvatar:
      'from-rose-400 to-rose-500 shadow-[0_8px_20px_-6px_rgba(244,63,94,0.4)]',
    link: 'stroke-rose-400/70',
    skeleton: 'from-rose-100/70 via-white/80 to-amber-50/70 dark:from-rose-950/40 dark:via-slate-800/50 dark:to-amber-950/30',
  },
  marriage: {
    icon: Home,
    title: '正在铺排共同生活',
    subtitle: '对齐分工、财务与边界，整理经营节奏…',
    tips: ['日常分工与责任', '财务协作规则', '边界与中长期节奏'],
    shell:
      'border-indigo-200/55 bg-gradient-to-br from-white/80 via-indigo-50/45 to-amber-50/25 dark:border-indigo-400/15 dark:from-slate-900/85 dark:via-indigo-950/40 dark:to-amber-950/15',
    glowA: 'bg-indigo-400/25',
    glowB: 'bg-amber-300/18',
    accent: 'text-indigo-600 dark:text-indigo-300',
    ring: 'border-indigo-300/50 dark:border-indigo-400/25',
    chip: 'border-indigo-200/50 bg-indigo-500/10 text-indigo-600 dark:border-indigo-400/20 dark:bg-indigo-400/15 dark:text-indigo-300',
    bar: 'from-indigo-400 via-amber-300 to-indigo-500',
    selfAvatar: 'from-indigo-500 to-indigo-600 shadow-[0_8px_20px_-6px_rgba(79,70,229,0.4)]',
    partnerAvatar:
      'from-amber-400 to-orange-500 shadow-[0_8px_20px_-6px_rgba(245,158,11,0.35)]',
    link: 'stroke-indigo-400/70',
    skeleton: 'from-indigo-100/70 via-white/80 to-amber-50/70 dark:from-indigo-950/40 dark:via-slate-800/50 dark:to-amber-950/30',
  },
  friendship: {
    icon: Users,
    title: '正在整理相处舒适度',
    subtitle: '看联系节奏、边界与互相充电的方式…',
    tips: ['联系是否轻松', '互助不绑架', '边界与互惠'],
    shell:
      'border-emerald-200/55 bg-gradient-to-br from-white/80 via-emerald-50/45 to-teal-50/25 dark:border-emerald-400/15 dark:from-slate-900/85 dark:via-emerald-950/35 dark:to-teal-950/15',
    glowA: 'bg-emerald-400/22',
    glowB: 'bg-teal-300/18',
    accent: 'text-emerald-600 dark:text-emerald-300',
    ring: 'border-emerald-300/50 dark:border-emerald-400/25',
    chip: 'border-emerald-200/50 bg-emerald-500/10 text-emerald-600 dark:border-emerald-400/20 dark:bg-emerald-400/15 dark:text-emerald-300',
    bar: 'from-emerald-400 via-teal-300 to-emerald-500',
    selfAvatar: 'from-emerald-500 to-teal-600 shadow-[0_8px_20px_-6px_rgba(16,185,129,0.4)]',
    partnerAvatar:
      'from-cyan-400 to-teal-500 shadow-[0_8px_20px_-6px_rgba(20,184,166,0.35)]',
    link: 'stroke-emerald-400/70',
    skeleton: 'from-emerald-100/70 via-white/80 to-teal-50/70 dark:from-emerald-950/40 dark:via-slate-800/50 dark:to-teal-950/30',
  },
  partnership: {
    icon: Briefcase,
    title: '正在对齐协作决策台',
    subtitle: '梳理目标、拍板与风险边界…',
    tips: ['目标是否同向', '谁拍板谁执行', '风险与信用边界'],
    shell:
      'border-violet-200/55 bg-gradient-to-br from-white/80 via-slate-50/50 to-violet-50/30 dark:border-violet-400/15 dark:from-slate-900/85 dark:via-slate-900/70 dark:to-violet-950/25',
    glowA: 'bg-violet-400/22',
    glowB: 'bg-slate-400/16',
    accent: 'text-violet-600 dark:text-violet-300',
    ring: 'border-violet-300/50 dark:border-violet-400/25',
    chip: 'border-violet-200/50 bg-violet-500/10 text-violet-600 dark:border-violet-400/20 dark:bg-violet-400/15 dark:text-violet-300',
    bar: 'from-slate-400 via-violet-400 to-slate-500',
    selfAvatar: 'from-slate-600 to-slate-700 shadow-[0_8px_20px_-6px_rgba(51,65,85,0.4)]',
    partnerAvatar:
      'from-violet-500 to-purple-600 shadow-[0_8px_20px_-6px_rgba(139,92,246,0.4)]',
    link: 'stroke-violet-400/70',
    skeleton: 'from-slate-100/80 via-white/80 to-violet-50/70 dark:from-slate-800/50 dark:via-slate-800/40 dark:to-violet-950/30',
  },
};

function DuoLinkVisual({
  relation,
  reduceMotion,
}: {
  relation: RelationType;
  reduceMotion: boolean;
}) {
  const t = THEMES[relation];
  const dash =
    relation === 'friendship'
      ? '6 6'
      : relation === 'partnership'
        ? '0'
        : undefined;
  const path =
    relation === 'marriage'
      ? 'M 36 48 Q 80 18 124 48'
      : relation === 'partnership'
        ? 'M 36 48 L 70 28 L 90 58 L 124 48'
        : 'M 36 48 C 60 28, 100 28, 124 48';

  return (
    <div className="relative mx-auto flex h-[112px] w-full max-w-[280px] items-center justify-center">
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 160 96"
        aria-hidden
      >
        <path
          d={path}
          fill="none"
          className={t.link}
          strokeWidth={relation === 'marriage' ? 2.4 : 2}
          strokeDasharray={dash}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.85}
        />
        {!reduceMotion ? (
          <motion.circle
            r={3.2}
            fill="currentColor"
            className={t.accent}
            initial={{ offsetDistance: '0%' }}
            animate={{ offsetDistance: '100%' }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
            style={{ offsetPath: `path('${path}')` } as React.CSSProperties}
          />
        ) : null}
      </svg>

      <div className="relative z-[1] flex w-full items-center justify-between px-2">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white',
            t.selfAvatar
          )}
        >
          我
        </div>
        <div
          className={cn(
            'relative flex h-14 w-14 items-center justify-center rounded-full border bg-white/70 backdrop-blur-md dark:bg-slate-900/70',
            t.ring
          )}
        >
          {!reduceMotion ? (
            <motion.span
              className={cn('absolute inset-0 rounded-full border', t.ring)}
              animate={{ scale: [1, 1.18, 1], opacity: [0.55, 0, 0.55] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : null}
          <Loader2 className={cn('h-5 w-5 animate-spin', t.accent)} />
        </div>
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br text-sm font-bold text-white',
            t.partnerAvatar
          )}
        >
          TA
        </div>
      </div>
    </div>
  );
}

/**
 * 四视角切换时的特色 loading：
 * 玻璃卡片 + 主题色光晕 + 双人连线动画 + 步骤 chip + 骨架
 * 点击即切换、无二次确认；补生成与首开一样计费
 */
export function RelationViewLoading({
  relation,
  partnerLabel = 'TA',
}: {
  relation: RelationType;
  partnerLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const t = THEMES[relation];
  const Icon = t.icon;
  const [tipIndex, setTipIndex] = React.useState(0);

  React.useEffect(() => {
    if (reduceMotion) return;
    const id = window.setInterval(() => {
      setTipIndex((i) => (i + 1) % t.tips.length);
    }, 1800);
    return () => window.clearInterval(id);
  }, [reduceMotion, t.tips.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn(
        'relative overflow-hidden rounded-[28px] border p-5 sm:p-7',
        'backdrop-blur-2xl supports-[backdrop-filter]:bg-white/50',
        'shadow-[0_20px_40px_-15px_rgba(15,23,42,0.12),0_8px_20px_-10px_rgba(59,130,246,0.08)]',
        'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px',
        'before:bg-gradient-to-r before:from-transparent before:via-white/70 before:to-transparent',
        t.shell
      )}
    >
      {/* 背景光晕 */}
      <div
        className={cn(
          'pointer-events-none absolute -left-10 -top-12 h-40 w-40 rounded-full blur-3xl',
          t.glowA
        )}
      />
      <div
        className={cn(
          'pointer-events-none absolute -bottom-16 -right-8 h-44 w-44 rounded-full blur-3xl',
          t.glowB
        )}
      />

      <div className="relative z-[1] flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div
              className={cn(
                'mb-2 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold backdrop-blur-sm',
                t.chip
              )}
            >
              <Icon className="h-3 w-3" />
              {RELATION_LABEL[relation]} · 视角切换
            </div>
            <h3 className="text-base font-bold tracking-tight text-slate-800 dark:text-slate-100 sm:text-lg">
              {t.title}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              我 × {partnerLabel.slice(0, 8)} · {t.subtitle}
            </p>
          </div>
        </div>

        <DuoLinkVisual relation={relation} reduceMotion={reduceMotion} />

        {/* 进度条 */}
        <div className="h-1.5 overflow-hidden rounded-full bg-white/55 dark:bg-slate-800/70">
          <motion.div
            className={cn('h-full rounded-full bg-gradient-to-r', t.bar)}
            initial={reduceMotion ? { width: '42%' } : { x: '-40%', width: '38%' }}
            animate={
              reduceMotion
                ? { width: '42%' }
                : { x: ['-40%', '110%'] }
            }
            transition={
              reduceMotion
                ? undefined
                : { duration: 1.4, repeat: Infinity, ease: 'easeInOut' }
            }
          />
        </div>

        {/* 步骤 chip */}
        <div className="flex flex-wrap gap-2">
          {t.tips.map((tip, i) => {
            const active = i === tipIndex;
            return (
              <span
                key={tip}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-[11px] font-medium transition-all duration-300',
                  active
                    ? cn(t.chip, 'shadow-sm')
                    : 'border-white/50 bg-white/35 text-slate-400 dark:border-white/10 dark:bg-slate-950/30 dark:text-slate-500'
                )}
              >
                {tip}
              </span>
            );
          })}
        </div>

        {/* 骨架：模拟报告首屏结构，避免空洞 */}
        <div className="grid grid-cols-12 gap-3">
          <div
            className={cn(
              'col-span-12 h-[108px] rounded-2xl bg-gradient-to-r animate-pulse sm:col-span-8',
              t.skeleton
            )}
          />
          <div
            className={cn(
              'col-span-12 h-[108px] rounded-2xl bg-gradient-to-r animate-pulse sm:col-span-4',
              t.skeleton
            )}
          />
          <div
            className={cn(
              'col-span-6 h-14 rounded-xl bg-gradient-to-r animate-pulse',
              t.skeleton
            )}
          />
          <div
            className={cn(
              'col-span-6 h-14 rounded-xl bg-gradient-to-r animate-pulse',
              t.skeleton
            )}
          />
        </div>

        <p className="text-center text-[11px] text-slate-400 dark:text-slate-500">
          正在以「{RELATION_LABEL[relation]}」视角组织已有命盘，不会改变双方八字
        </p>
      </div>
    </div>
  );
}
