import { describe, expect, it } from 'vitest';
import { normalizeUsage } from '@repo/db';

describe('normalizeUsage', () => {
  it('兼容豆包 usage 结构', () => {
    const normalized = normalizeUsage({
      input_tokens: 88,
      input_tokens_details: {
        cached_tokens: 5,
      },
      output_tokens: 230,
      output_tokens_details: {
        reasoning_tokens: 211,
      },
      total_tokens: 318,
    });

    expect(normalized).toMatchObject({
      inputTokens: 88,
      outputTokens: 230,
      totalTokens: 318,
      cachedTokens: 5,
      reasoningTokens: 211,
      taskCount: 1,
    });
  });

  it('兼容讯飞 usage 结构', () => {
    const normalized = normalizeUsage({
      prompt_tokens: 12,
      completion_tokens: 34,
      total_tokens: 46,
    });

    expect(normalized).toMatchObject({
      inputTokens: 12,
      outputTokens: 34,
      totalTokens: 46,
      taskCount: 1,
    });
  });

  it('无 usage 时回退为次数统计', () => {
    const normalized = normalizeUsage(undefined);

    expect(normalized).toMatchObject({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      taskCount: 1,
    });
  });
});
