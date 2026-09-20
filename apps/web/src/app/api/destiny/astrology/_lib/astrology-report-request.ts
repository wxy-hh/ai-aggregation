/**
 * astrology-report-request.ts —— 星座寰宇报告路由的请求体口径与档案映射
 *
 * 请求体与表单同形（apps/web/src/app/destiny/_components/astrology-types.ts 的 AstrologyFormData），
 * 由前端唯一异步接缝（lib/astrology/chart-request.ts）提交；本模块负责：
 * - Zod 校验：字段覆盖表单全部字段，未来日期 / 时分范围 / 约时段 / 时区合法性按表单口径拦截（400）；
 * - 出生档案映射：复用表单同一映射函数 mapFormToAstroProfile，时区、历史夏令时与 DST 歧义口径全链路唯一。
 */

import { z } from 'zod';
import {
  APPROXIMATE_SLOTS,
  isValidBirthDate,
  mapFormToAstroProfile,
} from '@/app/destiny/_components/astrology/astrology-mappers';
import type { AstroBirthProfile } from '@/lib/astrology/chart-facts';

/** 出生时刻串（表单口径：一位或两位数字；空串表示该档不填时刻） */
const TimePartSchema = z.string().trim().regex(/^\d{0,2}$/, '出生时刻应为数字');

const BirthDateSchema = z.object({
  year: z.number().int().min(1900, '出生年份不得早于 1900 年').max(2100, '出生年份不合法'),
  month: z.number().int().min(1, '出生月份不合法').max(12, '出生月份不合法'),
  day: z.number().int().min(1, '出生日期不合法').max(31, '出生日期不合法'),
});

/** 城市必须携带经纬度与 IANA 时区（模糊文本、缺经纬度一律不接受） */
const LocationSchema = z.object({
  name: z.string().trim().min(1, '出生城市不能为空'),
  lat: z.number().min(-90, '纬度不合法').max(90, '纬度不合法'),
  lon: z.number().min(-180, '经度不合法').max(180, '经度不合法'),
  timezone: z.string().trim().min(1, '出生城市缺少时区'),
});

/** 时区名是否被运行时 tzdb 识别（非法时区在换算期才炸，必须提前拦在 400） */
function isKnownTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * 报告请求体（表单同形）：
 * nick 昵称可选、出生日期必填、时间精度三档、精确时分或大约时段、城市含经纬度与时区、
 * 关注主题可选（只影响阅读排序，不改变盘面）；provider 为解读层模型（默认豆包，与模型切换器同口径）。
 */
export const AstrologyReportRequestSchema = z
  .object({
    name: z.string().trim().max(40, '称呼过长').optional().default(''),
    birthDate: BirthDateSchema,
    topic: z.enum(['self', 'love', 'career', 'recent']).nullish().transform((value) => value ?? null),
    timePrecision: z.enum(['accurate', 'approximate', 'unknown']),
    provider: z.enum(['doubao', 'deepseek']).default('doubao'),
    birthTime: z
      .object({ hour: TimePartSchema, minute: TimePartSchema })
      .optional()
      .default({ hour: '', minute: '' }),
    approximateSlot: z.string().trim().optional().default(''),
    location: LocationSchema,
  })
  .superRefine((value, ctx) => {
    // 与表单 isValidBirthDate 同口径：非法日期与未来日期一并拦截
    if (!isValidBirthDate(value.birthDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['birthDate'],
        message: '日期无效或晚于今天，请检查后重选',
      });
    }

    if (value.timePrecision === 'accurate') {
      const hour = Number(value.birthTime.hour);
      const minute = Number(value.birthTime.minute);
      const valid =
        value.birthTime.hour !== '' &&
        value.birthTime.minute !== '' &&
        Number.isInteger(hour) &&
        Number.isInteger(minute) &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59;
      if (!valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['birthTime'],
          message: '请选择出生时刻（时与分）',
        });
      }
    }

    if (value.timePrecision === 'approximate') {
      const slot = APPROXIMATE_SLOTS.find((item) => item.value === value.approximateSlot);
      if (!slot) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['approximateSlot'],
          message: '请选择一个大约时段',
        });
      }
    }

    if (!isKnownTimezone(value.location.timezone)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['location.timezone'],
        message: '出生城市的时区无法识别，请重新选择城市',
      });
    }
  });

export type AstrologyReportRequestBody = z.infer<typeof AstrologyReportRequestSchema>;

/** 出生资料无法换算为可计算档案（可直接展示给用户的原因，路由据此回 error 事件） */
export class AstrologyReportRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AstrologyReportRequestError';
  }
}

/**
 * 请求体 → 出生档案（计算域唯一入参）。
 * 复用表单同口径映射：时区取城市自带 IANA 时区、本地时刻按运行时 tzdb 换算（含历史夏令时），
 * 约时档原样保存半开区间 [localStart, localEnd)，未知档不填任何时刻。
 * 服务端改写 tzdbVersion：实际参与换算的是 Node 运行时的 ICU 时区库。
 */
export function buildProfileFromRequestBody(body: AstrologyReportRequestBody): AstroBirthProfile {
  const profile = mapFormToAstroProfile(body);
  if (!profile) {
    throw new AstrologyReportRequestError('出生资料无法换算为可计算的出生档案，请返回检查后重试');
  }
  return { ...profile, tzdbVersion: `node-icu-${process.versions.icu ?? 'unknown'}` };
}
