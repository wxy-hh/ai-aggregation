'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function GlassCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-white/30 dark:border-white/10 bg-white/60 dark:bg-slate-900/70 backdrop-blur-[32px]',
        'shadow-[0_18px_60px_-18px_rgba(15,23,42,0.18)] dark:shadow-[0_18px_60px_-18px_rgba(0,0,0,0.4)]',
        'supports-[backdrop-filter]:bg-white/45 dark:supports-[backdrop-filter]:bg-slate-900/60',
        className
      )}
      {...props}
    />
  );
}
