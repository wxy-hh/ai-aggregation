import { describe, expect, it } from 'vitest';
import { scaleValuesForRadarDisplay } from './five-element-radar';

describe('scaleValuesForRadarDisplay', () => {
  it('整体偏低时按相对位置拉伸，避免全部缩在中心', () => {
    const scaled = scaleValuesForRadarDisplay([8, 12, 10, 9, 11]);
    expect(Math.min(...scaled)).toBeGreaterThanOrEqual(0.28);
    expect(Math.max(...scaled)).toBeLessThanOrEqual(0.92);
    expect(scaled[1]).toBeGreaterThan(scaled[3]);
  });

  it('绝对值较高时保留真实比例并设下限', () => {
    const scaled = scaleValuesForRadarDisplay([72, 68, 61, 56, 74]);
    expect(scaled[0]).toBeCloseTo(0.72, 2);
    expect(scaled[3]).toBeGreaterThanOrEqual(0.28);
  });

  it('五维完全相同时落在中间可视带', () => {
    const scaled = scaleValuesForRadarDisplay([20, 20, 20, 20, 20]);
    scaled.forEach((ratio) => {
      expect(ratio).toBeGreaterThan(0.4);
      expect(ratio).toBeLessThan(0.7);
    });
  });
});
