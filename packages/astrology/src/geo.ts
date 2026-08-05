/**
 * 球面坐标与角度工具。
 *
 * 所有函数均为纯函数、无浮点累积状态，便于单元测试与真值复现。
 */

/** 度分秒结构。 */
export interface Dms {
  degree: number;
  minute: number;
  second: number;
  /** 符号，true 表示负值。 */
  negative: boolean;
}

/**
 * 将任意角度规范化到 [0, 360) 区间。
 *
 * 对负数与超过 360° 的输入均适用。
 */
export function normalizeDegree(degree: number): number {
  let normalized = degree % 360;
  if (normalized < 0) {
    normalized += 360;
  }
  // 避免 -0 与 0 在 Object.is 比较时不一致，保证规范化结果确定性。
  return normalized === 0 ? 0 : normalized;
}

/**
 * 计算从 a 到 b 的最短有符号弧。
 *
 * 返回值范围 (-180, 180]：
 * - 正值表示从 a 向东/逆时针到 b 更近；
 * - 负值表示向西/顺时针更近。
 */
export function shortestArcDelta(a: number, b: number): number {
  let delta = (b - a) % 360;
  if (delta > 180) {
    delta -= 360;
  } else if (delta <= -180) {
    delta += 360;
  }
  return delta;
}

/**
 * 计算两角度间的最短无符号距离（0°–180°）。
 */
export function shortestArcDistance(a: number, b: number): number {
  return Math.abs(shortestArcDelta(a, b));
}

/**
 * 将十进制度数转换为度分秒。
 *
 * 结果保持输入符号：负值时 negative=true，degree 为绝对值的整数部分。
 */
export function degreeToDms(degree: number): Dms {
  const negative = degree < 0;
  const absDegree = Math.abs(degree);
  const d = Math.floor(absDegree);
  const remainingMinutes = (absDegree - d) * 60;
  const m = Math.floor(remainingMinutes);
  const s = (remainingMinutes - m) * 60;

  return {
    degree: d,
    minute: m,
    second: s,
    negative,
  };
}

/**
 * 将度分秒转换为十进制度数。
 */
export function dmsToDegree(dms: Dms): number {
  const sign = dms.negative ? -1 : 1;
  return sign * (dms.degree + dms.minute / 60 + dms.second / 3600);
}

/**
 * 将角度从度转换为弧度。
 */
export function degToRad(degree: number): number {
  return (degree * Math.PI) / 180;
}

/**
 * 将角度从弧度转换为度。
 */
export function radToDeg(radian: number): number {
  return (radian * 180) / Math.PI;
}
