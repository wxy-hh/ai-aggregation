/**
 * zodiac-geometry.ts —— 星座寰宇 · 黄道几何与相位口径（纯函数，客户端安全）
 *
 * 本模块只承载设计文档 §9.2 冻结的确定性口径，不依赖星历库，可在客户端与测试中直接使用：
 * - 黄经 ↔ 星座 / 星座内度数换算；
 * - 两黄经分离角（0-180）与相位判定（合相 / 六合 / 刑相 / 拱相 / 对冲，容许度取 ORB_TABLE，
 *   由 orbTableVersion 标识，AI 不得自行判断）；
 * - 时刻盘相位推导（deriveAspects）与区间相位推导（deriveAspectFactsFromRanges）：
 *   约时/未知档只有区间分离角窗口全部落在容许度窗口内才输出单值，否则该相位不稳定；
 * - 区间落点稳定性（placementStability）：星座跨座 → unstable；星座稳定但整度数跨边界 → signOnly；
 *   整度数一致 → stable。不取区间中点或任意默认时刻补算（文档 §9.2）。
 *
 * 依赖图约定：本文件被服务端计算域（chart-engine.ts）在 Node 下直接以 TS 运行时引入，
 * 故对 .ts 模块使用显式扩展名导入（tsconfig 已开启 allowImportingTsExtensions）。
 */

import { ORB_TABLE } from './chart-facts.ts';
import type { AspectFact, AspectType, PlanetBody, PlacementStability, ZodiacSign } from './chart-facts';
import { ZODIAC_ORDER } from './zh-names.ts';

/** 黄道顺序（白羊起）：宫位/黄经换算共用（自 zh-names 的 ZODIAC_ORDER 复制，避免共享可变引用） */
export const SIGN_ORDER: ZodiacSign[] = [...ZODIAC_ORDER];

/** 黄经 → 星座 */
export function signOfLongitude(lon: number): ZodiacSign {
  return SIGN_ORDER[Math.floor((((lon % 360) + 360) % 360) / 30) % 12];
}

/** 黄经 → 星座内度数（0-30） */
export function degreeInSign(lon: number): number {
  return ((lon % 30) + 30) % 30;
}

/** 两黄经分离角（0-180） */
export function separation(a: number, b: number): number {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

/** 精确成相角（度） */
export const ASPECT_IDEAL: Record<AspectType, number> = {
  conjunction: 0,
  sextile: 60,
  square: 90,
  trine: 120,
  opposition: 180,
};

/** 保留 4 位小数（角度值与 orb 的统一口径） */
export function round4(x: number): number {
  return Math.round((x + Number.EPSILON) * 10000) / 10000;
}

/** 保留 3 位小数的强度值 */
export function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

/** 分离角 → 相位类型（orb 表内才算成相，表外返回 null） */
export function aspectTypeOf(sep: number): AspectType | null {
  const types = Object.keys(ASPECT_IDEAL) as AspectType[];
  for (const type of types) {
    if (Math.abs(sep - ASPECT_IDEAL[type]) <= ORB_TABLE[type]) return type;
  }
  return null;
}

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
      const orb = round4(Math.abs(sep - ASPECT_IDEAL[type]));
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

/** 区间内某星体/角点的黄经极值 */
export interface LongitudeRange {
  min: number;
  max: number;
}

/** 区间相位对：分离角在区间内的极值与区间中点时刻的分离角 */
export interface AspectRange {
  source: PlanetBody;
  target: PlanetBody;
  /** 区间内最小/最大分离角（度，0-180） */
  minSep: number;
  maxSep: number;
  /** 区间中点时刻的分离角（度，0-180） */
  midSep: number;
}

/**
 * 区间相位推导（约时/未知档）：区间分离角窗口 [minSep, maxSep] 与某相位的容许度窗口
 * 相交才视为候选相位；整个区间分离角全部落在容许度窗口内才稳定（可展示），
 * 否则该相位不稳定（orb/strength 为 null，不进入可见解释，文档 §9.3）。
 */
export function deriveAspectFactsFromRanges(ranges: AspectRange[]): AspectFact[] {
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
    const orb = round4(Math.abs(r.midSep - ASPECT_IDEAL[type]));
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
 * 区间落点稳定性（约时档专用）：
 * - 星座在整个区间内不变，且星座内整度数（四舍五入）不变 → stable（展示整度数单值）
 * - 星座不变但整度数跨边界 → signOnly（只展示星座）
 * - 星座本身跨座 → unstable（整颗隐藏）
 * 未知档不套用该函数：未知档不展示任何度数（见 chart-engine 注释）。
 */
export function placementStability(range: LongitudeRange): PlacementStability {
  if (signOfLongitude(range.min) !== signOfLongitude(range.max)) return 'unstable';
  if (Math.round(degreeInSign(range.min)) !== Math.round(degreeInSign(range.max))) return 'signOnly';
  return 'stable';
}
