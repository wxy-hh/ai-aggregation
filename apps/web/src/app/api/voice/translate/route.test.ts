import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BillingError } from '@/lib/billing/billing-errors';

// 模拟测试依赖
const mocks = vi.hoisted(() => ({
  xunfeiChat: vi.fn(),
  reserve: vi.fn(),
  finalize: vi.fn(),
  currentRole: 'user',
}));

vi.mock('@repo/providers', () => ({ xunfeiChat: mocks.xunfeiChat }));
vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (
      request: Request,
      handler: (user: { id: string; role: string }, request: Request) => unknown
    ) =>
      handler({ id: 'user_voice_1', role: mocks.currentRole }, request)
  ),
}));

vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: mocks.reserve },
}));

import { POST } from './route';

function fakeSession() {
  return {
    outputLimit: 4096,
    hasReservation: true,
    inputUnits: 15,
    finalize: mocks.finalize,
  };
}

describe('POST /api/voice/translate 路由测试', () => {
  beforeEach(() => {
    mocks.currentRole = 'user';
    mocks.xunfeiChat.mockReset();
    mocks.reserve.mockReset();
    mocks.finalize.mockReset();
    mocks.reserve.mockResolvedValue(fakeSession());
    mocks.finalize.mockResolvedValue(undefined);
    mocks.xunfeiChat.mockResolvedValue({
      content: 'Hello world',
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
    });
  });

  it('正常翻译：通过管道扣除配额并返回翻译结果', async () => {
    const response = await POST(
      new Request('http://localhost/api/voice/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'idempotency-key': 'voice-req-1' },
        body: JSON.stringify({ text: '你好世界', sourceLanguage: 'Chinese', targetLanguage: 'English' }),
      }) as never
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.translatedText).toBe('Hello world');
    expect(mocks.reserve).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'voice', requestId: 'voice-req-1' }),
      'user'
    );
    expect(mocks.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        action: 'voice-translate',
        endpoint: '/api/voice/translate',
        feature: 'voice',
        outputText: 'Hello world',
      })
    );
  });

  it('额度不足：预留失败返回 402', async () => {
    mocks.reserve.mockRejectedValue(
      new BillingError('QUOTA_INSUFFICIENT', '配额不足', { requestId: 'voice-req-2' })
    );

    const response = await POST(
      new Request('http://localhost/api/voice/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '你好世界' }),
      }) as never
    );

    expect(response.status).toBe(402);
    expect(mocks.xunfeiChat).not.toHaveBeenCalled();
    expect(mocks.finalize).not.toHaveBeenCalled();
  });

  it('上游模型调用失败：管道捕获并声明 failed 终态释放额度', async () => {
    mocks.xunfeiChat.mockRejectedValue(new Error('讯飞接口网络超时'));

    const response = await POST(
      new Request('http://localhost/api/voice/translate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: '你好世界' }),
      }) as never
    );

    expect(response.status).toBe(500);
    expect(mocks.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({
        action: 'voice-translate',
        reason: '讯飞接口网络超时',
      })
    );
  });
});
