/**
 * 相位计算测试。
 */

import { describe, it, expect } from 'vitest';
import { computeAspects } from './aspects';
import type { PlanetBody } from './ephemeris';

describe('aspects', () => {
  const makeLongitudes = (overrides: Partial<Record<PlanetBody, number>> = {}): Record<PlanetBody, number> => ({
    sun: 0,
    moon: 0,
    mercury: 0,
    venus: 0,
    mars: 0,
    jupiter: 0,
    saturn: 0,
    uranus: 0,
    neptune: 0,
    pluto: 0,
    ...overrides,
  });

  it('合相应被正确识别', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 2 }));
    const conjunction = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(conjunction).toBeDefined();
    expect(conjunction!.type).toBe('conjunction');
    expect(conjunction!.orb).toBeCloseTo(2, 5);
    expect(conjunction!.exact).toBe(false);
  });

  it('精确合相应标记 exact', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 0.05 }));
    const conjunction = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(conjunction).toBeDefined();
    expect(conjunction!.exact).toBe(true);
  });

  it('对冲相应被正确识别', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 178 }));
    const opposition = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(opposition).toBeDefined();
    expect(opposition!.type).toBe('opposition');
    expect(opposition!.orb).toBeCloseTo(2, 5);
  });

  it('刑相应被正确识别', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 93 }));
    const square = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(square).toBeDefined();
    expect(square!.type).toBe('square');
    expect(square!.orb).toBeCloseTo(3, 5);
  });

  it('拱相应被正确识别', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 122 }));
    const trine = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(trine).toBeDefined();
    expect(trine!.type).toBe('trine');
    expect(trine!.orb).toBeCloseTo(2, 5);
  });

  it('六合相应被正确识别', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 58 }));
    const sextile = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(sextile).toBeDefined();
    expect(sextile!.type).toBe('sextile');
    expect(sextile!.orb).toBeCloseTo(2, 5);
  });

  it('超出容许度时不应生成相位', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 10 }));
    const conjunction = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(conjunction).toBeUndefined();
  });

  it('orb 越小 strength 越强', () => {
    const tight = computeAspects(makeLongitudes({ moon: 1 })).find(
      (a) => a.source === 'sun' && a.target === 'moon'
    )!;
    const loose = computeAspects(makeLongitudes({ moon: 7 })).find(
      (a) => a.source === 'sun' && a.target === 'moon'
    )!;
    expect(tight.strength).toBeGreaterThan(loose.strength);
    expect(tight.strength).toBeCloseTo(0.875, 5);
    expect(loose.strength).toBeCloseTo(0.125, 5);
  });

  it('对跨越 0°/360° 的角度应正确处理', () => {
    const aspects = computeAspects(makeLongitudes({ sun: 355, moon: 2 }));
    const conjunction = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(conjunction).toBeDefined();
    expect(conjunction!.type).toBe('conjunction');
    expect(conjunction!.angle).toBeCloseTo(7, 5);
  });

  it('应只返回无序星体对，不重复', () => {
    const aspects = computeAspects(makeLongitudes({ sun: 0, moon: 0 }));
    const sunMoon = aspects.filter(
      (a) =>
        (a.source === 'sun' && a.target === 'moon') ||
        (a.source === 'moon' && a.target === 'sun')
    );
    expect(sunMoon).toHaveLength(1);
  });

  it('应返回中文相位名', () => {
    const aspects = computeAspects(makeLongitudes({ moon: 120 }));
    const trine = aspects.find((a) => a.source === 'sun' && a.target === 'moon');
    expect(trine).toBeDefined();
    expect(trine!.typeCn).toBe('拱相');
  });
});
