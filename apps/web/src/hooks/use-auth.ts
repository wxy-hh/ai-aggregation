'use client';

import { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useShallow } from 'zustand/shallow';

/** 获取认证状态和操作 */
export function useAuth() {
  const { user, isAuthenticated, isLoading, accessToken } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      isAuthenticated: s.isAuthenticated,
      isLoading: s.isLoading,
      accessToken: s.accessToken,
    }))
  );

  const login = useAuthStore((s) => s.login);
  const register = useAuthStore((s) => s.register);
  const logout = useAuthStore((s) => s.logout);
  const initialize = useAuthStore((s) => s.initialize);
  const refreshAccessToken = useAuthStore((s) => s.refreshAccessToken);

  useEffect(() => {
    initialize();
  }, [initialize]);

  return {
    user,
    isAuthenticated,
    isLoading,
    accessToken,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    refreshAccessToken,
  };
}

/** 要求用户已登录，否则重定向到 /login */
export function useRequireAuth() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  return useAuth();
}

/** 仅获取 accessToken，用于 API 调用 */
export function useAccessToken() {
  return useAuthStore((s) => s.accessToken);
}
