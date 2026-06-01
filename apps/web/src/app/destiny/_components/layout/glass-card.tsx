'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';
import { destinyG3ContentShellClass, destinyG3ShellClass } from './destiny-result-header';

type GlassCardVariant = 'standard' | 'compact' | 'hero' | 'solid';

type GlassCardProps = HTMLAttributes<HTMLDivElement> & {
  variant?: GlassCardVariant;
};

const variantClass: Record<GlassCardVariant, string> = {
  /** G-3 深度级：格局定调等首屏焦点 */
  hero: cn(
    destinyG3ShellClass,
    'rounded-[28px] sm:rounded-[32px]',
    'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-px',
    'before:bg-gradient-to-r before:from-transparent before:via-white/60 before:to-transparent',
    'dark:before:via-white/20'
  ),
  /** G-2 标准级：与三术结果页 content shell 对齐 */
  standard: cn(
    destinyG3ContentShellClass,
    'rounded-[24px] sm:rounded-[28px] p-0',
    'shadow-[0_12px_20px_-8px_rgba(15,23,42,0.06),0_4px_10px_-2px_rgba(15,23,42,0.04)]',
    'dark:shadow-[0_14px_32px_rgba(0,0,0,0.22)]'
  ),
  compact: cn(
    'rounded-2xl border border-white/60 bg-white/85 backdrop-blur-xl',
    'shadow-[0_1px_2px_rgba(15,23,42,0.06)]',
    'supports-[backdrop-filter]:bg-white/80',
    'dark:border-white/10 dark:bg-slate-900/75 dark:shadow-[0_2px_10px_rgba(0,0,0,0.18)]',
    'dark:supports-[backdrop-filter]:bg-slate-900/70'
  ),
  /** 长文阅读区：高对比实体底，弱模糊 */
  solid: cn(
    'rounded-[24px] sm:rounded-[28px] border border-slate-200/80 bg-white/95',
    'shadow-[0_4px_12px_-2px_rgba(15,23,42,0.04)]',
    'dark:border-white/10 dark:bg-slate-900/92'
  ),
};

export function GlassCard({ className, variant = 'standard', ...props }: GlassCardProps) {
  return (
    <div
      className={cn('relative', variant === 'hero' && 'overflow-hidden', variantClass[variant], className)}
      {...props}
    />
  );
}
