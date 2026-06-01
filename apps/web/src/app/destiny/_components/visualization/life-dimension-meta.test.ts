import { describe, expect, it } from 'vitest';
import { rankLifeDimensionLevels } from './life-dimension-meta';

describe('life-dimension-meta', () => {
  it('按分值在五维内划分偏弱、中等、偏强', () => {
    const levels = rankLifeDimensionLevels([
      { key: 'career', value: 88 },
      { key: 'wealth', value: 44 },
      { key: 'health', value: 59 },
      { key: 'love', value: 54 },
      { key: 'wisdom', value: 44 },
    ]);

    expect(levels.get('career')).toBe('high');
    expect(levels.get('wealth')).toBe('low');
    expect(levels.get('wisdom')).toBe('low');
    expect(levels.get('love')).toBe('mid');
    expect(levels.get('health')).toBe('high');
  });
});
