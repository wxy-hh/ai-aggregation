import { afterEach, describe, expect, it, vi } from 'vitest';
import { authApi } from './auth';

describe('认证 API 请求超时', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('挂起的刷新请求在 8 秒 abort 并返回中文超时错误', async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | null | undefined;
    vi.stubGlobal('fetch', vi.fn((_url: string, options?: RequestInit) => {
      const signal = options?.signal;
      requestSignal = signal;
      return new Promise<Response>((_resolve, reject) => {
        if (signal) signal.addEventListener('abort', () => reject(signal.reason));
      });
    }));

    const outcome = authApi.refresh().then(
      () => ({ kind: 'resolved' }),
      (error: unknown) => ({
        kind: 'rejected',
        message: error instanceof Error ? error.message : String(error),
      })
    );

    await vi.advanceTimersByTimeAsync(7_999);
    expect(await Promise.race([outcome, Promise.resolve({ kind: 'pending' })])).toEqual({ kind: 'pending' });

    await vi.advanceTimersByTimeAsync(1);
    expect(await Promise.race([outcome, Promise.resolve({ kind: 'pending' })])).toEqual({
      kind: 'rejected',
      message: '网络连接超时，请稍后重试',
    });
    expect(requestSignal?.aborted).toBe(true);
  });
});
