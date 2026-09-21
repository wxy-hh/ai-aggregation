// 核心布局组件
'use client';

import React, { ReactNode, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { GlobalSidebar } from './global-sidebar';
import { MobileHeader } from './mobile-header';
import { MobileBottomNav } from './mobile-bottom-nav';
import { MobileAppDrawer } from './mobile-app-drawer';
import { useAuth } from '@/hooks/use-auth';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { status } = useAuth();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // 认证引导未结束：先显示加载态，避免用过期身份渲染工作台
  if (status !== 'ready') {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff] dark:bg-[#0A0B10]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
          <p className="mt-4 text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col bg-[#F5F7FA] dark:bg-[#0A0B10] transition-colors duration-500 lg:flex-row"
      style={{ ['--app-global-nav-w' as string]: '100px' }}
    >
      {/* 桌面全局导航：悬浮层（fixed）不占文档流，页面底色/环境光延伸到它下方；
          页面内容由 main 的左侧内边距让位（DESIGN.md §8.5） */}
      <div className="fixed inset-y-0 left-0 z-50 hidden w-[var(--app-global-nav-w)] lg:block">
        <GlobalSidebar />
      </div>

      <div className="contents lg:hidden">
        <MobileHeader pathname={pathname} />
      </div>

      <main className="relative flex min-h-screen flex-1 overflow-x-hidden pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:h-screen lg:overflow-hidden lg:pt-0 lg:pb-0 lg:pl-[var(--app-global-nav-w)]">
        {children}
      </main>

      <div className="lg:hidden">
        <MobileBottomNav pathname={pathname} onMoreClick={() => setDrawerOpen(true)} />
        <MobileAppDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      </div>
    </div>
  );
}
