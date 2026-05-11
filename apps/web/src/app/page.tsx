'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StaticLoginPage } from '@/components/login/static-login-page';
import { useAuthStore } from '@/stores/auth-store';

function getAuthHydrated() {
  return useAuthStore.persist?.hasHydrated?.() ?? true;
}

export default function HomePage() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(getAuthHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  useEffect(() => {
    const onFinishHydration = useAuthStore.persist?.onFinishHydration;

    if (hydrated || !onFinishHydration) return;

    const unsub = onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

  useEffect(() => {
    if (hydrated && isAuthenticated) {
      router.replace('/home');
    }
  }, [hydrated, isAuthenticated, router]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
      </div>
    );
  }

  return <StaticLoginPage />;
}
