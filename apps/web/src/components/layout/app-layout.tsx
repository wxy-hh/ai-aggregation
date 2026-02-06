// 核心布局组件
'use client';

import { ReactNode } from 'react';
import { GlobalSidebar } from './global-sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-[#F5F7FA] dark:bg-[#0A0B10] transition-colors duration-500">
      <GlobalSidebar />
      <main className="flex-1 flex overflow-hidden h-screen relative">{children}</main>
    </div>
  );
}
