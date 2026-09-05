/**
 * solar-longitude.test.ts —— 表单预览太阳黄经近似计算的金样测试
 * 锚点：1995-10-08 的太阳黄经与 02 冻结示例盘（194.5158°，真实计算口径）比对，
 * 误差须在 ±0.6° 内；另锁定四季代表性日期的星座归属。
 */

import { describe, expect, it } from 'vitest';
import { approximateSunLongitude, approximateSunSign } from './solar-longitude';

describe('approximateSunLongitude 太阳黄经近似', () => {
  it('1995-10-08 与冻结示例盘真值（194.5158°）误差在 ±0.6° 内', () => {
    const lon = approximateSunLongitude({ year: 1995, month: 10, day: 8 });
    expect(Math.abs(lon - 194.5158)).toBeLessThan(0.6);
  });

  it('2000-01-01 正午前后太阳在摩羯座约 10°（历书常识锚点）', () => {
    const lon = approximateSunLongitude({ year: 2000, month: 1, day: 1 });
    expect(lon).toBeGreaterThan(279);
    expect(lon).toBeLessThan(283);
  });
});

describe('approximateSunSign 太阳星座归属', () => {
  it.each([
    [{ year: 1995, month: 10, day: 8 }, 'libra'],
    [{ year: 2000, month: 1, day: 15 }, 'capricorn'],
    [{ year: 1990, month: 4, day: 10 }, 'aries'],
    [{ year: 1988, month: 7, day: 20 }, 'cancer'],
    [{ year: 1999, month: 8, day: 15 }, 'leo'],
    [{ year: 2001, month: 12, day: 25 }, 'capricorn'],
    [{ year: 1997, month: 2, day: 14 }, 'aquarius'],
    [{ year: 1993, month: 5, day: 10 }, 'taurus'],
    [{ year: 1996, month: 6, day: 10 }, 'gemini'],
    [{ year: 1994, month: 9, day: 5 }, 'virgo'],
    [{ year: 1992, month: 11, day: 10 }, 'scorpio'],
    [{ year: 1998, month: 12, day: 10 }, 'sagittarius'],
    [{ year: 1991, month: 3, day: 5 }, 'pisces'],
  ] as const)('%o → %s', (date, sign) => {
    expect(approximateSunSign(date)).toBe(sign);
  });
});
