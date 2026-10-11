/**
 * 前端行为埋点 trackEvent 单元测试（ADR-0013 / P0a 工单 03）
 *
 * 验证目标：
 * - 正常上报：通过 fetchWithAuth 向 /api/events 发送 POST 请求，正确传递 event 与 props
 * - fire-and-forget：同步返回 void，调用方无需 await，不阻塞交互
 * - 异常静默：HTTP 错误（如 401、400、500）或网络抛错时静默捕获，不向外抛出异常
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { trackEvent } from './tracker';

const mocks = vi.hoisted(() => ({
  fetchWithAuth: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: mocks.fetchWithAuth,
}));

describe('trackEvent 前端埋点封装', () => {
  beforeEach(() => {
    mocks.fetchWithAuth.mockReset();
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });

  it('正常上报：使用 fetchWithAuth 发送 POST /api/events 并正确序列化请求体', async () => {
    mocks.fetchWithAuth.mockResolvedValue(new Response(JSON.stringify({ success: true })));

    trackEvent('agent_intent_chip.click', { signal: 'url' });

    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(1);
    expect(mocks.fetchWithAuth).toHaveBeenCalledWith('/api/events', {
      method: 'POST',
      body: JSON.stringify({
        event: 'agent_intent_chip.click',
        props: { signal: 'url' },
      }),
    });
  });

  it('fire-and-forget：函数返回值为 void，即便底层 Promise 未完成也不阻塞', () => {
    // 模拟一个挂起/耗时的请求
    mocks.fetchWithAuth.mockReturnValue(new Promise(() => {}));

    const result = trackEvent('agent_intent_chip.impression', {
      signal: 'keyword',
      keyword: '搜索',
    });

    expect(result).toBeUndefined();
    expect(mocks.fetchWithAuth).toHaveBeenCalledTimes(1);
  });

  it('异常静默：网络异常抛错时不向外抛出，保证交互不中断', async () => {
    mocks.fetchWithAuth.mockRejectedValue(new Error('Network error'));

    expect(() => {
      trackEvent('agent_intent_chip.dismiss', { signal: 'keyword' });
    }).not.toThrow();

    // 等待微任务队列排空，确认没有未捕获的 Promise rejection
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  it('异常静默：服务端返回 400/401/500 非 2xx 响应时静默处理', async () => {
    mocks.fetchWithAuth.mockResolvedValue(
      new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401 })
    );

    expect(() => {
      trackEvent('agent_intent_chip.click', { signal: 'url' });
    }).not.toThrow();

    await new Promise((resolve) => setTimeout(resolve, 10));
  });
});
