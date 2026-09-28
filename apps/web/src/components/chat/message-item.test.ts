import { describe, it, expect } from 'vitest';
import { formatUsageText } from './message-item';

describe('formatUsageText 格式化消息 token 消耗展示', () => {
  it('真实 usage 包含分项：展示标准格式，千分位，无约前缀', () => {
    const text = formatUsageText({
      inputTokens: 1000,
      outputTokens: 234,
      totalTokens: 1234,
      estimated: false,
    });
    expect(text).toBe('1,234 tokens（输入 1,000 · 输出 234）');
  });

  it('估算 usage 包含分项：带有“约 ”前缀', () => {
    const text = formatUsageText({
      inputTokens: 500,
      outputTokens: 1500,
      totalTokens: 2000,
      estimated: true,
    });
    expect(text).toBe('约 2,000 tokens（输入 500 · 输出 1,500）');
  });

  it('分项为 null 时退化为仅展示总数', () => {
    const textWithoutInputs = formatUsageText({
      inputTokens: null,
      outputTokens: 50,
      totalTokens: 50,
      estimated: false,
    });
    expect(textWithoutInputs).toBe('50 tokens');

    const textWithoutOutputs = formatUsageText({
      inputTokens: 50,
      outputTokens: null,
      totalTokens: 50,
      estimated: true,
    });
    expect(textWithoutOutputs).toBe('约 50 tokens');

    const textWithoutBoth = formatUsageText({
      inputTokens: null,
      outputTokens: null,
      totalTokens: 100,
      estimated: false,
    });
    expect(textWithoutBoth).toBe('100 tokens');
  });
});
