import { describe, it, expect } from 'vitest';
import {
  normalizeDegree,
  shortestArcDelta,
  shortestArcDistance,
  degreeToDms,
  dmsToDegree,
  degToRad,
  radToDeg,
} from './geo';

describe('geo', () => {
  describe('normalizeDegree', () => {
    it('应将正角度规范化到 [0, 360)', () => {
      expect(normalizeDegree(0)).toBe(0);
      expect(normalizeDegree(360)).toBe(0);
      expect(normalizeDegree(450)).toBe(90);
      expect(normalizeDegree(720)).toBe(0);
    });

    it('应将负角度规范化到 [0, 360)', () => {
      expect(normalizeDegree(-90)).toBe(270);
      expect(normalizeDegree(-360)).toBe(0);
      expect(normalizeDegree(-450)).toBe(270);
    });

    it('应保留非整数输入', () => {
      expect(normalizeDegree(365.5)).toBeCloseTo(5.5, 8);
    });
  });

  describe('shortestArcDelta', () => {
    it('应返回 [-180, 180] 内的最短有符号弧', () => {
      expect(shortestArcDelta(0, 10)).toBe(10);
      expect(shortestArcDelta(10, 0)).toBe(-10);
      expect(shortestArcDelta(350, 10)).toBe(20);
      expect(shortestArcDelta(10, 350)).toBe(-20);
    });

    it('在 180° 边界应取东向（+180）', () => {
      expect(shortestArcDelta(0, 180)).toBe(180);
    });

    it('跨越 0° 时不应跳变', () => {
      expect(shortestArcDelta(359, 1)).toBe(2);
      expect(shortestArcDelta(1, 359)).toBe(-2);
    });
  });

  describe('shortestArcDistance', () => {
    it('应返回非负最短距离', () => {
      expect(shortestArcDistance(0, 10)).toBe(10);
      expect(shortestArcDistance(10, 0)).toBe(10);
      expect(shortestArcDistance(350, 10)).toBe(20);
    });
  });

  describe('degreeToDms / dmsToDegree', () => {
    it('应将十进制度数转换为度分秒并还原', () => {
      const dms = degreeToDms(123.456789);
      expect(dms.degree).toBe(123);
      expect(dms.minute).toBe(27);
      expect(dms.negative).toBe(false);
      expect(dmsToDegree(dms)).toBeCloseTo(123.456789, 5);
    });

    it('应保留负号', () => {
      const dms = degreeToDms(-45.5);
      expect(dms.negative).toBe(true);
      expect(dms.degree).toBe(45);
      expect(dms.minute).toBe(30);
      expect(dmsToDegree(dms)).toBeCloseTo(-45.5, 8);
    });

    it('0° 边界情况', () => {
      const dms = degreeToDms(0);
      expect(dms).toEqual({ degree: 0, minute: 0, second: 0, negative: false });
    });
  });

  describe('degToRad / radToDeg', () => {
    it('应完成度与弧度的互转', () => {
      expect(degToRad(180)).toBeCloseTo(Math.PI, 10);
      expect(radToDeg(Math.PI)).toBeCloseTo(180, 10);
      expect(radToDeg(degToRad(123.45))).toBeCloseTo(123.45, 10);
    });
  });
});
