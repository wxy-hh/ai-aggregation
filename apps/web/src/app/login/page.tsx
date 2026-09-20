'use client';

import React, { Suspense } from 'react';
import { StaticLoginPage } from '@/components/login/static-login-page';
import { useRedirectRealUserToHome } from '@/hooks/use-auth';

function LoginSpinner() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
      <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
    </div>
  );
}

function LoginPageContent() {
  // 真实登录用户（非匿名）不应停留在登录页：命中即跳 /home。
  // 判定依据只有 auth store 的引导状态 + 身份（见 useRedirectRealUserToHome），
  // 不再依赖持久化水合的内部生命周期；未登录/匿名用户直接渲染表单，不额外等待匿名引导。
  const isRedirecting = useRedirectRealUserToHome();

  if (isRedirecting) {
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
