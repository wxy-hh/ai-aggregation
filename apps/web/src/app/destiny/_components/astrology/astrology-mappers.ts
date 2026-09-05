/**
 * astrology-mappers.ts —— 星座寰宇表单 → 出生档案（AstroBirthProfile）的映射与校验
 *
 * 校验规则（设计文档 §6.3 表单即时反馈）：
 * - 阳历出生日期必填；非法/未来日期即时在字段下反馈，不阻断骨架
 * - 出生城市必须精确选中（经纬度与 IANA 时区齐全），模糊文本不允许提交
 * - 时间精度仅三档；时间选择器不默认当前时刻、12:00 或任何推测值
 */

import type { AstroBirthProfile } from '@/lib/astrology/chart-facts';
import type { AstrologyFormData } from '../astrology-types';

/** 约时时段选项：三小时粒度八段（含起点，不含终点；§6.3「可计算的时间区间」） */
export const APPROXIMATE_SLOTS: Array<{ value: string; label: string; rangeHint: string }> = [
  { value: '00:00-03:00', label: '00:00–03:00', rangeHint: '00:00 至 02:59' },
  { value: '03:00-06:00', label: '03:00–06:00', rangeHint: '03:00 至 05:59' },
  { value: '06:00-09:00', label: '06:00–09:00', rangeHint: '06:00 至 08:59' },
  { value: '09:00-12:00', label: '09:00–12:00', rangeHint: '09:00 至 11:59' },
  { value: '12:00-15:00', label: '12:00–15:00', rangeHint: '12:00 至 14:59' },
  { value: '15:00-18:00', label: '15:00–18:00', rangeHint: '15:00 至 17:59' },
  { value: '18:00-21:00', label: '18:00–21:00', rangeHint: '18:00 至 20:59' },
  { value: '21:00-24:00', label: '21:00–24:00', rangeHint: '21:00 至 23:59' },
];

/** 小数度 → 度分格式：14.5 → 14°30′（结果页与深度区共用） */
export function formatDegreeMinute(deg: number): string {
  const d = Math.floor(deg);
  const m = Math.round((deg - d) * 60);
  return m === 0 ? `${d}°` : `${d}°${String(m).padStart(2, '0')}′`;
}

/** 某时刻某 IANA 时区的 UTC 偏移（分钟）：浏览器 Intl 自带历史 tzdb（含历史夏令时） */
export function utcOffsetMinutesFor(timezone: string, at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = dtf.formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'));
  return Math.round((asUTC - at.getTime()) / 60000);
}

/** UTC 偏移分钟 → 可读串（如 UTC+8 / UTC-4） */
export function formatUtcOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return m === 0 ? `UTC${sign}${h}` : `UTC${sign}${h}:${String(m).padStart(2, '0')}`;
}

/** 日期合法性：年月日范围、当月天数、非未来日期 */
export function isValidBirthDate(date: { year: number; month: number; day: number } | null): boolean {
  if (!date) return false;
  const { year, month, day } = date;
  const currentYear = new Date().getFullYear();
  if (year < 1900 || year > currentYear) return false;
  if (month < 1 || month > 12) return false;
  const dim = new Date(year, month, 0).getDate();
  if (day < 1 || day > dim) return false;
  const d = new Date(year, month - 1, day);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  return d.getTime() <= today.getTime();
}

/** 第一步校验：日期必填且合法 */
export function validateAstrologyStep1(formData: AstrologyFormData): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (!formData.birthDate) {
    errors.birthDate = '请选择阳历出生日期';
  } else if (!isValidBirthDate(formData.birthDate)) {
    errors.birthDate = '日期无效或晚于今天，请检查后重选';
  }
  return errors;
}

/** 第二步校验：按时间精度分档；城市必须精确选中 */
export function validateAstrologyStep2(formData: AstrologyFormData): Partial<Record<string, string>> {
  const errors: Partial<Record<string, string>> = {};
  if (formData.timePrecision === 'accurate') {
    if (formData.birthTime.hour === '' || formData.birthTime.minute === '') {
      errors.birthTime = '请选择出生时刻（时与分）';
    }
  } else if (formData.timePrecision === 'approximate') {
    if (!formData.approximateSlot) {
      errors.approximateSlot = '请选择一个大约时段';
    }
  }
  if (!formData.location.name || formData.location.lat === null || formData.location.lon === null || !formData.location.timezone) {
    errors.location = '请从候选列表中精确选择出生城市';
  }
  return errors;
}

/** 分钟偏移 → ISO 时区后缀（如 +08:00） */
function isoOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const abs = Math.abs(offsetMinutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 表单 → 出生档案（唯一真值接缝的输入）；校验未过返回 null */
export function mapFormToAstroProfile(formData: AstrologyFormData): AstroBirthProfile | null {
  if (!isValidBirthDate(formData.birthDate)) return null;
  const { year, month, day } = formData.birthDate!;
  const { name, location } = formData;
  if (location.lat === null || location.lon === null || !location.timezone) return null;

  // 以当地正午近似取该日 UTC 偏移（历史夏令时由浏览器 tzdb 换算）
  const noonLocalAsUTC = new Date(Date.UTC(year, month - 1, day, 4, 0, 0));
  const offset = utcOffsetMinutesFor(location.timezone, noonLocalAsUTC);

  const base = {
    name: name.trim() || null,
    birthDate: { year, month, day },
    city: location.name,
    latitude: location.lat,
    longitude: location.lon,
    timezone: location.timezone,
    // 夏令时重复时刻歧义选择：基础表单未提供选择器，测试期为 null（真实域落地时补交互界面）
    localTimeDisambiguation: null,
    // 时区数据库版本：测试期以浏览器国际化接口口径标识
    tzdbVersion: 'browser-intl',
  };

  if (formData.timePrecision === 'accurate') {
    const hour = Number(formData.birthTime.hour);
    const minute = Number(formData.birthTime.minute);
    if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return null;
    }
    return {
      ...base,
      timePrecision: 'accurate',
      birthTime: { hour, minute },
      timeRange: null,
      utcOffsetMinutes: offset,
    };
  }

  if (formData.timePrecision === 'approximate') {
    const slot = APPROXIMATE_SLOTS.find((s) => s.value === formData.approximateSlot);
    if (!slot) return null;
    const [start, end] = slot.value.split('-');
    const suffix = isoOffset(offset);
    // 原始半开区间 [localStart, localEnd) 原样保存（文档 §9.2）；24:00 由日期进位为次日 00:00
    const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
    const localEnd =
      end === '24:00'
        ? `${nextDay.getUTCFullYear()}-${pad2(nextDay.getUTCMonth() + 1)}-${pad2(nextDay.getUTCDate())}T00:00:00${suffix}`
        : `${year}-${pad2(month)}-${pad2(day)}T${end}:00${suffix}`;
    return {
      ...base,
      timePrecision: 'approximate',
      birthTime: null,
      timeRange: { localStart: `${year}-${pad2(month)}-${pad2(day)}T${start}:00${suffix}`, localEnd, timezone: location.timezone },
      utcOffsetMinutes: offset,
    };
  }

  // 完全未知：不填任何时刻，绝不用中点或 12:00 补算
  return {
    ...base,
    timePrecision: 'unknown',
    birthTime: null,
    timeRange: null,
    utcOffsetMinutes: null,
  };
}
