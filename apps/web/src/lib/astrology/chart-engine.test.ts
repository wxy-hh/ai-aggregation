/**
 * chart-engine.test.ts —— 星座寰宇 · 真实星盘计算域金样与降级口径测试
 *
 * 权威参照：Swiss Ephemeris（Astrodienst 口径：地心视位置、回归黄道、当日分点）。
 * 示例盘 1995-10-08 14:30 上海（UTC 1995-10-08T06:30Z，31.2304N / 121.4737E）的核对值由
 * pyswisseph（swe.calc_ut 十星体 + houses_ex 的 Placidus）产出，作为本文件的权威金样常量：
 *   sun 194.5086  moon 9.7989  mercury 187.8883  venus 207.4438  mars 231.0820
 *   jupiter 251.6258  saturn 349.6049  uranus 296.5272  neptune 292.7769  pluto 238.8052
 *   ASC 312.1526  MC 237.6683
 *   cusps [312.1526, 353.9258, 29.8235, 57.6683, 81.1720, 104.3901, 132.1526, 173.9258,
 *          209.8235, 237.6683, 261.1720, 284.3901]
 *
 * 交叉验证：旧冻结档案（scripts/freeze-sample-chart.mjs 于 2026-08-31 用 Schlyter 低精度算法
 * 冻结）作为第二参照，按票面容差（行星 < 0.5°、ASC/MC < 1°）复核新引擎无口径漂移。
 */

import { describe, expect, it } from 'vitest';
import { ORB_TABLE, ORB_TABLE_VERSION } from './chart-facts';
import type { AspectType, AstroBirthProfile, PlanetBody, PlanetPlacement } from './chart-facts';
import {
  ENGINE_VERSION,
  bodyLongitudesAt,
  collectInOrbSpans,
  computeChartFactsAt,
  computeTransitFacts,
  placidusCuspsValid,
  resolveProfileCivilDay,
  resolveProfileInstant,
  resolveProfileInterval,
  startOfNaturalWeekUtc,
} from './chart-engine';

/** 测试固定计算时刻（周三），保证行运窗口与结果确定性 */
const AT = new Date('2026-09-16T12:00:00.000Z');

const DAY_MS = 86400000;

const BODY_ORDER: PlanetBody[] = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
];

const SIGN_ORDER = [
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
] as const;

/** Swiss Ephemeris 权威黄经（1995-10-08T06:30Z，地心视位置、回归黄道） */
const SWISS_LONGITUDES: Record<PlanetBody, number> = {
  sun: 194.5086,
  moon: 9.7989,
  mercury: 187.8883,
  venus: 207.4438,
  mars: 231.082,
  jupiter: 251.6258,
  saturn: 349.6049,
  uranus: 296.5272,
  neptune: 292.7769,
  pluto: 238.8052,
};

/** Swiss Ephemeris 权威四轴与 Placidus 宫头黄经 */
const SWISS_ASC = 312.1526;
const SWISS_MC = 237.6683;
const SWISS_CUSPS = [
  312.1526, 353.9258, 29.8235, 57.6683, 81.172, 104.3901, 132.1526, 173.9258, 209.8235, 237.6683, 261.172,
  284.3901,
];

/** 旧冻结档案（Schlyter 低精度算法，2026-08-31 冻结）——交叉验证第二参照 */
const LEGACY_LONGITUDES: Record<PlanetBody, number> = {
  sun: 194.5158,
  moon: 9.771,
  mercury: 187.8887,
  venus: 207.4567,
  mars: 231.0843,
  jupiter: 251.6199,
  saturn: 349.6039,
  uranus: 296.52,
  neptune: 292.7746,
  pluto: 238.8036,
};
const LEGACY_ASC = 312.149;
const LEGACY_MC = 237.6668;

/** 示例盘档案：1995-10-08 14:30 上海 */
const SAMPLE_ACCURATE: AstroBirthProfile = {
  name: null,
  birthDate: { year: 1995, month: 10, day: 8 },
  birthTime: { hour: 14, minute: 30 },
  timeRange: null,
  timePrecision: 'accurate',
  city: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  localTimeDisambiguation: null,
  tzdbVersion: 'tzdata2025a',
};

/** 约时档案：1995-10-08 [13:00, 16:00) 上海 */
const SAMPLE_APPROXIMATE: AstroBirthProfile = {
  ...SAMPLE_ACCURATE,
  birthTime: null,
  timePrecision: 'approximate',
  timeRange: {
    localStart: '1995-10-08T13:00:00+08:00',
    localEnd: '1995-10-08T16:00:00+08:00',
    timezone: 'Asia/Shanghai',
  },
};

/** 未知时间档案：1995-10-10 上海（该日月亮白羊→金牛跨座） */
const SAMPLE_UNKNOWN: AstroBirthProfile = {
  ...SAMPLE_ACCURATE,
  birthDate: { year: 1995, month: 10, day: 10 },
  birthTime: null,
  timePrecision: 'unknown',
  utcOffsetMinutes: null,
};

/** 未知时间对照：1995-10-08 上海（该日月亮整日停留白羊座） */
const UNKNOWN_MOON_STABLE: AstroBirthProfile = {
  ...SAMPLE_UNKNOWN,
  birthDate: { year: 1995, month: 10, day: 8 },
};

/** 高纬出生地（Placidus 在极圈附近宫头顺序无法闭合） */
const HIGH_LATITUDE: AstroBirthProfile = {
  ...SAMPLE_ACCURATE,
  city: '特罗姆瑟',
  latitude: 68,
  longitude: 20,
  timezone: 'Europe/Oslo',
  utcOffsetMinutes: 60,
};

/** 按某一刻的出生日期时间构造准确档档案 */
function accurateProfileAt(
  birthDate: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  overrides: Partial<AstroBirthProfile> = {}
): AstroBirthProfile {
  return { ...SAMPLE_ACCURATE, birthDate, birthTime: { hour, minute }, ...overrides };
}

/** 由星座 + 星座内度数还原黄经（对外可观察量，不依赖内部实现） */
function absoluteLongitude(planet: PlanetPlacement): number {
  const signIndex = SIGN_ORDER.indexOf(planet.sign as (typeof SIGN_ORDER)[number]);
  if (signIndex < 0 || planet.degree === null) throw new Error(`${planet.body} 落点不可用`);
  return signIndex * 30 + planet.degree;
}

/** 去除随计算时刻变化的字段，便于比较本命盘部分 */
function natalOnly(facts: ReturnType<typeof computeChartFactsAt>): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...facts };
  delete clone.calculatedAt;
  delete clone.transits;
  return clone;
}

function planetOf(facts: ReturnType<typeof computeChartFactsAt>, body: PlanetBody): PlanetPlacement {
  const planet = facts.planets.find((p) => p.body === body);
  if (!planet) throw new Error(`缺少 ${body}`);
  return planet;
}

function longitudeAt(tMs: number, body: PlanetBody, profile: AstroBirthProfile): number {
  return bodyLongitudesAt(tMs, profile.latitude, profile.longitude)[body];
}

function separationOf(a: number, b: number): number {
  const diff = Math.abs((((a - b) % 360) + 360) % 360);
  return diff > 180 ? 360 - diff : diff;
}

describe('金样：1995-10-08 14:30 上海（UTC 06:30）', () => {
  const facts = computeChartFactsAt(SAMPLE_ACCURATE, AT);

  it('十星体黄经与 Swiss Ephemeris 权威值一致（≤0.02°），且与旧冻结档案在交叉验证容差内（≤0.5°）', () => {
    for (const body of BODY_ORDER) {
      const restored = absoluteLongitude(planetOf(facts, body));
      expect(Math.abs(restored - SWISS_LONGITUDES[body]), `${body} 与权威星历偏差`).toBeLessThanOrEqual(0.02);
      expect(Math.abs(restored - LEGACY_LONGITUDES[body]), `${body} 与旧冻结档案偏差`).toBeLessThanOrEqual(0.5);
    }
  });

  it('逆行与四轴符合权威口径（水星、土星逆行；ASC/MC ≤0.05°）', () => {
    expect(planetOf(facts, 'mercury').retrograde).toBe(true);
    expect(planetOf(facts, 'saturn').retrograde).toBe(true);
    for (const body of BODY_ORDER.filter((b) => b !== 'mercury' && b !== 'saturn')) {
      expect(planetOf(facts, body).retrograde, `${body} 不应逆行`).toBe(false);
    }

    const asc = facts.angles.ascendant;
    const mc = facts.angles.midheaven;
    expect(asc.sign).toBe('aquarius');
    expect(Math.abs(asc.longitude! - SWISS_ASC)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(mc.longitude! - SWISS_MC)).toBeLessThanOrEqual(0.05);
    // 与旧档案的容差复核（票面口径：ASC/MC < 1°）
    expect(Math.abs(asc.longitude! - LEGACY_ASC)).toBeLessThanOrEqual(1);
    expect(Math.abs(mc.longitude! - LEGACY_MC)).toBeLessThanOrEqual(1);
  });

  it('宫制为 Placidus，十二宫头与权威星历一致（≤0.1°）', () => {
    expect(facts.houseSystem).toBe('placidus');
    expect(facts.dataCompleteness).toBe('with-houses');
    expect(facts.houses).toHaveLength(12);
    for (const house of facts.houses) {
      const restored = SIGN_ORDER.indexOf(house.sign as (typeof SIGN_ORDER)[number]) * 30 + house.cuspDegree;
      expect(Math.abs(restored - SWISS_CUSPS[house.number - 1]), `第 ${house.number} 宫头`).toBeLessThanOrEqual(0.1);
    }
    // 太阳落第 8 宫（Placidus 实证；整宫制会给出第 9 宫）
    expect(planetOf(facts, 'sun').house).toBe(8);
    expect(facts.factStability.note).toBeNull();
  });

  it('相位由同一组黄经按冻结容许度表推导，orbTableVersion 与口径锁定', () => {
    expect(facts.orbTableVersion).toBe(ORB_TABLE_VERSION);
    expect(ORB_TABLE).toEqual({ conjunction: 8, opposition: 8, square: 6, trine: 6, sextile: 4 });
    expect(facts.aspects.length).toBeGreaterThan(0);
    for (const aspect of facts.aspects) {
      expect(aspect.orb!).toBeLessThanOrEqual(ORB_TABLE[aspect.type]);
      expect(aspect.strength).toBeCloseTo(1 - aspect.orb! / ORB_TABLE[aspect.type], 3);
      expect(aspect.stability).toBe('stable');
    }
    const sunMoon = facts.aspects.find(
      (a) => a.source === 'sun' && a.target === 'moon' && a.type === 'opposition'
    );
    expect(sunMoon).toBeDefined();
    expect(sunMoon!.orb!).toBeLessThanOrEqual(ORB_TABLE.opposition);
  });

  it('事实层头部：引擎版本、黄道体系、元素齐全', () => {
    expect(facts.zodiacSystem).toBe('tropical');
    expect(facts.engineVersion).toBe(ENGINE_VERSION);
    expect(facts.planets).toHaveLength(10);
    expect(facts.calculationRevision).toMatch(/^astro-[0-9a-f]{8}$/);
    expect(facts.factStability.angles.displayable).toBe(true);
    expect(facts.factStability.aspects.displayable).toBe(true);
  });
});

describe('确定性与输入敏感性', () => {
  it('同一出生资料重复计算结果一致（本命盘部分；行运随计算时刻变化）', () => {
    const first = computeChartFactsAt(SAMPLE_ACCURATE, AT);
    const second = computeChartFactsAt(SAMPLE_ACCURATE, AT);
    expect(second).toEqual(first);

    const otherMoment = computeChartFactsAt(SAMPLE_ACCURATE, new Date('2026-09-23T12:00:00.000Z'));
    expect(natalOnly(otherMoment)).toEqual(natalOnly(first));
    expect(otherMoment.calculatedAt).not.toBe(first.calculatedAt);
    expect(otherMoment.transits).not.toEqual(first.transits); // 换一周 → 行运窗口不同
  });

  it('换出生日期 / 城市 / 时间，结果真实不同', () => {
    const base = computeChartFactsAt(SAMPLE_ACCURATE, AT);
    const nextDay = computeChartFactsAt(accurateProfileAt({ year: 1995, month: 10, day: 9 }, 14, 30), AT);
    const otherCity = computeChartFactsAt(
      accurateProfileAt({ year: 1995, month: 10, day: 8 }, 14, 30, {
        city: '北京',
        latitude: 39.9042,
        longitude: 116.4074,
      }),
      AT
    );
    const otherMinute = computeChartFactsAt(accurateProfileAt({ year: 1995, month: 10, day: 8 }, 14, 31), AT);

    expect(planetOf(nextDay, 'sun').degree).not.toBe(planetOf(base, 'sun').degree);
    expect(otherCity.angles.ascendant.longitude).not.toBe(base.angles.ascendant.longitude);
    expect(otherMinute.angles.ascendant.longitude).not.toBe(base.angles.ascendant.longitude);
    expect(nextDay.calculationRevision).not.toBe(base.calculationRevision);
  });
});

describe('时区与夏令时（IANA + Intl 口径）', () => {
  it('中国 1988 年夏令时：出生当地时间按 +9 换算', () => {
    const resolved = resolveProfileInstant(accurateProfileAt({ year: 1988, month: 7, day: 15 }, 12, 0));
    expect(resolved.offsetMinutes).toBe(540);
    expect(new Date(resolved.utcMs).toISOString()).toBe('1988-07-15T03:00:00.000Z');
  });

  it('中国 1988 年冬令时：出生当地时间按 +8 换算', () => {
    const resolved = resolveProfileInstant(accurateProfileAt({ year: 1988, month: 1, day: 15 }, 12, 0));
    expect(resolved.offsetMinutes).toBe(480);
    expect(new Date(resolved.utcMs).toISOString()).toBe('1988-01-15T04:00:00.000Z');
  });

  it('新疆城市按全国统一 Asia/Shanghai 口径换算（不被库内 tz-lookup 的 Asia/Urumqi 带偏）', () => {
    const kashgar = accurateProfileAt({ year: 1995, month: 10, day: 8 }, 14, 30, {
      city: '喀什',
      latitude: 39.4704,
      longitude: 75.9898,
    });
    const resolved = resolveProfileInstant(kashgar);
    // 若走库内 tz-lookup（Asia/Urumqi, +6）会得到 08:30Z；项目口径为 +8 → 06:30Z
    expect(resolved.offsetMinutes).toBe(480);
    expect(new Date(resolved.utcMs).toISOString()).toBe('1995-10-08T06:30:00.000Z');

    // 引擎把修正真正应用到了星历调用上：太阳黄经等于 06:30Z 实算值，而非 08:30Z
    const facts = computeChartFactsAt(kashgar, AT);
    const at0630 = bodyLongitudesAt(Date.UTC(1995, 9, 8, 6, 30), 39.4704, 75.9898);
    const at0830 = bodyLongitudesAt(Date.UTC(1995, 9, 8, 8, 30), 39.4704, 75.9898);
    expect(Math.abs(at0630.sun - at0830.sun)).toBeGreaterThan(0.05);
    expect(Math.abs(absoluteLongitude(planetOf(facts, 'sun')) - at0630.sun)).toBeLessThanOrEqual(0.01);
  });

  it('夏令时回拨的重复本地时刻：默认第一次出现，可按偏移或显式选择取第二次', () => {
    const base = accurateProfileAt({ year: 1988, month: 9, day: 11 }, 1, 30, {
      utcOffsetMinutes: null,
      localTimeDisambiguation: null,
    });
    const first = resolveProfileInstant(base);
    expect(first.ambiguous).toBe(true);
    expect(first.offsetMinutes).toBe(540);
    expect(new Date(first.utcMs).toISOString()).toBe('1988-09-10T16:30:00.000Z');

    const second = resolveProfileInstant({ ...base, localTimeDisambiguation: 'second' });
    expect(second.utcMs).toBeGreaterThan(first.utcMs);
    expect(second.offsetMinutes).toBe(480);
    expect(new Date(second.utcMs).toISOString()).toBe('1988-09-10T17:30:00.000Z');

    // 档案里记录的偏移也可辨认出现次序（表单在当日得到的偏移即当日实际偏移）
    const byOffset = resolveProfileInstant({ ...base, utcOffsetMinutes: 480 });
    expect(byOffset.utcMs).toBe(second.utcMs);
  });

  it('夏令时前拨不存在的本地时刻：容错解析到跳变后的时刻（表单层负责阻止提交）', () => {
    const resolved = resolveProfileInstant(accurateProfileAt({ year: 1988, month: 4, day: 17 }, 2, 30));
    expect(resolved.nonexistent).toBe(true);
    expect(new Date(resolved.utcMs).toISOString()).toBe('1988-04-16T18:30:00.000Z');
    expect(resolved.offsetMinutes).toBe(540);
  });

  it('约时与未知档的区间端点同样按 IANA 时区换算', () => {
    const interval = resolveProfileInterval(SAMPLE_APPROXIMATE);
    expect(new Date(interval.startMs).toISOString()).toBe('1995-10-08T05:00:00.000Z');
    expect(new Date(interval.endMs).toISOString()).toBe('1995-10-08T08:00:00.000Z');

    const day = resolveProfileCivilDay(SAMPLE_UNKNOWN);
    expect(new Date(day.startMs).toISOString()).toBe('1995-10-09T16:00:00.000Z');
    expect(new Date(day.endMs).toISOString()).toBe('1995-10-10T16:00:00.000Z');
  });
});

describe('大约时段：区间稳定性校验', () => {
  const facts = computeChartFactsAt(SAMPLE_APPROXIMATE, AT);

  it('3 小时时段角点不稳定 → 无宫位降级，不取中点补算', () => {
    expect(facts.dataCompleteness).toBe('without-houses');
    expect(facts.houseSystem).toBeNull();
    expect(facts.houses).toEqual([]);
    expect(facts.angles.ascendant.sign).toBeNull();
    expect(facts.angles.ascendant.degree).toBeNull();
    expect(facts.angles.ascendant.longitude).toBeNull();
    expect(facts.angles.ascendant.stability).toBe('unstable');
    expect(facts.factStability.angles.displayable).toBe(false);
    expect(facts.factStability.angles.reason).toBe('unstable-in-range');
    expect(facts.factStability.note).toContain('约时');
    for (const planet of facts.planets) {
      expect(planet.house, `${planet.body} 宫位`).toBeNull();
    }
  });

  it('度数稳定性三态：整度数稳定才展示度数（其余仅星座或隐藏）', () => {
    // 三小时窗口内：太阳/月亮/金星整度数跨边界（signOnly），其余星体稳定
    expect(planetOf(facts, 'sun')).toMatchObject({ sign: 'libra', degree: null, stability: 'signOnly' });
    expect(planetOf(facts, 'moon')).toMatchObject({ sign: 'aries', degree: null, stability: 'signOnly' });
    expect(planetOf(facts, 'venus')).toMatchObject({ sign: 'libra', degree: null, stability: 'signOnly' });
    expect(planetOf(facts, 'mercury')).toMatchObject({ sign: 'libra', degree: 8, stability: 'stable' });
    expect(planetOf(facts, 'mars')).toMatchObject({ sign: 'scorpio', degree: 21, stability: 'stable' });
    expect(planetOf(facts, 'jupiter')).toMatchObject({ sign: 'sagittarius', degree: 12, stability: 'stable' });

    // 不变量：stable 必有度数，signOnly/unstable 必无度数，unstable 连星座都为 null
    for (const planet of facts.planets) {
      if (planet.stability === 'stable') expect(planet.degree).not.toBeNull();
      else expect(planet.degree).toBeNull();
      if (planet.stability === 'unstable') expect(planet.sign).toBeNull();
      else expect(planet.sign).not.toBeNull();
    }
    expect(facts.factStability.placements.sun.displayable).toBe(true);
    expect(facts.factStability.placements.sun.detail).toContain('仅展示星座');
  });

  it('相位：区间分离角窗口全部落在容许度内才稳定', () => {
    expect(facts.aspects.length).toBeGreaterThan(0);
    expect(facts.aspects.every((a) => a.stability === 'stable')).toBe(true);
    for (const aspect of facts.aspects) {
      expect(aspect.orb).not.toBeNull();
      expect(aspect.orb!).toBeLessThanOrEqual(ORB_TABLE[aspect.type]);
    }
    expect(facts.factStability.aspects.detail).toContain('稳定的相位共');
  });

  it('区间足够短且角点稳定时按数据输出宫位（降级是数据驱动，不是按档位写死）', () => {
    const oneMinute: AstroBirthProfile = {
      ...SAMPLE_APPROXIMATE,
      timeRange: {
        localStart: '1995-10-08T14:30:00+08:00',
        localEnd: '1995-10-08T14:31:00+08:00',
        timezone: 'Asia/Shanghai',
      },
    };
    const short = computeChartFactsAt(oneMinute, AT);
    expect(short.angles.ascendant.stability).toBe('stable');
    expect(short.angles.ascendant.sign).toBe('aquarius');
    expect(short.dataCompleteness).toBe('with-houses');
    expect(short.houses).toHaveLength(12);
    expect(short.factStability.note).toBeNull();
    // 约时档展示整数度：太阳天秤 15°
    expect(planetOf(short, 'sun')).toMatchObject({ sign: 'libra', degree: 15, stability: 'stable' });
  });
});

describe('完全未知：民用日降级', () => {
  const facts = computeChartFactsAt(SAMPLE_UNKNOWN, AT);

  it('无宫位无四轴，度数一律为 null（不以 12:00 或中点补算）', () => {
    expect(facts.dataCompleteness).toBe('without-houses');
    expect(facts.houseSystem).toBeNull();
    expect(facts.houses).toEqual([]);
    expect(facts.angles.ascendant.longitude).toBeNull();
    expect(facts.angles.midheaven.longitude).toBeNull();
    expect(facts.factStability.angles.reason).toBe('time-unknown');
    expect(facts.factStability.houses.reason).toBe('time-unknown');
    for (const planet of facts.planets) {
      expect(planet.degree, `${planet.body} 度数`).toBeNull();
      expect(planet.house, `${planet.body} 宫位`).toBeNull();
    }
  });

  it('月亮当日跨座（白羊→金牛）整颗隐藏，字段全为 null', () => {
    const moon = planetOf(facts, 'moon');
    expect(moon.sign).toBeNull();
    expect(moon.degree).toBeNull();
    expect(moon.retrograde).toBeNull();
    expect(moon.stability).toBe('unstable');
    expect(facts.factStability.placements.moon.displayable).toBe(false);
    expect(facts.factStability.placements.moon.reason).toBe('time-unknown');
    // 金星同日也跨座（天秤→天蝎）
    expect(planetOf(facts, 'venus').sign).toBeNull();
  });

  it('整日星座稳定的星体保留星座（signOnly），逆行状态可用', () => {
    const sun = planetOf(facts, 'sun');
    expect(sun).toMatchObject({ sign: 'libra', degree: null, stability: 'signOnly' });
    expect(sun.retrograde).toBe(false);
    expect(planetOf(facts, 'mercury').retrograde).toBe(true);
    expect(facts.factStability.placements.sun.detail).toContain('度数不展示');
  });

  it('月亮不跨座的日子保留月亮星座（对照）', () => {
    const stable = computeChartFactsAt(UNKNOWN_MOON_STABLE, AT);
    const moon = planetOf(stable, 'moon');
    expect(moon.sign).toBe('aries');
    expect(moon.degree).toBeNull();
    expect(moon.stability).toBe('signOnly');
    expect(stable.factStability.placements.moon.displayable).toBe(true);
  });

  it('台账与展示一致：整日稳定的外行星不得被标成「当日跨星座」', () => {
    // 快星体的三态之外还有一态：未知档整日稳定（无度数需求）的慢星体 —— 展示星座，台账也必须承认可展示
    const jupiter = planetOf(facts, 'jupiter');
    expect(jupiter).toMatchObject({ sign: 'sagittarius', degree: null, stability: 'stable' });
    expect(facts.factStability.placements.jupiter).toMatchObject({ displayable: true, reason: null });
    expect(facts.factStability.placements.jupiter.detail).not.toContain('跨星座');
    expect(facts.factStability.placements.jupiter.detail).toContain('时间未知档不展示度数');

    // 不变量：displayable 恒等于「星座可展示」，隐藏项的 detail 说明跨座原因
    for (const planet of facts.planets) {
      const ledger = facts.factStability.placements[planet.body];
      expect(ledger.displayable, `${planet.body} 台账与展示不一致`).toBe(planet.sign !== null);
      if (planet.sign === null) expect(ledger.detail).toContain('跨星座');
    }
  });

  it('跨容许度窗口的相位为不稳定（orb/strength 为 null）', () => {
    const stable = facts.aspects.filter((a) => a.stability === 'stable');
    const unstable = facts.aspects.filter((a) => a.stability === 'unstable');
    expect(stable.length).toBeGreaterThan(0);
    expect(unstable.length).toBeGreaterThan(0);
    for (const aspect of stable) {
      expect(aspect.orb).not.toBeNull();
    }
    for (const aspect of unstable) {
      expect(aspect.orb).toBeNull();
      expect(aspect.strength).toBeNull();
    }
  });
});

describe('高纬 Placidus 失效回退整宫制', () => {
  it('高纬出生地：宫头顺序无法闭合 → 回退整宫制并在事实层标注', () => {
    const facts = computeChartFactsAt(HIGH_LATITUDE, AT);
    expect(facts.houseSystem).toBe('whole-sign');
    expect(facts.dataCompleteness).toBe('with-houses');
    expect(facts.houses).toHaveLength(12);
    expect(facts.houses.every((h) => h.cuspDegree === 0)).toBe(true);
    expect(facts.houses[0].sign).toBe(facts.angles.ascendant.sign);
    expect(facts.factStability.note).toContain('普拉西德制');
    expect(facts.factStability.note).toContain('回退整宫制');
    expect(facts.factStability.houses.detail).toContain('回退整宫制');
    // 四轴与星体落点不受宫制回退影响，仍完整可展示
    expect(facts.angles.ascendant.stability).toBe('stable');
    expect(planetOf(facts, 'sun').stability).toBe('stable');
  });

  it('中纬出生地：Placidus 有效，宫头为非零真实度数', () => {
    const facts = computeChartFactsAt(SAMPLE_ACCURATE, AT);
    expect(facts.houseSystem).toBe('placidus');
    expect(facts.houses.some((h) => h.cuspDegree > 0)).toBe(true);
    expect(facts.factStability.note).toBeNull();
  });

  it('宫头有效性判定：缺失/非有限/顺序倒挂都视为失效', () => {
    expect(placidusCuspsValid(null)).toBe(false);
    expect(placidusCuspsValid([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330])).toBe(true);
    expect(placidusCuspsValid([0, 30, 60, 90, 120, 150, NaN, 210, 240, 270, 300, 330])).toBe(false);
    expect(placidusCuspsValid([0, 30, 60, 90, 120, 150, 140, 210, 240, 270, 300, 330])).toBe(false);
    expect(placidusCuspsValid([0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300])).toBe(false);
  });
});

describe('行运：自然周窗口与相位筛选', () => {
  it('自然周窗口为周一 00:00 UTC 起（半开区间）', () => {
    const bounds = startOfNaturalWeekUtc(Date.UTC(2026, 8, 16, 12, 0, 0));
    expect(new Date(bounds.startMs).toISOString()).toBe('2026-09-14T00:00:00.000Z');
    expect(new Date(bounds.endMs).toISOString()).toBe('2026-09-21T00:00:00.000Z');
    const monday = startOfNaturalWeekUtc(Date.UTC(2026, 8, 14, 0, 0, 0));
    expect(monday.startMs).toBe(bounds.startMs);
    const sunday = startOfNaturalWeekUtc(Date.UTC(2026, 8, 20, 23, 59, 59));
    expect(sunday.startMs).toBe(bounds.startMs);
    const nextMonday = startOfNaturalWeekUtc(Date.UTC(2026, 8, 21, 0, 0, 0));
    expect(nextMonday.startMs).toBe(bounds.endMs);
  });

  it('准确档产出 TransitFact[]，结构与设计文档 §9.3 一致且落在窗口内', () => {
    const facts = computeChartFactsAt(SAMPLE_ACCURATE, AT);
    const bounds = startOfNaturalWeekUtc(AT.getTime());
    expect(facts.transits.length).toBeGreaterThan(0);
    for (const transit of facts.transits) {
      const startsAt = Date.parse(transit.startsAt);
      const endsAt = Date.parse(transit.endsAt);
      expect(startsAt).toBeGreaterThanOrEqual(bounds.startMs);
      expect(endsAt).toBeLessThanOrEqual(bounds.endMs);
      expect(endsAt).toBeGreaterThan(startsAt);
      expect(BODY_ORDER).toContain(transit.transitingBody);
      expect(BODY_ORDER).toContain(transit.natalTarget);
      expect(Object.keys(ORB_TABLE)).toContain(transit.aspect);
      expect(transit.theme.length).toBeGreaterThan(0);
    }
  });

  it('每条行运的时段与真实星象一致：区间内成相、区间外脱相（窗口裁切除外）', () => {
    const facts = computeChartFactsAt(SAMPLE_ACCURATE, AT);
    const bounds = startOfNaturalWeekUtc(AT.getTime());
    const natal = Object.fromEntries(
      facts.planets.map((planet) => [planet.body, absoluteLongitude(planet)])
    ) as Record<PlanetBody, number>;
    const idealOf: Record<string, number> = {
      conjunction: 0,
      sextile: 60,
      square: 90,
      trine: 120,
      opposition: 180,
    };

    for (const transit of facts.transits) {
      const startsAt = Date.parse(transit.startsAt);
      const endsAt = Date.parse(transit.endsAt);
      const ideal = idealOf[transit.aspect];
      const orb = ORB_TABLE[transit.aspect as AspectType];
      const label = `${transit.transitingBody}-${transit.natalTarget}-${transit.aspect}`;
      const separationAt = (tMs: number) =>
        separationOf(longitudeAt(tMs, transit.transitingBody, SAMPLE_ACCURATE), natal[transit.natalTarget]);

      expect(Math.abs(separationAt((startsAt + endsAt) / 2) - ideal), `${label} 时窗内`).toBeLessThanOrEqual(
        orb + 0.05
      );
      if (startsAt > bounds.startMs) {
        expect(
          Math.abs(separationAt(startsAt - 3 * 3600000) - ideal),
          `${label} 时窗前`
        ).toBeGreaterThan(orb - 0.05);
      }
      if (endsAt < bounds.endMs) {
        expect(Math.abs(separationAt(endsAt + 3 * 3600000) - ideal), `${label} 时窗后`).toBeGreaterThan(
          orb - 0.05
        );
      }
    }
  });

  it('粗采样不丢窗口：与 1 小时细粒度扫描的结果集完全一致（日月为行运目标）', () => {
    const bounds = startOfNaturalWeekUtc(AT.getTime());
    const natal = { sun: 194.5079, moon: 9.7897 };
    const transits = computeTransitFacts(natal, SAMPLE_ACCURATE, AT);

    const idealOf: Record<string, number> = {
      conjunction: 0,
      sextile: 60,
      square: 90,
      trine: 120,
      opposition: 180,
    };
    const fineActive = new Set<string>();
    for (let tMs = bounds.startMs; tMs <= bounds.endMs; tMs += 3600000) {
      const longitudes = bodyLongitudesAt(tMs, SAMPLE_ACCURATE.latitude, SAMPLE_ACCURATE.longitude);
      for (const body of BODY_ORDER) {
        for (const [target, natalLongitude] of Object.entries(natal)) {
          for (const [aspect, ideal] of Object.entries(idealOf)) {
            const orb = ORB_TABLE[aspect as AspectType];
            if (Math.abs(separationOf(longitudes[body], natalLongitude) - ideal) <= orb) {
              fineActive.add(`${body}|${target}|${aspect}`);
            }
          }
        }
      }
    }

    const coarseActive = new Set(transits.map((t) => `${t.transitingBody}|${t.natalTarget}|${t.aspect}`));
    expect([...coarseActive].sort()).toEqual([...fineActive].sort());
  });

  it('约时档只对度数稳定的本命星体产出行运；未知档不产出行运', () => {
    const approximate = computeChartFactsAt(SAMPLE_APPROXIMATE, AT);
    const stableBodies = new Set(
      approximate.planets.filter((p) => p.stability === 'stable').map((p) => p.body)
    );
    expect(stableBodies.size).toBeGreaterThan(0);
    expect(stableBodies.size).toBeLessThan(10);
    expect(approximate.transits.length).toBeGreaterThan(0);
    for (const transit of approximate.transits) {
      expect(
        stableBodies.has(transit.natalTarget),
        `${transit.natalTarget} 非稳定落点不应作为行运目标`
      ).toBe(true);
    }

    const unknown = computeChartFactsAt(SAMPLE_UNKNOWN, AT);
    expect(unknown.transits).toEqual([]);
  });

  it('collectInOrbSpans 纯函数：进出边界、短窗口、窗口裁切', () => {
    const bounds = { startMs: 0, endMs: 7 * DAY_MS };
    // 全程在容差内 → 整个窗口
    expect(
      collectInOrbSpans(
        [
          { tMs: 0, delta: 1 },
          { tMs: 7 * DAY_MS, delta: 2 },
        ],
        4,
        bounds
      )
    ).toEqual([{ startMs: 0, endMs: 7 * DAY_MS }]);

    // 中途进入（10 → -2 在 +4 处入相）、次日脱相（-2 → -10 在 -4 处脱相）
    const spans = collectInOrbSpans(
      [
        { tMs: 0, delta: 10 },
        { tMs: DAY_MS, delta: -2 },
        { tMs: 2 * DAY_MS, delta: -10 },
      ],
      4,
      bounds
    );
    expect(spans).toHaveLength(1);
    expect(Math.abs(spans[0].startMs - DAY_MS / 2)).toBeLessThan(60000); // (4-10)/(-2-10) = 0.5 天
    expect(Math.abs(spans[0].endMs - 1.25 * DAY_MS)).toBeLessThan(60000); // (-4+2)/(-10+2) = 0.25 天

    // 两端都在容差外但中途精确成相 → 短窗口（-9 → 9，穿越 -4 / 0 / +4）
    const shortSpans = collectInOrbSpans(
      [
        { tMs: 0, delta: -9 },
        { tMs: DAY_MS, delta: 9 },
      ],
      4,
      bounds
    );
    expect(shortSpans).toHaveLength(1);
    expect(Math.abs(shortSpans[0].startMs - (DAY_MS * 5) / 18)).toBeLessThan(60000);
    expect(Math.abs(shortSpans[0].endMs - (DAY_MS * 13) / 18)).toBeLessThan(60000);

    // 边界落在窗口外的部分被裁掉
    const clipped = collectInOrbSpans(
      [
        { tMs: -DAY_MS, delta: 10 },
        { tMs: 2 * DAY_MS, delta: -10 },
      ],
      4,
      bounds
    );
    expect(clipped).toHaveLength(1);
    expect(clipped[0].startMs).toBe(0);
    expect(Math.abs(clipped[0].endMs - 1.1 * DAY_MS)).toBeLessThan(60000);
    expect(clipped.every((span) => span.startMs >= bounds.startMs && span.endMs <= bounds.endMs)).toBe(true);
  });
});
