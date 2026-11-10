'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useShallow } from 'zustand/shallow';

/** 获取认证状态和操作 */
export function useAuth() {
  const { user, isAuthenticated, status, accessToken } = useAuthStore(
    useShallow((s) => ({
      user: s.user,
      isAuthenticated: s.isAuthenticated,
      status: s.status,
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
    /** 认证引导状态：'bootstrapping' 表示还没有结论（不能当成未登录），'ready' 表示 isAuthenticated 可信 */
    status,
    accessToken,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    refreshAccessToken,
  };
}

/** 要求用户已登录，否则重定向到 /login 并携带来源路径 */
export function useRequireAuth() {
  const auth = useAuth();
  const { isAuthenticated, status } = auth;
  const router = useRouter();

  useEffect(() => {
    if (status === 'ready' && !isAuthenticated) {
      const currentPath = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '';
      const redirectUrl = currentPath && currentPath !== '/' && currentPath !== '/home'
        ? `/login?redirect=${encodeURIComponent(currentPath)}`
        : '/login';
      router.push(redirectUrl);
    }
  }, [status, isAuthenticated, router]);

  return auth;
}

/** 仅获取 accessToken，用于 API 调用 */
export function useAccessToken() {
  return useAuthStore((s) => s.accessToken);
}

/**
 * 「未登录专属页」（/login、/register 等）的真实用户重定向规则。
 *
 * @returns 是否正在跳转——调用方据此先渲染占位，避免表单闪一下又被跳走
 */
export function useRedirectRealUserToHome() {
  const status = useAuthStore((s) => s.status);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const router = useRouter();

  // 检查是否是被中间件拦截回登录页（如 ?redirect=...）或显式登出（?logout=...）
  // 这两种情况下服务端均已确认当前请求无有效 Cookie 凭证；客户端若存在残留登录态，必须熔断自愈，严禁跳往 /home 导致死循环
  const isServerUnauthenticated = typeof window !== 'undefined' && (() => {
    try {
      const searchParams = new URLSearchParams(window.location.search);
      return searchParams.has('redirect') || searchParams.has('logout');
    } catch {
      return false;
    }
  })();

  useEffect(() => {
    if (isServerUnauthenticated) {
      if (isAuthenticated) {
        // 服务端明确判定未登录，强制同步重置客户端脏状态并清理存储
        useAuthStore.setState({
          user: null,
          accessToken: null,
          isAuthenticated: false,
          status: 'ready',
        });
        try {
          localStorage.removeItem('ai-app-auth');
        } catch {
          // 忽略存储清理异常
        }
      }
      return;
    }

    if (status === 'ready' && isAuthenticated) {
      router.replace('/home');
    }
  }, [status, isAuthenticated, isServerUnauthenticated, router]);

  if (isServerUnauthenticated) {
    return false;
  }

  return status === 'ready' && isAuthenticated;
}
