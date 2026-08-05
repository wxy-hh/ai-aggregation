import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn((req: Request, handler: (user: { id: string; role: string }, request: Request) => unknown) =>
    handler({ id: 'test-user', role: 'member' }, req)
  ),
}));

import { POST } from './route';
import type { ChartFacts } from '@/app/destiny/_components/astrology/astrology-types';

function makeFacts(): ChartFacts {
  return {
    version: 'test',
    calculatedAt: new Date().toISOString(),
    location: { name: '北京', lat: 39.9, lon: 116.4 },
    birthTimestamp: '1990-05-15',
    bigThree: {
      sun: { sign: 'taurus', label: '金牛座' },
      moon: { sign: 'cancer', label: '巨蟹座' },
      ascendant: { sign: 'libra', label: '天秤座' },
    },
    planets: [
      { body: 'sun', longitude: 54, zodiacSign: 'taurus', isRetrograde: false, house: 8, label: '太阳' },
    ],
    houses: [],
    aspects: [],
  };
}

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/destiny/astrology/qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const BASE = { chartFacts: makeFacts(), timePrecision: 'minute', provider: 'doubao' };

describe('POST /api/destiny/astrology/qa', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://ark.example.com/api/v3';
  });
  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockModel(text: string) {
    const encoder = new TextEncoder();
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream({
          start(c) {
            c.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.completed', response: { output: [{ type: 'output_text', text }] } })}\n\n`));
            c.close();
          },
        }),
        { status: 200 }
      )
    );
  }

  it('第 4 个问题被拦截并出现上限文案', async () => {
    const res = await POST(makeRequest({ ...BASE, question: '还想问', askedCount: 3 }));
    const data = await res.json();
    expect(data.limited).toBe(true);
    expect(data.answer).toContain('本次星语问答已完成');
  });

  it('医疗敏感话题返回安全拦截而非结论', async () => {
    const res = await POST(makeRequest({ ...BASE, question: '我最近会不会生病？', askedCount: 0 }));
    const data = await res.json();
    expect(data.sensitive).toBe(true);
    expect(data.answer).toContain('医疗、财务或法律');
  });

  it('投资/财务话题被拦截', async () => {
    const res = await POST(makeRequest({ ...BASE, question: '我适合买哪只股票？', askedCount: 0 }));
    const data = await res.json();
    expect(data.sensitive).toBe(true);
  });

  it('正常问题返回基于星盘的回答', async () => {
    mockModel('你的太阳落金牛座，倾向稳扎稳打，本周可以尝试把一个想法落地。');
    const res = await POST(makeRequest({ ...BASE, question: '本周工作适合主动争取什么？', askedCount: 0 }));
    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.answer.length).toBeGreaterThan(0);
    expect(data.sensitive).toBeUndefined();
  });

  it('空问题返回 400', async () => {
    const res = await POST(makeRequest({ ...BASE, question: '  ', askedCount: 0 }));
    expect(res.status).toBe(400);
  });
});
