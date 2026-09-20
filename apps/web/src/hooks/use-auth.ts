'use client';

import { useEffect, useCallback } from 'react';
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

/** 要求用户已登录，否则重定向到 /login */
export function useRequireAuth() {
  const auth = useAuth();
  const { isAuthenticated, status } = auth;
  const router = useRouter();

  useEffect(() => {
    // 只有引导已有结论（ready）且确实未登录时才跳转：
    // 引导进行中（匿名认证可能在途）绝不能当成未登录，否则首次进站会被甩到登录页
    if (status === 'ready' && !isAuthenticated) {
      router.push('/login');
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
 * 判定只依赖引导状态与身份，不读 zustand persist 的内部生命周期（hasHydrated / onFinishHydration）：
 * 已持久化的登录态在 rehydrate 时就会把 status 置为 'ready'，所以这里无需触发匿名引导，
 * 登录页也不会因此多创建一个匿名账号。
 *
 * 注意：判定要求 `status === 'ready'`，因此它只在「引导已得出过结论」的入口生效。
 * 目前在 /login 上，唯一会得出该结论的来源是 rehydrate 命中的已持久化登录态；
 * 若将来接入 OAuth 回跳 /login 之类的新路径，需要让该路径也触发一次引导（或让 store 显式迁移 status），
 * 否则这条客户端兜底不会生效（正式登录流程由登录表单自身的 router.push 负责跳转）。
 *
 * @returns 是否正在跳转——调用方据此先渲染占位，避免表单闪一下又被跳走
 */
export function useRedirectRealUserToHome() {
  const status = useAuthStore((s) => s.status);
  // 匿名用户允许停留在登录页，以便输入账号密码切换为真实登录
  const isRealUser = useAuthStore((s) => s.isAuthenticated && s.user?.isAnonymous !== true);
  const router = useRouter();

  useEffect(() => {
    if (status === 'ready' && isRealUser) {
      router.replace('/home');
    }
  }, [status, isRealUser, router]);

  return status === 'ready' && isRealUser;
}
