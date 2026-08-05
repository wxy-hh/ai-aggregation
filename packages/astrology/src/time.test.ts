import { describe, it, expect } from 'vitest';
import {
  localCivilToUtc,
  utcToJulianDay,
  julianDayToGmst,
  localCivilToJulianDay,
  createShanghaiLocalTime,
} from './time';

describe('time', () => {
  describe('localCivilToUtc', () => {
    it('应将 Asia/Shanghai 本地时间转换为 UTC（UTC+8）', () => {
      const local = createShanghaiLocalTime(2024, 1, 1, 8, 0, 0);
      const utc = localCivilToUtc(local);
      expect(utc).toEqual({
        year: 2024,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      });
    });

    it('应正确处理跨日边界', () => {
      const local = createShanghaiLocalTime(2024, 1, 1, 5, 30, 0);
      const utc = localCivilToUtc(local);
      expect(utc).toEqual({
        year: 2023,
        month: 12,
        day: 31,
        hour: 21,
        minute: 30,
        second: 0,
      });
    });

    it('对非 Shanghai 偏移应抛出错误', () => {
      const local = createShanghaiLocalTime(2024, 1, 1, 12, 0, 0);
      local.utcOffsetMinutes = 540;
      expect(() => localCivilToUtc(local)).toThrow(/P0 仅支持 Asia\/Shanghai/);
    });
  });

  describe('utcToJulianDay', () => {
    it('已知历元：1900-01-01 00:00 UTC 应为 JD 2415020.5', () => {
      const jd = utcToJulianDay({
        year: 1900,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      });
      expect(jd).toBeCloseTo(2415020.5, 6);
    });

    it('已知历元：2024-01-01 00:00 UTC 应为 JD 2460310.5', () => {
      const jd = utcToJulianDay({
        year: 2024,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      });
      expect(jd).toBeCloseTo(2460310.5, 6);
    });

    it('已知历元：J2000.0 的 UTC 近似为 JD 2451544.999247685', () => {
      // J2000.0 定义在 2000-01-01 12:00 TT；TT-UTC 约 64.184 秒，对应 UTC 11:58:55。
      const jd = utcToJulianDay({
        year: 2000,
        month: 1,
        day: 1,
        hour: 11,
        minute: 58,
        second: 55,
      });
      expect(jd).toBeCloseTo(2451544.999247685, 6);
    });
  });

  describe('julianDayToGmst', () => {
    it('J2000.0 历元 GMST 应接近 280.46061837°', () => {
      const gmst = julianDayToGmst(2451545.0);
      expect(gmst).toBeCloseTo(280.46061837, 4);
    });

    it('2024-01-01 00:00 UTC 的 GMST 应与天文年鉴值接近', () => {
      const jd = utcToJulianDay({
        year: 2024,
        month: 1,
        day: 1,
        hour: 0,
        minute: 0,
        second: 0,
      });
      const gmst = julianDayToGmst(jd);
      // 与 IAU 2000 近似公式及 NOAA 计算器对照，2024-01-01 0h UTC 的 GMST 约 100.15°。
      expect(gmst).toBeCloseTo(100.1526, 3);
    });
  });

  describe('可复现性', () => {
    it('同一本地时间重复计算的儒略日应逐字段一致', () => {
      const local = createShanghaiLocalTime(1990, 5, 15, 20, 30, 0);
      const first = localCivilToJulianDay(local);
      const second = localCivilToJulianDay(local);
      expect(first).toBe(second);
      // 1990-05-15 20:30 CST = 1990-05-15 12:30 UTC，JD 约 2448027.0208。
      expect(first).toBeCloseTo(2448027.0208333335, 8);
    });

    it('同一 JD 重复计算的 GMST 应逐字段一致', () => {
      const gmst1 = julianDayToGmst(2460310.5);
      const gmst2 = julianDayToGmst(2460310.5);
      expect(gmst1).toBe(gmst2);
    });
  });
});
