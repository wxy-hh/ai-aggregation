import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const validPayload = {
  name: '测试',
  gender: 'male' as const,
  birthDate: { year: 1995, month: 6, day: 18 },
  birthTime: { hour: '12', minute: '30' },
  location: { name: '北京', lat: 39.9, lon: 116.4 },
};

function createRequest() {
  return new Request('http://localhost/api/destiny/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(validPayload),
  });
}

describe('/api/destiny/report', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ARK_API_KEY;
  const originalBaseUrl = process.env.ARK_BASE_URL;

  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://example.com/api/v3';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.ARK_API_KEY = originalApiKey;
    process.env.ARK_BASE_URL = originalBaseUrl;
    vi.restoreAllMocks();
  });

  it('当模型响应缺少有效文本时返回 502 而不是 500', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'reasoning', summary: [] }],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    ) as typeof fetch;

    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(502);
    expect(json).toEqual({
      error: '模型返回格式不合法，请稍后重试',
      details: 'ARK 未返回有效文本',
    });
  });

  it('当重试请求被上游限流时透传 429 而不是 500', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 'incomplete',
            incomplete_details: { reason: 'length' },
            output: [],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'rate limit' } }), {
          status: 429,
          headers: { 'Content-Type': 'application/json' },
        })
      ) as typeof fetch;

    const response = await POST(createRequest());
    const json = await response.json();

    expect(response.status).toBe(429);
    expect(json.error).toBe('请求过于频繁，请稍后重试');
  });
});
