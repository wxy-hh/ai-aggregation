import '@testing-library/jest-dom/vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 守卫决策点的回归锁：`useRequireAuth` 只能在「引导已有结论（status 为 ready）且确实未登录」时跳转。
 * 这一条就是首次进站被甩到登录页的现场——引导进行中（匿名认证在途）绝不能当成未登录。
 */

const pushMock = vi.fn();
const replaceMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}));

const refreshMock = vi.fn();
const anonymousMock = vi.fn();
vi.mock('@/lib/api/auth', () => ({
  authApi: {
    refresh: (...args: unknown[]) => refreshMock(...args),
    anonymous: (...args: unknown[]) => anonymousMock(...args),
    getMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
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
    anonymousMock.mockReset();
    // refresh 拿不到 token + 匿名认证永不返回：把引导钉死在「进行中」
    refreshMock.mockResolvedValue({ accessToken: null });
    anonymousMock.mockReturnValue(new Promise(() => {}));
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
      user: { id: 'u1', username: 'anon', isAnonymous: true } as never,
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

  it('已持久化真实用户：replace /home 且返回跳转中（登录页据此不渲染表单）', async () => {
    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: true,
      user: { id: 'u2', username: 'real_user', isAnonymous: false } as never,
      accessToken: 'token',
    });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/home'));
    expect(result.current).toBe(true);
  });

  it('匿名用户允许停留在登录页：不跳转、直接渲染表单', async () => {
    useAuthStore.setState({
      status: 'ready',
      isAuthenticated: true,
      user: { id: 'u3', username: 'anon_user', isAnonymous: true } as never,
      accessToken: 'token',
    });

    const { result } = renderHook(() => useRedirectRealUserToHome());
    await act(async () => {});

    expect(replaceMock).not.toHaveBeenCalled();
    expect(result.current).toBe(false);
  });
});
