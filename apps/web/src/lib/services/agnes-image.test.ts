/**
 * Agnes 文生图上游调用测试
 *
 * 重点是**取消语义**：用户中止时不得把取消包装成 AgnesUpstreamError。
 * 曾经的问题：abort → fetch 抛 AbortError → 被包成 AgnesUpstreamError(status=0)，
 * 调用方于是报「图片生成失败，请稍后重试」，把「你按了停止」说成功能故障。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AgnesUpstreamError, requestAgnesImage } from './agnes-image';

const fetchMock = vi.fn();

function okResponse(url: string) {
  return new Response(JSON.stringify({ data: [{ url }] }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('requestAgnesImage', () => {
  beforeEach(() => {
    process.env.AGNES_API_KEY = 'sk-test';
    process.env.AGNES_INFERENCE_API_URL = 'https://example.invalid/v1/images/generations';
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('成功 → 返回图片 URL', async () => {
    fetchMock.mockResolvedValue(okResponse('https://cdn.example.com/a.png'));

    const result = await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' });

    expect(result.url).toBe('https://cdn.example.com/a.png');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('兼容 images[0].url 形态', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ images: [{ url: 'https://cdn.example.com/b.png' }] }), {
        status: 200,
      })
    );

    expect((await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' })).url).toBe(
      'https://cdn.example.com/b.png'
    );
  });

  it('已取消的 signal → 抛取消错误，**不是** AgnesUpstreamError', async () => {
    // 这是本文件的回归重点：取消必须与上游失败区分开
    fetchMock.mockRejectedValue(Object.assign(new Error('signal is aborted'), { name: 'AbortError' }));
    const ac = new AbortController();
    ac.abort();

    const error = await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }, ac.signal).catch(
      (e) => e
    );

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AgnesUpstreamError);
    // 取消后不应重试
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('缺少 AGNES_API_KEY → 抛普通配置错误（不是上游错误）', async () => {
    delete process.env.AGNES_API_KEY;

    const error = await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }).catch((e) => e);

    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AgnesUpstreamError);
    expect((error as Error).message).toContain('AGNES_API_KEY');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('4xx（不可重试）→ 不重试，原样抛出上游状态', async () => {
    fetchMock.mockResolvedValue(new Response('bad request', { status: 400 }));

    const error = await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }).catch((e) => e);

    expect(error).toBeInstanceOf(AgnesUpstreamError);
    expect((error as AgnesUpstreamError).status).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('429 → 退避重试 2 次后仍失败 → 抛 AgnesUpstreamError(429)', async () => {
    vi.useFakeTimers();
    // 必须每次构造新的 Response：同一个实例的 body 只能读一次，
    // 否则第二次重试读 body 会抛错，掩盖真实的 429 状态
    fetchMock.mockImplementation(async () => new Response('rate limited', { status: 429 }));

    const pending = requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(3000);
    const error = await pending;

    expect(error).toBeInstanceOf(AgnesUpstreamError);
    expect((error as AgnesUpstreamError).status).toBe(429);
    // 首次 + 2 次重试
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('响应里没有 url → 抛 AgnesUpstreamError(status=0)', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: [{}] }), { status: 200 }));

    const error = await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }).catch((e) => e);

    expect(error).toBeInstanceOf(AgnesUpstreamError);
    expect((error as AgnesUpstreamError).status).toBe(0);
  });

  it('网络错误（fetch 抛异常）→ 退避重试，后续成功则返回 URL', async () => {
    // 上游实测约半数时间以连接中断（undici fetch failed）失败，不重试会把抖动 1:1 传给用户
    vi.useFakeTimers();
    fetchMock
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(okResponse('https://cdn.example.com/retry-ok.png'));

    const pending = requestAgnesImage({ prompt: '一只猫', size: '1024x1024' });
    await vi.advanceTimersByTimeAsync(1000);
    const result = await pending;

    expect(result.url).toBe('https://cdn.example.com/retry-ok.png');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('网络错误连挂 → 抛 AgnesUpstreamError(status=0) 且 cause 链保留原始错误', async () => {
    vi.useFakeTimers();
    const netError = new TypeError('fetch failed');
    fetchMock.mockRejectedValue(netError);

    const pending = requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }).catch((e) => e);
    await vi.advanceTimersByTimeAsync(3000);
    const error = await pending;

    expect(error).toBeInstanceOf(AgnesUpstreamError);
    expect((error as AgnesUpstreamError).status).toBe(0);
    // 首次 + 2 次重试
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 排障依赖：包装后必须能从 cause 链找回原始网络错误
    expect((error as AgnesUpstreamError).cause).toBe(netError);
  });

  it('网络错误 + 用户已取消 → 不重试，抛原始取消错误', async () => {
    // 取消判定优先于重试：signal 已中止时 break 在重试判定之前
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const ac = new AbortController();
    ac.abort();

    const error = await requestAgnesImage({ prompt: '一只猫', size: '1024x1024' }, ac.signal).catch(
      (e) => e
    );

    expect(error).not.toBeInstanceOf(AgnesUpstreamError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
