import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTH_BOOTSTRAP_TIMEOUT_MS, createAuthStore, type AuthStatus } from './auth-store';

/**
 * auth-store 的认证引导（bootstrap）契约：
 *
 * `status` 是「认证是否已有结论」的唯一真相来源，只有引导生命周期本身能改写它
 * （rehydrate 命中已持久化登录态、或 initialize 收尾）。只要它在引导结束前被当成「未登录」，
 * useRequireAuth 就会立刻 router.push('/login')，用户首次进站被留在登录页
 * （重定向甚至晚于匿名认证成功）。
 */

const refreshMock = vi.fn();
const anonymousMock = vi.fn();
const getMeMock = vi.fn();
const loginMock = vi.fn();
const registerMock = vi.fn();

vi.mock('@/lib/api/auth', () => ({
  authApi: {
    refresh: (...args: unknown[]) => refreshMock(...args),
    anonymous: (...args: unknown[]) => anonymousMock(...args),
    getMe: (...args: unknown[]) => getMeMock(...args),
    login: (...args: unknown[]) => loginMock(...args),
    register: (...args: unknown[]) => registerMock(...args),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const ANONYMOUS_USER = {
  id: 'u1',
  username: 'anon_test',
  email: null,
  name: null,
  avatar: null,
  role: 'user' as const,
  status: 'active' as const,
  tokens: 20000,
  isAnonymous: true,
};

const REAL_USER = { ...ANONYMOUS_USER, id: 'u2', username: 'real_user', isAnonymous: false };

/** 可手动放行的匿名凭证 Promise，用来把「认证进行中」这一刻钉在测试里 */
function createDeferredCredential() {
  let release!: (value: string) => void;
  const promise = new Promise<string>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

const noopStrategy = {
  getCredential: () => Promise.resolve('a'.repeat(64)),
  clearCredential: () => {},
};

/** 守卫的重定向判据（与 useRequireAuth 中一致） */
function guardWouldRedirect(status: AuthStatus, isAuthenticated: boolean) {
  return status === 'ready' && !isAuthenticated;
}

function seedPersistedSession() {
  localStorage.setItem(
    'ai-app-auth',
    JSON.stringify({
      state: { accessToken: 'persisted-token', user: ANONYMOUS_USER, isAuthenticated: true },
      version: 0,
    })
  );
}

describe('auth-store 引导状态契约（首次进站不得被甩到登录页）', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const mock of [refreshMock, anonymousMock, getMeMock, loginMock, registerMock]) {
      mock.mockReset();
    }
  });

  it('未登录 rehydrate 后仍是 bootstrapping：不能把「还没结论」当成「未登录」', () => {
    const store = createAuthStore({ anonymousStrategy: noopStrategy });

    // 回归点：修复前 rehydrate 无条件把就绪标志置为 false（等价于今天 status 直接变 ready），
    // 守卫据此判定「未登录」→ push('/login')，而匿名认证还没开始
    expect(store.getState().status).toBe('bootstrapping');
    expect(store.getState().isAuthenticated).toBe(false);
    expect(guardWouldRedirect(store.getState().status, store.getState().isAuthenticated)).toBe(false);
  });

  it('匿名认证在途时保持 bootstrapping，收尾后迁移到 ready', async () => {
    refreshMock.mockResolvedValue({ accessToken: null });
    const credential = createDeferredCredential();
    const store = createAuthStore({
      anonymousStrategy: { ...noopStrategy, getCredential: () => credential.promise },
    });
    anonymousMock.mockResolvedValue({
      success: true,
      data: { user: ANONYMOUS_USER, accessToken: 'token-1' },
    });

    const pending = store.getState().initialize();
    await Promise.resolve();
    await Promise.resolve();

    // 匿名登录尚未返回：必须还没结论，守卫不能跳转
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().status).toBe('bootstrapping');
    expect(guardWouldRedirect(store.getState().status, store.getState().isAuthenticated)).toBe(false);

    credential.release('b'.repeat(64));
    await pending;

    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().status).toBe('ready');
  });

  it('匿名认证失败时迁移到 ready 且未认证：守卫可正常跳登录页，不会永远转圈', async () => {
    refreshMock.mockResolvedValue({ accessToken: null });
    anonymousMock.mockRejectedValue(new Error('设备注册过于频繁'));

    const store = createAuthStore({ anonymousStrategy: noopStrategy });
    await store.getState().initialize();

    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().status).toBe('ready');
    expect(guardWouldRedirect(store.getState().status, store.getState().isAuthenticated)).toBe(true);
  });

  it(`接口挂起时不永久停在加载态：超过 ${AUTH_BOOTSTRAP_TIMEOUT_MS}ms 强制放行`, async () => {
    vi.useFakeTimers();
    try {
      // refresh 永不返回（接口层无超时，弱网/代理挂起就是这个形态）
      refreshMock.mockReturnValue(new Promise(() => {}));

      const store = createAuthStore({ anonymousStrategy: noopStrategy });
      const pending = store.getState().initialize();
      await vi.advanceTimersByTimeAsync(1000);
      expect(store.getState().status).toBe('bootstrapping');

      await vi.advanceTimersByTimeAsync(AUTH_BOOTSTRAP_TIMEOUT_MS);
      await pending;

      expect(store.getState().status).toBe('ready');
      expect(guardWouldRedirect(store.getState().status, store.getState().isAuthenticated)).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('已持久化登录态时 rehydrate 即 ready（不回归成每次都要等引导）', () => {
    seedPersistedSession();

    const store = createAuthStore({ anonymousStrategy: noopStrategy });

    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().status).toBe('ready');
  });

  it('状态单向迁移：initialize 不会把已就绪的界面打回 bootstrapping', async () => {
    seedPersistedSession();
    refreshMock.mockResolvedValue({ accessToken: 'fresh-token' });
    getMeMock.mockResolvedValue({ success: true, data: { user: ANONYMOUS_USER } });

    const store = createAuthStore({ anonymousStrategy: noopStrategy });
    expect(store.getState().status).toBe('ready');

    const pending = store.getState().initialize();
    // 同步检查：initialize 一开始就重置状态的话，这里会看到界面被打回加载态
    expect(store.getState().status).toBe('ready');

    await pending;
    expect(store.getState().status).toBe('ready');
  });

  it('登录动作不改写引导状态：后续接 OAuth 之类的登录路径无从污染它', async () => {
    refreshMock.mockResolvedValue({ accessToken: null });
    anonymousMock.mockResolvedValue({
      success: true,
      data: { user: ANONYMOUS_USER, accessToken: 'token-1' },
    });

    const store = createAuthStore({ anonymousStrategy: noopStrategy });
    await store.getState().initialize();
    expect(store.getState().status).toBe('ready');

    loginMock.mockResolvedValue({ success: true, data: { user: REAL_USER, accessToken: 'token-2' } });
    await store.getState().login('real_user', 'password');

    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().status).toBe('ready');
  });
});
