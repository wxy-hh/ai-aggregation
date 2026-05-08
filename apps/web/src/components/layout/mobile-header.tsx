'use client';

import React from 'react';
import { APP_CONFIGS } from './apps-modal';
import { Sparkles } from 'lucide-react';

interface MobileHeaderProps {
  pathname: string;
}

const PAGE_TITLES: Record<string, string> = {
  '/': '首页',
  '/history': '历史记录',
};

function getPageTitle(pathname: string) {
  const matchedApp = APP_CONFIGS.find((app) => pathname.startsWith(app.href));

  if (matchedApp) {
    return matchedApp.label;
  }

  return PAGE_TITLES[pathname] ?? 'AI Studio';
}

export function MobileHeader({ pathname }: MobileHeaderProps) {
  return (
    <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200/80 bg-white/92 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl dark:border-slate-800/70 dark:bg-[#111218]/92">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr from-[#5D7CFA] to-[#8794FF] text-white shadow-lg shadow-indigo-500/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{getPageTitle(pathname)}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">AI 聚合工作台</p>
        </div>
      </div>
    </header>
  );
}
