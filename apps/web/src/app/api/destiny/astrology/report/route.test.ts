import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/with-auth', () => ({
  withAuth: vi.fn(
    (req: Request, handler: (user: { id: string; role: string }, request: Request) => unknown) =>
      handler({ id: 'test-admin', role: 'admin' }, req)
  ),
}));

import { POST } from './route';

function createArkCompletedResponse(report: Record<string, unknown>) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({
              type: 'response.completed',
              response: {
                id: 'resp_test',
                usage: { input_tokens: 100, output_tokens: 200 },
                output: [{ type: 'output_text', text: JSON.stringify(report) }],
              },
            })}\n\n`
          )
        );
        controller.close();
      },
    }),
    { status: 200 }
  );
}

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

const BASE_BODY = {
  name: '小宇',
  solarDate: { year: 1990, month: 5, day: 15 },
  birthTime: { hour: 20, minute: 30 },
  timePrecision: 'minute',
  approximateRange: null,
  location: { name: '北京市', lat: 39.9, lon: 116.4 },
  timezoneConfirmed: true,
  focusTheme: 'self',
  provider: 'doubao',
};

function makeRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/destiny/astrology/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/destiny/astrology/report', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.ARK_API_KEY = 'test-key';
    process.env.ARK_BASE_URL = 'https://ark.example.com/api/v3';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('按序流出 chart-facts → bigThree → headline/modules/transits → complete', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      createArkCompletedResponse({
        headline: '在稳定与自由之间，练习把感受说清楚。',
        modules: [{ key: 'self', title: '我是谁', summary: '核心气质', highlights: ['行动感强'] }],
        transits: [{ period: '本周', title: '行动三角', summary: '', opportunities: ['推进'], challenges: ['分心'] }],
      })
    );

    const res = await POST(makeRequest(BASE_BODY));
    expect(res.headers.get('Content-Type')).toContain('text/event-stream');
    const events = await readSseEvents(res);
    const types = events.map((e) => e.type);

    expect(types[0]).toBe('chart-facts');
    expect(types).toContain('bigThree');
    expect(types[types.length - 1]).toBe('complete');
    // chart-facts 必须早于任何解读区块
    expect(types.indexOf('chart-facts')).toBeLessThan(types.indexOf('complete'));
  });

  it('chart-facts 为确定性真值，不含 AI 文本', async () => {
    global.fetch = vi.fn().mockResolvedValue(createArkCompletedResponse({ headline: 'x', modules: [], transits: [] }));
    const res = await POST(makeRequest(BASE_BODY));
    const events = await readSseEvents(res);
    const facts = events.find((e) => e.type === 'chart-facts')?.chartFacts as {
      planets: Array<{ body: string }>;
      houses: unknown[];
      version: string;
    };
    expect(facts.planets.length).toBeGreaterThan(0);
    expect(facts.version).toContain('astro');
    // minute 精度应含宫位
    expect(Array.isArray(facts.houses)).toBe(true);
  });

  it('未知时间不产生宫位与上升依赖', async () => {
    global.fetch = vi.fn().mockResolvedValue(createArkCompletedResponse({ headline: 'x', modules: [], transits: [] }));
    const res = await POST(
      makeRequest({ ...BASE_BODY, timePrecision: 'unknown', birthTime: null, approximateRange: null })
    );
    const events = await readSseEvents(res);
    const facts = events.find((e) => e.type === 'chart-facts')?.chartFacts as {
      houses: unknown[];
      planets: Array<{ house: number }>;
    };
    expect(facts.houses).toEqual([]);
    facts.planets.forEach((p) => expect(p.house).toBe(0));
  });

  it('非法/未来日期返回 400', async () => {
    const res = await POST(
      makeRequest({ ...BASE_BODY, solarDate: { year: 2999, month: 1, day: 1 } })
    );
    expect(res.status).toBe(400);
  });

  it('城市缺经纬度返回 400', async () => {
    const res = await POST(
      makeRequest({ ...BASE_BODY, location: { name: '北京', lat: null, lon: null } })
    );
    expect(res.status).toBe(400);
  });

  it('minute 缺 birthTime 返回 400', async () => {
    const res = await POST(makeRequest({ ...BASE_BODY, birthTime: null }));
    expect(res.status).toBe(400);
  });
});
