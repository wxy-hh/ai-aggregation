/**
 * 区间稳定性校验测试。
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateStability,
  stabilityForApproximateRange,
  stabilityForUnknownTime,
  STABILITY_SAMPLE_STEP_MINUTES,
  STABILITY_DEGREE_TOLERANCE,
} from './stability';
import { createShanghaiLocalTime, localCivilToJulianDay } from './time';
import { allPlanetsLongitude, longitudeToZodiac } from './ephemeris';
import { computeHouses } from './houses';

describe('stability', () => {
  describe('evaluateStability', () => {
    it('恒定字段应判定为 stable 并保留统一值', () => {
      const result = evaluateStability(
        2451545.0,
        2451545.1,
        () => ({ fixed: 'A' }),
        { fixed: 'discrete' }
      );
      expect(result.fixed.stable).toBe(true);
      expect(result.fixed.value).toBe('A');
    });

    it('度数字段变化小于容差应判定为 stable', () => {
      const result = evaluateStability(
        2451545.0,
        2451545.0 + 0.1, // 0.1 日
        (jd) => ({ deg: 10 + (jd - 2451545.0) * 4 }), // 0.1 日变化 0.4°，小于容差
        { deg: 'degree' }
      );
      expect(result.deg.stable).toBe(true);
      expect(result.deg.value).toBeCloseTo(10, 5);
    });

    it('度数字段变化超过容差应判定为 unstable 并隐藏值', () => {
      const result = evaluateStability(
        2451545.0,
        2451545.5,
        (jd) => ({ deg: (jd - 2451545.0) * 10 }), // 0.5 日变化 5°，超过容差
        { deg: 'degree' }
      );
      expect(result.deg.stable).toBe(false);
      expect(result.deg.value).toBeNull();
      expect(result.deg.unstableReason).toContain('超过容差');
    });

    it('离散字段不一致应判定为 unstable', () => {
      let flip = false;
      const result = evaluateStability(
        2451545.0,
        2451545.1,
        () => {
          flip = !flip;
          return { sign: flip ? 'A' : 'B' };
        },
        { sign: 'discrete' }
      );
      expect(result.sign.stable).toBe(false);
      expect(result.sign.value).toBeNull();
    });

    it('采样步长应不超过 4 分钟', () => {
      const samples: number[] = [];
      evaluateStability(
        2451545.0,
        2451545.0 + 1, // 1 日
        (jd) => {
          samples.push(jd);
          return { x: 1 };
        },
        { x: 'discrete' }
      );
      const stepDays = STABILITY_SAMPLE_STEP_MINUTES / 1440;
      for (let i = 1; i < samples.length; i++) {
        expect(samples[i] - samples[i - 1]).toBeLessThanOrEqual(stepDays + 1e-9);
      }
      // 端点必采。
      expect(samples[0]).toBe(2451545.0);
      expect(samples[samples.length - 1]).toBe(2451545.0 + 1);
    });
  });

  describe('stabilityForApproximateRange', () => {
    it('约时跨星座月亮应判定为 unstable 并隐藏', () => {
      // 1990-05-13 14:00–15:00 CST，北京，月亮在该小时内由射手座进入摩羯座。
      const start = createShanghaiLocalTime(1990, 5, 13, 14, 0, 0, 'approximate');
      const end = createShanghaiLocalTime(1990, 5, 13, 15, 0, 0, 'approximate');

      const result = stabilityForApproximateRange(
        start,
        end,
        (jd) => {
          const longitudes = allPlanetsLongitude(jd);
          const { signId } = longitudeToZodiac(longitudes.moon);
          return { moonSign: signId };
        },
        { moonSign: 'discrete' }
      );

      expect(result.moonSign.stable).toBe(false);
      expect(result.moonSign.value).toBeNull();
    });
  });

  describe('stabilityForUnknownTime', () => {
    it('未知时间不应产生稳定的上升点/天顶/宫位', () => {
      const result = stabilityForUnknownTime(
        { year: 1990, month: 5, day: 15 },
        480,
        (jd) => {
          const houses = computeHouses(jd, 39.9, 116.4);
          return {
            ascendant: houses.ascendant,
            midheaven: houses.midheaven,
            house1: houses.cusps[0],
          };
        },
        {
          ascendant: 'degree',
          midheaven: 'degree',
          house1: 'degree',
        }
      );

      expect(result.ascendant.stable).toBe(false);
      expect(result.ascendant.value).toBeNull();
      expect(result.midheaven.stable).toBe(false);
      expect(result.midheaven.value).toBeNull();
      expect(result.house1.stable).toBe(false);
      expect(result.house1.value).toBeNull();
    });

    it('未知时间区间应覆盖完整当地民用日', () => {
      const samples: number[] = [];
      stabilityForUnknownTime(
        { year: 1990, month: 5, day: 15 },
        480,
        (jd) => {
          samples.push(jd);
          return { x: 1 };
        },
        { x: 'discrete' }
      );
      const startJd = localCivilToJulianDay(createShanghaiLocalTime(1990, 5, 15, 0, 0, 0));
      const endJd = localCivilToJulianDay(createShanghaiLocalTime(1990, 5, 16, 0, 0, 0));
      expect(samples[0]).toBeCloseTo(startJd, 8);
      expect(samples[samples.length - 1]).toBeCloseTo(endJd, 8);
    });
  });
});
