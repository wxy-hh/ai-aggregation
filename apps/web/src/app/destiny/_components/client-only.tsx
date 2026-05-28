'use client';

import { use } from 'react';
import dynamic from 'next/dynamic';

const DestinyPageClient = dynamic(
  () => import('./destiny-page-client').then((m) => m.DestinyPageClient),
  { ssr: false }
);

export function ClientOnly({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; historyId?: string }>;
}) {
  const params = use(searchParams);
  return <DestinyPageClient initialTab={params.tab} />;
}
