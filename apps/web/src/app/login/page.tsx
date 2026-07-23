'use client';

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { StaticLoginPage } from '@/components/login/static-login-page';
import { useAuthStore } from '@/stores/auth-store';

function getAuthHydrated() {
  return useAuthStore.persist?.hasHydrated?.() ?? true;
}

function LoginSpinner() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
    </div>
  );
}

function LoginPageContent() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(getAuthHydrated);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isAnonymous = useAuthStore((s) => s.user?.isAnonymous === true);

  useEffect(() => {
    const onFinishHydration = useAuthStore.persist?.onFinishHydration;

    if (hydrated || !onFinishHydration) return;

    const unsub = onFinishHydration(() => setHydrated(true));
    return unsub;
  }, [hydrated]);

  useEffect(() => {
    // 仅真实登录用户自动跳 /home；匿名用户停留以便输入账号密码切换为真实登录
    if (hydrated && isAuthenticated && !isAnonymous) {
      router.replace('/home');
    }
  }, [hydrated, isAuthenticated, isAnonymous, router]);

  if (!hydrated) {
    return <LoginSpinner />;
  }

  return <StaticLoginPage />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSpinner />}>
      <LoginPageContent />
    </Suspense>
  );
}
