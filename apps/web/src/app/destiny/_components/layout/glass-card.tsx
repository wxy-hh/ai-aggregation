'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

type GlassCardVariant = 'standard' | 'compact';

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: GlassCardVariant;
};

const variantClass: Record<GlassCardVariant, string> = {
  standard: cn(
    'rounded-3xl border border-[#D5DAEB]/80 bg-white/78 backdrop-blur-[24px]',
    'shadow-[0_8px_20px_rgba(76,95,154,0.10)]',
    'supports-[backdrop-filter]:bg-white/72',
    'dark:border-white/10 dark:bg-slate-900/70 dark:shadow-[0_14px_32px_rgba(0,0,0,0.28)]',
    'dark:supports-[backdrop-filter]:bg-slate-900/65'
  ),
  compact: cn(
    'rounded-2xl border border-[#E2E8F0]/90 bg-white/85 backdrop-blur-[16px]',
    'shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
    'supports-[backdrop-filter]:bg-white/80',
    'dark:border-white/10 dark:bg-slate-900/75 dark:shadow-[0_2px_10px_rgba(0,0,0,0.18)]',
    'dark:supports-[backdrop-filter]:bg-slate-900/70'
  ),
};

export function GlassCard({ className, variant = 'standard', ...props }: GlassCardProps) {
  return <div className={cn(variantClass[variant], className)} {...props} />;
}
