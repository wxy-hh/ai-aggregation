'use client';

import React from 'react';
import { useRequireAuth } from '@/hooks/use-auth';

interface AuthGuardProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/** 客户端认证守卫：未登录时显示 fallback 并重定向到 /login */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { isAuthenticated, isLoading } = useRequireAuth();

  if (isLoading || !isAuthenticated) {
    return <>{fallback ?? <DefaultLoading />}</>;
  }

  return <>{children}</>;
}

function DefaultLoading() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
      <div className="text-center">
        <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
        <p className="mt-4 text-sm text-slate-500">加载中...</p>
      </div>
    </div>
  );
}
