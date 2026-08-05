import { describe, expect, it } from 'vitest';
import {
  validateFactReference,
  assertFactReferencesValid,
  filterValidReport,
} from './astrology-truth-guard';
import type { ChartFacts } from '@/app/destiny/_components/astrology/astrology-types';

/** 构造一个含宫位/相位的最小真值。 */
function makeChartFacts(withHouses = true): ChartFacts {
  return {
    version: 'test',
    calculatedAt: new Date().toISOString(),
    location: { name: '北京', lat: 39.9, lon: 116.4 },
    birthTimestamp: '1990-05-15',
    bigThree: {
      sun: { sign: 'taurus', label: '金牛座' },
      moon: { sign: 'cancer', label: '巨蟹座' },
      ascendant: { sign: 'libra', label: '天秤座' },
    },
    planets: [
      { body: 'sun', longitude: 54, zodiacSign: 'taurus', isRetrograde: false, house: 8, label: '太阳' },
      { body: 'moon', longitude: 100, zodiacSign: 'cancer', isRetrograde: false, house: 10, label: '月亮' },
    ],
    houses: withHouses
      ? [{ number: 1, cuspLongitude: 180, zodiacSign: 'libra', label: '命宫' }]
      : [],
    aspects: [
      { planetA: 'sun', planetB: 'moon', type: 'square', angle: 90, orb: 1, applying: true },
    ],
  };
}

describe('astrology-truth-guard', () => {
  it('合法行星引用通过', () => {
    expect(validateFactReference({ kind: 'planet', body: 'sun' }, makeChartFacts()).valid).toBe(true);
  });

  it('杜撰行星引用被拒绝', () => {
    const r = validateFactReference({ kind: 'planet', body: 'mars' }, makeChartFacts());
    expect(r.valid).toBe(false);
  });

  it('含宫位时宫位引用通过；无宫位时被拒绝', () => {
    expect(validateFactReference({ kind: 'house', number: 1 }, makeChartFacts(true)).valid).toBe(true);
    const noHouse = validateFactReference({ kind: 'house', number: 1 }, makeChartFacts(false));
    expect(noHouse.valid).toBe(false);
  });

  it('真实相位引用通过；不存在的相位被拒绝', () => {
    expect(
      validateFactReference({ kind: 'aspect', planetA: 'sun', planetB: 'moon', type: 'square' }, makeChartFacts()).valid
    ).toBe(true);
    expect(
      validateFactReference({ kind: 'aspect', planetA: 'sun', planetB: 'moon', type: 'trine' }, makeChartFacts()).valid
    ).toBe(false);
  });

  it('相位去序：B-A 与 A-B 等价', () => {
    expect(
      validateFactReference({ kind: 'aspect', planetA: 'moon', planetB: 'sun', type: 'square' }, makeChartFacts()).valid
    ).toBe(true);
  });

  it('批量校验遇首个违规即返回', () => {
    const r = assertFactReferencesValid(
      [
        { kind: 'planet', body: 'sun' },
        { kind: 'planet', body: 'pluto' },
      ],
      makeChartFacts()
    );
    expect(r.valid).toBe(false);
  });

  it('filterValidReport 移除引用非法事实的段', () => {
    const sections = [
      { key: 'a', factReferences: [{ kind: 'planet', body: 'sun' } as const] },
      { key: 'b', factReferences: [{ kind: 'planet', body: 'neptune' } as const] },
    ];
    const kept = filterValidReport(sections, makeChartFacts());
    expect(kept.map((s) => s.key)).toEqual(['a']);
  });
});
