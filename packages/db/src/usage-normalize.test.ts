import { describe, it, expect } from 'vitest';
import { normalizeUsage } from '@repo/shared';

// 评审 C3：normalizeUsage 已迁移到 @repo/shared（唯一实现），
// 本测试锁定其行为契约（原 db 版行为保持不变）。

describe('normalizeUsage（@repo/shared 唯一实现）', () => {
  it('空/非法输入：返回全 null + taskCount=1（字段面稳定，不返回 null）', () => {
    for (const raw of [null, undefined, '', '字符串', 42]) {
      expect(normalizeUsage(raw)).toEqual({
        inputTokens: null,
        outputTokens: null,
        totalTokens: null,
        cachedTokens: null,
        reasoningTokens: null,
        taskCount: 1,
      });
    }
    // 空数组是 truthy `object`：走对象分支（与原 db 版行为一致）
    expect(normalizeUsage([])).toEqual({
      inputTokens: null,
      outputTokens: null,
      totalTokens: null,
      cachedTokens: null,
      reasoningTokens: null,
      taskCount: 1,
      rawUsage: [],
    });
  });

  it('DeepSeek snake_case：prompt_tokens / completion_tokens / total_tokens', () => {
    expect(
      normalizeUsage({ prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 })
    ).toMatchObject({
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
    });
  });

  it('ARK snake_case：input_tokens / output_tokens', () => {
    expect(normalizeUsage({ input_tokens: 5, output_tokens: 7 })).toMatchObject({
      inputTokens: 5,
      outputTokens: 7,
      totalTokens: 12, // 缺失 total 时按 input+output 合计
    });
  });

  it('camelCase：inputTokens / outputTokens / totalTokens', () => {
    expect(
      normalizeUsage({ inputTokens: 3, outputTokens: 4, totalTokens: 7 })
    ).toMatchObject({ inputTokens: 3, outputTokens: 4, totalTokens: 7 });
  });

  it('提取 cached/reasoning 细节（嵌套 details 与顶层字段）', () => {
    expect(
      normalizeUsage({
        input_tokens: 100,
        output_tokens: 50,
        input_tokens_details: { cached_tokens: 80 },
        output_tokens_details: { reasoning_tokens: 30 },
      })
    ).toMatchObject({ cachedTokens: 80, reasoningTokens: 30 });

    expect(
      normalizeUsage({
        inputTokenDetails: { cacheReadTokens: 5 },
        outputTokenDetails: { reasoningTokens: 2 },
      })
    ).toMatchObject({ cachedTokens: 5, reasoningTokens: 2 });

    expect(
      normalizeUsage({ cachedInputTokens: 9 })
    ).toMatchObject({ cachedTokens: 9 });
  });

  it('字符串数字可解析，负数净化为 0', () => {
    expect(normalizeUsage({ input_tokens: '12' })).toMatchObject({
      inputTokens: 12,
      totalTokens: 12,
    });
    expect(normalizeUsage({ input_tokens: -5 })).toMatchObject({
      inputTokens: 0,
      totalTokens: 0,
    });
  });

  it('rawUsage 原始对象透传', () => {
    const raw = { prompt_tokens: 1, completion_tokens: 2 };
    expect(normalizeUsage(raw).rawUsage).toBe(raw);
  });
});
