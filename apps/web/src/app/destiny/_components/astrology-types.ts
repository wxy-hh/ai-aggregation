// 星座寰宇表单数据类型（字段口径对齐设计文档 §6.3 与 §9.3 AstroBirthProfile）
// 注意：占星表单无性别字段、以阳历为唯一历法（§6.3「现代占星以阳历生日计算」）

import type { TimePrecision } from '@/lib/astrology/chart-facts';

/** 关注主题（可选单选，用于排序报告而非改变盘面） */
export type AstrologyTopic = 'self' | 'love' | 'career' | 'recent';

export type { TimePrecision };

export type AstrologyFormData = {
  /** 称呼（可空，用于报告称呼） */
  name: string;
  /** 阳历出生日期（必填）；null 表示未填 */
  birthDate: { year: number; month: number; day: number } | null;
  /** 关注主题（可空单选） */
  topic: AstrologyTopic | null;
  /** 出生时间精度档位：准确到分钟 / 大约时段 / 完全未知（仅三档，无第四档） */
  timePrecision: TimePrecision;
  /** 准确时间（accurate 档必填；不默认当前时刻或任何推测值） */
  birthTime: { hour: string; minute: string };
  /** 大约时段（approximate 档必填），如 '13:00-16:00'；原始区间原样保存 */
  approximateSlot: string;
  /** 出生城市（必须精确选中：保存经纬度与 IANA 时区） */
  location: { name: string; lat: number | null; lon: number | null; timezone: string | null };
};

export function createDefaultAstrologyFormData(): AstrologyFormData {
  return {
    name: '',
    birthDate: null,
    topic: null,
    timePrecision: 'accurate',
    birthTime: { hour: '', minute: '' },
    approximateSlot: '',
    location: { name: '', lat: null, lon: null, timezone: null },
  };
}
