/**
 * 星座寰宇 · 表单工具函数与常量
 *
 * 提供太阳星座即时预览、字段校验与关注主题元信息。
 * 太阳星座按阳历日期区间判定（仅作预览提示，不提前生成性格评价）。
 */

import type {
  BirthFormData,
  AstrologyFieldErrors,
  FocusTheme,
  FocusThemeMeta,
  ZodiacSignId,
} from './astrology-types';

/** 关注主题（单选，仅排序报告而非改盘）。 */
export const FOCUS_THEMES: FocusThemeMeta[] = [
  { key: 'self', label: '认识自己', description: '核心气质与内在动机' },
  { key: 'relationship', label: '感情关系', description: '亲密需求与沟通模式' },
  { key: 'career', label: '事业方向', description: '优势场景与协作方式' },
  { key: 'spirit', label: '近期状态', description: '当下能量与行动节奏' },
];

/** 太阳星座区间：[起月, 起日, 星座, 中文名]。按阳历。 */
const SUN_SIGN_TABLE: Array<[number, number, ZodiacSignId, string]> = [
  [3, 21, 'aries', '白羊座'],
  [4, 20, 'taurus', '金牛座'],
  [5, 21, 'gemini', '双子座'],
  [6, 21, 'cancer', '巨蟹座'],
  [7, 23, 'leo', '狮子座'],
  [8, 23, 'virgo', '处女座'],
  [9, 23, 'libra', '天秤座'],
  [10, 23, 'scorpio', '天蝎座'],
  [11, 22, 'sagittarius', '射手座'],
  [12, 22, 'capricorn', '摩羯座'],
  [1, 20, 'aquarius', '水瓶座'],
  [2, 19, 'pisces', '双鱼座'],
];

/**
 * 按阳历生日返回太阳星座（仅用于预览条）。
 * 返回中文名，如「天秤座」。
 */
export function sunSignPreview(month: number, day: number): { id: ZodiacSignId; label: string } | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const md = month * 100 + day;
  // 魔羯座跨年（12/22 ~ 次年 1/19），单独处理
  if (md >= 1222 || md < 120) return { id: 'capricorn', label: '摩羯座' };
  // 取「起始月日 <= 当前」中最大的边界（表按黄道顺序、含跨年，故线性扫描取最大值）
  let result: { id: ZodiacSignId; label: string } = { id: 'capricorn', label: '摩羯座' };
  let best = -1;
  for (const [m, d, id, label] of SUN_SIGN_TABLE) {
    const boundary = m * 100 + d;
    if (boundary <= md && boundary > best) {
      best = boundary;
      result = { id, label };
    }
  }
  return result;
}

/** 校验第一步（身份与日期）。 */
export function validateStepOne(formData: BirthFormData): AstrologyFieldErrors {
  const errors: AstrologyFieldErrors = {};
  const { year, month, day } = formData.solarDate;
  const date = new Date(Date.UTC(year, month - 1, day));
  const valid =
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  if (!valid) {
    errors.solarDate = '请输入有效的阳历出生日期';
  } else if (date.getTime() > Date.now()) {
    errors.solarDate = '出生日期不能是未来日期';
  }
  if (formData.name && formData.name.trim().length > 24) {
    errors.name = '昵称不超过 24 字';
  }
  return errors;
}

/** 校验第二步（时间与地点）。 */
export function validateStepTwo(formData: BirthFormData): AstrologyFieldErrors {
  const errors: AstrologyFieldErrors = {};
  const { timePrecision, birthTime, approximateRange, location } = formData;

  if (timePrecision === 'minute') {
    if (!birthTime) {
      errors.birthTime = '请选择出生时间（时:分）';
    }
  } else if (timePrecision === 'approximate') {
    if (!approximateRange || !approximateRange.localStart || !approximateRange.localEnd) {
      errors.approximateRange = '请选择大致的出生时段';
    }
  }
  // unknown：无需时间

  if (!location.name || location.lat == null || location.lon == null) {
    errors.location = '请从候选列表中选择精确的出生城市';
  }
  return errors;
}

/** 时间精度选项（固定三档，无第四档「只知道日期」）。 */
export const TIME_PRECISION_OPTIONS: Array<{
  value: BirthFormData['timePrecision'];
  label: string;
  hint: string;
}> = [
  { value: 'minute', label: '准确到分钟', hint: '可计算上升、宫位与天顶' },
  { value: 'approximate', label: '大约时段', hint: '约时，部分盘面范围可能不稳定' },
  { value: 'unknown', label: '完全未知', hint: '将生成无宫位本命盘' },
];

/** 约时段候选（半开区间 [localStart, localEnd)）。 */
export const APPROXIMATE_RANGES: Array<{ label: string; localStart: string; localEnd: string }> = [
  { label: '凌晨 00:00–02:00', localStart: '00:00', localEnd: '02:00' },
  { label: '清晨 06:00–09:00', localStart: '06:00', localEnd: '09:00' },
  { label: '上午 09:00–12:00', localStart: '09:00', localEnd: '12:00' },
  { label: '午后 12:00–15:00', localStart: '12:00', localEnd: '15:00' },
  { label: '傍晚 15:00–19:00', localStart: '15:00', localEnd: '19:00' },
  { label: '夜晚 19:00–23:00', localStart: '19:00', localEnd: '23:00' },
];
