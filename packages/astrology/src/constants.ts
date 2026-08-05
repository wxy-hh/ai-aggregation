/**
 * 占星引擎版本与容许度等冻结常量。
 *
 * 本文件只包含标量与字面量枚举，确保在 Serverless/边缘节点中无运行时依赖、可序列化。
 */

/** 占星计算引擎版本号，用于真值缓存键与可复现声明。 */
export const ENGINE_VERSION = 'astro-0.1.0' as const;

/** 相位容许度表版本号，变更时须同步更新下游缓存。 */
export const ORB_TABLE_VERSION = 'orb-v1' as const;

/** 十二星座顺序表，按黄道 0° 白羊座起始排列。 */
export const ZODIAC_SIGNS = [
  { id: 'aries', cn: '白羊座', startLongitude: 0 },
  { id: 'taurus', cn: '金牛座', startLongitude: 30 },
  { id: 'gemini', cn: '双子座', startLongitude: 60 },
  { id: 'cancer', cn: '巨蟹座', startLongitude: 90 },
  { id: 'leo', cn: '狮子座', startLongitude: 120 },
  { id: 'virgo', cn: '处女座', startLongitude: 150 },
  { id: 'libra', cn: '天秤座', startLongitude: 180 },
  { id: 'scorpio', cn: '天蝎座', startLongitude: 210 },
  { id: 'sagittarius', cn: '射手座', startLongitude: 240 },
  { id: 'capricorn', cn: '摩羯座', startLongitude: 270 },
  { id: 'aquarius', cn: '水瓶座', startLongitude: 300 },
  { id: 'pisces', cn: '双鱼座', startLongitude: 330 },
] as const;

/** 五大古典/现代核心相位。 */
export const ASPECT_TYPES = [
  'conjunction',
  'opposition',
  'square',
  'trine',
  'sextile',
] as const;

/** 相位类型枚举。 */
export type AspectType = (typeof ASPECT_TYPES)[number];

/** 时间精度枚举：精确到分钟、近似、未知。 */
export type TimePrecision = 'minute' | 'approximate' | 'unknown';

/** 相位定义：目标角度与容许度（单位：度）。 */
export interface AspectDefinition {
  type: AspectType;
  /** 理想相位角 */
  angle: number;
  /** 容许度正负范围 */
  orb: number;
  /** 中文名 */
  cn: string;
}

/** 冻结的相位容许度表（orb-v1）。 */
export const ASPECT_TABLE: readonly AspectDefinition[] = [
  { type: 'conjunction', angle: 0, orb: 8, cn: '合相' },
  { type: 'opposition', angle: 180, orb: 8, cn: '对冲' },
  { type: 'square', angle: 90, orb: 6, cn: '刑相' },
  { type: 'trine', angle: 120, orb: 6, cn: '拱相' },
  { type: 'sextile', angle: 60, orb: 4, cn: '六合' },
] as const;

/** 星座对象类型，由 ZODIAC_SIGNS 推导。 */
export type ZodiacSign = (typeof ZODIAC_SIGNS)[number];

/** 本地时间歧义处理策略：首次出现、第二次出现、无歧义。 */
export type LocalTimeDisambiguation = 'first' | 'second' | null;
