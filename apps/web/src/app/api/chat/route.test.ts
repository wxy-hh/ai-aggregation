import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createProvider,
  getDefaultModel,
  createXunfeiStreamResponse,
  getRateLimiter,
  getQuotaManager,
  requireAuth,
  normalizeUsage,
  safeRecordAiUsage,
} = vi.hoisted(() => ({
  createProvider: vi.fn(),
  getDefaultModel: vi.fn(),
  createXunfeiStreamResponse: vi.fn(),
  getRateLimiter: vi.fn(),
  getQuotaManager: vi.fn(),
  requireAuth: vi.fn(),
  normalizeUsage: vi.fn(),
  safeRecordAiUsage: vi.fn(),
}));

vi.mock('@repo/providers', () => ({
  createProvider,
  getDefaultModel,
  createXunfeiStreamResponse,
}));

vi.mock('@repo/shared', () => ({
  getRateLimiter,
  getQuotaManager,
}));

vi.mock('@/lib/auth/require-auth', () => ({
  requireAuth,
}));

vi.mock('@/lib/ai-usage', () => ({
  normalizeUsage,
  safeRecordAiUsage,
}));

describe('POST /api/chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireAuth.mockResolvedValue('user-chat');
    getDefaultModel.mockReturnValue('lite');
    getRateLimiter.mockReturnValue({
      check: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 9,
        reset: Date.now() + 60_000,
      }),
    });
    getQuotaManager.mockReturnValue({
      checkQuota: vi.fn().mockResolvedValue({
        allowed: true,
        remaining: 99,
        quota: 100,
      }),
      incrementQuota: vi.fn().mockResolvedValue(undefined),
    });
    normalizeUsage.mockReturnValue({ totalTokens: 42, taskCount: 1 });
  });

  it('讯飞流式对话完成后写入 usage 记录', async () => {
    createXunfeiStreamResponse.mockImplementation((options: { onUsage?: (usage: unknown) => void }) => {
      options.onUsage?.({ prompt_tokens: 12, completion_tokens: 30, total_tokens: 42 });
      const encoder = new TextEncoder();
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode('你好'));
          controller.close();
        },
      });
    });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
        body: JSON.stringify({
          provider: 'xunfei',
          messages: [{ role: 'user', content: '你好' }],
        }),
      })
    );
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain('"type":"text-delta"');
    expect(text).toContain('"type":"done"');
    expect(safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-chat',
        feature: 'chat',
        action: 'chat-stream',
        provider: 'xunfei',
      })
    );
  });
});
