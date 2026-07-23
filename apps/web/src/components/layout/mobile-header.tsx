'use client';

import React from 'react';
import { APP_CONFIGS } from './apps-modal';
import { Sparkles } from 'lucide-react';
import { useDestinyWorkspaceStore } from '@/stores/destiny-workspace-store';
import { cn } from '@/lib/utils';

interface MobileHeaderProps {
  pathname: string;
}

const PAGE_TITLES: Record<string, string> = {
  '/home': '首页',
  '/history': '历史记录',
  '/profile': '个人中心',
  '/admin/users': '系统用户管理',
};

function getPageTitle(pathname: string) {
  const matchedApp = APP_CONFIGS.find((app) => pathname.startsWith(app.href));

  if (matchedApp) {
    return matchedApp.label;
  }

  return PAGE_TITLES[pathname] ?? 'AI Studio';
}

export function MobileHeader({ pathname }: MobileHeaderProps) {
  // 紫微结果态:顶栏随场景入夜(移动端唯一的全局 chrome,全宽白带会直接切断沉浸)
  const ziweiNightInStore = useDestinyWorkspaceStore(
    (s) => s.activeModule === 'ziwei' && s.ziwei.step === 'result'
  );
  const night = pathname.startsWith('/destiny') && ziweiNightInStore;

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-40 border-b px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur-xl',
        'transition-[background-color,border-color] duration-500',
        night
          ? 'border-[#E7C873]/15 bg-[#0C1128]/85'
          : 'border-slate-200/80 bg-white/92 dark:border-slate-800/70 dark:bg-[#111218]/92'
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-tr text-white shadow-lg transition-all duration-500',
            night
              ? 'from-[#8B5CF6] to-[#6D28D9] shadow-violet-500/30'
              : 'from-[#5D7CFA] to-[#8794FF] shadow-indigo-500/20'
          )}
        >
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p
            className={cn(
              'text-sm font-semibold transition-colors duration-500',
              night ? 'font-song text-[#EDE7DA]' : 'text-slate-900 dark:text-white'
            )}
          >
            {getPageTitle(pathname)}
          </p>
          <p
            className={cn(
              'text-xs transition-colors duration-500',
              night ? 'text-[#8B87A0]' : 'text-slate-500 dark:text-slate-400'
            )}
          >
            AI 聚合工作台
          </p>
        </div>
      </div>

      {/* 夜态时向下延伸 8px 夜色,盖住 main 顶部留白(root 浅底)与固定顶栏之间约 7px 的浅色接缝 */}
      {night && <span className="absolute inset-x-0 -bottom-2 h-2 bg-[#0C1128]/85" aria-hidden />}
    </header>
  );
}
