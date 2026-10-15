import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { authFetch, rawAuthFetch } from './client';

/**
 * 模拟 auth-store，避免单元测试加载真实的 Zustand 持久化逻辑和指纹库。
 * 同时暴露内部状态操控函数，便于测试不同 token / 刷新结果。
 */
vi.mock('@/stores/auth-store', () => {
  const state: {
    accessToken: string | null;
    status: 'bootstrapping' | 'ready';
    logout: ReturnType<typeof vi.fn>;
    refreshAccessToken: () => Promise<string | null>;
    initialize: () => Promise<void>;
    pendingBootstrap: Promise<void> | null;
  } = {
    accessToken: 'test-token',
    status: 'ready',
    logout: vi.fn(),
    refreshAccessToken: vi.fn(async () => 'new-token'),
    initialize: vi.fn(async () => {}),
    pendingBootstrap: null,
  };

  return {
    useAuthStore: {
      getState: () => state,
      _setAccessToken: (token: string | null) => {
        state.accessToken = token;
      },
      _setRefreshAccessToken: (fn: () => Promise<string | null>) => {
        state.refreshAccessToken = vi.fn(fn);
      },
      _setStatus: (status: 'bootstrapping' | 'ready') => {
        state.status = status;
      },
      _setInitialize: (fn: () => Promise<void>) => {
        state.initialize = vi.fn(fn);
      },
      _setPendingBootstrap: (promise: Promise<void> | null) => {
        state.pendingBootstrap = promise;
      },
      _getLogout: () => state.logout,
      _getRefreshAccessToken: () => state.refreshAccessToken,
      _getInitialize: () => state.initialize,
    },
    getPendingAuthBootstrap: () => state.pendingBootstrap,
  };
});

const mockedStore = await import('@/stores/auth-store');

function setAccessToken(token: string | null) {
  (mockedStore.useAuthStore as unknown as { _setAccessToken: (token: string | null) => void })._setAccessToken(token);
}

function setRefreshAccessToken(fn: () => Promise<string | null>) {
  (mockedStore.useAuthStore as unknown as { _setRefreshAccessToken: (fn: () => Promise<string | null>) => void })._setRefreshAccessToken(fn);
}

function setStatus(status: 'bootstrapping' | 'ready') {
  (mockedStore.useAuthStore as unknown as { _setStatus: (status: 'bootstrapping' | 'ready') => void })._setStatus(status);
}

function setInitialize(fn: () => Promise<void>) {
  (mockedStore.useAuthStore as unknown as { _setInitialize: (fn: () => Promise<void>) => void })._setInitialize(fn);
}

function setPendingBootstrap(promise: Promise<void> | null) {
  (
    mockedStore.useAuthStore as unknown as { _setPendingBootstrap: (promise: Promise<void> | null) => void }
  )._setPendingBootstrap(promise);
}

function getLogout() {
  return (mockedStore.useAuthStore as unknown as { _getLogout: () => ReturnType<typeof vi.fn> })._getLogout();
}

function getRefreshAccessToken() {
  return (
    mockedStore.useAuthStore as unknown as { _getRefreshAccessToken: () => ReturnType<typeof vi.fn> }
  )._getRefreshAccessToken();
}

function getInitialize() {
  return (mockedStore.useAuthStore as unknown as { _getInitialize: () => ReturnType<typeof vi.fn> })._getInitialize();
}

/** 放行微任务队列：让请求走到「等引导结论」这一步 */
async function flushMicrotasks() {
  for (let i = 0; i < 5; i += 1) {
    await Promise.resolve();
  }
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
  setStatus('ready');
  setPendingBootstrap(null);
  setInitialize(async () => {});
  setRefreshAccessToken(async () => 'new-token');
  getLogout().mockClear();
  getRefreshAccessToken().mockClear();
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

  it('遇到 402 + QUOTA_LIMIT_REACHED 时不触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_LIMIT_REACHED' }), { status: 402 }));

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

  it('引导未结束时的 401：先等引导结论，用引导换回的 token 重试，不抢刷新也不登出', async () => {
    // accessToken 内存化后，引导结束前内存里必然没有 token，首屏请求就是这个形态
    setAccessToken(null);
    setStatus('bootstrapping');
    setInitialize(async () => {
      setAccessToken('boot-token');
      setStatus('ready');
    });
    mockFetch(
      new Response(null, { status: 401 }),
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const res = await rawAuthFetch('/api/test');

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer boot-token');
    // 引导自己会换 token：这里再刷一次会和它抢同一枚 refresh token 的轮换
    expect(getRefreshAccessToken()).not.toHaveBeenCalled();
    expect(getLogout()).not.toHaveBeenCalled();
  });

  it('引导在途（刷新页面后的静默恢复）：请求层等引导结论，不并行刷新也不登出', async () => {
    // rehydrate 命中已持久化登录态时 status 已是 ready，而 token 只能等引导换回
    let releaseBootstrap!: () => void;
    const pendingBootstrap = new Promise<void>((resolve) => {
      releaseBootstrap = resolve;
    });
    setAccessToken(null);
    setStatus('ready');
    setPendingBootstrap(pendingBootstrap);
    mockFetch(
      new Response(null, { status: 401 }),
      new Response(JSON.stringify({ ok: true }), { status: 200 })
    );

    const request = rawAuthFetch('/api/test');
    await flushMicrotasks();

    // 引导还没出结论：既不抢发刷新，也不把用户登出
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(getRefreshAccessToken()).not.toHaveBeenCalled();
    expect(getLogout()).not.toHaveBeenCalled();

    setAccessToken('boot-token');
    releaseBootstrap();
    const res = await request;

    expect(res.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[1][1].headers as Headers;
    expect(retryHeaders.get('Authorization')).toBe('Bearer boot-token');
  });

  it('引导结束后仍拿不到新 token：回落到刷新路径，刷新失败才登出', async () => {
    setStatus('bootstrapping');
    setInitialize(async () => {
      // 引导没能换回新 token（例如匿名会话），token 仍是本次请求带出去的那个
      setStatus('ready');
    });
    setRefreshAccessToken(async () => null);
    mockFetch(new Response(null, { status: 401 }));

    const res = await rawAuthFetch('/api/test');

    expect(res.status).toBe(401);
    expect(getLogout()).toHaveBeenCalledTimes(1);
  });
});

describe('authFetch', () => {
  it('遇到 402 + QUOTA_LIMIT_REACHED 时触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_LIMIT_REACHED' }), { status: 402 }));

    await authFetch('/api/test');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
    const event = dispatchSpy.mock.calls[0][0] as Event;
    expect(event.type).toBe('quota-exhausted');
    expect(event).toBeInstanceOf(CustomEvent);
  });

  it('遇到新的 QUOTA_INSUFFICIENT 错误码时也触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_INSUFFICIENT' }), { status: 402 }));

    await authFetch('/api/test');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });

  it('遇到 402 但 code 不是 QUOTA_LIMIT_REACHED 时不触发事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'OTHER_ERROR' }), { status: 402 }));

    await authFetch('/api/test');

    expect(dispatchSpy).not.toHaveBeenCalled();
  });

  it('遇到 429 + QUOTA_LIMIT_REACHED 时也触发全局事件', async () => {
    const dispatchSpy = vi.spyOn(window, 'dispatchEvent');
    mockFetch(new Response(JSON.stringify({ code: 'QUOTA_LIMIT_REACHED' }), { status: 429 }));

    await authFetch('/api/test');

    expect(dispatchSpy).toHaveBeenCalledTimes(1);
  });
});
