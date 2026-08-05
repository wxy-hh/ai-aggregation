/**
 * 宫位计算测试。
 *
 * 使用 pyswisseph/Swiss Ephemeris 为北京样例计算的 Placidus 宫头作为金样对照，
 * 同时包含自洽校验、极区回退与 houseOfLongitude 判定。
 */

import { describe, it, expect } from 'vitest';
import {
  ascendant,
  midheaven,
  placidusHouses,
  computeHouses,
  houseOfLongitude,
} from './houses';
import { normalizeDegree, shortestArcDistance } from './geo';
import polarCharts from '../test/fixtures/polar-charts.json' assert { type: 'json' };

/** 北京样例：1990-05-15 20:30 CST，北纬 39.9°，东经 116.4°。 */
const BEIJING_JD = 2448027.0208333335;
const BEIJING_LAT = 39.9;
const BEIJING_LON = 116.4;

/** Swiss Ephemeris (pyswisseph) 计算的 Placidus 宫头金样（度）。 */
const BEIJING_SWISS_EPHEMERIS_CUSPS = [
  249.03374607792, // 1
  282.03812080807, // 2
  320.2350020075, // 3
  356.59637592396, // 4
  25.93208547922, // 5
  49.12981987735, // 6
  69.03374607792, // 7
  102.03812080807, // 8
  140.2350020075, // 9
  176.59637592396, // 10
  205.93208547922, // 11
  229.12981987735, // 12
];

describe('houses', () => {
  describe('ascendant', () => {
    it('北京样例上升点应与 Swiss Ephemeris 一致（±0.05°）', () => {
      const asc = ascendant(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      expect(shortestArcDistance(asc, BEIJING_SWISS_EPHEMERIS_CUSPS[0])).toBeLessThanOrEqual(0.05);
    });

    it('赤道春分 LST=0 时上升点应为巨蟹座 90°', () => {
      // 由 julianDayToGmst 反解：GMST=0 对应 JD ≈ 2451545.220339。
      const jd = 2451545.2203394575;
      const asc = ascendant(jd, 0, 0);
      expect(shortestArcDistance(asc, 90)).toBeLessThanOrEqual(0.05);
    });

    it('赤道 LST=90° 时上升点应为天秤座 180°', () => {
      const jd = 2451544.4723872826;
      const asc = ascendant(jd, 0, 0);
      expect(shortestArcDistance(asc, 180)).toBeLessThanOrEqual(0.05);
    });
  });

  describe('midheaven', () => {
    it('北京样例天顶应与 Swiss Ephemeris 一致（±0.05°）', () => {
      const mc = midheaven(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      expect(shortestArcDistance(mc, BEIJING_SWISS_EPHEMERIS_CUSPS[9])).toBeLessThanOrEqual(0.05);
    });

    it('赤道 LST=0 时天顶应为白羊座 0°', () => {
      const jd = 2451545.2203394575;
      const mc = midheaven(jd, 0, 0);
      expect(shortestArcDistance(mc, 0)).toBeLessThanOrEqual(0.05);
    });

    it('赤道 LST=90° 时天顶应为巨蟹座 90°', () => {
      const jd = 2451544.4723872826;
      const mc = midheaven(jd, 0, 0);
      expect(shortestArcDistance(mc, 90)).toBeLessThanOrEqual(0.05);
    });
  });

  describe('placidusHouses', () => {
    it('北京样例十二宫宫头应与 Swiss Ephemeris 一致（±0.05°）', () => {
      const cusps = placidusHouses(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      expect(cusps).toHaveLength(12);
      for (let i = 0; i < 12; i++) {
        const err = shortestArcDistance(cusps[i], BEIJING_SWISS_EPHEMERIS_CUSPS[i]);
        expect(err).toBeLessThanOrEqual(0.05);
      }
    });

    it('宫头数组应为递增顺序（模 360）', () => {
      const cusps = placidusHouses(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      for (let i = 0; i < 12; i++) {
        const start = cusps[i];
        const end = cusps[(i + 1) % 12];
        const delta = normalizeDegree(end - start);
        expect(delta).toBeGreaterThan(0);
        expect(delta).toBeLessThan(180);
      }
    });

    it('对宫（1-7、4-10、11-5、12-6）应相差 180°', () => {
      const cusps = placidusHouses(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      const oppositePairs = [
        [0, 6],
        [3, 9],
        [10, 4],
        [11, 5],
      ];
      for (const [a, b] of oppositePairs) {
        expect(shortestArcDistance(cusps[a], cusps[b])).toBeCloseTo(180, 3);
      }
    });
  });

  describe('computeHouses', () => {
    it('北京样例应采用 Placidus 且不回退', () => {
      const result = computeHouses(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      expect(result.houseSystem).toBe('placidus');
      expect(result.houseSystemFallback).toBe(false);
      expect(result.cusps).toHaveLength(12);
      expect(result.ascendant).toBeCloseTo(BEIJING_SWISS_EPHEMERIS_CUSPS[0], 1);
      expect(result.midheaven).toBeCloseTo(BEIJING_SWISS_EPHEMERIS_CUSPS[9], 1);
    });

    it('纬度超过 66° 应触发 Whole Sign 回退并标注', () => {
      const result = computeHouses(BEIJING_JD, 70, BEIJING_LON);
      expect(result.houseSystem).toBe('whole-sign');
      expect(result.houseSystemFallback).toBe(true);
      expect(result.cusps).toHaveLength(12);
      // 整宫制宫头间隔均为 30°。
      for (let i = 0; i < 12; i++) {
        expect(normalizeDegree(result.cusps[(i + 1) % 12] - result.cusps[i])).toBeCloseTo(30, 5);
      }
    });

    it('极区 fixture 记录应全部触发 Whole Sign 回退', () => {
      const records = (polarCharts as { records: Array<{ jd: number; geo: { latitude: number; longitude: number }; expected: { houseSystem: string; houseSystemFallback: boolean } }> }).records;
      for (const rec of records) {
        const result = computeHouses(rec.jd, rec.geo.latitude, rec.geo.longitude);
        expect(result.houseSystem).toBe(rec.expected.houseSystem);
        expect(result.houseSystemFallback).toBe(rec.expected.houseSystemFallback);
      }
    });
  });

  describe('houseOfLongitude', () => {
    it('应正确判断黄经所在宫位', () => {
      const cusps = placidusHouses(BEIJING_JD, BEIJING_LAT, BEIJING_LON);
      // 正好落在第 5 宫宫头应归第 5 宫。
      expect(houseOfLongitude(cusps[4], cusps)).toBe(5);
      // 第 5 宫内部一点。
      const house5Mid = normalizeDegree((cusps[4] + cusps[5]) / 2);
      expect(houseOfLongitude(house5Mid, cusps)).toBe(5);
      // 跨越 0° 的宫位（第 4 宫内部近 0° 处）。
      expect(houseOfLongitude(10, cusps)).toBe(4);
      // 第 4 宫末尾（cusp 5 之前）。
      const house4End = normalizeDegree(cusps[4] - 0.01);
      expect(houseOfLongitude(house4End, cusps)).toBe(4);
      // cusp 5 本身应归第 5 宫。
      expect(houseOfLongitude(cusps[4], cusps)).toBe(5);
    });

    it('对整宫制也应正确判断', () => {
      const result = computeHouses(BEIJING_JD, 70, BEIJING_LON);
      const ascSignStart = Math.floor(result.ascendant / 30) * 30;
      // 上升星座内一点应在第 1 宫。
      expect(houseOfLongitude(ascSignStart + 15, result.cusps)).toBe(1);
      // 下一星座内一点应在第 2 宫。
      expect(houseOfLongitude(normalizeDegree(ascSignStart + 45), result.cusps)).toBe(2);
    });
  });
});
