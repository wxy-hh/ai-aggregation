'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRequireAuth } from '@/hooks/use-auth';

interface AdminGuardProps {
  children: React.ReactNode;
}

/**
 * 管理员权限守卫组件。
 * - 未登录：useRequireAuth 自动重定向到 /login
 * - 已登录但非 admin：重定向到 /home
 * - 认证引导未结束（status !== 'ready'）：显示 loading 占位
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const { isAdmin, status, isAuthenticated } = useRequireAuth();
  const router = useRouter();
  const isReady = status === 'ready';

  useEffect(() => {
    if (isReady && isAuthenticated && !isAdmin) {
      router.replace('/home');
    }
  }, [isReady, isAuthenticated, isAdmin, router]);

  // 引导未结束或未认证时显示 loading，useRequireAuth 会处理重定向
  if (!isReady || !isAuthenticated || !isAdmin) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-[#f8faff]">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-[#d7e2f3] border-t-[#3c6df3]" />
          <p className="mt-4 text-sm text-slate-500">加载中...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
