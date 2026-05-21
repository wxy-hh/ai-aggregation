import { AppLayout } from '@/components/layout/app-layout';
import { ClientOnly } from './_components/client-only';

export default function DestinyPage() {
  return (
    <AppLayout>
      <ClientOnly />
    </AppLayout>
  );
}

