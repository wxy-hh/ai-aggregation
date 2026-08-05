/**
 * 时间系统换算工具。
 *
 * 当前 P0 仅支持 Asia/Shanghai（UTC+8，无夏令时）。
 * 所有函数均为纯函数，输入/输出使用原生 Date 或显式字段，避免隐式时区转换。
 */

import type { LocalTimeDisambiguation, TimePrecision } from './constants';

/** 民用时元信息，包含与 UTC 的偏移及可能的回退歧义标记。 */
export interface LocalCivilTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  /** 当前地点与 UTC 的分钟偏移量，P0 固定 480（UTC+8）。 */
  utcOffsetMinutes: number;
  /**
   * 本地时间歧义标记。
   * - null：无歧义（Asia/Shanghai 无夏令时，P0 始终为 null）。
   * - 'first'/'second'：夏令时回退重叠期的第一次/第二次出现，供后续扩展。
   */
  localTimeDisambiguation: LocalTimeDisambiguation;
  /** 时间精度声明。 */
  precision: TimePrecision;
}

/** UTC 时间元信息。 */
export interface UtcTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** P0 固定时区：Asia/Shanghai，UTC+8，无夏令时。 */
const SHANGHAI_UTC_OFFSET_MINUTES = 480;

/** 儒略世纪天数（36525 日）。 */
const DAYS_PER_JULIAN_CENTURY = 36525;

/**
 * 将本地民用时（Asia/Shanghai）转换为 UTC 时间。
 *
 * 注意：P0 固定 UTC+8、无夏令时，因此直接减去偏移。
 */
export function localCivilToUtc(local: LocalCivilTime): UtcTime {
  if (local.utcOffsetMinutes !== SHANGHAI_UTC_OFFSET_MINUTES) {
    throw new Error(
      `P0 仅支持 Asia/Shanghai（UTC+8），收到 offset=${local.utcOffsetMinutes} 分钟`
    );
  }

  // 将本地日初（00:00）作为锚点，避免跨日边界符号歧义。
  const localSecondsSinceMidnight =
    local.hour * 3600 + local.minute * 60 + local.second;
  const offsetSeconds = local.utcOffsetMinutes * 60;
  const utcSecondsSinceLocalMidnight = localSecondsSinceMidnight - offsetSeconds;

  const baseDate = new Date(
    Date.UTC(local.year, local.month - 1, local.day, 0, 0, 0)
  );
  const utcDate = new Date(
    baseDate.getTime() + utcSecondsSinceLocalMidnight * 1000
  );

  return {
    year: utcDate.getUTCFullYear(),
    month: utcDate.getUTCMonth() + 1,
    day: utcDate.getUTCDate(),
    hour: utcDate.getUTCHours(),
    minute: utcDate.getUTCMinutes(),
    second: utcDate.getUTCSeconds(),
  };
}

/**
 * 将 UTC 时间元信息转换为 JavaScript Date。
 * 返回的 Date 处于 UTC 语义下（内部毫秒数正确）。
 */
export function utcToDate(utc: UtcTime): Date {
  return new Date(
    Date.UTC(utc.year, utc.month - 1, utc.day, utc.hour, utc.minute, utc.second)
  );
}

/**
 * 计算 UTC 时间对应的儒略日（Julian Day）。
 *
 * 使用 Meeus《Astronomical Algorithms》格里高利历算法，精度满足占星排盘需求。
 * 结果以 UT 为基准（未做 TT 质心/岁差修正），与星历表对照时误差在秒级以内。
 */
export function utcToJulianDay(utc: UtcTime): number {
  let y = utc.year;
  let m = utc.month;
  const d =
    utc.day +
    utc.hour / 24 +
    utc.minute / 1440 +
    utc.second / 86400;

  if (m <= 2) {
    y -= 1;
    m += 12;
  }

  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);

  const jd =
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    d +
    b -
    1524.5;

  return jd;
}

/**
 * 计算儒略日对应的格林尼治平恒星时（GMST，单位：度）。
 *
 * 采用 IAU 2000 推荐近似公式：
 *   θ = 280.46061837
 *       + 360.98564736629 × (JD - 2451545.0)
 *       + 0.000387933 × T²
 *       - T³ / 38710000
 * 其中 T 为自 J2000.0 起的儒略世纪数。
 */
export function julianDayToGmst(jd: number): number {
  const d = jd - 2451545.0;
  const t = d / DAYS_PER_JULIAN_CENTURY;

  let gmst =
    280.46061837 +
    360.98564736629 * d +
    0.000387933 * t * t -
    (t * t * t) / 38710000;

  gmst = gmst % 360;
  if (gmst < 0) {
    gmst += 360;
  }

  return gmst;
}

/**
 * 将本地民用时一次性转换为儒略日。
 *
 * 等价于 `utcToJulianDay(localCivilToUtc(local))`。
 */
export function localCivilToJulianDay(local: LocalCivilTime): number {
  return utcToJulianDay(localCivilToUtc(local));
}

/**
 * 构造一个 Asia/Shanghai 本地时间对象。
 *
 * 这是 P0 的便捷工厂函数；精度的默认值为 'minute'。
 */
export function createShanghaiLocalTime(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second = 0,
  precision: TimePrecision = 'minute'
): LocalCivilTime {
  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    utcOffsetMinutes: SHANGHAI_UTC_OFFSET_MINUTES,
    localTimeDisambiguation: null,
    precision,
  };
}
