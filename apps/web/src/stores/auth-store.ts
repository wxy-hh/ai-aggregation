'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi } from '@/lib/api/auth';

interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  emailVerified: string | null;
  createdAt?: string;
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, name?: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      isLoading: true,
      isAuthenticated: false,

      login: async (username, password) => {
        const res = await authApi.login(username, password);

        if (!res.success || !res.data?.user || !res.data?.accessToken) {
          throw new Error(res.error || '登录失败');
        }

        set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true, isLoading: false });
      },

      register: async (username, password, name) => {
        const res = await authApi.register(username, password, name);

        if (!res.success || !res.data?.user || !res.data?.accessToken) {
          throw new Error(res.error || '注册失败');
        }

        set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true, isLoading: false });
      },

      logout: async () => {
        set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
        // 全页面导航到登出接口，确保服务端清除 httpOnly Cookie
        window.location.href = '/api/auth/logout';
      },

      refreshAccessToken: async () => {
        try {
          const res = await authApi.refresh();
          if (res.accessToken) {
            set({ accessToken: res.accessToken });
            return res.accessToken;
          }
          return null;
        } catch {
          return null;
        }
      },

      fetchUser: async () => {
        const { accessToken, refreshAccessToken } = get();

        if (!accessToken) {
          const newToken = await refreshAccessToken();
          if (!newToken) {
            set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
            return;
          }
        }

        try {
          const res = await authApi.getMe(get().accessToken!);

          if (!res.success || !res.data?.user) {
            // Token 过期，尝试刷新
            const newToken = await refreshAccessToken();
            if (!newToken) {
              set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
              return;
            }
            const retryRes = await authApi.getMe(newToken);
            if (!retryRes.success || !retryRes.data?.user) {
              set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
              return;
            }
            set({ user: retryRes.data.user, isLoading: false });
            return;
          }

          set({ user: res.data.user, isLoading: false });
        } catch {
          set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
        }
      },

      initialize: async () => {
        set({ isLoading: true });

        const { refreshAccessToken, fetchUser } = get();

        // 优先通过 refresh token 获取新 token（避免使用 localStorage 中可能已过期的旧 token）
        const newToken = await refreshAccessToken();

        if (newToken) {
          await fetchUser();
        } else {
          // refresh token 不可用，尝试用 localStorage 中的旧 token
          const { accessToken } = get();
          if (accessToken) {
            await fetchUser();
          } else {
            set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
          }
        }
      },
    }),
    {
      name: 'ai-app-auth',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        accessToken: state.accessToken,
        user: state.user,
        isAuthenticated: state.isAuthenticated,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isLoading = false;
        }
      },
    }
  )
);
