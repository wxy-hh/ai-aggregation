/**
 * 星历计算金样测试。
 *
 * 使用 test/fixtures/golden-charts.json 中的权威参考值（NASA JPL Horizons
 * DE441 地心视黄经）验证本包实现精度、星座判定与逆行判定。
 */

import { describe, it, expect } from 'vitest';
import {
  type PlanetBody,
  PLANET_BODIES,
  planetLongitude,
  allPlanetsLongitude,
  longitudeToZodiac,
  isRetrograde,
} from './ephemeris';
import { absErrorDeg } from './ephemeris.compare';
import { ZODIAC_SIGNS } from './constants';
import golden from '../test/fixtures/golden-charts.json' assert { type: 'json' };

interface GoldenRecord {
  name: string;
  birthLocal: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
    timeZone: string;
  };
  jd: number;
  longitudes: Record<PlanetBody, number>;
  retrograde: Record<PlanetBody, boolean>;
}

const records = (golden as { records: GoldenRecord[] }).records;

const MAX_ERROR_DEG = 0.1;

describe('ephemeris', () => {
  describe('planetLongitude 精度', () => {
    for (const rec of records) {
      describe(`${rec.name} ${rec.birthLocal.year}-${rec.birthLocal.month}-${rec.birthLocal.day} (JD ${rec.jd})`, () => {
        for (const body of PLANET_BODIES) {
          it(`${body} 与参考黄经误差应 ≤ ${MAX_ERROR_DEG}°`, () => {
            const actual = planetLongitude(body, rec.jd);
            const expected = rec.longitudes[body];
            const err = absErrorDeg(actual, expected);
            expect(err).toBeLessThanOrEqual(MAX_ERROR_DEG);
          });
        }
      });
    }
  });

  describe('longitudeToZodiac 星座映射', () => {
    for (const rec of records) {
      it(`${rec.name} 各星体黄经应落入正确星座`, () => {
        for (const body of PLANET_BODIES) {
          const lon = rec.longitudes[body];
          const expectedSignIndex = Math.floor(normalizeDegree(lon) / 30) % 12;
          const expectedSign = ZODIAC_SIGNS[expectedSignIndex];
          const zodiac = longitudeToZodiac(lon);
          expect(zodiac.signId).toBe(expectedSign.id);
          expect(zodiac.signCn).toBe(expectedSign.cn);
          expect(zodiac.degreeInSign).toBeGreaterThanOrEqual(0);
          expect(zodiac.degreeInSign).toBeLessThan(30);
        }
      });
    }
  });

  describe('isRetrograde 逆行判定', () => {
    for (const rec of records) {
      it(`${rec.name} 逆行状态应与参考一致`, () => {
        for (const body of PLANET_BODIES) {
          const actual = isRetrograde(body, rec.jd);
          expect(actual).toBe(rec.retrograde[body]);
        }
      });
    }

    it('太阳与月亮恒为顺行', () => {
      const jd = records[0].jd;
      expect(isRetrograde('sun', jd)).toBe(false);
      expect(isRetrograde('moon', jd)).toBe(false);
    });
  });

  describe('可复现性', () => {
    it('同一 JD 重复计算应逐字段一致', () => {
      const jd = records[0].jd;
      const first = allPlanetsLongitude(jd);
      const second = allPlanetsLongitude(jd);
      for (const body of PLANET_BODIES) {
        expect(first[body]).toBe(second[body]);
      }
    });

    it('同一黄经重复映射星座应逐字段一致', () => {
      const lon = records[0].longitudes.sun;
      const first = longitudeToZodiac(lon);
      const second = longitudeToZodiac(lon);
      expect(first).toEqual(second);
    });
  });
});

/** 将角度规范化到 [0, 360)。 */
function normalizeDegree(degree: number): number {
  let normalized = degree % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  return normalized === 0 ? 0 : normalized;
}
