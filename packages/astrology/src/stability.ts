/**
 * 区间稳定性校验：针对出生时间不确定场景，按固定步长采样并判定字段是否稳定。
 *
 * 核心规则：任一采样点不一致即标为 unstable 并隐藏该字段，绝不在区间中点
 * 或 12:00 伪造单值。
 */

import type { LocalCivilTime } from './time';
import { localCivilToJulianDay, createShanghaiLocalTime } from './time';
import { shortestArcDelta } from './geo';

/** 稳定性采样步长（分钟），≤ 4 分钟可覆盖上升点最快约 1°/4 分钟的变化。 */
export const STABILITY_SAMPLE_STEP_MINUTES = 4 as const;

/** 度数字段一致性容差（度）。 */
export const STABILITY_DEGREE_TOLERANCE = 0.5 as const;

/** 字段类型：离散值按相等判定，度数按 |Δ| < 容差判定。 */
export type StabilityFieldType = 'discrete' | 'degree';

/** 单个字段的稳定性结论。 */
export interface StabilityFieldResult {
  /** 是否全采样点一致。 */
  stable: boolean;
  /** 稳定时的统一值；不稳定时为 null（隐藏）。 */
  value: unknown;
  /** 不稳定原因，仅在不稳定时存在。 */
  unstableReason?: string;
}

/** 稳定性评估返回结构。 */
export type StabilityResult = Record<string, StabilityFieldResult>;

/**
 * 生成 [jdStart, jdEnd] 区间内按 ≤4 分钟步长的采样点，两端点必采。
 *
 * 若 jdEnd - jdStart 小于步长，则仅返回两端点。
 */
function generateSamplePoints(jdStart: number, jdEnd: number): number[] {
  if (!Number.isFinite(jdStart) || !Number.isFinite(jdEnd) || jdEnd < jdStart) {
    throw new Error('稳定性采样区间非法：端点须为有限值且结束不小于开始');
  }

  const stepDays = STABILITY_SAMPLE_STEP_MINUTES / 1440;
  const points: number[] = [jdStart];

  let t = jdStart + stepDays;
  while (t < jdEnd) {
    points.push(t);
    t += stepDays;
  }

  // 端点必采；避免区间长度恰好为整数步时重复。
  if (points[points.length - 1] !== jdEnd) {
    points.push(jdEnd);
  }

  return points;
}

/**
 * 判断两个度数采样值是否一致（最短弧差绝对值 < 容差）。
 */
function degreeValuesEqual(a: number, b: number): boolean {
  return Math.abs(shortestArcDelta(a, b)) < STABILITY_DEGREE_TOLERANCE;
}

/**
 * 判断两个离散采样值是否一致（严格相等）。
 */
function discreteValuesEqual(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') {
    return a === b;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, idx) => discreteValuesEqual(v, b[idx]));
  }
  return a === b;
}

/**
 * 在 [jdStart, jdEnd] 区间内按 ≤4 分钟步长采样，对每个采样点调用 evaluator，
 * 并判定每个字段是否稳定。
 *
 * @param jdStart 区间起始儒略日（含）
 * @param jdEnd 区间结束儒略日（含采样）
 * @param evaluator 对每个采样点返回字段集合的函数
 * @param fieldTypes 字段类型声明，未声明的字段默认按离散值处理
 */
export function evaluateStability(
  jdStart: number,
  jdEnd: number,
  evaluator: (jd: number) => Record<string, unknown>,
  fieldTypes: Record<string, StabilityFieldType> = {}
): StabilityResult {
  const points = generateSamplePoints(jdStart, jdEnd);
  const samples = points.map((jd) => ({ jd, fields: evaluator(jd) }));

  const firstFields = samples[0].fields;
  const fieldNames = Object.keys(firstFields);
  const result: StabilityResult = {};

  for (const name of fieldNames) {
    const type = fieldTypes[name] ?? 'discrete';
    const values = samples.map((s) => s.fields[name]);
    const firstValue = values[0];

    let stable = true;
    let unstableReason = '';

    for (let i = 1; i < values.length; i++) {
      const current = values[i];
      if (type === 'degree') {
        if (
          typeof firstValue !== 'number' ||
          typeof current !== 'number' ||
          !degreeValuesEqual(firstValue, current)
        ) {
          stable = false;
          if (typeof firstValue === 'number' && typeof current === 'number') {
            const delta = Math.abs(shortestArcDelta(firstValue, current));
            unstableReason = `度数字段 "${name}" 在采样点间变化 ${delta.toFixed(2)}°，超过容差 ${STABILITY_DEGREE_TOLERANCE}°`;
          } else {
            unstableReason = `度数字段 "${name}" 出现非数值采样`;
          }
          break;
        }
      } else {
        if (!discreteValuesEqual(firstValue, current)) {
          stable = false;
          unstableReason = `离散字段 "${name}" 在采样点间不一致`;
          break;
        }
      }
    }

    if (stable) {
      result[name] = { stable: true, value: firstValue };
    } else {
      result[name] = { stable: false, value: null, unstableReason };
    }
  }

  return result;
}

export function stabilityForApproximateRange(
  localStart: LocalCivilTime,
  localEnd: LocalCivilTime,
  evaluator: (jd: number) => Record<string, unknown>,
  fieldTypes: Record<string, StabilityFieldType> = {}
): StabilityResult {
  const jdStart = localCivilToJulianDay(localStart);
  const jdEnd = localCivilToJulianDay(localEnd);
  return evaluateStability(jdStart, jdEnd, evaluator, fieldTypes);
}

/**
 * 针对“未知时间”的稳定性封装。
 *
 * 取当地民用日 [00:00, 次日 00:00) 作为区间，转换为儒略日后采样。
 */
export function stabilityForUnknownTime(
  date: { year: number; month: number; day: number },
  cityOffsetMinutes: number,
  evaluator: (jd: number) => Record<string, unknown>,
  fieldTypes: Record<string, StabilityFieldType> = {}
): StabilityResult {
  const start = createShanghaiLocalTime(
    date.year,
    date.month,
    date.day,
    0,
    0,
    0,
    'unknown'
  );

  // 次日 00:00
  const nextDay = new Date(Date.UTC(date.year, date.month - 1, date.day + 1, 0, 0, 0));
  const end = createShanghaiLocalTime(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    0,
    0,
    0,
    'unknown'
  );

  // createShanghaiLocalTime 固定 utcOffsetMinutes=480，若调用方传入其他城市偏移，
  // 需要覆盖；但 P0 仅支持 Shanghai。这里做防御性赋值。
  start.utcOffsetMinutes = cityOffsetMinutes;
  end.utcOffsetMinutes = cityOffsetMinutes;

  return stabilityForApproximateRange(start, end, evaluator, fieldTypes);
}

