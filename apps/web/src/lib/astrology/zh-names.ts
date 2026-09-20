/**
 * zh-names.ts —— 星座寰宇 · 事实层代码标识 → 中文名映射（展示层共享词汇表）
 *
 * 事实层（chart-facts）只存代码标识；中文名集中在展示层本文件，
 * 供星盘轮、结果页、mock 解读层共用，避免多处重复定义漂移。
 */

import type { AspectType, PlanetBody, ZodiacSign } from './chart-facts';

/** 十星体中文名 */
export const PLANET_CN: Record<PlanetBody, string> = {
  sun: '太阳',
  moon: '月亮',
  mercury: '水星',
  venus: '金星',
  mars: '火星',
  jupiter: '木星',
  saturn: '土星',
  uranus: '天王星',
  neptune: '海王星',
  pluto: '冥王星',
};

/** 十二星座中文名 */
export const ZODIAC_CN: Record<ZodiacSign, string> = {
  aries: '白羊座',
  taurus: '金牛座',
  gemini: '双子座',
  cancer: '巨蟹座',
  leo: '狮子座',
  virgo: '处女座',
  libra: '天秤座',
  scorpio: '天蝎座',
  sagittarius: '射手座',
  capricorn: '摩羯座',
  aquarius: '水瓶座',
  pisces: '双鱼座',
};

/** 主要相位中文名（0° 合相 / 60° 六合 / 90° 刑相 / 120° 拱相 / 180° 对冲） */
export const ASPECT_CN: Record<AspectType, string> = {
  conjunction: '合相',
  sextile: '六合',
  square: '刑相',
  trine: '拱相',
  opposition: '对冲',
};

/** 黄道顺序（白羊起）：宫位/黄经换算共用 */
export const ZODIAC_ORDER: ZodiacSign[] = [
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
