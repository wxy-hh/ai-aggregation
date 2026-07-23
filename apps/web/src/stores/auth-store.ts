'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi } from '@/lib/api/auth';
import {
  type AnonymousAuthStrategy,
  fingerprintAnonymousStrategy,
} from '@/lib/auth/anonymous-strategy';

interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  tokens?: number;
  isAnonymous?: boolean;
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
  anonymousSignIn: () => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export interface AuthStoreOptions {
  /** 匿名认证策略，控制设备标识的获取与清除 */
  anonymousStrategy: AnonymousAuthStrategy;
}

// 防止并发初始化调用导致的竞争条件
let initializePromise: Promise<void> | null = null;

/** 创建 auth store，允许注入匿名认证策略以便测试或替换实现 */
export function createAuthStore(options: AuthStoreOptions) {
  return create<AuthState>()(
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

        anonymousSignIn: async () => {
          const credential = await options.anonymousStrategy.getCredential();
          const res = await authApi.anonymous(credential);

          if (!res.success || !res.data?.user || !res.data?.accessToken) {
            throw new Error(res.error || '匿名登录失败');
          }

          set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true, isLoading: false });
        },

        logout: async () => {
          // 清除持久化的登录数据，防止公共电脑上的残留
          try {
            localStorage.removeItem('ai-app-auth');
          } catch {
            // 忽略清除失败
          }

          // 如果是匿名用户，同时清除设备标识，确保下次访问时重新生成匿名身份
          const { user } = get();
          if (user?.isAnonymous) {
            options.anonymousStrategy.clearCredential();
          }

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
            if (res.success && res.data?.user) {
              set({ user: res.data.user, isAuthenticated: true, isLoading: false });
              return;
            }

            // getMe 返回失败，尝试刷新 token 后重试一次
            const newToken = await refreshAccessToken();
            if (!newToken) {
              set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
              return;
            }
            const retryRes = await authApi.getMe(newToken);
            if (retryRes.success && retryRes.data?.user) {
              set({ user: retryRes.data.user, isAuthenticated: true, isLoading: false });
              return;
            }
            set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
          } catch (error) {
            // 账号被禁用时立即登出，不做重试
            if (
              error instanceof Error &&
              (error.message.includes('停用') || error.message.includes('FORBIDDEN'))
            ) {
              set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
              return;
            }
            // 网络错误等非预期异常，尝试刷新 token 后重试
            try {
              const newToken = await refreshAccessToken();
              if (newToken) {
                const retryRes = await authApi.getMe(newToken);
                if (retryRes.success && retryRes.data?.user) {
                  set({ user: retryRes.data.user, isAuthenticated: true, isLoading: false });
                  return;
                }
              }
            } catch {
              // 刷新也失败，保持当前状态，不清除
            }
            // 网络错误不强制登出，保持现有登录状态
            set({ isLoading: false });
          }
        },

        initialize: async () => {
          // 防止并发调用（React StrictMode 会导致 useEffect 执行两次）
          if (initializePromise) return initializePromise;

          initializePromise = (async () => {
            set({ isLoading: true });

            const { refreshAccessToken, fetchUser, anonymousSignIn } = get();

            // 优先通过 refresh token 获取新 token（兼容已登录真实用户）
            const newToken = await refreshAccessToken();

            if (newToken) {
              await fetchUser();
            } else {
              // refresh token 不可用，尝试匿名设备认证
              try {
                await anonymousSignIn();
              } catch (anonymousError) {
                console.warn('[auth-store] 匿名认证失败:', anonymousError);
                // 匿名认证失败，清除状态
                set({ user: null, accessToken: null, isAuthenticated: false, isLoading: false });
              }
            }
          })();

          try {
            await initializePromise;
          } finally {
            initializePromise = null;
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
}

/** 默认 auth store：使用浏览器指纹作为匿名认证策略 */
export const useAuthStore = createAuthStore({ anonymousStrategy: fingerprintAnonymousStrategy });
