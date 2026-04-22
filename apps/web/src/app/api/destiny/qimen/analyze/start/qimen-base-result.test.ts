import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateQimenBaseResult } from '@repo/shared';

describe('generateQimenBaseResult', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          output_text:
            '{"chartTitle":"奇门遁甲排盘","chartMeta":{"dun":"阳遁","ju":"三局"},"board":[{"palace":"巽四宫" "luoshu":4}],"score":82,"disclaimer":"仅供参考"}',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    ) as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('当模型返回格式错误的 JSON 时仍能回退到可展示的基础盘面', async () => {
    const result = await generateQimenBaseResult(
      {
        context: {
          datetime: '2026-04-16 09:30',
          location: '上海',
          chartMethod: 'time',
        },
        question: {
          category: 'career',
          description: '我想判断近期是否适合换工作，以及该怎么安排节奏。',
          focus: 'risk_control',
          outputStyle: 'plain',
          outputLength: 'brief',
        },
      },
      {
        apiKey: 'test-key',
        baseUrl: 'https://example.com/api/v3',
      }
    );

    expect(result.chartTitle).toBe('奇门遁甲排盘');
    expect(result.board).toHaveLength(9);
    expect(result.disclaimer).toBeTruthy();
  });
});
