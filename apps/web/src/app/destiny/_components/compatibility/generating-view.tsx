'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { CompatibilityStreamStatus } from './types';

const STAGES: Array<{ key: CompatibilityStreamStatus; label: string }> = [
  { key: 'validating', label: '正在核对双方出生资料' },
  { key: 'charting', label: '正在生成双方命盘' },
  { key: 'analyzing', label: '正在整理你们的相处线索' },
  { key: 'finalizing', label: '合盘报告已准备好' },
];

export function CompatibilityGeneratingView({
  status,
  partnerName,
  onCancel,
}: {
  status: CompatibilityStreamStatus | null;
  partnerName: string;
  onCancel?: () => void;
}) {
  const activeIndex = Math.max(
    0,
    STAGES.findIndex((s) => s.key === status)
  );

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-xl flex-col items-center justify-center px-4 py-10 text-center">
      <div className="relative mb-8 h-28 w-56" aria-hidden>
        <div className="absolute left-4 top-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-blue-300/50 bg-blue-500/10 text-sm font-bold text-blue-600 shadow-sm dark:text-blue-300">
          我
        </div>
        <div className="absolute right-4 top-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-rose-300/50 bg-rose-400/10 text-sm font-bold text-rose-500 shadow-sm">
          TA
        </div>
        <svg className="absolute inset-x-16 top-14 h-6 overflow-visible" viewBox="0 0 120 24">
          <path
            d="M0 12 C 30 12, 90 12, 120 12"
            fill="none"
            stroke="rgba(212,175,55,0.8)"
            strokeWidth="1.5"
            className="compat-gen-line"
          />
        </svg>
      </div>

      <h2 className="text-xl font-bold text-slate-900 dark:text-slate-50">
        正在合盘 · 我 × {partnerName || 'TA'}
      </h2>
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">约需片刻，可离开后在合盘档案查看</p>

      <ol className="mt-8 w-full space-y-3 text-left">
        {STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const current = index === activeIndex;
          return (
            <li
              key={stage.key}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4 py-3 text-sm',
                current
                  ? 'border-blue-400/40 bg-blue-50/80 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : done
                    ? 'border-emerald-200/50 bg-emerald-50/50 text-emerald-700 dark:border-emerald-500/20 dark:bg-emerald-500/5 dark:text-emerald-300'
                    : 'border-slate-200/60 bg-white/70 text-slate-400 dark:border-white/10 dark:bg-slate-900/50'
              )}
            >
              <span
                className={cn(
                  'flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold',
                  current && 'animate-pulse bg-blue-600 text-white',
                  done && 'bg-emerald-500 text-white',
                  !current && !done && 'bg-slate-200 text-slate-500 dark:bg-slate-700'
                )}
              >
                {index + 1}
              </span>
              {stage.label}
            </li>
          );
        })}
      </ol>

      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-8 text-sm font-medium text-slate-500 underline-offset-2 hover:underline"
        >
          返回修改资料（报告会继续尝试生成）
        </button>
      ) : null}

      <style jsx>{`
        .compat-gen-line {
          stroke-dasharray: 8 6;
          animation: compat-dash 1.2s linear infinite;
        }
        @keyframes compat-dash {
          to {
            stroke-dashoffset: -28;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .compat-gen-line {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
