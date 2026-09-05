/**
 * solar-longitude.ts —— 表单预览用太阳黄经近似计算（前端确定性计算）
 *
 * 设计共识：表单预览条与预览盘的太阳星座由前端确定性计算，不占用真值计算域接缝。
 * 采用经典低精度公式（平黄经 + 中心差修正，精度约 0.01°），仅用于表单预览；
 * 报告真值仍以 computeChartFacts 接缝输出为准，两处互不影响。
 */

import type { ZodiacSign } from './chart-facts';

const ZODIAC_ORDER: ZodiacSign[] = [
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

/** 阳历日期 + UTC 小时 → 儒略日（标准历书公式） */
function julianDay(year: number, month: number, day: number, hourUTC: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  return (
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045 +
    hourUTC / 24 -
    0.5
  );
}

/**
 * 太阳视黄经近似值（度，0-360）。
 * 取当日 12:00 东八区（04:00 UTC）：太阳日行约 1°，日内几乎不变，预览用途足够；
 * 表单只展示星座不展示度数，跨界日的微小误差不会影响预览条口径。
 */
export function approximateSunLongitude(date: {
  year: number;
  month: number;
  day: number;
}): number {
  const jd = julianDay(date.year, date.month, date.day, 4);
  const n = jd - 2451545.0; // 自 J2000.0 的日数
  // 平黄经与平近点角
  const L = (((280.46 + 0.9856474 * n) % 360) + 360) % 360;
  const g = ((((357.528 + 0.9856003 * n) % 360) + 360) % 360) * (Math.PI / 180);
  // 中心差修正 → 视黄经
  return (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g) + 360) % 360;
}

/** 阳历日期 → 太阳星座（表单预览条「你的太阳星座：××座」） */
export function approximateSunSign(date: { year: number; month: number; day: number }): ZodiacSign {
  return ZODIAC_ORDER[Math.floor(approximateSunLongitude(date) / 30) % 12];
}

/**
 * 十二星座通行日期范围（静态展示表，仅供预览条参考文案）：
 * 与 approximateSunSign 的天文计算解耦——跨界日以天文计算为准，
 * 范围文字只帮助用户建立「这个星座大概覆盖哪些日子」的直觉。
 */
export const ZODIAC_DATE_RANGE: Record<ZodiacSign, string> = {
  aries: '3月21日 – 4月19日',
  taurus: '4月20日 – 5月20日',
  gemini: '5月21日 – 6月21日',
  cancer: '6月22日 – 7月22日',
  leo: '7月23日 – 8月22日',
  virgo: '8月23日 – 9月22日',
  libra: '9月23日 – 10月23日',
  scorpio: '10月24日 – 11月22日',
  sagittarius: '11月23日 – 12月21日',
  capricorn: '12月22日 – 1月19日',
  aquarius: '1月20日 – 2月18日',
  pisces: '2月19日 – 3月20日',
};
