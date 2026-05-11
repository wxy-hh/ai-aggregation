import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getOptionalUserId, normalizeUsage, safeRecordAiUsage } = vi.hoisted(() => ({
  getOptionalUserId: vi.fn(),
  normalizeUsage: vi.fn(),
  safeRecordAiUsage: vi.fn(),
}));

vi.mock('@/lib/auth/get-optional-user-id', () => ({
  getOptionalUserId,
}));

vi.mock('@/lib/ai-usage', () => ({
  normalizeUsage,
  safeRecordAiUsage,
}));

describe('POST /api/resume/polish', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ARK_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://example.com/api/v3';
    getOptionalUserId.mockResolvedValue('user-3');
    normalizeUsage.mockReturnValue({ totalTokens: 120, taskCount: 1 });
  });

  it('润色成功后记录资源消耗', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          usage: { total_tokens: 120 },
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '1. 优化后的经历' }],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/resume/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: 'workExperiences.0.summary',
          text: '负责前端开发',
          context: {},
          style: 'professional',
          language: 'zh-CN',
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.optimizedText).toContain('优化后的经历');
    expect(safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-3',
        feature: 'resume',
        action: 'resume-polish',
      })
    );
  });

  it('参数校验失败时返回 400', async () => {
    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/resume/polish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          target: '',
          text: '',
        }),
      })
    );

    expect(response.status).toBe(400);
    expect(safeRecordAiUsage).not.toHaveBeenCalled();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ARK_API_KEY = originalApiKey;
  });
});
