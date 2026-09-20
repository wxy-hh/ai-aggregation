/**
 * sample-chart.ts —— 星座寰宇 · 示例盘冻结档案（★ 客户端安全：纯数据，不含星历库 ★）
 *
 * 示例盘 = 真实计算域（./chart-engine.ts，仅服务端）对下方固定虚拟档案的真实产出，
 * 由 scripts/freeze-sample-chart.mjs 计算后写入「冻结数据块」，保证入口首页示例与真实产出同口径。
 *
 * 重新冻结：node scripts/freeze-sample-chart.mjs --write
 * 权威核对：1995-10-08 14:30 上海（UTC 06:30）的十星体黄经 / 四轴 / Placidus 宫头已与
 * Swiss Ephemeris（Astrodienst 口径：地心视位置、回归黄道、当日分点）逐项核对，
 * 核对值与容差记录在 SAMPLE_CHART_ANCHOR。
 *
 * 三份档案对应三档时间精度（与出生档案一一对应）：
 * - accurate：1995-10-08 14:30 上海 —— 完整盘（Placidus 宫位 + 四轴）
 * - approximate：1995-10-08 [13:00, 16:00) 上海 —— 区间稳定性校验后的无宫位盘
 * - unknown：1995-10-10 上海民用日 —— 无宫位无四轴；该日月亮白羊→金牛跨座，锁定隐藏规则
 *
 * 注意：示例盘为冻结的「本命盘」档案，transits 为空数组；行运随请求时刻变化，由计算域实时产出。
 */

import type { AstrologyChartFacts, AstroBirthProfile, PlanetBody, TimePrecision } from './chart-facts';

/** 示例盘档案：准确到分钟（1995-10-08 14:30 上海） */
export const SAMPLE_PROFILE_ACCURATE: AstroBirthProfile = {
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

/** 约时档案：大约时段 [13:00, 16:00)（同一天，演示区间稳定性校验） */
export const SAMPLE_PROFILE_APPROXIMATE: AstroBirthProfile = {
  name: null,
  birthDate: { year: 1995, month: 10, day: 8 },
  birthTime: null,
  timeRange: {
    localStart: '1995-10-08T13:00:00+08:00',
    localEnd: '1995-10-08T16:00:00+08:00',
    timezone: 'Asia/Shanghai',
  },
  timePrecision: 'approximate',
  city: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  utcOffsetMinutes: 480,
  localTimeDisambiguation: null,
  tzdbVersion: 'tzdata2025a',
};

/** 未知时间档案：1995-10-10 上海（该日月亮白羊→金牛跨座，锁定「跨座隐藏」规则） */
export const SAMPLE_PROFILE_UNKNOWN: AstroBirthProfile = {
  name: null,
  birthDate: { year: 1995, month: 10, day: 10 },
  birthTime: null,
  timeRange: null,
  timePrecision: 'unknown',
  city: '上海',
  latitude: 31.2304,
  longitude: 121.4737,
  timezone: 'Asia/Shanghai',
  utcOffsetMinutes: null,
  localTimeDisambiguation: null,
  tzdbVersion: 'tzdata2025a',
};

/**
 * 权威核对锚点：1995-10-08 14:30 上海（UTC 06:30，31.2304N / 121.4737E）。
 * swiss* 为 Swiss Ephemeris 值，tolerance* 为核对时认定的最大允许偏差
 * （新引擎实测偏差：行星 ≤0.01°、四轴 ≤0.003°、Placidus 宫头 ≤0.06°）。
 */
export const SAMPLE_CHART_ANCHOR = {
  utc: '1995-10-08T06:30:00.000Z',
  swiss: {
    longitudes: {
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
    } as Record<PlanetBody, number>,
    ascendant: 312.1526,
    midheaven: 237.6683,
    cusps: [
      312.1526, 353.9258, 29.8235, 57.6683, 81.172, 104.3901, 132.1526, 173.9258, 209.8235, 237.6683,
      261.172, 284.3901,
    ],
  },
  tolerance: { longitude: 0.02, angle: 0.05, cusp: 0.1 },
  /** 交叉验证第二参照：旧冻结档案（Schlyter 低精度算法，2026-08-31 冻结） */
  legacy: {
    longitudes: {
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
    } as Record<PlanetBody, number>,
    ascendant: 312.149,
    midheaven: 237.6668,
  },
  toleranceLegacy: { longitude: 0.5, angle: 1 },
} as const;

/* ======== 冻结数据块（由 scripts/freeze-sample-chart.mjs --write 生成，勿手改） ======== */

/** 冻结档案元信息（生成方式、引擎与口径版本） */
export const SAMPLE_CHART_META = {
  generatedBy: 'node scripts/freeze-sample-chart.mjs --write',
  frozenAt: '2026-09-20T00:00:00.000Z',
  engineVersion: 'astro-engine-1.0.0+chjs1.1.0',
  orbTableVersion: '2026-07-26-v1',
} as const;

/** 准确到分钟：完整盘（Placidus 宫位 + 四轴） */
export const SAMPLE_CHART_ACCURATE: AstrologyChartFacts = {
  "zodiacSystem": "tropical",
  "calculatedAt": "2026-09-20T00:00:00.000Z",
  "engineVersion": "astro-engine-1.0.0+chjs1.1.0",
  "orbTableVersion": "2026-07-26-v1",
  "calculationRevision": "astro-7cbb4152",
  "transits": [],
  "houseSystem": "placidus",
  "dataCompleteness": "with-houses",
  "planets": [
    {
      "body": "sun",
      "sign": "libra",
      "degree": 14.5079,
      "house": 8,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "moon",
      "sign": "aries",
      "degree": 9.7897,
      "house": 2,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "mercury",
      "sign": "libra",
      "degree": 7.889,
      "house": 8,
      "retrograde": true,
      "stability": "stable"
    },
    {
      "body": "venus",
      "sign": "libra",
      "degree": 27.4429,
      "house": 8,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "mars",
      "sign": "scorpio",
      "degree": 21.0816,
      "house": 9,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "jupiter",
      "sign": "sagittarius",
      "degree": 11.6257,
      "house": 10,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "saturn",
      "sign": "pisces",
      "degree": 19.6048,
      "house": 1,
      "retrograde": true,
      "stability": "stable"
    },
    {
      "body": "uranus",
      "sign": "capricorn",
      "degree": 26.5272,
      "house": 12,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "neptune",
      "sign": "capricorn",
      "degree": 22.7769,
      "house": 12,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "pluto",
      "sign": "scorpio",
      "degree": 28.8049,
      "house": 10,
      "retrograde": false,
      "stability": "stable"
    }
  ],
  "angles": {
    "ascendant": {
      "point": "ascendant",
      "sign": "aquarius",
      "degree": 12.1512,
      "longitude": 312.1512,
      "stability": "stable"
    },
    "midheaven": {
      "point": "midheaven",
      "sign": "scorpio",
      "degree": 27.6663,
      "longitude": 237.6663,
      "stability": "stable"
    }
  },
  "houses": [
    {
      "number": 1,
      "sign": "aquarius",
      "cuspDegree": 12.1512,
      "stability": "stable"
    },
    {
      "number": 2,
      "sign": "pisces",
      "cuspDegree": 23.9236,
      "stability": "stable"
    },
    {
      "number": 3,
      "sign": "aries",
      "cuspDegree": 29.8152,
      "stability": "stable"
    },
    {
      "number": 4,
      "sign": "taurus",
      "cuspDegree": 27.6663,
      "stability": "stable"
    },
    {
      "number": 5,
      "sign": "gemini",
      "cuspDegree": 21.2168,
      "stability": "stable"
    },
    {
      "number": 6,
      "sign": "cancer",
      "cuspDegree": 14.4473,
      "stability": "stable"
    },
    {
      "number": 7,
      "sign": "leo",
      "cuspDegree": 12.1512,
      "stability": "stable"
    },
    {
      "number": 8,
      "sign": "virgo",
      "cuspDegree": 23.9236,
      "stability": "stable"
    },
    {
      "number": 9,
      "sign": "libra",
      "cuspDegree": 29.8152,
      "stability": "stable"
    },
    {
      "number": 10,
      "sign": "scorpio",
      "cuspDegree": 27.6663,
      "stability": "stable"
    },
    {
      "number": 11,
      "sign": "sagittarius",
      "cuspDegree": 21.2168,
      "stability": "stable"
    },
    {
      "number": 12,
      "sign": "capricorn",
      "cuspDegree": 14.4473,
      "stability": "stable"
    }
  ],
  "aspects": [
    {
      "source": "sun",
      "target": "moon",
      "type": "opposition",
      "orb": 4.7182,
      "strength": 0.41,
      "stability": "stable"
    },
    {
      "source": "sun",
      "target": "mercury",
      "type": "conjunction",
      "orb": 6.6189,
      "strength": 0.173,
      "stability": "stable"
    },
    {
      "source": "sun",
      "target": "jupiter",
      "type": "sextile",
      "orb": 2.8822,
      "strength": 0.279,
      "stability": "stable"
    },
    {
      "source": "moon",
      "target": "mercury",
      "type": "opposition",
      "orb": 1.9007,
      "strength": 0.762,
      "stability": "stable"
    },
    {
      "source": "moon",
      "target": "jupiter",
      "type": "trine",
      "orb": 1.836,
      "strength": 0.694,
      "stability": "stable"
    },
    {
      "source": "mercury",
      "target": "jupiter",
      "type": "sextile",
      "orb": 3.7367,
      "strength": 0.066,
      "stability": "stable"
    },
    {
      "source": "venus",
      "target": "uranus",
      "type": "square",
      "orb": 0.9157,
      "strength": 0.847,
      "stability": "stable"
    },
    {
      "source": "venus",
      "target": "neptune",
      "type": "square",
      "orb": 4.666,
      "strength": 0.222,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "saturn",
      "type": "trine",
      "orb": 1.4768,
      "strength": 0.754,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "neptune",
      "type": "sextile",
      "orb": 1.6953,
      "strength": 0.576,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "pluto",
      "type": "conjunction",
      "orb": 7.7233,
      "strength": 0.035,
      "stability": "stable"
    },
    {
      "source": "saturn",
      "target": "neptune",
      "type": "sextile",
      "orb": 3.1721,
      "strength": 0.207,
      "stability": "stable"
    },
    {
      "source": "uranus",
      "target": "neptune",
      "type": "conjunction",
      "orb": 3.7503,
      "strength": 0.531,
      "stability": "stable"
    },
    {
      "source": "uranus",
      "target": "pluto",
      "type": "sextile",
      "orb": 2.2777,
      "strength": 0.431,
      "stability": "stable"
    }
  ],
  "factStability": {
    "angles": {
      "displayable": true,
      "reason": null,
      "detail": null
    },
    "houses": {
      "displayable": true,
      "reason": null,
      "detail": null
    },
    "placements": {
      "sun": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "moon": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "mercury": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "venus": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "mars": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "jupiter": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "saturn": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "uranus": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "neptune": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "pluto": {
        "displayable": true,
        "reason": null,
        "detail": null
      }
    },
    "aspects": {
      "displayable": true,
      "reason": null,
      "detail": null
    },
    "note": null
  }
};

/** 大约时段：区间稳定性校验后的降级盘（无宫位；度数不稳定者仅展示星座） */
export const SAMPLE_CHART_APPROXIMATE: AstrologyChartFacts = {
  "zodiacSystem": "tropical",
  "calculatedAt": "2026-09-20T00:00:00.000Z",
  "engineVersion": "astro-engine-1.0.0+chjs1.1.0",
  "orbTableVersion": "2026-07-26-v1",
  "calculationRevision": "astro-9a550585",
  "transits": [],
  "houseSystem": null,
  "dataCompleteness": "without-houses",
  "planets": [
    {
      "body": "sun",
      "sign": "libra",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "signOnly"
    },
    {
      "body": "moon",
      "sign": "aries",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "signOnly"
    },
    {
      "body": "mercury",
      "sign": "libra",
      "degree": 8,
      "house": null,
      "retrograde": true,
      "stability": "stable"
    },
    {
      "body": "venus",
      "sign": "libra",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "signOnly"
    },
    {
      "body": "mars",
      "sign": "scorpio",
      "degree": 21,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "jupiter",
      "sign": "sagittarius",
      "degree": 12,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "saturn",
      "sign": "pisces",
      "degree": 20,
      "house": null,
      "retrograde": true,
      "stability": "stable"
    },
    {
      "body": "uranus",
      "sign": "capricorn",
      "degree": 27,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "neptune",
      "sign": "capricorn",
      "degree": 23,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "pluto",
      "sign": "scorpio",
      "degree": 29,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    }
  ],
  "angles": {
    "ascendant": {
      "point": "ascendant",
      "sign": null,
      "degree": null,
      "longitude": null,
      "stability": "unstable"
    },
    "midheaven": {
      "point": "midheaven",
      "sign": null,
      "degree": null,
      "longitude": null,
      "stability": "unstable"
    }
  },
  "houses": [],
  "aspects": [
    {
      "source": "sun",
      "target": "moon",
      "type": "opposition",
      "orb": 4.7182,
      "strength": 0.41,
      "stability": "stable"
    },
    {
      "source": "sun",
      "target": "mercury",
      "type": "conjunction",
      "orb": 6.6189,
      "strength": 0.173,
      "stability": "stable"
    },
    {
      "source": "sun",
      "target": "jupiter",
      "type": "sextile",
      "orb": 2.8822,
      "strength": 0.279,
      "stability": "stable"
    },
    {
      "source": "moon",
      "target": "mercury",
      "type": "opposition",
      "orb": 1.9007,
      "strength": 0.762,
      "stability": "stable"
    },
    {
      "source": "moon",
      "target": "jupiter",
      "type": "trine",
      "orb": 1.836,
      "strength": 0.694,
      "stability": "stable"
    },
    {
      "source": "mercury",
      "target": "jupiter",
      "type": "sextile",
      "orb": 3.7367,
      "strength": 0.066,
      "stability": "stable"
    },
    {
      "source": "venus",
      "target": "uranus",
      "type": "square",
      "orb": 0.9157,
      "strength": 0.847,
      "stability": "stable"
    },
    {
      "source": "venus",
      "target": "neptune",
      "type": "square",
      "orb": 4.666,
      "strength": 0.222,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "saturn",
      "type": "trine",
      "orb": 1.4768,
      "strength": 0.754,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "neptune",
      "type": "sextile",
      "orb": 1.6953,
      "strength": 0.576,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "pluto",
      "type": "conjunction",
      "orb": 7.7233,
      "strength": 0.035,
      "stability": "stable"
    },
    {
      "source": "saturn",
      "target": "neptune",
      "type": "sextile",
      "orb": 3.1721,
      "strength": 0.207,
      "stability": "stable"
    },
    {
      "source": "uranus",
      "target": "neptune",
      "type": "conjunction",
      "orb": 3.7503,
      "strength": 0.531,
      "stability": "stable"
    },
    {
      "source": "uranus",
      "target": "pluto",
      "type": "sextile",
      "orb": 2.2777,
      "strength": 0.431,
      "stability": "stable"
    }
  ],
  "factStability": {
    "angles": {
      "displayable": false,
      "reason": "unstable-in-range",
      "detail": "上升与天顶在所选时段内不稳定（文档 §9.2）"
    },
    "houses": {
      "displayable": false,
      "reason": "unstable-in-range",
      "detail": "上升不稳定，宫位无法确定，已按无宫位范围降级（文档 §6.2）"
    },
    "placements": {
      "sun": {
        "displayable": true,
        "reason": null,
        "detail": "该星体在所选时段内度数不稳定，仅展示星座"
      },
      "moon": {
        "displayable": true,
        "reason": null,
        "detail": "该星体在所选时段内度数不稳定，仅展示星座"
      },
      "mercury": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "venus": {
        "displayable": true,
        "reason": null,
        "detail": "该星体在所选时段内度数不稳定，仅展示星座"
      },
      "mars": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "jupiter": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "saturn": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "uranus": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "neptune": {
        "displayable": true,
        "reason": null,
        "detail": null
      },
      "pluto": {
        "displayable": true,
        "reason": null,
        "detail": null
      }
    },
    "aspects": {
      "displayable": true,
      "reason": null,
      "detail": "区间内成相且稳定的相位共 14 条"
    },
    "note": "约时：上升、天顶与宫位在所选时段内不稳定，已按无宫位范围展示；部分星体度数不稳定，仅展示星座"
  }
};

/** 完全未知：无宫位无四轴降级盘（仅整日稳定的星座与主要相位） */
export const SAMPLE_CHART_UNKNOWN: AstrologyChartFacts = {
  "zodiacSystem": "tropical",
  "calculatedAt": "2026-09-20T00:00:00.000Z",
  "engineVersion": "astro-engine-1.0.0+chjs1.1.0",
  "orbTableVersion": "2026-07-26-v1",
  "calculationRevision": "astro-798432f6",
  "transits": [],
  "houseSystem": null,
  "dataCompleteness": "without-houses",
  "planets": [
    {
      "body": "sun",
      "sign": "libra",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "signOnly"
    },
    {
      "body": "moon",
      "sign": null,
      "degree": null,
      "house": null,
      "retrograde": null,
      "stability": "unstable"
    },
    {
      "body": "mercury",
      "sign": "libra",
      "degree": null,
      "house": null,
      "retrograde": true,
      "stability": "signOnly"
    },
    {
      "body": "venus",
      "sign": null,
      "degree": null,
      "house": null,
      "retrograde": null,
      "stability": "unstable"
    },
    {
      "body": "mars",
      "sign": "scorpio",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "signOnly"
    },
    {
      "body": "jupiter",
      "sign": "sagittarius",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "saturn",
      "sign": "pisces",
      "degree": null,
      "house": null,
      "retrograde": true,
      "stability": "signOnly"
    },
    {
      "body": "uranus",
      "sign": "capricorn",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "neptune",
      "sign": "capricorn",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    },
    {
      "body": "pluto",
      "sign": "scorpio",
      "degree": null,
      "house": null,
      "retrograde": false,
      "stability": "stable"
    }
  ],
  "angles": {
    "ascendant": {
      "point": "ascendant",
      "sign": null,
      "degree": null,
      "longitude": null,
      "stability": "unstable"
    },
    "midheaven": {
      "point": "midheaven",
      "sign": null,
      "degree": null,
      "longitude": null,
      "stability": "unstable"
    }
  },
  "houses": [],
  "aspects": [
    {
      "source": "sun",
      "target": "neptune",
      "type": "square",
      "orb": null,
      "strength": null,
      "stability": "unstable"
    },
    {
      "source": "moon",
      "target": "venus",
      "type": "opposition",
      "orb": null,
      "strength": null,
      "stability": "unstable"
    },
    {
      "source": "moon",
      "target": "uranus",
      "type": "square",
      "orb": null,
      "strength": null,
      "stability": "unstable"
    },
    {
      "source": "moon",
      "target": "neptune",
      "type": "square",
      "orb": null,
      "strength": null,
      "stability": "unstable"
    },
    {
      "source": "venus",
      "target": "uranus",
      "type": "square",
      "orb": 3.2704,
      "strength": 0.455,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "saturn",
      "type": "trine",
      "orb": 2.9289,
      "strength": 0.512,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "uranus",
      "type": "sextile",
      "orb": null,
      "strength": null,
      "stability": "unstable"
    },
    {
      "source": "mars",
      "target": "neptune",
      "type": "sextile",
      "orb": 0.3707,
      "strength": 0.907,
      "stability": "stable"
    },
    {
      "source": "mars",
      "target": "pluto",
      "type": "conjunction",
      "orb": 6.4532,
      "strength": 0.193,
      "stability": "stable"
    },
    {
      "source": "saturn",
      "target": "neptune",
      "type": "sextile",
      "orb": 3.2996,
      "strength": 0.175,
      "stability": "stable"
    },
    {
      "source": "uranus",
      "target": "neptune",
      "type": "conjunction",
      "orb": 3.7503,
      "strength": 0.531,
      "stability": "stable"
    },
    {
      "source": "uranus",
      "target": "pluto",
      "type": "sextile",
      "orb": 2.3322,
      "strength": 0.417,
      "stability": "stable"
    }
  ],
  "factStability": {
    "angles": {
      "displayable": false,
      "reason": "time-unknown",
      "detail": "出生时间未知，不计算上升与天顶（文档 §9.2）"
    },
    "houses": {
      "displayable": false,
      "reason": "time-unknown",
      "detail": "出生时间未知，不计算十二宫（文档 §9.2）"
    },
    "placements": {
      "sun": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座在整日内稳定，度数不展示"
      },
      "moon": {
        "displayable": false,
        "reason": "time-unknown",
        "detail": "该星体在当日跨星座，当前资料无法确定"
      },
      "mercury": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座在整日内稳定，度数不展示"
      },
      "venus": {
        "displayable": false,
        "reason": "time-unknown",
        "detail": "该星体在当日跨星座，当前资料无法确定"
      },
      "mars": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座在整日内稳定，度数不展示"
      },
      "jupiter": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座与整度数在当日稳定；时间未知档不展示度数"
      },
      "saturn": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座在整日内稳定，度数不展示"
      },
      "uranus": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座与整度数在当日稳定；时间未知档不展示度数"
      },
      "neptune": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座与整度数在当日稳定；时间未知档不展示度数"
      },
      "pluto": {
        "displayable": true,
        "reason": null,
        "detail": "该星体星座与整度数在当日稳定；时间未知档不展示度数"
      }
    },
    "aspects": {
      "displayable": true,
      "reason": null,
      "detail": "整日内成相且稳定的相位共 7 条"
    },
    "note": "出生时间未知：未计算上升、天顶与宫位；仅展示整日内稳定的星体星座与主要相位"
  }
};
/* ======== 冻结数据块结束 ======== */

/** 按时间精度取冻结示例盘（mock 与预览盘共用） */
export const SAMPLE_CHART_BY_PRECISION: Record<TimePrecision, AstrologyChartFacts> = {
  accurate: SAMPLE_CHART_ACCURATE,
  approximate: SAMPLE_CHART_APPROXIMATE,
  unknown: SAMPLE_CHART_UNKNOWN,
};
