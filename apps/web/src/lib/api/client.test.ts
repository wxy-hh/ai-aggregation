import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFetch, rawAuthFetch } from './client';

/**
 * 模拟 auth-store，避免单元测试加载真实的 Zustand 持久化逻辑和指纹库。
 * 同时暴露内部状态操控函数，便于测试不同 token / 刷新结果。
 */
vi.mock('@/stores/auth-store', () => {
  const state: {
    accessToken: string;
    logout: ReturnType<typeof vi.fn>;
    refreshAccessToken: () => Promise<string | null>;
  } = {
    accessToken: 'test-token',
    logout: vi.fn(),
    refreshAccessToken: vi.fn(async () => 'new-token'),
  };

  return {
    useAuthStore: {
      getState: () => state,
      _setAccessToken: (token: string) => {
        state.accessToken = token;
      },
      _setRefreshAccessToken: (fn: () => Promise<string | null>) => {
        state.refreshAccessToken = fn;
      },
      _getLogout: () => state.logout,
    },
  };
});

const mockedStore = await import('@/stores/auth-store');

function setAccessToken(token: string) {
  (mockedStore.useAuthStore as unknown as { _setAccessToken: (token: string) => void })._setAccessToken(token);
}

function setRefreshAccessToken(fn: () => Promise<string | null>) {
  (mockedStore.useAuthStore as unknown as { _setRefreshAccessToken: (fn: () => Promise<string | null>) => void })._setRefreshAccessToken(fn);
}

function getLogout() {
  return (mockedStore.useAuthStore as unknown as { _getLogout: () => ReturnType<typeof vi.fn> })._getLogout();
}

/**
 * 依次返回预设 Response 的全局 fetch mock。
 */
function mockFetch(...responses: Response[]) {
  let index = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(responses[index++]))
  );
}

beforeEach(() => {
  setAccessToken('test-token');
  setRefreshAccessToken(async () => 'new-token');
  getLogout().mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rawAuthFetch', () => {
  it('附加 Authorization 头和默认 Content-Type 发送请求', async () => {
    mockFetch(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const res = await rawAuthFetch('/api/test');

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith('/api/test', expect.objectContaining({ headers: expect.any(Headers) }));

    const callHeaders = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].headers as Headers;
    expect(callHeaders.get('Authorization')).toBe('Bearer test-token');
    expect(callHeaders.get('Content-Type')).toBe('application/json');
  });

  it('遇到 402 + QUOTA_EXHAUSTED 时不触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_EXHAUSTED' }), { status: 402 }));

    await rawAuthFetch('/api/test');

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('401 时自动刷新 token 并用新 token 重试', async () => {
    mockFetch(
      new Response(null, { status: 401 }),
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await rawAuthFetch('/api/test');

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);

    const retryHeaders = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer new-token');
  });

  it('401 刷新失败时调用 logout 并返回原响应', async () => {
    setRefreshAccessToken(async () => null);
    mockFetch(new Response(null, { status: 401 }));

    const res = await rawAuthFetch('/api/test');

    expect(res.status).toBe(401);
    expect(getLogout()).toHaveBeenCalledTimes(1);
  });
});

describe('authFetch', () => {
  it('遇到 402 + QUOTA_EXHAUSTED 时触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_EXHAUSTED' }), { status: 402 }));

    await authFetch('/api/test');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as Event;
    expect(event.type).toBe('quota-exhausted');
    expect(event).toBeInstanceOf(CustomEvent);
  });

  it('遇到 402 但 code 不是 QUOTA_EXHAUSTED 时不触发事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'OTHER_ERROR' }), { status: 402 }));

    await authFetch('/api/test');

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('遇到 429 + QUOTA_EXHAUSTED 时也触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_EXHAUSTED' }), { status: 429 }));

    await authFetch('/api/test');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });
});
