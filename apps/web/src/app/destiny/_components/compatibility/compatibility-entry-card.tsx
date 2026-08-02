'use client';

import React, { useEffect, useRef, useState } from 'react';
import { HeartHandshake, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BAZI_COMPATIBILITY_ENABLED } from './constants';

type CompatibilityEntryCardProps = {
  visible: boolean;
  onStart: () => void;
  hasExisting?: boolean;
  onViewExisting?: () => void;
  className?: string;
};

export function CompatibilityEntryCard({
  visible,
  onStart,
  hasExisting = false,
  onViewExisting,
  className,
}: CompatibilityEntryCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [linePlayed, setLinePlayed] = useState(false);

  useEffect(() => {
    if (!visible || linePlayed || !ref.current) return;
    const el = ref.current;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setLinePlayed(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [visible, linePlayed]);

  if (!BAZI_COMPATIBILITY_ENABLED || !visible) return null;

  return (
    <section
      ref={ref}
      className={cn(
        'group relative overflow-hidden rounded-3xl border border-blue-200/60 bg-white/90 p-5 shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)]',
        'dark:border-blue-400/15 dark:bg-slate-900/80 sm:p-6',
        className
      )}
    >
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/80 to-transparent opacity-70" />
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-gradient-to-br from-blue-400/15 to-rose-300/10 blur-3xl" />

      <div className="relative flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <div className="relative mt-0.5 flex h-14 w-[4.5rem] shrink-0 items-center justify-center">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-md shadow-blue-500/20">
              我
            </span>
            <span className="absolute right-0 flex h-10 w-10 items-center justify-center rounded-full bg-rose-400/90 text-xs font-bold text-white shadow-md shadow-rose-400/20">
              TA
            </span>
            <svg
              className="pointer-events-none absolute inset-x-3 top-1/2 h-3 -translate-y-1/2 overflow-visible"
              viewBox="0 0 56 12"
              aria-hidden
            >
              <path
                d="M4 6 C 18 6, 38 6, 52 6"
                fill="none"
                stroke="rgba(212,175,55,0.85)"
                strokeWidth="1.5"
                strokeLinecap="round"
                className={cn(linePlayed && 'compat-entry-line')}
              />
            </svg>
          </div>

          <div className="min-w-0 flex-1">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                <HeartHandshake className="h-3 w-3" />
                关系合盘
              </span>
              <span className="text-[11px] font-medium text-slate-400">恋爱 / 婚姻优先</span>
            </div>
            <h3 className="text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-xl">
              和 TA 测测缘分
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              从五行互补到相处节奏，看见你们的关系底色
            </p>
          </div>
        </div>

        <div className="flex w-full shrink-0 flex-col gap-2 sm:flex-row lg:w-auto lg:flex-col xl:flex-row">
          {hasExisting ? (
            <>
              <button
                type="button"
                onClick={onViewExisting}
                className="inline-flex h-12 min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow-md shadow-blue-500/15 transition hover:shadow-lg active:scale-[0.98]"
              >
                <Sparkles className="h-4 w-4" />
                查看上次合盘
              </button>
              <button
                type="button"
                onClick={onStart}
                className="inline-flex h-12 min-h-[44px] items-center justify-center rounded-2xl border border-slate-200/80 bg-white/70 px-5 text-sm font-semibold text-slate-700 transition hover:bg-white dark:border-white/10 dark:bg-slate-900/50 dark:text-slate-200"
              >
                重新测算
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onStart}
              className="inline-flex h-12 min-h-[44px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 text-sm font-semibold text-white shadow-md shadow-blue-500/15 transition hover:shadow-lg active:scale-[0.98]"
            >
              <Sparkles className="h-4 w-4" />
              开启八字合盘
            </button>
          )}
        </div>
      </div>

      <style jsx>{`
        .compat-entry-line {
          stroke-dasharray: 80;
          stroke-dashoffset: 80;
          animation: compat-line-flow 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
        }
        @keyframes compat-line-flow {
          to {
            stroke-dashoffset: 0;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .compat-entry-line {
            animation: none;
            stroke-dashoffset: 0;
          }
        }
      `}</style>
    </section>
  );
}
