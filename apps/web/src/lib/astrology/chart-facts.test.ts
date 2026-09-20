/**
 * chart-facts.test.ts —— 星座寰宇 · 真值层冻结档案与计算口径金样测试
 *
 * 锁定的规则（均来自设计文档 docs/designs/2026-07-26-constellation-universe-design.md）：
 * - 冻结示例盘与权威星历核对锚点一致（SAMPLE_CHART_ANCHOR：Swiss Ephemeris 十星体/四轴/宫头）；
 * - 相位由同一组黄经推导，orb 表内（合/冲 8°、刑/拱 6°、六合 4°，§9.2）才算成相，由
 *   orbTableVersion 标识；
 * - 约时区间整度数稳定才展示度数、星座跨座一律隐藏（§9.2）；区间分离角窗口不全落在容许度内
 *   的相位为不稳定（§9.3）；
 * - 未知时间无宫位无四轴、不展示任何度数、月亮跨座隐藏（§9.2 验收清单）。
 *
 * 参考金样写法：apps/web/src/app/api/destiny/_lib/bazi-chart.test.ts。
 */

import { describe, expect, it } from 'vitest';
import { ORB_TABLE, ORB_TABLE_VERSION } from './chart-facts';
import type { PlanetBody, PlanetPlacement, ZodiacSign } from './chart-facts';
import {
  ASPECT_IDEAL,
  deriveAspectFactsFromRanges,
  deriveAspects,
  degreeInSign,
  placementStability,
  separation,
  signOfLongitude,
} from './zodiac-geometry';
import type { AspectRange } from './zodiac-geometry';
import {
  SAMPLE_CHART_ACCURATE,
  SAMPLE_CHART_ANCHOR,
  SAMPLE_CHART_APPROXIMATE,
  SAMPLE_CHART_UNKNOWN,
} from './sample-chart';

const SIGN_ORDER: ZodiacSign[] = [
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
  return aspects.find((x) => (x.source === a && x.target === b) || (x.source === b && x.target === a));
}

/** 冻结落点还原为黄经（只依赖对外可观察量） */
function absoluteLongitude(planet: PlanetPlacement): number {
  if (!planet.sign || planet.degree === null) throw new Error(`${planet.body} 落点不可用`);
  return SIGN_ORDER.indexOf(planet.sign) * 30 + planet.degree;
}

function planetOf(facts: typeof SAMPLE_CHART_ACCURATE, body: PlanetBody): PlanetPlacement {
  const planet = facts.planets.find((p) => p.body === body);
  if (!planet) throw new Error(`缺少 ${body}`);
  return planet;
}

describe('冻结示例盘：准确到分钟（1995-10-08 14:30 上海）', () => {
  const facts = SAMPLE_CHART_ACCURATE;

  it('十星体黄经、逆行、四轴与权威星历锚点一致', () => {
    for (const body of Object.keys(SAMPLE_CHART_ANCHOR.swiss.longitudes) as PlanetBody[]) {
      const diff = absoluteLongitude(planetOf(facts, body)) - SAMPLE_CHART_ANCHOR.swiss.longitudes[body];
      expect(Math.abs(diff), `${body} 与权威星历偏差`).toBeLessThanOrEqual(SAMPLE_CHART_ANCHOR.tolerance.longitude);
    }
    const asc = facts.angles.ascendant.longitude!;
    const mc = facts.angles.midheaven.longitude!;
    expect(Math.abs(asc - SAMPLE_CHART_ANCHOR.swiss.ascendant)).toBeLessThanOrEqual(SAMPLE_CHART_ANCHOR.tolerance.angle);
    expect(Math.abs(mc - SAMPLE_CHART_ANCHOR.swiss.midheaven)).toBeLessThanOrEqual(SAMPLE_CHART_ANCHOR.tolerance.angle);
    expect(planetOf(facts, 'mercury').retrograde).toBe(true); // 1995-10-08 水星逆行
    expect(planetOf(facts, 'saturn').retrograde).toBe(true); // 1995-10-08 土星逆行
  });

  it('宫位为 Placidus 且宫头与权威星历锚点一致', () => {
    expect(facts.houseSystem).toBe('placidus');
    expect(facts.dataCompleteness).toBe('with-houses');
    expect(facts.houses).toHaveLength(12);
    expect(facts.factStability.note).toBeNull();
    for (const house of facts.houses) {
      const cusp = SIGN_ORDER.indexOf(house.sign) * 30 + house.cuspDegree;
      const reference = SAMPLE_CHART_ANCHOR.swiss.cusps[house.number - 1];
      expect(Math.abs(cusp - reference), `第 ${house.number} 宫头`).toBeLessThanOrEqual(
        SAMPLE_CHART_ANCHOR.tolerance.cusp
      );
    }
  });

  it('相位由同一组黄经推导，orb 表内才算成相，且与事实层版本标识一致', () => {
    expect(facts.orbTableVersion).toBe(ORB_TABLE_VERSION);
    expect(facts.aspects.length).toBeGreaterThan(0);
    for (const aspect of facts.aspects) {
      const sep = separation(absoluteLongitude(planetOf(facts, aspect.source)), absoluteLongitude(planetOf(facts, aspect.target)));
      expect(Math.abs(sep - ASPECT_IDEAL[aspect.type])).toBeLessThanOrEqual(ORB_TABLE[aspect.type]);
      expect(aspect.orb).toBeCloseTo(Math.abs(sep - ASPECT_IDEAL[aspect.type]), 3);
      expect(aspect.strength).toBeCloseTo(1 - aspect.orb! / ORB_TABLE[aspect.type], 3);
      expect(aspect.stability).toBe('stable');
    }
    // 金样：日月对冲（容许度 8° 内）、天王-海王合相
    expect(aspectPair(facts.aspects, 'sun', 'moon')!.type).toBe('opposition');
    expect(aspectPair(facts.aspects, 'uranus', 'neptune')!.type).toBe('conjunction');
    // 反例：金星-太阳黄经差约 12.9°（合相容许度外）不成相
    expect(aspectPair(facts.aspects, 'sun', 'venus')).toBeUndefined();
  });

  it('示例盘为冻结本命盘，不含行运事实', () => {
    expect(facts.transits).toEqual([]);
  });
});

describe('冻结示例盘：大约时段与时间未知降级', () => {
  it('约时档：角点与宫位隐藏，度数不稳定者仅展示星座', () => {
    const facts = SAMPLE_CHART_APPROXIMATE;
    expect(facts.dataCompleteness).toBe('without-houses');
    expect(facts.houseSystem).toBeNull();
    expect(facts.houses).toEqual([]);
    expect(facts.angles.ascendant.sign).toBeNull();
    expect(facts.angles.ascendant.longitude).toBeNull();
    expect(facts.factStability.angles.reason).toBe('unstable-in-range');
    expect(facts.factStability.note).toContain('约时');
    expect(planetOf(facts, 'sun')).toMatchObject({ sign: 'libra', degree: null, stability: 'signOnly' });
    expect(planetOf(facts, 'mercury')).toMatchObject({ sign: 'libra', degree: 8, stability: 'stable' });
    for (const planet of facts.planets) {
      if (planet.stability === 'stable') expect(planet.degree).not.toBeNull();
      else expect(planet.degree).toBeNull();
    }
  });

  it('未知档：无宫位无四轴、度数一律为 null，月亮跨座隐藏', () => {
    const facts = SAMPLE_CHART_UNKNOWN;
    expect(facts.dataCompleteness).toBe('without-houses');
    expect(facts.houseSystem).toBeNull();
    expect(facts.houses).toEqual([]);
    expect(facts.factStability.angles.reason).toBe('time-unknown');
    for (const planet of facts.planets) {
      expect(planet.degree, `${planet.body} 度数`).toBeNull();
      expect(planet.house, `${planet.body} 宫位`).toBeNull();
    }
    // 1995-10-10 月亮白羊→金牛、金星天秤→天蝎：整颗隐藏
    expect(planetOf(facts, 'moon').sign).toBeNull();
    expect(planetOf(facts, 'moon').stability).toBe('unstable');
    expect(planetOf(facts, 'venus').sign).toBeNull();
    expect(facts.factStability.placements.moon.displayable).toBe(false);
    expect(planetOf(facts, 'sun')).toMatchObject({ sign: 'libra', degree: null, stability: 'signOnly' });
  });
});

describe('deriveAspects orb 表边界（合成黄经）', () => {
  const pair = (sep: number) => aspectPair(deriveAspects(twoBodyLongitudes(sep)), 'sun', 'moon');

  it('合相 0°：8° 内成相，8° 外不成相', () => {
    expect(pair(0.5)?.type).toBe('conjunction');
    expect(pair(7.9)?.type).toBe('conjunction');
    expect(pair(8.1)).toBeUndefined();
  });

  it('六合 60°：4° 内成相，4° 外不成相', () => {
    expect(pair(56.1)?.type).toBe('sextile');
    expect(pair(63.9)?.type).toBe('sextile');
    expect(pair(55.9)).toBeUndefined();
    expect(pair(64.1)).toBeUndefined();
  });

  it('刑相 90° 与拱相 120°：6° 内成相，6° 外不成相', () => {
    expect(pair(84.1)?.type).toBe('square');
    expect(pair(95.9)?.type).toBe('square');
    expect(pair(83.9)).toBeUndefined();
    expect(pair(96.1)).toBeUndefined();
    expect(pair(114.1)?.type).toBe('trine');
    expect(pair(125.9)?.type).toBe('trine');
    expect(pair(113.9)).toBeUndefined();
    expect(pair(126.1)).toBeUndefined();
  });

  it('对冲 180°：8° 内成相，8° 外不成相；12.94° 类中间值不成相', () => {
    expect(pair(172.1)?.type).toBe('opposition');
    expect(pair(187.9)?.type).toBe('opposition');
    expect(pair(171.9)).toBeUndefined();
    expect(pair(188.1)).toBeUndefined();
    expect(pair(12.94)).toBeUndefined();
    expect(pair(30)).toBeUndefined();
  });

  it('强度 = 1 - orb/容许度：精确成相为 1', () => {
    expect(pair(0)!.strength).toBe(1);
    expect(pair(4)!.strength).toBeCloseTo(0.5, 3);
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

describe('deriveAspectFactsFromRanges 区间相位口径', () => {
  const range = (minSep: number, maxSep: number, midSep: number): AspectRange => ({
    source: 'sun',
    target: 'moon',
    minSep,
    maxSep,
    midSep,
  });

  it('窗口全落容许度内 → 稳定（orb 取区间中点的偏差）', () => {
    const [aspect] = deriveAspectFactsFromRanges([range(172.5, 176.5, 174.5)]);
    expect(aspect.type).toBe('opposition');
    expect(aspect.stability).toBe('stable');
    expect(aspect.orb).toBeCloseTo(5.5, 3);
    expect(aspect.strength).toBeCloseTo(0.313, 4); // 1 - 5.5/8 = 0.3125，强度保留三位小数
  });

  it('窗口与容许度相交但未全落 → 不稳定（orb/strength 为 null）', () => {
    const [aspect] = deriveAspectFactsFromRanges([range(170.5, 176.5, 174.5)]);
    expect(aspect.type).toBe('opposition');
    expect(aspect.stability).toBe('unstable');
    expect(aspect.orb).toBeNull();
    expect(aspect.strength).toBeNull();
  });

  it('窗口与所有容许度窗口都不相交 → 不成相', () => {
    expect(deriveAspectFactsFromRanges([range(30, 34, 32)])).toEqual([]);
  });
});

describe('黄道几何口径', () => {
  it('signOfLongitude / degreeInSign / separation 边界行为稳定', () => {
    expect(signOfLongitude(0)).toBe('aries');
    expect(signOfLongitude(359.9999)).toBe('pisces');
    expect(signOfLongitude(-1)).toBe('pisces');
    expect(degreeInSign(30.5)).toBeCloseTo(0.5, 6);
    expect(degreeInSign(-0.5)).toBeCloseTo(29.5, 6);
    expect(separation(10, 350)).toBeCloseTo(20, 6);
    expect(separation(10, 190)).toBeCloseTo(180, 6);
  });
});
