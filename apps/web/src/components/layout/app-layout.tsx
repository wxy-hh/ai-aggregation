// 核心布局组件
'use client';

import React, { ReactNode, useState } from 'react';
import { usePathname } from 'next/navigation';
import { GlobalSidebar } from './global-sidebar';
import { MobileHeader } from './mobile-header';
import { MobileBottomNav } from './mobile-bottom-nav';
import { MobileAppDrawer } from './mobile-app-drawer';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F7FA] dark:bg-[#0A0B10] transition-colors duration-500 lg:flex-row">
      <div className="hidden lg:block lg:h-screen lg:shrink-0">
        <GlobalSidebar />
      </div>

      <div className="contents lg:hidden">
        <MobileHeader pathname={pathname} />
      </div>

      <main className="relative flex min-h-screen flex-1 overflow-x-hidden pt-[calc(env(safe-area-inset-top)+4.5rem)] pb-[calc(env(safe-area-inset-bottom)+5.5rem)] lg:h-screen lg:overflow-hidden lg:pt-0 lg:pb-0">
        {children}
      </main>

      <div className="lg:hidden">
        <MobileBottomNav pathname={pathname} onMoreClick={() => setDrawerOpen(true)} />
        <MobileAppDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />
      </div>
    </div>
  );
}
