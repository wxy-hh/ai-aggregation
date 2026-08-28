import { describe, it, expect } from 'vitest';
import { normalizeModelUsage } from '@repo/shared';

// 评审 C3：normalizeModelUsage 已改为统一 normalizeUsage 的薄映射，
// 本测试锁定 Destiny 域简版 ModelUsage 的外部行为不变。

describe('normalizeModelUsage（Destiny 域薄映射）', () => {
  it('DeepSeek snake_case 映射为 ModelUsage', () => {
    expect(
      normalizeModelUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    ).toEqual({
      promptTokens: 10,
      completionTokens: 20,
      totalTokens: 30,
    });
  });

  it('ARK input_tokens / output_tokens 缺失 total 时合计', () => {
    expect(normalizeModelUsage({ input_tokens: 5, output_tokens: 7 })).toEqual({
      promptTokens: 5,
      completionTokens: 7,
      totalTokens: 12,
    });
  });

  it('空/非法输入返回 null（destiny 域简版契约）', () => {
    expect(normalizeModelUsage(null)).toBeNull();
    expect(normalizeModelUsage(undefined)).toBeNull();
    expect(normalizeModelUsage('文本')).toBeNull();
    expect(normalizeModelUsage({})).toBeNull();
  });

  it('只有单项 token 时另一项补 0，total 为单项值', () => {
    expect(normalizeModelUsage({ input_tokens: 9 })).toEqual({
      promptTokens: 9,
      completionTokens: 0,
      totalTokens: 9,
    });
  });
});
