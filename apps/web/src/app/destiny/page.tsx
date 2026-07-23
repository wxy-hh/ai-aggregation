import { AppLayout } from '@/components/layout/app-layout';
import { ClientOnly } from './_components/client-only';

export default function DestinyPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; historyId?: string }>;
}) {
  return (
    <AppLayout>
      <ClientOnly searchParams={searchParams} />
    </AppLayout>
  );
}
