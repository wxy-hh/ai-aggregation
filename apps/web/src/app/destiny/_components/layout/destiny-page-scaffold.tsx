'use client';

import React from 'react';
import { cn } from '@/lib/utils';
import { DestinyAmbientBackground, type DestinyAmbientTone } from './destiny-ambient-background';

type DestinyPageScaffoldProps = {
  children: React.ReactNode;
  className?: string;
  /** 桌面端（lg 起，与左侧导航显隐断点一致）为左侧导航预留偏移 */
  withNavOffset?: boolean;
  /** 环境光主色调（八字蓝 / 紫微紫 / 奇门靛） */
  tone?: DestinyAmbientTone;
  /** 页面级入夜（紫微结果步）：环境底层交叉渐变为深空夜底 */
  night?: boolean;
};

export function DestinyPageScaffold({
  children,
  className,
  withNavOffset = false,
  tone = 'blue',
  night = false,
}: DestinyPageScaffoldProps) {
  // 全局导航是 fixed 悬浮层：桌面端让环境光底改取视口级定位，向左铺到导航下方——
  // 页面底色不再在导航右缘断一刀，悬浮玻璃后有色可磨（DESIGN.md §4.1 / §8.5）。
  // 入夜（夜幕）不铺：全局导航未随夜幕联动，保持原有亮玻璃底与分界（§10.2 联动面）。
  const bleedGlobalNav = withNavOffset && !night;

  return (
    <div className={cn('relative isolate h-full min-h-0 w-full overflow-hidden', className)}>
      <DestinyAmbientBackground
        tone={tone}
        night={night}
        className={cn(bleedGlobalNav && 'lg:fixed')}
      />

      <div
        className={cn(
          'relative z-0 h-full min-h-0 w-full',
          withNavOffset &&
            'lg:h-full lg:pl-[var(--destiny-nav-offset,304px)] transition-[padding-left] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)]'
        )}
      >
        {children}
      </div>
    </div>
  );
}
