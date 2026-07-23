'use client';

import React from 'react';
import Link from 'next/link';
import { Home, Bot, PenTool, AudioWaveform, MoreHorizontal } from 'lucide-react';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  pathname: string;
  onMoreClick: () => void;
}

const PRIMARY_NAV_ITEMS = [
  { href: '/home', label: '首页', icon: Home },
  { href: '/chat', label: '对话', icon: Bot },
  { href: '/image', label: '图像', icon: PenTool },
  { href: '/voice', label: '语音', icon: AudioWaveform },
];

function isActive(pathname: string, href: string) {
  if (href === '/') {
    return pathname === '/';
  }

  return pathname.startsWith(href);
}

export function MobileBottomNav({ pathname, onMoreClick }: MobileBottomNavProps) {
  // 紫微结果态:底栏随场景入夜,与顶栏一起消除全宽白色接缝
  const ziweiNightInStore = useDestinyWorkspaceStore(
    (s) => s.activeModule === 'ziwei' && s.ziwei.step === 'result'
  );
  const night = pathname.startsWith('/destiny') && ziweiNightInStore;

  return (
    <nav
      aria-label="移动端底部导航"
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 border-t px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl',
        'transition-[background-color,border-color] duration-500',
        night
          ? 'border-[#E7C873]/15 bg-[#0C1128]/90'
          : 'border-slate-200/80 bg-white/94 dark:border-slate-800/70 dark:bg-[#111218]/94'
      )}
    >
      <div className="grid grid-cols-5 gap-1">
        {PRIMARY_NAV_ITEMS.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition-colors',
                active
                  ? night
                    ? 'bg-[#A78BFA]/15 text-[#C4B5FD]'
                    : 'bg-[#EEF2FF] text-[#4E67E6] dark:bg-slate-800/90 dark:text-[#9BADFF]'
                  : night
                    ? 'text-[#8B87A0]'
                    : 'text-slate-500 dark:text-slate-400'
              )}
            >
              <item.icon className="h-5 w-5" />
              <span>{item.label}</span>
            </Link>
          );
        })}

        <button
          type="button"
          aria-label="更多"
          onClick={onMoreClick}
          className={cn(
            'flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium transition-colors',
            night ? 'text-[#8B87A0]' : 'text-slate-500 dark:text-slate-400'
          )}
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>更多</span>
        </button>
      </div>
    </nav>
  );
}
