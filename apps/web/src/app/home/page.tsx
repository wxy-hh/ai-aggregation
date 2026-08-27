'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const HomeWorkspace = dynamic(() => import('./home-workspace'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      </div>
    </div>
  ),
});

export default function HomeWorkspacePage() {
  return <HomeWorkspace />;
}
