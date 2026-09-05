/**
 * mock-chart-facts.ts —— 星座寰宇 · 占星真值计算域 mock 实现（前端先行期）
 *
 * 接缝接口：computeChartFacts(profile: AstroBirthProfile): AstrologyChartFacts
 * （类型与接口见 ./chart-facts.ts）。真实计算域上线后替换本绑定即可，消费方不改。
 *
 * 实现方式：三档时间精度各冻结一份「代表性档案」（由 scripts/freeze-sample-chart.mjs
 * 真实计算后冻结，非手工摆位），mock 在运行时按时间精度执行稳定性打包策略：
 * - 准确到分钟：完整盘（示例盘 1995-10-08 14:30 上海），相位由冻结黄经实时推导（orb 表内才算成相）
 * - 大约时段：对冻结的区间黄经极值执行稳定性校验——星座稳定看整区间、度数稳定看整度数一致、
 *   相位稳定看区间分离角窗口是否全落在容许度内；不稳定的角点/宫位按文档 §6.2 降级为无宫位范围
 * - 完全未知：仅展示整日内星座稳定的星体与区间内稳定的主要相位；度数一律为 null（不以
 *   12:00 或区间中点补算）；月亮/金星当日跨座则整颗隐藏（sign 为 null）
 *
 * mock 边界（文档 §17 允许）：mock 不读取出生日期/城市，按时间精度返回对应冻结档案；
 * 生成命令与算法口径见下方 FROZEN_SAMPLE_CHART 头注释。所有不稳定字段一律为 null。
 */

import type {
  AngleFact,
  AspectFact,
  AstroBirthProfile,
  AstrologyChartFacts,
  AspectType,
  ComputeChartFacts,
  HideReason,
  HouseFact,
  PlacementStability,
  PlanetBody,
  PlanetPlacement,
  StabilityStatus,
  ZodiacSign,
} from './chart-facts';
import { ORB_TABLE } from './chart-facts';

// ---------- 冻结真值档案数据结构 ----------

export interface FrozenBodyRange {
  min: number;
  max: number;
}

export interface FrozenAngleRange {
  min: number;
  max: number;
}

export interface FrozenAspectRange {
  source: PlanetBody;
  target: PlanetBody;
  /** 区间内最小/最大分离角（度，0-180），由冻结脚本按 10-20 分钟粒度采样得到 */
  minSep: number;
  maxSep: number;
  /** 区间中点时刻的分离角（度，0-180） */
  midSep: number;
}

export interface FrozenChartData {
  meta: {
    generatedBy: string;
    algorithm: string;
    engineVersion: string;
    orbTableVersion: string;
    sample: string;
  };
  accurate: {
    datetime: string;
    utc: string;
    longitudes: Record<PlanetBody, number>;
    retrograde: Record<PlanetBody, boolean>;
    asc: number;
    mc: number;
  };
  approximate: {
    localStart: string;
    localEnd: string;
    bodies: Record<PlanetBody, FrozenBodyRange>;
    aspectRanges: FrozenAspectRange[];
    retrograde: Record<PlanetBody, boolean>;
    ascRange: FrozenAngleRange;
    mcRange: FrozenAngleRange;
    moonCrosses: boolean;
  };
  unknown: {
    localDate: string;
    localStart: string;
    localEnd: string;
    utcStart: string;
    utcEnd: string;
    bodies: Record<PlanetBody, FrozenBodyRange>;
    aspectRanges: FrozenAspectRange[];
    retrograde: Record<PlanetBody, boolean>;
    moonCrosses: boolean;
  };
}

/**
 * 冻结真值档案（勿手改）：由 scripts/freeze-sample-chart.mjs 真实计算后生成，非手工摆位。
 * 生成命令：node scripts/freeze-sample-chart.mjs
 * 算法口径：Paul Schlyter 低精度行星位置算法（地心、回归黄道、当日分点，含月亮 12 项经度摄动、
 * 木/土/天摄动项与冥王星曲线拟合）；恒星时 GMST0 常数公式 + 地方恒星时；
 * 上升/天顶由 LST 与地理纬度推出（脚本内已通过地平条件 cos(H) = -tanφ·tanδ 自检）；
 * 相位分离角 min/max 按 10-20 分钟粒度采样取区间极值。冻结日期：2026-08-31。
 */
export const FROZEN_SAMPLE_CHART: FrozenChartData = {
  "meta": {
    "generatedBy": "node scripts/freeze-sample-chart.mjs",
    "algorithm": "Paul Schlyter \u4f4e\u7cbe\u5ea6\u884c\u661f\u4f4d\u7f6e\u7b97\u6cd5\uff08\u5730\u5fc3\u3001\u56de\u5f52\u9ec4\u9053\u3001\u5f53\u65e5\u5206\u70b9\uff0c\u542b\u6708\u4eae\u4e0e\u6728\u571f\u5929\u6444\u52a8\u9879\uff09",
    "engineVersion": "mock-schlyter-1.0",
    "orbTableVersion": "2026-07-26-v1",
    "sample": "\u56fa\u5b9a\u865a\u62df\u6863\u6848 1995-10-08 14:30 \u4e0a\u6d77\uff0831.2304N, 121.4737E, UTC+8\uff09",
  },
  "accurate": {
    "datetime": "1995-10-08T14:30:00+08:00",
    "utc": "1995-10-08T06:30:00Z",
    "longitudes": {
      "sun": 194.5158,
      "moon": 9.771,
      "mercury": 187.8887,
      "venus": 207.4567,
      "mars": 231.0843,
      "jupiter": 251.6199,
      "saturn": 349.6039,
      "uranus": 296.52,
      "neptune": 292.7746,
      "pluto": 238.8036,
    },
    "retrograde": {
      "sun": false,
      "moon": false,
      "mercury": true,
      "venus": false,
      "mars": false,
      "jupiter": false,
      "saturn": true,
      "uranus": false,
      "neptune": false,
      "pluto": false,
    },
    "asc": 312.149,
    "mc": 237.6668,
  },
  "approximate": {
    "localStart": "1995-10-08T13:00:00+08:00",
    "localEnd": "1995-10-08T16:00:00+08:00",
    "bodies": {
      "sun": {
        "min": 194.4542,
        "max": 194.5775,
      },
      "moon": {
        "min": 8.9507,
        "max": 10.5903,
      },
      "mercury": {
        "min": 187.8304,
        "max": 187.9475,
      },
      "venus": {
        "min": 207.3789,
        "max": 207.5344,
      },
      "mars": {
        "min": 231.0406,
        "max": 231.1281,
      },
      "jupiter": {
        "min": 251.6095,
        "max": 251.6304,
      },
      "saturn": {
        "min": 349.5998,
        "max": 349.608,
      },
      "uranus": {
        "min": 296.5199,
        "max": 296.5201,
      },
      "neptune": {
        "min": 292.7745,
        "max": 292.7747,
      },
      "pluto": {
        "min": 238.8016,
        "max": 238.8055,
      },
    },
    "aspectRanges": [
      {
        "source": "sun",
        "target": "moon",
        "minSep": 174.4966,
        "maxSep": 176.0128,
        "midSep": 175.2552,
      },
      {
        "source": "sun",
        "target": "mercury",
        "minSep": 6.5066,
        "maxSep": 6.7472,
        "midSep": 6.6271,
      },
      {
        "source": "sun",
        "target": "venus",
        "minSep": 12.9247,
        "maxSep": 12.9569,
        "midSep": 12.9408,
      },
      {
        "source": "sun",
        "target": "mars",
        "minSep": 36.5506,
        "maxSep": 36.5864,
        "midSep": 36.5685,
      },
      {
        "source": "sun",
        "target": "jupiter",
        "minSep": 57.0529,
        "maxSep": 57.1553,
        "midSep": 57.1041,
      },
      {
        "source": "sun",
        "target": "saturn",
        "minSep": 155.0222,
        "maxSep": 155.1538,
        "midSep": 155.088,
      },
      {
        "source": "sun",
        "target": "uranus",
        "minSep": 101.9426,
        "maxSep": 102.0657,
        "midSep": 102.0041,
      },
      {
        "source": "sun",
        "target": "neptune",
        "minSep": 98.1972,
        "maxSep": 98.3203,
        "midSep": 98.2588,
      },
      {
        "source": "sun",
        "target": "pluto",
        "minSep": 44.228,
        "maxSep": 44.3475,
        "midSep": 44.2877,
      },
      {
        "source": "moon",
        "target": "mercury",
        "minSep": 177.2401,
        "maxSep": 178.9968,
        "midSep": 178.1177,
      },
      {
        "source": "moon",
        "target": "venus",
        "minSep": 161.5718,
        "maxSep": 163.0559,
        "midSep": 162.3144,
      },
      {
        "source": "moon",
        "target": "mars",
        "minSep": 137.9101,
        "maxSep": 139.4622,
        "midSep": 138.6867,
      },
      {
        "source": "moon",
        "target": "jupiter",
        "minSep": 117.3412,
        "maxSep": 118.9599,
        "midSep": 118.1511,
      },
      {
        "source": "moon",
        "target": "saturn",
        "minSep": 19.3427,
        "maxSep": 20.9905,
        "midSep": 20.1672,
      },
      {
        "source": "moon",
        "target": "uranus",
        "minSep": 72.4308,
        "maxSep": 74.0702,
        "midSep": 73.251,
      },
      {
        "source": "moon",
        "target": "neptune",
        "minSep": 76.1762,
        "maxSep": 77.8156,
        "midSep": 76.9964,
      },
      {
        "source": "moon",
        "target": "pluto",
        "minSep": 130.1491,
        "maxSep": 131.7848,
        "midSep": 130.9675,
      },
      {
        "source": "mercury",
        "target": "venus",
        "minSep": 19.4313,
        "maxSep": 19.7041,
        "midSep": 19.5679,
      },
      {
        "source": "mercury",
        "target": "mars",
        "minSep": 43.093,
        "maxSep": 43.2977,
        "midSep": 43.1956,
      },
      {
        "source": "mercury",
        "target": "jupiter",
        "minSep": 63.662,
        "maxSep": 63.8,
        "midSep": 63.7312,
      },
      {
        "source": "mercury",
        "target": "saturn",
        "minSep": 161.6604,
        "maxSep": 161.7694,
        "midSep": 161.7151,
      },
      {
        "source": "mercury",
        "target": "uranus",
        "minSep": 108.5724,
        "maxSep": 108.6897,
        "midSep": 108.6312,
      },
      {
        "source": "mercury",
        "target": "neptune",
        "minSep": 104.827,
        "maxSep": 104.9443,
        "midSep": 104.8859,
      },
      {
        "source": "mercury",
        "target": "pluto",
        "minSep": 50.8541,
        "maxSep": 50.9751,
        "midSep": 50.9148,
      },
      {
        "source": "venus",
        "target": "mars",
        "minSep": 23.5936,
        "maxSep": 23.6617,
        "midSep": 23.6277,
      },
      {
        "source": "venus",
        "target": "jupiter",
        "minSep": 44.096,
        "maxSep": 44.2306,
        "midSep": 44.1633,
      },
      {
        "source": "venus",
        "target": "saturn",
        "minSep": 142.0653,
        "maxSep": 142.2291,
        "midSep": 142.1472,
      },
      {
        "source": "venus",
        "target": "uranus",
        "minSep": 88.9856,
        "maxSep": 89.141,
        "midSep": 89.0633,
      },
      {
        "source": "venus",
        "target": "neptune",
        "minSep": 85.2403,
        "maxSep": 85.3956,
        "midSep": 85.318,
      },
      {
        "source": "venus",
        "target": "pluto",
        "minSep": 31.271,
        "maxSep": 31.4228,
        "midSep": 31.3469,
      },
      {
        "source": "mars",
        "target": "jupiter",
        "minSep": 20.5023,
        "maxSep": 20.5689,
        "midSep": 20.5356,
      },
      {
        "source": "mars",
        "target": "saturn",
        "minSep": 118.4717,
        "maxSep": 118.5674,
        "midSep": 118.5195,
      },
      {
        "source": "mars",
        "target": "uranus",
        "minSep": 65.392,
        "maxSep": 65.4793,
        "midSep": 65.4357,
      },
      {
        "source": "mars",
        "target": "neptune",
        "minSep": 61.6466,
        "maxSep": 61.7339,
        "midSep": 61.6903,
      },
      {
        "source": "mars",
        "target": "pluto",
        "minSep": 7.6774,
        "maxSep": 7.7611,
        "midSep": 7.7192,
      },
      {
        "source": "jupiter",
        "target": "saturn",
        "minSep": 97.9694,
        "maxSep": 97.9985,
        "midSep": 97.9839,
      },
      {
        "source": "jupiter",
        "target": "uranus",
        "minSep": 44.8897,
        "maxSep": 44.9104,
        "midSep": 44.9,
      },
      {
        "source": "jupiter",
        "target": "neptune",
        "minSep": 41.1443,
        "maxSep": 41.165,
        "midSep": 41.1547,
      },
      {
        "source": "jupiter",
        "target": "pluto",
        "minSep": 12.8079,
        "maxSep": 12.8249,
        "midSep": 12.8164,
      },
      {
        "source": "saturn",
        "target": "uranus",
        "minSep": 53.0797,
        "maxSep": 53.0881,
        "midSep": 53.0839,
      },
      {
        "source": "saturn",
        "target": "neptune",
        "minSep": 56.8251,
        "maxSep": 56.8335,
        "midSep": 56.8293,
      },
      {
        "source": "saturn",
        "target": "pluto",
        "minSep": 110.7943,
        "maxSep": 110.8063,
        "midSep": 110.8003,
      },
      {
        "source": "uranus",
        "target": "neptune",
        "minSep": 3.7454,
        "maxSep": 3.7454,
        "midSep": 3.7454,
      },
      {
        "source": "uranus",
        "target": "pluto",
        "minSep": 57.7146,
        "maxSep": 57.7182,
        "midSep": 57.7164,
      },
      {
        "source": "neptune",
        "target": "pluto",
        "minSep": 53.9692,
        "maxSep": 53.9729,
        "midSep": 53.971,
      }
    ],
    "retrograde": {
      "sun": false,
      "moon": false,
      "mercury": true,
      "venus": false,
      "mars": false,
      "jupiter": false,
      "saturn": true,
      "uranus": false,
      "neptune": false,
      "pluto": false,
    },
    "ascRange": {
      "min": 286.9637,
      "max": 342.362,
    },
    "mcRange": {
      "min": 215.1221,
      "max": 258.9272,
    },
    "moonCrosses": false,
  },
  "unknown": {
    "localDate": "1995-10-10",
    "localStart": "1995-10-10T00:00:00+08:00",
    "localEnd": "1995-10-10T24:00:00+08:00",
    "utcStart": "1995-10-09T16:00:00Z",
    "utcEnd": "1995-10-10T16:00:00Z",
    "bodies": {
      "sun": {
        "min": 195.8941,
        "max": 196.8822,
      },
      "moon": {
        "min": 27.8168,
        "max": 40.4222,
      },
      "mercury": {
        "min": 186.025,
        "max": 186.7029,
      },
      "venus": {
        "min": 209.1939,
        "max": 210.4384,
      },
      "mars": {
        "min": 232.0626,
        "max": 232.7649,
      },
      "jupiter": {
        "min": 251.855,
        "max": 252.0255,
      },
      "saturn": {
        "min": 349.4495,
        "max": 349.5133,
      },
      "uranus": {
        "min": 296.523,
        "max": 296.5262,
      },
      "neptune": {
        "min": 292.7777,
        "max": 292.7806,
      },
      "pluto": {
        "min": 238.8468,
        "max": 238.8783,
      },
    },
    "aspectRanges": [
      {
        "source": "sun",
        "target": "moon",
        "minSep": 156.46,
        "maxSep": 168.0773,
        "midSep": 162.2356,
      },
      {
        "source": "sun",
        "target": "mercury",
        "minSep": 9.1912,
        "maxSep": 10.8571,
        "midSep": 10.0436,
      },
      {
        "source": "sun",
        "target": "venus",
        "minSep": 13.2998,
        "maxSep": 13.5563,
        "midSep": 13.4281,
      },
      {
        "source": "sun",
        "target": "mars",
        "minSep": 35.8828,
        "maxSep": 36.1685,
        "midSep": 36.0256,
      },
      {
        "source": "sun",
        "target": "jupiter",
        "minSep": 55.1433,
        "maxSep": 55.9609,
        "midSep": 55.552,
      },
      {
        "source": "sun",
        "target": "saturn",
        "minSep": 152.5673,
        "maxSep": 153.6192,
        "midSep": 153.0932,
      },
      {
        "source": "sun",
        "target": "uranus",
        "minSep": 99.644,
        "maxSep": 100.6289,
        "midSep": 100.1365,
      },
      {
        "source": "sun",
        "target": "neptune",
        "minSep": 95.8984,
        "maxSep": 96.8836,
        "midSep": 96.391,
      },
      {
        "source": "sun",
        "target": "pluto",
        "minSep": 41.9961,
        "maxSep": 42.9527,
        "midSep": 42.4744,
      },
      {
        "source": "moon",
        "target": "mercury",
        "minSep": 145.6028,
        "maxSep": 158.8861,
        "midSep": 152.1921,
      },
      {
        "source": "moon",
        "target": "venus",
        "minSep": 170.0162,
        "maxSep": 179.9424,
        "midSep": 175.6637,
      },
      {
        "source": "moon",
        "target": "mars",
        "minSep": 155.7542,
        "maxSep": 167.6572,
        "midSep": 161.7388,
      },
      {
        "source": "moon",
        "target": "jupiter",
        "minSep": 135.9618,
        "maxSep": 148.3967,
        "midSep": 142.2124,
      },
      {
        "source": "moon",
        "target": "saturn",
        "minSep": 38.3036,
        "maxSep": 50.9727,
        "midSep": 44.6712,
      },
      {
        "source": "moon",
        "target": "uranus",
        "minSep": 91.2938,
        "maxSep": 103.896,
        "midSep": 97.6279,
      },
      {
        "source": "moon",
        "target": "neptune",
        "minSep": 95.0391,
        "maxSep": 107.6416,
        "midSep": 101.3733,
      },
      {
        "source": "moon",
        "target": "pluto",
        "minSep": 148.97,
        "maxSep": 161.5439,
        "midSep": 155.2899,
      },
      {
        "source": "mercury",
        "target": "venus",
        "minSep": 22.4909,
        "maxSep": 24.4134,
        "midSep": 23.4716,
      },
      {
        "source": "mercury",
        "target": "mars",
        "minSep": 45.3597,
        "maxSep": 46.7399,
        "midSep": 46.0691,
      },
      {
        "source": "mercury",
        "target": "jupiter",
        "minSep": 65.1521,
        "maxSep": 66.0004,
        "midSep": 65.5955,
      },
      {
        "source": "mercury",
        "target": "saturn",
        "minSep": 162.8103,
        "maxSep": 163.4244,
        "midSep": 163.1367,
      },
      {
        "source": "mercury",
        "target": "uranus",
        "minSep": 109.8201,
        "maxSep": 110.5012,
        "midSep": 110.18,
      },
      {
        "source": "mercury",
        "target": "neptune",
        "minSep": 106.0748,
        "maxSep": 106.7556,
        "midSep": 106.4346,
      },
      {
        "source": "mercury",
        "target": "pluto",
        "minSep": 52.1439,
        "maxSep": 52.8532,
        "midSep": 52.518,
      },
      {
        "source": "venus",
        "target": "mars",
        "minSep": 22.3265,
        "maxSep": 22.8688,
        "midSep": 22.5975,
      },
      {
        "source": "venus",
        "target": "jupiter",
        "minSep": 41.587,
        "maxSep": 42.6612,
        "midSep": 42.1239,
      },
      {
        "source": "venus",
        "target": "saturn",
        "minSep": 139.011,
        "maxSep": 140.3194,
        "midSep": 139.6651,
      },
      {
        "source": "venus",
        "target": "uranus",
        "minSep": 86.0878,
        "maxSep": 87.3292,
        "midSep": 86.7084,
      },
      {
        "source": "venus",
        "target": "neptune",
        "minSep": 82.3422,
        "maxSep": 83.5839,
        "midSep": 82.9629,
      },
      {
        "source": "venus",
        "target": "pluto",
        "minSep": 28.4398,
        "maxSep": 29.653,
        "midSep": 29.0464,
      },
      {
        "source": "mars",
        "target": "jupiter",
        "minSep": 19.2605,
        "maxSep": 19.7924,
        "midSep": 19.5264,
      },
      {
        "source": "mars",
        "target": "saturn",
        "minSep": 116.6845,
        "maxSep": 117.4506,
        "midSep": 117.0676,
      },
      {
        "source": "mars",
        "target": "uranus",
        "minSep": 63.7613,
        "maxSep": 64.4604,
        "midSep": 64.1109,
      },
      {
        "source": "mars",
        "target": "neptune",
        "minSep": 60.0157,
        "maxSep": 60.7151,
        "midSep": 60.3654,
      },
      {
        "source": "mars",
        "target": "pluto",
        "minSep": 6.1133,
        "maxSep": 6.7842,
        "midSep": 6.4489,
      },
      {
        "source": "jupiter",
        "target": "saturn",
        "minSep": 97.424,
        "maxSep": 97.6582,
        "midSep": 97.5412,
      },
      {
        "source": "jupiter",
        "target": "uranus",
        "minSep": 44.5008,
        "maxSep": 44.668,
        "midSep": 44.5845,
      },
      {
        "source": "jupiter",
        "target": "neptune",
        "minSep": 40.7551,
        "maxSep": 40.9227,
        "midSep": 40.839,
      },
      {
        "source": "jupiter",
        "target": "pluto",
        "minSep": 13.0082,
        "maxSep": 13.1472,
        "midSep": 13.0775,
      },
      {
        "source": "saturn",
        "target": "uranus",
        "minSep": 52.9233,
        "maxSep": 52.9902,
        "midSep": 52.9567,
      },
      {
        "source": "saturn",
        "target": "neptune",
        "minSep": 56.6689,
        "maxSep": 56.7355,
        "midSep": 56.7022,
      },
      {
        "source": "saturn",
        "target": "pluto",
        "minSep": 110.5712,
        "maxSep": 110.6664,
        "midSep": 110.6187,
      },
      {
        "source": "uranus",
        "target": "neptune",
        "minSep": 3.7453,
        "maxSep": 3.7456,
        "midSep": 3.7454,
      },
      {
        "source": "uranus",
        "target": "pluto",
        "minSep": 57.6479,
        "maxSep": 57.6762,
        "midSep": 57.662,
      },
      {
        "source": "neptune",
        "target": "pluto",
        "minSep": 53.9023,
        "maxSep": 53.9309,
        "midSep": 53.9166,
      }
    ],
    "retrograde": {
      "sun": false,
      "moon": false,
      "mercury": true,
      "venus": false,
      "mars": false,
      "jupiter": false,
      "saturn": true,
      "uranus": false,
      "neptune": false,
      "pluto": false,
    },
    "moonCrosses": true,
  },
};


// ---------- 黄道几何工具 ----------

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

/** 黄经 → 星座 */
export function signOfLongitude(lon: number): ZodiacSign {
  return SIGN_ORDER[Math.floor(((lon % 360 + 360) % 360) / 30) % 12];
}

/** 黄经 → 星座内度数（0-30） */
export function degreeInSign(lon: number): number {
  return (lon % 30 + 30) % 30;
}

/** 两黄经分离角（0-180） */
export function separation(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** 精确成相角（度） */
const ASPECT_IDEAL: Record<AspectType, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

/** 分离角 → 相位类型（orb 表内才算成相，表外返回 null） */
export function aspectTypeOf(sep: number): AspectType | null {
  const types = Object.keys(ASPECT_IDEAL) as AspectType[];
  for (const type of types) {
    if (Math.abs(sep - ASPECT_IDEAL[type]) <= ORB_TABLE[type]) return type;
  }
  return null;
}

/** 保留 3 位小数的强度值 */
function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

// ---------- 相位推导（金样：由同一组黄经推导，orb 内才算成相） ----------

/**
 * 精确时刻相位推导：对给定十星体黄经表逐对计算分离角，按文档 §9.2 容许度表
 * （合相/对冲 8°、刑相/拱相 6°、六合 4°，orbTableVersion 标识）判定成相；
 * 强度 = 1 - orb/容许度（0-1，1 为精确成相）。
 */
export function deriveAspects(longitudes: Record<PlanetBody, number>): AspectFact[] {
  const bodies = Object.keys(longitudes) as PlanetBody[];
  const aspects: AspectFact[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const sep = separation(longitudes[bodies[i]], longitudes[bodies[j]]);
      const type = aspectTypeOf(sep);
      if (type === null) continue;
      const orb = Math.round((Math.abs(sep - ASPECT_IDEAL[type]) + Number.EPSILON) * 10000) / 10000;
      aspects.push({
        source: bodies[i],
        target: bodies[j],
        type,
        orb,
        strength: round3(Math.max(0, Math.min(1, 1 - orb / ORB_TABLE[type]))),
        stability: 'stable',
      });
    }
  }
  return aspects;
}

/**
 * 区间相位推导（约时/未知档）：区间分离角窗口 [minSep, maxSep] 与某相位的容许度窗口
 * 相交才视为候选相位；整个区间分离角全部落在容许度窗口内才稳定（可展示），
 * 否则该相位不稳定（orb/strength 为 null，不进入可见解释，文档 §9.3）。
 */
export function deriveAspectFactsFromRanges(ranges: FrozenAspectRange[]): AspectFact[] {
  const types = Object.keys(ASPECT_IDEAL) as AspectType[];
  return ranges.flatMap<AspectFact>((r) => {
    // 候选：区间分离角窗口与容许度窗口相交（多个窗口互不相交，至多命中一个）
    const type = types.find(
      (t) => r.minSep <= ASPECT_IDEAL[t] + ORB_TABLE[t] && r.maxSep >= ASPECT_IDEAL[t] - ORB_TABLE[t]
    );
    if (type === undefined) return [];
    const stable =
      r.minSep >= ASPECT_IDEAL[type] - ORB_TABLE[type] && r.maxSep <= ASPECT_IDEAL[type] + ORB_TABLE[type];
    if (!stable) {
      return [{ source: r.source, target: r.target, type, orb: null, strength: null, stability: 'unstable' }];
    }
    const orb = Math.round((Math.abs(r.midSep - ASPECT_IDEAL[type]) + Number.EPSILON) * 10000) / 10000;
    return [
      {
        source: r.source,
        target: r.target,
        type,
        orb,
        strength: round3(Math.max(0, Math.min(1, 1 - orb / ORB_TABLE[type]))),
        stability: 'stable',
      },
    ];
  });
}

/**
 * 约时区间星体稳定性（约时档专用）：
 * - 星座在整个区间内不变，且星座内整度数（四舍五入）不变 → stable（展示整度数单值）
 * - 星座不变但整度数跨边界 → signOnly（只展示星座）
 * - 星座本身跨座 → unstable（整颗隐藏）
 * 未知档不套用该函数：未知档不展示任何度数（见 buildUnknownChart 注释）。
 */
export function placementStability(range: FrozenBodyRange): PlacementStability {
  if (signOfLongitude(range.min) !== signOfLongitude(range.max)) return 'unstable';
  if (Math.round(degreeInSign(range.min)) !== Math.round(degreeInSign(range.max))) return 'signOnly';
  return 'stable';
}

// ---------- mock 三档构建 ----------

/** 隐藏角点（上升/天顶）：字段一律为 null，不生成伪单值 */
function hiddenAngle(point: 'ascendant' | 'midheaven'): AngleFact {
  return { point, sign: null, degree: null, longitude: null, stability: 'unstable' };
}

/** 不可展示状态 */
function hiddenStatus(reason: HideReason, detail: string): StabilityStatus {
  return { displayable: false, reason, detail };
}

/** 事实层公共头部（真值来源与版本信息） */
function baseFacts(): AstrologyChartFacts {
  return {
    zodiacSystem: 'tropical',
    houseSystem: null,
    calculatedAt: new Date().toISOString(),
    engineVersion: FROZEN_SAMPLE_CHART.meta.engineVersion,
    orbTableVersion: FROZEN_SAMPLE_CHART.meta.orbTableVersion,
    calculationRevision: '2026-08-31-1',
    planets: [],
    angles: { ascendant: hiddenAngle('ascendant'), midheaven: hiddenAngle('midheaven') },
    houses: [],
    aspects: [],
    factStability: {
      angles: hiddenStatus('time-unknown', ''),
      houses: hiddenStatus('time-unknown', ''),
      placements: Object.fromEntries(
        PLANET_BODY_ORDER.map((b) => [b, { displayable: true, reason: null, detail: null }])
      ) as Record<PlanetBody, StabilityStatus>,
      aspects: { displayable: true, reason: null, detail: null },
      note: null,
    },
    dataCompleteness: 'without-houses',
  };
}

const PLANET_BODY_ORDER: PlanetBody[] = [
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

/** 准确到分钟：完整盘（示例盘 1995-10-08 14:30 上海），整宫制宫位由上升星座推导 */
function buildAccurateChart(): AstrologyChartFacts {
  const f = FROZEN_SAMPLE_CHART.accurate;
  const ascSign = signOfLongitude(f.asc);
  const ascIndex = SIGN_ORDER.indexOf(ascSign);
  const facts = baseFacts();
  facts.houseSystem = 'whole-sign'; // 设计文档 §9.2 的 Placidus 回退制；mock 阶段采用整宫制：
  // 约时/未知场景下整宫制与角点稳定性天然自洽，且与冻结口径一致（见冻结脚本头注释）
  facts.dataCompleteness = 'with-houses';

  facts.planets = PLANET_BODY_ORDER.map((body): PlanetPlacement => {
    const lon = f.longitudes[body];
    return {
      body,
      sign: signOfLongitude(lon),
      degree: Math.round((degreeInSign(lon) + Number.EPSILON) * 10000) / 10000,
      house: ((SIGN_ORDER.indexOf(signOfLongitude(lon)) - ascIndex + 12) % 12) + 1,
      retrograde: f.retrograde[body],
      stability: 'stable',
    };
  });
  facts.angles = {
    ascendant: { point: 'ascendant', sign: ascSign, degree: Math.round((degreeInSign(f.asc) + Number.EPSILON) * 10000) / 10000, longitude: f.asc, stability: 'stable' },
    midheaven: { point: 'midheaven', sign: signOfLongitude(f.mc), degree: Math.round((degreeInSign(f.mc) + Number.EPSILON) * 10000) / 10000, longitude: f.mc, stability: 'stable' },
  };
  facts.houses = Array.from({ length: 12 }, (_, i): HouseFact => ({
    number: i + 1,
    sign: SIGN_ORDER[(ascIndex + i) % 12],
    cuspDegree: 0, // 整宫制：宫头即星座起始 0°
    stability: 'stable',
  }));
  facts.aspects = deriveAspects(f.longitudes);
  facts.factStability = {
    angles: { displayable: true, reason: null, detail: null },
    houses: { displayable: true, reason: null, detail: null },
    placements: Object.fromEntries(
      facts.planets.map((p) => [p.body, { displayable: true, reason: null, detail: null }])
    ) as Record<PlanetBody, StabilityStatus>,
    aspects: { displayable: true, reason: null, detail: null },
    note: null, // 时间准确到分钟：全部事实可展示，无降级说明
  };
  return facts;
}

/** 大约时段：对冻结区间极值执行稳定性校验；角点/宫位不稳定 → 按无宫位范围降级（文档 §6.2） */
function buildApproximateChart(): AstrologyChartFacts {
  const f = FROZEN_SAMPLE_CHART.approximate;
  const facts = baseFacts();

  const placements = PLANET_BODY_ORDER.map((body): PlanetPlacement => {
    const range = f.bodies[body];
    const st = placementStability(range);
    return {
      body,
      sign: st === 'unstable' ? null : signOfLongitude(range.min),
      degree: st === 'stable' ? Math.round(degreeInSign(range.min)) : null,
      house: null,
      retrograde: f.retrograde[body],
      stability: st,
    };
  });
  facts.planets = placements;
  facts.angles = {
    ascendant: hiddenAngle('ascendant'), // 冻结证据：ASC 区间 286.96°~342.36° 跨摩羯→双鱼
    midheaven: hiddenAngle('midheaven'), // 冻结证据：MC 区间 215.12°~258.93° 跨天蝎→射手
  };
  facts.houses = []; // 上升不稳定，宫位无法确定，按无宫位范围降级且不留占位
  facts.aspects = deriveAspectFactsFromRanges(f.aspectRanges);

  const stableCount = facts.aspects.filter((a) => a.stability === 'stable').length;
  facts.factStability = {
    angles: hiddenStatus('unstable-in-range', '上升与天顶在所选时段内跨星座，角点不稳定（文档 §9.2）'),
    houses: hiddenStatus('unstable-in-range', '上升不稳定，宫位无法确定，已按无宫位范围降级（文档 §6.2）'),
    placements: Object.fromEntries(
      placements.map((p) => [
        p.body,
        p.stability === 'stable'
          ? { displayable: true, reason: null, detail: null }
          : p.stability === 'signOnly'
            ? { displayable: true, reason: 'unstable-in-range', detail: '该星体在所选时段内度数不稳定，仅展示星座' }
            : hiddenStatus('unstable-in-range', '该星体在所选时段内星座不稳定，已隐藏'),
      ])
    ) as Record<PlanetBody, StabilityStatus>,
    aspects: { displayable: true, reason: null, detail: `区间内成相且稳定的相位共 ${stableCount} 条` },
    note: '约时，部分盘面范围不稳定：上升、天顶与宫位在所选时段内不稳定，已按无宫位范围展示；部分星体度数不稳定，仅展示星座',
  };
  return facts;
}

/**
 * 完全未知：以当地民用日 [00:00, 次日 00:00) 计（冻结档案 UTC 区间 [10-09 16:00, 10-10 16:00)）。
 * 不计算上升/天顶/宫位；仅展示整日内星座稳定的星体（度数一律为 null——未知档不展示度数，
 * 文档 §6.2 只承诺整日内稳定的星座与主要相位，绝不用 12:00 或区间中点补算）；
 * 月亮与金星当日跨座（白羊→金牛 / 天秤→天蝎），整颗隐藏（sign 为 null）。
 */
function buildUnknownChart(): AstrologyChartFacts {
  const f = FROZEN_SAMPLE_CHART.unknown;
  const facts = baseFacts();

  const placements = PLANET_BODY_ORDER.map((body): PlanetPlacement => {
    const range = f.bodies[body];
    const signStable = signOfLongitude(range.min) === signOfLongitude(range.max);
    return {
      body,
      sign: signStable ? signOfLongitude(range.min) : null,
      degree: null, // 未知档只展示整日内稳定的星座，不展示任何度数
      house: null,
      retrograde: signStable ? f.retrograde[body] : null,
      stability: signStable ? 'signOnly' : 'unstable',
    };
  });
  facts.planets = placements;
  facts.angles = {
    ascendant: hiddenAngle('ascendant'), // 文档 §9.2：时间未知不计算上升、天顶、宫位
    midheaven: hiddenAngle('midheaven'),
  };
  facts.houses = [];
  facts.aspects = deriveAspectFactsFromRanges(f.aspectRanges);

  const stableCount = facts.aspects.filter((a) => a.stability === 'stable').length;
  facts.factStability = {
    angles: hiddenStatus('time-unknown', '出生时间未知，不计算上升与天顶（文档 §9.2）'),
    houses: hiddenStatus('time-unknown', '出生时间未知，不计算十二宫（文档 §9.2）'),
    placements: Object.fromEntries(
      placements.map((p) => [
        p.body,
        p.stability === 'signOnly'
          ? { displayable: true, reason: null, detail: '该星体星座在整日内稳定，度数不展示' }
          : hiddenStatus('time-unknown', '该星体在当日跨星座（如月亮白羊→金牛），当前资料无法确定'),
      ])
    ) as Record<PlanetBody, StabilityStatus>,
    aspects: { displayable: true, reason: null, detail: `整日内成相且稳定的相位共 ${stableCount} 条` },
    note: '出生时间未知：未计算上升、天顶与宫位；仅展示整日内稳定的星体星座与主要相位',
  };
  return facts;
}

// ---------- 接缝实现 ----------

/**
 * 占星真值计算域 mock 实现（唯一接缝绑定）。
 * 注意：mock 按时间精度返回冻结的代表性档案，不读取具体出生日期/城市；
 * 真实计算域上线后按 profile 全量计算，接口与消费方不变。
 */
export const computeChartFacts: ComputeChartFacts = (profile) => {
  switch (profile.timePrecision) {
    case 'accurate':
      return buildAccurateChart();
    case 'approximate':
      return buildApproximateChart();
    case 'unknown':
      return buildUnknownChart();
  }
};

// ---------- 冻结代表性档案（供测试与示例盘预览引用） ----------

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