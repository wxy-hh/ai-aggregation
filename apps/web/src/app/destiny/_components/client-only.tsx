'use client';

import dynamic from 'next/dynamic';

const DestinyPageClient = dynamic(
  () => import('./destiny-page-client').then((m) => m.DestinyPageClient),
  { ssr: false }
);

export function ClientOnly() {
  return <DestinyPageClient />;
}
