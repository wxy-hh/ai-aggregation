'use client';

import { cn } from '@/lib/utils';
import type { HTMLAttributes } from 'react';

export function GlassCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-white/30 bg-white/60 backdrop-blur-[32px]',
        'shadow-[0_18px_60px_-18px_rgba(15,23,42,0.18)]',
        'supports-[backdrop-filter]:bg-white/45',
        className
      )}
      {...props}
    />
  );
}

