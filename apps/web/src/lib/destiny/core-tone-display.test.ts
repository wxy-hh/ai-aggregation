import { describe, expect, it } from 'vitest';
import { isJargonHeavyText, resolveCoreToneDisplay } from './core-tone-display';

describe('core-tone-display', () => {
  it('识别术语化标题', () => {
    expect(isJargonHeavyText('寒金印食相生格局清透')).toBe(true);
    expect(isJargonHeavyText('先稳后发，适合长期积累')).toBe(false);
  });

  it('术语标题时改用描述中的白话句', () => {
    const result = resolveCoreToneDisplay({
      tag: '一句话看懂',
      chartSummary: '',
      headline: '寒金印食相生格局清透',
      description:
        '你整体偏内敛好学，表达与吸收力都不错，适合先打基础再逐步放大。事业上宜稳扎稳打，不宜急于求成。',
    });

    expect(result.primaryTitle).toContain('你');
    expect(result.patternLabel).toBe('寒金印食相生格局清透');
    expect(result.description).not.toContain(result.primaryTitle);
  });
});
