'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { authApi, type RegisterPayload } from '@/lib/api/auth';

interface User {
  id: string;
  username: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
  role: string;
  tokens?: number;
  memorySearchEnabled?: boolean;
  emailVerified: string | null;
  createdAt?: string;
}

/**
 * 认证引导（bootstrap）状态。只有两态、且单向迁移：
 * - `bootstrapping`：还没有结论（refresh 可能仍在途），不能当成"未登录"；
 * - `ready`：已经有结论，此时 `isAuthenticated` 才可信。
 */
export type AuthStatus = 'bootstrapping' | 'ready';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
  isAuthenticated: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => Promise<void>;
  refreshAccessToken: () => Promise<string | null>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export interface AuthStoreOptions {
  // 保留可选配置类型以兼容测试注入
}

const AUTH_SESSION_WRITE_LOCK = 'ai-aggregation-auth-refresh';

function supportsSessionWriteLock() {
  return typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
}

async function withSessionWriteLock<T>(callback: () => Promise<T>): Promise<T> {
  if (supportsSessionWriteLock()) {
    return await navigator.locks.request(AUTH_SESSION_WRITE_LOCK, callback);
  }
  return callback();
}

// 防止并发初始化调用导致的竞争条件
let initializePromise: Promise<void> | null = null;

/**
 * 在途的认证引导（没有在途引导时为 null）。
 * 供请求层在 401 时判断「该等引导结论，还是自己刷新」：
 * accessToken 内存化后，引导结束前内存里必然没有 token，首屏请求的 401 就发生在这一刻。
 */
export function getPendingAuthBootstrap(): Promise<void> | null {
  return initializePromise;
}

/** 创建 auth store */
export function createAuthStore(_options?: AuthStoreOptions) {
  // 防止并发刷新：401 请求、引导自身、fetchUser 都可能同时要求刷新，
  // 共享同一枚在途 Promise，收敛成一次请求。
  let refreshInFlight: Promise<string | null> | null = null;
  let hasInitialized = false;

  return create<AuthState>()(
    persist(
      (set, get) => ({
        user: null,
        accessToken: null,
        status: 'bootstrapping',
        isAuthenticated: false,

        login: async (username, password) => {
          const res = await authApi.login(username, password);

          if (!res.success || !res.data?.user || !res.data?.accessToken) {
            throw new Error(res.error || '登录失败');
          }

          // 登录动作不改 status：引导状态只由引导生命周期收尾
          set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true });
        },

        register: async (payload) => {
          const res = await authApi.register(payload);

          if (!res.success || !res.data?.user || !res.data?.accessToken) {
            throw new Error(res.error || '注册失败');
          }

          set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true });
        },

        logout: async () => {
          // 1. 立即同步重置内存中的所有认证状态，阻断任何可能的持久化重新写回
          set({
            user: null,
            accessToken: null,
            isAuthenticated: false,
            status: 'ready',
          });

          // 2. 清除持久化的登录数据，防止公共电脑上的残留
          try {
            localStorage.removeItem('ai-app-auth');
          } catch {
            // 忽略清除失败
          }

          // 3. 登出接口只接受 POST，用请求调用（服务端清 cookie），再由前端跳转登录页。
          try {
            await withSessionWriteLock(() => authApi.logout());
          } catch {
            // 忽略登出接口失败
          }

          // 4. 硬跳转刷新应用上下文
          window.location.href = '/login?logout=1';
        },

        refreshAccessToken: async () => {
          if (!refreshInFlight) {
            refreshInFlight = (async () => {
              try {
                const res = await withSessionWriteLock(() => authApi.refresh());
                if (res.accessToken) {
                  set({ accessToken: res.accessToken });
                  return res.accessToken;
                }
                return null;
              } catch {
                return null;
              }
            })().finally(() => {
              refreshInFlight = null;
            });
          }

          return refreshInFlight;
        },

        fetchUser: async () => {
          const { accessToken, refreshAccessToken } = get();

          if (!accessToken) {
            const newToken = await refreshAccessToken();
            if (!newToken) {
              set({ user: null, accessToken: null, isAuthenticated: false });
              return;
            }
          }

          try {
            const res = await authApi.getMe(get().accessToken!);
            if (res.success && res.data?.user) {
              set({ user: res.data.user, isAuthenticated: true });
              return;
            }

            // getMe 返回失败，尝试刷新 token 后重试一次
            const newToken = await refreshAccessToken();
            if (!newToken) {
              set({ user: null, accessToken: null, isAuthenticated: false });
              return;
            }
            const retryRes = await authApi.getMe(newToken);
            if (retryRes.success && retryRes.data?.user) {
              set({ user: retryRes.data.user, isAuthenticated: true });
              return;
            }
            set({ user: null, accessToken: null, isAuthenticated: false });
          } catch (error) {
            // 账号被禁用时立即登出，不做重试
            if (
              error instanceof Error &&
              (error.message.includes('停用') || error.message.includes('FORBIDDEN'))
            ) {
              set({ user: null, accessToken: null, isAuthenticated: false });
              return;
            }
            // 网络错误等非预期异常，尝试刷新 token 后重试
            try {
              const newToken = await refreshAccessToken();
              if (newToken) {
                const retryRes = await authApi.getMe(newToken);
                if (retryRes.success && retryRes.data?.user) {
                  set({ user: retryRes.data.user, isAuthenticated: true });
                  return;
                }
              }
            } catch {
              // 刷新也失败，保持当前状态，不清除
            }
          }
        },

        initialize: async () => {
          if (hasInitialized) return;
          // 防止并发调用（React StrictMode 会导致 useEffect 执行两次）
          if (initializePromise) {
            await initializePromise;
            hasInitialized = true;
            return;
          }

          initializePromise = (async () => {
            const { refreshAccessToken, fetchUser } = get();

            // 优先通过 refresh token 静默续期获取新 token
            let newToken = await refreshAccessToken();
            if (!newToken && !supportsSessionWriteLock()) {
              newToken = await refreshAccessToken();
            }

            if (newToken) {
              await fetchUser();
            } else {
              // 无有效令牌，置为未登录并清理失效本地持久化数据
              set({ user: null, accessToken: null, isAuthenticated: false });
              try {
                localStorage.removeItem('ai-app-auth');
              } catch {
                // 忽略清除失败
              }
            }
          })()
            .catch((bootstrapError) => {
              console.warn('[auth-store] 认证引导异常:', bootstrapError);
              set({ user: null, accessToken: null, isAuthenticated: false });
              try {
                localStorage.removeItem('ai-app-auth');
              } catch {
                // 忽略清除失败
              }
            })
            .finally(() => {
              // 引导收尾：单向迁移到 'ready'
              set({ status: 'ready' });
            });

          try {
            await initializePromise;
          } finally {
            hasInitialized = true;
            initializePromise = null;
          }
        },
      }),
      {
        name: 'ai-app-auth',
        storage: createJSONStorage(() => localStorage),
        version: 1,
        migrate: (persistedState, version) => {
          if (version < 1 && persistedState && typeof persistedState === 'object') {
            const cleaned = { ...(persistedState as Record<string, unknown>) };
            delete cleaned.accessToken;
            return cleaned as { user: User | null; isAuthenticated: boolean };
          }
          return persistedState as { user: User | null; isAuthenticated: boolean };
        },
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    )
  );
}

/** 默认 auth store */
export const useAuthStore = createAuthStore();

// 仅在本地开发或 E2E 自动化测试环境向 window 暴露用于状态校验，生产环境严格禁用
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as { __authStore?: typeof useAuthStore }).__authStore = useAuthStore;
}

