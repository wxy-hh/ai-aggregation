'use client';

import React from 'react';
import Link from 'next/link';
import { Home, Bot, PenTool, AudioWaveform, MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MobileBottomNavProps {
  pathname: string;
  onMoreClick: () => void;
}

const PRIMARY_NAV_ITEMS = [
  { href: '/', label: '首页', icon: Home },
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
  return (
    <nav
      aria-label="移动端底部导航"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/94 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur-xl dark:border-slate-800/70 dark:bg-[#111218]/94"
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
                  ? 'bg-[#EEF2FF] text-[#4E67E6] dark:bg-slate-800/90 dark:text-[#9BADFF]'
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
          className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs font-medium text-slate-500 transition-colors dark:text-slate-400"
        >
          <MoreHorizontal className="h-5 w-5" />
          <span>更多</span>
        </button>
      </div>
    </nav>
  );
}
