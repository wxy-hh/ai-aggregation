/**
 * chart-facts.test.ts —— 星座寰宇 · 占星真值计算域金样测试
 *
 * 锁定的规则（均来自设计文档 docs/designs/2026-07-26-constellation-universe-design.md）：
 * - 示例盘相位与行星位置自洽：相位由同一组冻结黄经推导，orb 表内（合/冲 8°、刑/拱 6°、
 *   六合 4°，§9.2）才算成相；
 * - 约时区间稳定性校验：角点/宫位不稳定按无宫位范围降级（§6.2），区间内整度数不稳定
 *   只展示星座（§9.2），区间分离角窗口不全落在容许度内的相位为不稳定；
 * - 未知时间月亮跨座隐藏（§9.2 验收清单），不以中点或 12:00 补算；
 * - 不稳定字段一律为 null，不生成伪单值（§9.3 PlanetPlacement）。
 *
 * 参考金样写法：apps/web/src/app/api/destiny/_lib/bazi-chart.test.ts。
 */

import { describe, expect, it } from 'vitest';
import { ORB_TABLE } from './chart-facts';
import type { AspectType, PlanetBody, ZodiacSign } from './chart-facts';
import {
  FROZEN_SAMPLE_CHART,
  SAMPLE_PROFILE_ACCURATE,
  SAMPLE_PROFILE_APPROXIMATE,
  SAMPLE_PROFILE_UNKNOWN,
  computeChartFacts,
  deriveAspectFactsFromRanges,
  deriveAspects,
  degreeInSign,
  placementStability,
  separation,
  signOfLongitude,
} from './mock-chart-facts';
import type { FrozenAspectRange } from './mock-chart-facts';

/** 精确成相角（度），与 mock 内部口径一致 */
const ASPECT_IDEAL: Record<AspectType, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

type LonMap = Record<PlanetBody, number>;

/** 构造十星体黄经表（默认其余星体远离成相角，避免干扰） */
function twoBodyLongitudes(sep: number): LonMap {
  const lons: LonMap = {
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
  };
  lons.sun = 0;
  lons.moon = sep;
  return lons;
}

/** 取两星体间的相位（按 source<target 忽略方向） */
function aspectPair(aspects: ReturnType<typeof deriveAspects>, a: PlanetBody, b: PlanetBody) {
  return aspects.find(
    (x) => (x.source === a && x.target === b) || (x.source === b && x.target === a)
  );
}

/** 在冻结区间相位表里按星体对查找（source 在前） */
function rangeOf(ranges: FrozenAspectRange[], a: PlanetBody, b: PlanetBody) {
  return ranges.find(
    (r) => (r.source === a && r.target === b) || (r.source === b && r.target === a)
  );
}

/** 冻结黄经转星座内度数 */
function placeOf(lon: number): { sign: ZodiacSign; degree: number } {
  return { sign: signOfLongitude(lon), degree: degreeInSign(lon) };
}

describe('computeChartFacts 准确到分钟（示例盘 1995-10-08 14:30 上海）', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);

  it('金样：完整盘结构与关键数值冻结', () => {
    expect(facts.zodiacSystem).toBe('tropical');
    expect(facts.houseSystem).toBe('whole-sign');
    expect(facts.dataCompleteness).toBe('with-houses');
    expect(facts.orbTableVersion).toBe('2026-07-26-v1');
    expect(facts.planets).toHaveLength(10);
    expect(facts.houses).toHaveLength(12);
    expect(facts.factStability.note).toBeNull();

    const sun = facts.planets.find((p) => p.body === 'sun')!;
    expect(sun.sign).toBe('libra');
    expect(sun.degree).toBeCloseTo(14.5158, 3); // 194.5158° 黄经
    expect(sun.house).toBe(9);

    const moon = facts.planets.find((p) => p.body === 'moon')!;
    expect(moon.sign).toBe('aries');
    expect(moon.degree).toBeCloseTo(9.771, 3); // 9.771° 黄经
    expect(moon.house).toBe(3);

    const mercury = facts.planets.find((p) => p.body === 'mercury')!;
    const saturn = facts.planets.find((p) => p.body === 'saturn')!;
    expect(mercury.retrograde).toBe(true); // 1995-10-08 水星逆行
    expect(saturn.retrograde).toBe(true); // 1995-10-08 土星逆行

    const asc = facts.angles.ascendant;
    expect(asc.sign).toBe('aquarius');
    expect(asc.degree).toBeCloseTo(12.149, 3); // 312.149° 黄经
    expect(asc.longitude).toBeCloseTo(312.149, 3);
    expect(asc.stability).toBe('stable');
    const mc = facts.angles.midheaven;
    expect(mc.sign).toBe('scorpio');
    expect(mc.degree).toBeCloseTo(27.6668, 3); // 237.6668° 黄经
  });

  it('金样：整宫制十二宫由上升星座推导，天顶落第十宫', () => {
    expect(facts.houses.map((h) => h.sign)).toEqual([
      'aquarius',
      'pisces',
      'aries',
      'taurus',
      'gemini',
      'cancer',
      'leo',
      'virgo',
      'libra',
      'scorpio',
      'sagittarius',
      'capricorn',
    ]);
    // 每颗星体的宫位 = 其星座相对上升星座的整宫位移
    const ascIndex = 10; // aquarius
    const signs: ZodiacSign[] = [
      'aries',
      'taurus',
      'gemini',
      'cancer',
      'leo',
      'virgo',
      'libra',
      'scorpio',
      'sagittarius',
      'capricorn',
      'aquarius',
      'pisces',
    ];
    for (const p of facts.planets) {
      expect(p.house).toBe(((signs.indexOf(p.sign!) - ascIndex + 12) % 12) + 1);
    }
    expect(facts.angles.midheaven.sign).toBe(facts.houses[9].sign); // MC 落 10 宫（整宫制）
  });

  it('金样：相位由同一组冻结黄经推导，orb 表内才算成相', () => {
    // 与冻结黄经直接推导的结果完全一致
    expect(facts.aspects).toEqual(deriveAspects(FROZEN_SAMPLE_CHART.accurate.longitudes));
    expect(facts.aspects).toHaveLength(14);

    // 全部相位逐条复核：分离角、类型、orb、强度与黄经自洽
    for (const a of facts.aspects) {
      const lonA = FROZEN_SAMPLE_CHART.accurate.longitudes[a.source];
      const lonB = FROZEN_SAMPLE_CHART.accurate.longitudes[a.target];
      const sep = separation(lonA, lonB);
      expect(Math.abs(sep - ASPECT_IDEAL[a.type])).toBeLessThanOrEqual(ORB_TABLE[a.type]);
      expect(a.orb).toBeCloseTo(Math.abs(sep - ASPECT_IDEAL[a.type]), 3);
      expect(a.strength).toBeCloseTo(1 - a.orb! / ORB_TABLE[a.type], 3);
    }

    // 金样：日月对冲（容许度 8° 内）与天王-海王合相
    const sunMoon = aspectPair(facts.aspects, 'sun', 'moon')!;
    expect(sunMoon.type).toBe('opposition');
    expect(sunMoon.orb).toBeCloseTo(4.7448, 3);
    const uranusNeptune = aspectPair(facts.aspects, 'uranus', 'neptune')!;
    expect(uranusNeptune.type).toBe('conjunction');
    expect(uranusNeptune.orb).toBeCloseTo(3.7454, 3);
    // 六合 4° 容许度内的土星-海王、天王-冥王
    const saturnNeptune = aspectPair(facts.aspects, 'saturn', 'neptune')!;
    expect(saturnNeptune.type).toBe('sextile');
    expect(saturnNeptune.orb).toBeCloseTo(3.1707, 3);
    const uranusPluto = aspectPair(facts.aspects, 'uranus', 'pluto')!;
    expect(uranusPluto.type).toBe('sextile');
    expect(uranusPluto.orb).toBeCloseTo(2.2836, 3);

    // 反例：黄经差 12.94° 的金星-太阳不成相（合相处 8° 容许度外）
    expect(aspectPair(facts.aspects, 'sun', 'venus')).toBeUndefined();
  });
});

describe('deriveAspects orb 表边界（合成黄经）', () => {
  const pair = (sep: number, type: AspectType) => {
    const aspects = deriveAspects(twoBodyLongitudes(sep));
    const found = aspectPair(aspects, 'sun', 'moon');
    if (type === null as unknown as AspectType) return found;
    return found;
  };

  it('合相 0°：8° 内成相，8° 外不成相', () => {
    expect(pair(0.5, 'conjunction')?.type).toBe('conjunction');
    expect(pair(7.9, 'conjunction')?.type).toBe('conjunction');
    expect(pair(8.1, 'conjunction')).toBeUndefined();
  });

  it('六合 60°：4° 内成相，4° 外不成相', () => {
    expect(pair(56.1, 'sextile')?.type).toBe('sextile');
    expect(pair(63.9, 'sextile')?.type).toBe('sextile');
    expect(pair(55.9, 'sextile')).toBeUndefined();
    expect(pair(64.1, 'sextile')).toBeUndefined();
  });

  it('刑相 90° 与拱相 120°：6° 内成相，6° 外不成相', () => {
    expect(pair(84.1, 'square')?.type).toBe('square');
    expect(pair(95.9, 'square')?.type).toBe('square');
    expect(pair(83.9, 'square')).toBeUndefined();
    expect(pair(96.1, 'square')).toBeUndefined();
    expect(pair(114.1, 'trine')?.type).toBe('trine');
    expect(pair(125.9, 'trine')?.type).toBe('trine');
    expect(pair(113.9, 'trine')).toBeUndefined();
    expect(pair(126.1, 'trine')).toBeUndefined();
  });

  it('对冲 180°：8° 内成相，8° 外不成相；12.94° 类中间值不成相', () => {
    expect(pair(172.1, 'opposition')?.type).toBe('opposition');
    expect(pair(187.9, 'opposition')?.type).toBe('opposition');
    expect(pair(171.9, 'opposition')).toBeUndefined();
    expect(pair(188.1, 'opposition')).toBeUndefined();
    expect(pair(12.94, 'conjunction')).toBeUndefined();
    expect(pair(30, 'conjunction')).toBeUndefined();
  });

  it('强度 = 1 - orb/容许度：精确成相为 1', () => {
    const aspects = deriveAspects(twoBodyLongitudes(0));
    const conj = aspectPair(aspects, 'sun', 'moon')!;
    expect(conj.strength).toBe(1);
    const aspects2 = deriveAspects(twoBodyLongitudes(4));
    expect(aspectPair(aspects2, 'sun', 'moon')!.strength).toBeCloseTo(0.5, 3);
  });
});

describe('computeChartFacts 大约时段 [13:00, 16:00)', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_APPROXIMATE);
  const frozen = FROZEN_SAMPLE_CHART.approximate;

  it('约时区间稳定性：角点/宫位不稳定 → 无宫位范围降级', () => {
    expect(facts.dataCompleteness).toBe('without-houses');
    expect(facts.houseSystem).toBeNull();
    expect(facts.houses).toEqual([]);
    expect(facts.angles.ascendant.sign).toBeNull();
    expect(facts.angles.ascendant.degree).toBeNull();
    expect(facts.angles.ascendant.longitude).toBeNull();
    expect(facts.angles.ascendant.stability).toBe('unstable');
    expect(facts.factStability.angles.displayable).toBe(false);
    expect(facts.factStability.angles.reason).toBe('unstable-in-range');
    // 冻结证据：ASC 区间跨摩羯→双鱼三个星座
    expect(signOfLongitude(frozen.ascRange.min)).not.toBe(signOfLongitude(frozen.ascRange.max));
    expect(signOfLongitude(frozen.mcRange.min)).not.toBe(signOfLongitude(frozen.mcRange.max));
    expect(facts.factStability.note).toContain('约时');
  });

  it('区间整度数稳定才展示度数，否则只展示星座（不生成伪单值）', () => {
    const table: Record<string, { sign: ZodiacSign; degree: number | null; stability: string }> = {
      sun: { sign: 'libra', degree: null, stability: 'signOnly' }, // 14.45°~14.58° 取整跨 14/15
      moon: { sign: 'aries', degree: null, stability: 'signOnly' }, // 8.95°~10.59° 取整跨 9/11
      venus: { sign: 'libra', degree: null, stability: 'signOnly' }, // 27.38°~27.53° 取整跨 27/28
      mercury: { sign: 'libra', degree: 8, stability: 'stable' },
      mars: { sign: 'scorpio', degree: 21, stability: 'stable' },
      jupiter: { sign: 'sagittarius', degree: 12, stability: 'stable' },
      saturn: { sign: 'pisces', degree: 20, stability: 'stable' },
      uranus: { sign: 'capricorn', degree: 27, stability: 'stable' },
      neptune: { sign: 'capricorn', degree: 23, stability: 'stable' },
      pluto: { sign: 'scorpio', degree: 29, stability: 'stable' },
    };
    for (const [body, expected] of Object.entries(table)) {
      const p = facts.planets.find((x) => x.body === body)!;
      expect(p.sign, `${body} 星座`).toBe(expected.sign);
      expect(p.degree, `${body} 度数`).toBe(expected.degree);
      expect(p.stability, `${body} 稳定性`).toBe(expected.stability);
      expect(p.house).toBeNull(); // 无宫位范围
    }
    // 与 placementStability 规则自洽（同一函数推导）
    for (const p of facts.planets) {
      expect(p.stability).toBe(placementStability(frozen.bodies[p.body]));
    }
  });

  it('约时相位：区间分离角窗口全落容许度内才稳定', () => {
    // 冻结档案中所有候选相位在 3 小时区间内均稳定（分离角漂移 < 0.5°）
    expect(facts.aspects).toHaveLength(14);
    for (const a of facts.aspects) {
      expect(a.stability, `${a.source}-${a.target}`).toBe('stable');
      const r = rangeOf(frozen.aspectRanges, a.source, a.target)!;
      expect(r.minSep).toBeGreaterThanOrEqual(ASPECT_IDEAL[a.type] - ORB_TABLE[a.type]);
      expect(r.maxSep).toBeLessThanOrEqual(ASPECT_IDEAL[a.type] + ORB_TABLE[a.type]);
      expect(a.orb).toBeCloseTo(Math.abs(r.midSep - ASPECT_IDEAL[a.type]), 3);
    }
    const sunMoon = aspectPair(facts.aspects, 'sun', 'moon')!;
    expect(sunMoon.type).toBe('opposition');
    expect(sunMoon.orb).toBeCloseTo(4.7448, 3);
    expect(facts.factStability.aspects.displayable).toBe(true);
  });

  it('与冻结区间极值推导结果一致', () => {
    expect(facts.aspects).toEqual(deriveAspectFactsFromRanges(frozen.aspectRanges));
  });
});

describe('computeChartFacts 完全未知（1995-10-10 上海民用日）', () => {
  const facts = computeChartFacts(SAMPLE_PROFILE_UNKNOWN);
  const frozen = FROZEN_SAMPLE_CHART.unknown;

  it('无宫位、无上升/天顶，仅整日稳定的星座可展示', () => {
    expect(facts.dataCompleteness).toBe('without-houses');
    expect(facts.houseSystem).toBeNull();
    expect(facts.houses).toEqual([]);
    expect(facts.angles.ascendant.sign).toBeNull();
    expect(facts.angles.midheaven.longitude).toBeNull();
    expect(facts.factStability.angles.reason).toBe('time-unknown');
    expect(facts.factStability.houses.reason).toBe('time-unknown');
    expect(facts.factStability.note).toContain('出生时间未知');
  });

  it('月亮当日跨座（白羊→金牛）整颗隐藏，字段全为 null', () => {
    // 冻结证据：月亮黄经 27.82°~40.42° 跨白羊/金牛
    expect(signOfLongitude(frozen.bodies.moon.min)).toBe('aries');
    expect(signOfLongitude(frozen.bodies.moon.max)).toBe('taurus');
    expect(frozen.moonCrosses).toBe(true);

    const moon = facts.planets.find((p) => p.body === 'moon')!;
    expect(moon.sign).toBeNull();
    expect(moon.degree).toBeNull();
    expect(moon.house).toBeNull();
    expect(moon.retrograde).toBeNull();
    expect(moon.stability).toBe('unstable');
    expect(facts.factStability.placements.moon.displayable).toBe(false);
    expect(facts.factStability.placements.moon.reason).toBe('time-unknown');

    // 金星同日也跨座（天秤→天蝎），同样整颗隐藏
    const venus = facts.planets.find((p) => p.body === 'venus')!;
    expect(signOfLongitude(frozen.bodies.venus.min)).toBe('libra');
    expect(signOfLongitude(frozen.bodies.venus.max)).toBe('scorpio');
    expect(venus.sign).toBeNull();
    expect(venus.stability).toBe('unstable');
  });

  it('不以中点或 12:00 补算：所有度数一律为 null，即使整度数恰好稳定', () => {
    for (const p of facts.planets) {
      expect(p.degree, `${p.body} 度数`).toBeNull();
      expect(p.house, `${p.body} 宫位`).toBeNull();
    }
    // 锁定「未知档只展示星座」的严格口径：木星整日内整度数稳定（251.86°~252.03°），
    // 但未知档仍不展示度数（文档 §6.2 只承诺整日内稳定的星座与主要相位）
    const jupiter = facts.planets.find((p) => p.body === 'jupiter')!;
    expect(Math.round(degreeInSign(frozen.bodies.jupiter.min))).toBe(
      Math.round(degreeInSign(frozen.bodies.jupiter.max))
    );
    expect(jupiter.sign).toBe('sagittarius');
    expect(jupiter.degree).toBeNull();
    expect(jupiter.stability).toBe('signOnly');

    // 星座稳定的星体展示星座（signOnly），月亮/金星跨座隐藏
    for (const p of facts.planets) {
      const range = frozen.bodies[p.body];
      const signStable = signOfLongitude(range.min) === signOfLongitude(range.max);
      expect(p.stability).toBe(signStable ? 'signOnly' : 'unstable');
      if (signStable) {
        expect(p.sign).toBe(signOfLongitude(range.min));
        expect(p.retrograde).not.toBeNull();
      } else {
        expect(p.sign).toBeNull();
        expect(p.retrograde).toBeNull();
      }
    }
  });

  it('整日稳定的主要相位保留，跨容许度窗口的相位为不稳定（orb/strength 为 null）', () => {
    const stable = facts.aspects.filter((a) => a.stability === 'stable');
    const unstable = facts.aspects.filter((a) => a.stability === 'unstable');
    expect(stable).toHaveLength(7);
    expect(unstable).toHaveLength(5);

    for (const a of facts.aspects) {
      const r = rangeOf(frozen.aspectRanges, a.source, a.target)!;
      const window = [ASPECT_IDEAL[a.type] - ORB_TABLE[a.type], ASPECT_IDEAL[a.type] + ORB_TABLE[a.type]];
      const intersects = r.minSep <= window[1] && r.maxSep >= window[0];
      expect(intersects, `${a.source}-${a.target} 应为候选相`).toBe(true);
      if (a.stability === 'stable') {
        expect(r.minSep).toBeGreaterThanOrEqual(window[0]);
        expect(r.maxSep).toBeLessThanOrEqual(window[1]);
        expect(a.orb).not.toBeNull();
        expect(a.strength).not.toBeNull();
      } else {
        expect(a.orb).toBeNull();
        expect(a.strength).toBeNull();
        expect(r.maxSep > window[1] || r.minSep < window[0]).toBe(true);
      }
    }

    // 金样：稳定的火星-冥王星合相、火星-土星拱相；不稳定的月亮-金星对冲（月亮跨座）
    const marsPluto = aspectPair(facts.aspects, 'mars', 'pluto')!;
    expect(marsPluto.type).toBe('conjunction');
    expect(marsPluto.stability).toBe('stable');
    expect(marsPluto.orb).toBeCloseTo(6.4489, 3);
    const marsSaturn = aspectPair(facts.aspects, 'mars', 'saturn')!;
    expect(marsSaturn.type).toBe('trine');
    expect(marsSaturn.stability).toBe('stable');
    const moonVenus = aspectPair(facts.aspects, 'moon', 'venus')!;
    expect(moonVenus.type).toBe('opposition');
    expect(moonVenus.stability).toBe('unstable');
    expect(moonVenus.orb).toBeNull();
    expect(moonVenus.strength).toBeNull();
    // 太阳-海王星刑相仅在部分时段落入容许度，同样为不稳定
    const sunNeptune = aspectPair(facts.aspects, 'sun', 'neptune')!;
    expect(sunNeptune.type).toBe('square');
    expect(sunNeptune.stability).toBe('unstable');
  });

  it('与冻结区间极值推导结果一致', () => {
    expect(facts.aspects).toEqual(deriveAspectFactsFromRanges(frozen.aspectRanges));
  });
});

describe('placementStability 区间稳定性规则', () => {
  it('星座跨座 → unstable；整度数跨边界 → signOnly；整度数一致 → stable', () => {
    expect(placementStability({ min: 29.8, max: 30.4 })).toBe('unstable'); // 白羊→金牛
    expect(placementStability({ min: 14.45, max: 14.58 })).toBe('signOnly'); // 取整跨 14/15
    expect(placementStability({ min: 7.83, max: 7.95 })).toBe('stable');
    expect(placementStability({ min: 359.6, max: 359.9 })).toBe('stable'); // 双鱼 29.6°~29.9°
    expect(placementStability({ min: 0.0, max: 0.49 })).toBe('stable'); // 取整同为 0
  });
});