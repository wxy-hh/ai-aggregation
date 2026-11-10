import '@testing-library/jest-dom/vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

const refreshMock = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    refresh: (...args: unknown[]) => refreshMock(...args),
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    forgotPassword: vi.fn(),
    resetPassword: vi.fn(),
  },
}));

import { useAuthStore } from '@/stores/auth-store';
import { useRedirectRealUserToHome, useRequireAuth } from './use-auth';

describe('useRequireAuth 的跳转时机', () => {
  beforeEach(() => {
    pushMock.mockReset();
    refreshMock.mockReset();
    refreshMock.mockReturnValue(new Promise(() => {}));
  });

  it('引导进行中不跳转，迁移到 ready 且未认证后才 push /login', async () => {
    useAuthStore.setState({ status: 'bootstrapping', isAuthenticated: false, user: null, accessToken: null });

    renderHook(() => useRequireAuth());
    await act(async () => {});

    expect(pushMock).not.toHaveBeenCalled();

    act(() => {
      useAuthStore.setState({ status: 'ready' });
    });

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith('/login'));
  });

  it('ready 且已认证时不跳转', async () => {
    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: true,
      user: { id: 'u1', username: 'test_user' } as never,
      accessToken: 'token',
    });

    renderHook(() => useRequireAuth());
    await act(async () => {});

    expect(pushMock).not.toHaveBeenCalled();
  });
});

describe('useRedirectRealUserToHome（未登录专属页的真实用户重定向）', () => {
  beforeEach(() => {
    pushMock.mockReset();
    replaceMock.mockReset();
  });

  it('引导未结束时不判定（既不跳转也不返回跳转中）', async () => {
    useAuthStore.setState({ status: 'bootstrapping', isAuthenticated: false, user: null });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('已登录用户：replace /home 且返回跳转中（登录页据此不渲染表单）', async () => {
    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: true,
      user: { id: 'u2', username: 'real_user' } as never,
      accessToken: 'token',
    });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/home'));
    expect(result.current).toBe(true);
  });

  it('未登录用户允许停留在登录页：不跳转、直接渲染表单', async () => {
    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: false,
      user: null,
      accessToken: null,
    });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });

  it('带有 redirect 参数时（服务端中间件拦截回登录页）：即使客户端存在残留认证态，也不跳转 /home 并自愈清理', async () => {
    delete (window as unknown as { location?: unknown }).location;
    window.location = new URL('http://localhost:3030/login?redirect=%2Fhome') as unknown as Location;
    localStorage.setItem('ai-app-auth', JSON.stringify({ state: { user: { id: 'u2' }, isAuthenticated: true } }));

    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: true,
      user: { id: 'u2', username: 'stale_user' } as never,
      accessToken: null,
    });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    // 严禁发起 replace /home（杜绝死循环）
    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current).toBe(false);

    // 验证自愈清理：客户端状态被重置，localStorage 残留被清除
    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(localStorage.getItem('ai-app-auth')).toBeNull();
    });
  });

  it('带有 logout 参数时：不跳转 /home 并自愈清理残留', async () => {
    delete (window as unknown as { location?: unknown }).location;
    window.location = new URL('http://localhost:3030/login?logout=1') as unknown as Location;
    localStorage.setItem('ai-app-auth', JSON.stringify({ state: { user: { id: 'u2' }, isAuthenticated: true } }));

    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: true,
      user: { id: 'u2', username: 'stale_user' } as never,
      accessToken: null,
    });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current).toBe(false);

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(localStorage.getItem('ai-app-auth')).toBeNull();
    });
  });
});
