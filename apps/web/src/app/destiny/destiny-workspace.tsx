'use client';

import { useSearchParams } from 'next/navigation';
import { AppLayout } from '@/components/layout/app-layout';
import { ClientOnly } from './_components/client-only';

export default function DestinyWorkspace() {
  // 客户端薄壳内直接读取 URL 参数（tab/historyId），替代原 page 级 Promise prop
  const searchParams = useSearchParams();
  return (
    <AppLayout>
      <ClientOnly
        searchParams={Promise.resolve({
          tab: searchParams.get('tab') ?? undefined,
          historyId: searchParams.get('historyId') ?? undefined,
        })}
      />
    </AppLayout>
  );
}
