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

describe('POST /api/resume/diagnose', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ARK_API_KEY;
  const createResumePayload = () => ({
    schemaVersion: 'v1',
    templateId: 'classic',
    updatedAt: '2026-05-10T12:00:00.000Z',
    personalInfo: { name: '张三', title: '前端工程师', email: '' },
    workExperiences: [],
    educations: [],
    projects: [],
    skills: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://example.com/api/v3';
    getOptionalUserId.mockResolvedValue('user-4');
    normalizeUsage.mockReturnValue({ totalTokens: 240, taskCount: 1 });
  });

  it('诊断成功后记录资源消耗', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          usage: { total_tokens: 240 },
          output: [
            {
              type: 'message',
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({
                    score: 88,
                    dimensions: {
                      completeness: 90,
                      impact: 85,
                      keywordMatch: 86,
                      readability: 91,
                    },
                    suggestions: [],
                  }),
                },
              ],
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    ) as typeof fetch;

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/resume/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: createResumePayload(),
          privacy: { allowContactFields: false },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.score).toBe(88);
    expect(safeRecordAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-4',
        feature: 'resume',
        action: 'resume-diagnose',
      })
    );
  });

  it('上游非 429 失败时回退规则引擎且不记录 usage', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: 'upstream error' } }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      })
    ) as typeof fetch;

    const { POST } = await import('./route');
    const response = await POST(
      new Request('http://localhost/api/resume/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resume: {
            ...createResumePayload(),
            personalInfo: { name: '张三', title: '', email: '' },
          },
          privacy: { allowContactFields: false },
        }),
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.fallback).toBe(true);
    expect(safeRecordAiUsage).not.toHaveBeenCalled();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ARK_API_KEY = originalApiKey;
  });
});
