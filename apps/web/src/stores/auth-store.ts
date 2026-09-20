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

/**
 * 认证引导（bootstrap）状态。只有两态、且单向迁移：
 * - `bootstrapping`：还没有结论（refresh / 匿名认证可能仍在途），**不能当成"未登录"**；
 * - `ready`：已经有结论，此时 `isAuthenticated` 才可信。
 *
 * 该字段是「认证是否已有结论」的唯一真相来源：只有引导生命周期本身可以改写它
 * （rehydrate 命中已持久化登录态、或 initialize 收尾），
 * login / register / anonymousSignIn 等登录动作一律不碰，
 * 避免"某条登录路径把状态改回未就绪"再次引发守卫误判。
 */
export type AuthStatus = 'bootstrapping' | 'ready';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: AuthStatus;
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

/**
 * 认证引导超时（毫秒）：接口层没有超时，弱网或代理挂起时引导会一直悬着，
 * 而 status 不迁移到 'ready' 就等于全站停在加载态。到点先放行渲染，引导继续在后台完成。
 */
export const AUTH_BOOTSTRAP_TIMEOUT_MS = 15_000;

/** 创建 auth store，允许注入匿名认证策略以便测试或替换实现 */
export function createAuthStore(options: AuthStoreOptions) {
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

        register: async (username, password, name) => {
          const res = await authApi.register(username, password, name);

          if (!res.success || !res.data?.user || !res.data?.accessToken) {
            throw new Error(res.error || '注册失败');
          }

          set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true });
        },

        anonymousSignIn: async () => {
          const credential = await options.anonymousStrategy.getCredential();
          const res = await authApi.anonymous(credential);

          if (!res.success || !res.data?.user || !res.data?.accessToken) {
            throw new Error(res.error || '匿名登录失败');
          }

          set({ user: res.data.user, accessToken: res.data.accessToken, isAuthenticated: true });
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
            // 网络错误不强制登出，保持现有登录状态（引导收尾由 initialize 负责）
          }
        },

        initialize: async () => {
          // 防止并发调用（React StrictMode 会导致 useEffect 执行两次）
          if (initializePromise) return initializePromise;

          const bootstrap = (async () => {
            const { refreshAccessToken, fetchUser, anonymousSignIn } = get();

            // 注意：这里不写 status —— 初始值就是 'bootstrapping'，而「已持久化登录态」
            // 已在 rehydrate 时置为 'ready'，重置会白白把已就绪的界面打回加载态。
            // 引导状态只在下面的 finally 里单向迁移到 'ready'。

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
                set({ user: null, accessToken: null, isAuthenticated: false });
              }
            }
          })();

          // 超时兜底：接口层没有超时，弱网/代理挂起时引导会一直悬着，
          // 而 status 不迁移到 'ready' 就意味着全站停在加载态（比"未登录"更糟）。
          // 到点先放行渲染，引导本身继续在后台跑完。
          let timer: ReturnType<typeof setTimeout> | undefined;
          const timeout = new Promise<void>((resolve) => {
            timer = setTimeout(() => {
              console.warn(`[auth-store] 认证引导超过 ${AUTH_BOOTSTRAP_TIMEOUT_MS}ms 未完成，先放行渲染`);
              resolve();
            }, AUTH_BOOTSTRAP_TIMEOUT_MS);
          });

          initializePromise = Promise.race([bootstrap, timeout])
            .catch((bootstrapError) => {
              // 引导自身抛出（例如 refresh 意外 reject）也要收尾，不能把异常留给调用方
              console.warn('[auth-store] 认证引导异常:', bootstrapError);
            })
            .finally(() => {
              if (timer) clearTimeout(timer);
              // 引导收尾（成功/失败/超时）：唯一一处把 status 迁移到 'ready' 的地方
              set({ status: 'ready' });
            });

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
          // 引导状态的两条写入路径之一（另一条是 initialize 的收尾）：
          // 只有「已持久化登录态」才能认定引导已有结论（isAuthenticated 已为 true，首个渲染即可放行）。
          // 未登录（含首次进站）必须留在 'bootstrapping'，等 initialize() 走完匿名认证再迁移；
          // 否则守卫会把「认证进行中」当成「未登录」立刻 router.push('/login')，
          // 用户停在登录页（重定向甚至晚于匿名认证成功）。
          if (state?.isAuthenticated) {
            state.status = 'ready';
          }
        },
      }
    )
  );
}

/** 默认 auth store：使用浏览器指纹作为匿名认证策略 */
export const useAuthStore = createAuthStore({ anonymousStrategy: fingerprintAnonymousStrategy });
