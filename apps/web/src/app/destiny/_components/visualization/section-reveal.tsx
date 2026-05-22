'use client';

import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPrefersReducedMotion(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setPrefersReducedMotion(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

type SectionRevealProps = {
  children: React.ReactNode;
  /** 是否有可展示内容 */
  ready: boolean;
  streaming?: boolean;
  /** 流式等待时的骨架 */
  skeleton?: React.ReactNode;
  className?: string;
  /** stagger 延迟档位 0–5 */
  delayIndex?: number;
  testId?: string;
};

export function SectionReveal({
  children,
  ready,
  streaming = false,
  skeleton,
  className,
  delayIndex = 0,
  testId,
}: SectionRevealProps) {
  const reducedMotion = usePrefersReducedMotion();
  const delayMs = reducedMotion ? 0 : delayIndex * 75;

  if (!ready && streaming && skeleton) {
    return (
      <div className={className} data-testid={testId}>
        {skeleton}
      </div>
    );
  }

  if (!ready) {
    return null;
  }

  return (
    <div
      className={cn(
        !reducedMotion &&
          'animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both',
        className
      )}
      style={!reducedMotion ? { animationDelay: `${delayMs}ms` } : undefined}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

/** 通用区块骨架 */
export function SectionBlockSkeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3 rounded-3xl border border-[#D5DAEB]/60 bg-white/60 p-6 dark:border-white/10 dark:bg-slate-900/50">
      <div className="h-5 w-32 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/70" />
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={`line-${index}`}
          className={cn(
            'h-4 animate-pulse rounded bg-slate-200/70 dark:bg-slate-700/70',
            index === lines - 1 && 'w-4/5'
          )}
        />
      ))}
    </div>
  );
}
