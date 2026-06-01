'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DestinyAmbientBackground, type DestinyAmbientTone } from './destiny-ambient-background';

type DestinyPageScaffoldProps = {
  children: React.ReactNode;
  className?: string;
  /** 桌面端为左侧导航预留偏移 */
  withNavOffset?: boolean;
  /** 环境光主色调（八字蓝 / 紫微紫 / 奇门靛） */
  tone?: DestinyAmbientTone;
};

export function DestinyPageScaffold({
  children,
  className,
  withNavOffset = false,
  tone = 'blue',
}: DestinyPageScaffoldProps) {
  return (
    <div className={cn('relative isolate h-full min-h-0 w-full overflow-hidden', className)}>
      <DestinyAmbientBackground tone={tone} />

      <div
        className={cn(
          'relative z-0 h-full min-h-0 w-full',
          withNavOffset &&
            'xl:h-full xl:pl-[var(--destiny-nav-offset,304px)] transition-[padding-left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
        )}
      >
        {children}
      </div>
    </div>
  );
}
