import { beforeEach, describe, expect, it, vi } from 'vitest';

const { xunfeiChat, getOptionalUserId, normalizeUsage, safeRecordAiUsage } = vi.hoisted(() => ({
  xunfeiChat: vi.fn(),
  getOptionalUserId: vi.fn(),
  normalizeUsage: vi.fn(),
  safeRecordAiUsage: vi.fn(),
}));

vi.mock('@repo/providers', () => ({
  xunfeiChat,
}));

vi.mock('@/lib/auth/get-optional-user-id', () => ({
  getOptionalUserId,
}));

vi.mock('@/lib/ai-usage', () => ({
  normalizeUsage,
  safeRecordAiUsage,
}));

describe('POST /api/voice/translate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功翻译后记录资源消耗', async () => {
    getOptionalUserId.mockResolvedValue('user-1');
    xunfeiChat.mockResolvedValue({
      content: 'Hello world',
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    });
    normalizeUsage.mockReturnValue({ totalTokens: 30, taskCount: 1 });

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/voice/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '你好世界' }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.translatedText).toBe('Hello world');
    expect(normalizeUsage).toHaveBeenCalled();
    expect(safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        feature: 'voice',
        action: 'voice-translate',
        provider: 'xunfei',
      })
    );
  });

  it('空文本时返回 400 且不记录资源消耗', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/voice/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: '   ' }),
      }) as never
    );

    expect(response.status).toBe(400);
    expect(safeRecordAiUsage).not.toHaveBeenCalled();
  });
});
