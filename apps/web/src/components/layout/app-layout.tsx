// AppLayout.tsx
'use client';

import { ReactNode } from 'react';
import { GlobalSidebar } from './global-sidebar';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300">
      <GlobalSidebar />
      <main className="flex-1 flex overflow-hidden h-screen">{children}</main>
    </div>
  );
}
