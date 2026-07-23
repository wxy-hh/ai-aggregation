'use client';

import { use, useEffect, useState } from 'react';
import { DestinyPageClient } from './destiny-page-client';

export function ClientOnly({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; historyId?: string }>;
}) {
  const [mounted, setMounted] = useState(false);
  const params = use(searchParams);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff] dark:bg-[#0A0B10]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
          <p className="mt-4 text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return <DestinyPageClient initialTab={params.tab} />;
}
