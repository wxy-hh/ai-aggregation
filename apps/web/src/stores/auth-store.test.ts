import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAuthStore, type AuthStatus } from './auth-store';

const refreshMock = vi.fn();
const getMeMock = vi.fn();
const loginMock = vi.fn();
const registerMock = vi.fn();
const logoutMock = vi.fn();

vi.mock('@/lib/api/auth', () => ({
  authApi: {
    refresh: (...args: unknown[]) => refreshMock(...args),
    getMe: (...args: unknown[]) => getMeMock(...args),
    login: (...args: unknown[]) => loginMock(...args),
    register: (...args: unknown[]) => registerMock(...args),
    logout: (...args: unknown[]) => logoutMock(...args),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

const TEST_USER = {
  id: 'u1',
  username: 'test_user',
  email: 'test@example.com',
  name: '测试用户',
  avatar: null,
  role: 'user' as const,
  status: 'active' as const,
  tokens: 20000,
  emailVerified: null,
};

/** 守卫的重定向判据（与 useRequireAuth 中一致） */
function guardWouldRedirect(status: AuthStatus, isAuthenticated: boolean) {
  return status === 'ready' && !isAuthenticated;
}

/** 持久化结构测试夹具 */
function seedPersistedSession(user = TEST_USER) {
  localStorage.setItem(
    'ai-app-auth',
    JSON.stringify({
      state: { user, isAuthenticated: true },
      version: 1,
    })
  );
}

describe('auth-store 引导状态契约与下线匿名后的未登录拦截', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const mock of [refreshMock, getMeMock, loginMock, registerMock, logoutMock]) {
      mock.mockReset();
    }
  });

  it('未登录初始化前是 bootstrapping，避免闪烁', () => {
    const store = createAuthStore();
    expect(store.getState().status).toBe('bootstrapping');
    expect(store.getState().isAuthenticated).toBe(false);
  });

  it('无有效会话凭据时，initialize 直接置为 ready 且未登录，触发守卫拦截', async () => {
    refreshMock.mockResolvedValue({ accessToken: null });

    const store = createAuthStore();
    await store.getState().initialize();

    expect(store.getState().status).toBe('ready');
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().user).toBeNull();
    expect(guardWouldRedirect(store.getState().status, store.getState().isAuthenticated)).toBe(true);
  });

  it('有有效会话凭据时，静默换票成功并拉取用户信息，标记已认证', async () => {
    refreshMock.mockResolvedValue({ accessToken: 'valid-token' });
    getMeMock.mockResolvedValue({ success: true, data: { user: TEST_USER } });

    const store = createAuthStore();
    await store.getState().initialize();

    expect(store.getState().status).toBe('ready');
    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().user?.username).toBe('test_user');
    expect(store.getState().accessToken).toBe('valid-token');
    expect(guardWouldRedirect(store.getState().status, store.getState().isAuthenticated)).toBe(false);
  });

  it('已持久化登录态时 rehydrate 即 ready', () => {
    seedPersistedSession();
    const store = createAuthStore();

    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().status).toBe('ready');
  });

  it('登录动作不改写引导状态，仅更新用户和 accessToken', async () => {
    refreshMock.mockResolvedValue({ accessToken: null });
    const store = createAuthStore();
    await store.getState().initialize();
    expect(store.getState().status).toBe('ready');

    loginMock.mockResolvedValue({ success: true, data: { user: TEST_USER, accessToken: 'token-after-login' } });
    await store.getState().login('test_user', 'password123');

    expect(store.getState().isAuthenticated).toBe(true);
    expect(store.getState().user?.username).toBe('test_user');
    expect(store.getState().accessToken).toBe('token-after-login');
  });
});

describe('accessToken 内存化契约', () => {
  beforeEach(() => {
    localStorage.clear();
    for (const mock of [refreshMock, getMeMock, loginMock, registerMock, logoutMock]) {
      mock.mockReset();
    }
  });

  it('登录只把用户快照写进 localStorage，accessToken 不落盘', async () => {
    loginMock.mockResolvedValue({ success: true, data: { user: TEST_USER, accessToken: 'secret-token' } });

    const store = createAuthStore();
    await store.getState().login('test_user', 'password123');

    expect(store.getState().accessToken).toBe('secret-token');

    const raw = localStorage.getItem('ai-app-auth');
    expect(raw).not.toContain('secret-token');
    const persisted = JSON.parse(raw ?? '{}');
    expect(persisted.state?.user?.username).toBe('test_user');
    expect(persisted.state?.accessToken).toBeUndefined();
  });

  it('logout 同步清空内存状态与 localStorage，阻断持久化脏数据写回', async () => {
    seedPersistedSession();
    logoutMock.mockResolvedValue({ success: true });

    // mock window.location.href
    delete (window as unknown as { location?: unknown }).location;
    window.location = { href: '' } as unknown as string & Location;

    const store = createAuthStore();
    expect(store.getState().isAuthenticated).toBe(true);
    expect(localStorage.getItem('ai-app-auth')).not.toBeNull();

    await store.getState().logout();

    // 验证内存状态第一时间同步置为未登录
    expect(store.getState().isAuthenticated).toBe(false);
    expect(store.getState().user).toBeNull();
    expect(store.getState().accessToken).toBeNull();
    expect(store.getState().status).toBe('ready');

    // 验证 localStorage 被物理清除
    expect(localStorage.getItem('ai-app-auth')).toBeNull();
    expect(window.location.href).toBe('/login?logout=1');
  });

  it('initialize 刷新失败时彻底置为未登录状态', async () => {
    seedPersistedSession();
    refreshMock.mockResolvedValue({ accessToken: null });

    const store = createAuthStore();
    expect(store.getState().isAuthenticated).toBe(true);

    await store.getState().initialize();

    expect(store.getState().isAuthenticated).toBe(false);
    const persisted = JSON.parse(localStorage.getItem('ai-app-auth') ?? '{}');
    expect(persisted.state?.isAuthenticated).toBe(false);
  });
});
