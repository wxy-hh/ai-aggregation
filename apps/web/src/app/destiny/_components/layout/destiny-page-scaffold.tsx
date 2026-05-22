'use client';

import React from 'react';
import { cn } from '@/lib/utils';

type DestinyPageScaffoldProps = {
  children: React.ReactNode;
  className?: string;
  /** 桌面端为左侧导航预留偏移 */
  withNavOffset?: boolean;
  /** 是否使用主题底图（默认仅用 CSS mesh） */
  useThemeImage?: boolean;
};

export function DestinyPageScaffold({
  children,
  className,
  withNavOffset = false,
  useThemeImage = false,
}: DestinyPageScaffoldProps) {
  return (
    <div
      className={cn(
        'relative h-full min-h-0 w-full overflow-hidden bg-[#F1F5F9] dark:bg-[#111218]',
        className
      )}
    >
      {/* 亮色：冷白底 + 低饱和蓝紫柔光 */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 dark:hidden"
        aria-hidden
        style={{
          backgroundImage: useThemeImage
            ? "url('/主题色.png'), radial-gradient(980px 520px at 78% 18%, rgba(219,234,254,0.85) 0%, rgba(219,234,254,0.35) 38%, rgba(219,234,254,0) 68%), radial-gradient(900px 540px at 82% 88%, rgba(233,213,255,0.55) 0%, rgba(233,213,255,0.22) 40%, rgba(233,213,255,0) 65%)"
            : 'radial-gradient(980px 520px at 78% 18%, rgba(219,234,254,0.85) 0%, rgba(219,234,254,0.35) 38%, rgba(219,234,254,0) 68%), radial-gradient(900px 540px at 82% 88%, rgba(233,213,255,0.55) 0%, rgba(233,213,255,0.22) 40%, rgba(233,213,255,0) 65%)',
          backgroundRepeat: useThemeImage ? 'no-repeat, no-repeat, no-repeat' : 'no-repeat, no-repeat',
          backgroundSize: useThemeImage ? 'cover, cover, cover' : 'cover, cover',
          backgroundPosition: 'center, center, center',
        }}
      />
      {/* 暗色：石板底 + 柔和径向光 */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 hidden dark:block"
        aria-hidden
        style={{
          backgroundImage:
            'radial-gradient(980px 520px at 78% 20%, rgba(37,99,235,0.18) 0%, rgba(37,99,235,0.06) 38%, rgba(37,99,235,0) 65%), radial-gradient(900px 540px at 82% 88%, rgba(124,58,237,0.14) 0%, rgba(124,58,237,0.05) 40%, rgba(124,58,237,0) 62%)',
          backgroundRepeat: 'no-repeat, no-repeat',
          backgroundSize: 'cover, cover',
          backgroundPosition: 'center, center',
        }}
      />

      <div
        className={cn(
          'relative h-full min-h-0 w-full',
          withNavOffset && 'xl:h-full xl:pl-[304px]'
        )}
      >
        {children}
      </div>
    </div>
  );
}
