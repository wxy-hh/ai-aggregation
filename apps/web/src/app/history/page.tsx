'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const HistoryWorkspace = dynamic(() => import('./history-workspace'), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff] dark:bg-[#0A0B10]">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
    </div>
  ),
});

export default function HistoryPage() {
  return <HistoryWorkspace />;
}
