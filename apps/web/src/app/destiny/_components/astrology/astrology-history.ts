/**
 * 星座寰宇 · 统一历史记录接入
 *
 * 真值完成时按统一历史规范写入一条「命理」类型结果（标题「星座寰宇 · {昵称}的本命星盘」）。
 * 低敏摘要仅含昵称、模块名、生成日期与一句主轴（≤28 字），不含生日/城市/精确时间/度数、
 * 月亮星座或相位等可反推出生时段的信息。删除复用现有历史删除并清除该条载荷，不可恢复。
 */

import type { ChartFacts, AstrologyReport, BirthFormData } from './astrology-types';

/** 低敏摘要：仅昵称/模块/日期/主轴，绝不包含敏感出生信息或可反推内容。 */
export function buildAstrologyPreview(report: AstrologyReport): string {
  const tone = (report.coreTone || report.summary || '').slice(0, 28);
  return tone;
}

/** 历史记录标题。 */
export function buildAstrologyHistoryTitle(name: string): string {
  return `星座寰宇 · ${name || '匿名'}的本命星盘`;
}

/** 生成历史记录载荷（DestinyHistoryItem 兼容）。 */
export function buildAstrologyHistoryPayload(input: {
  formData: BirthFormData;
  chartFacts: ChartFacts;
  report: AstrologyReport;
}) {
  const { formData, chartFacts, report } = input;
  return {
    type: 'destiny' as const,
    subType: 'astrology' as const,
    title: buildAstrologyHistoryTitle(formData.name),
    preview: buildAstrologyPreview(report),
    model: report.title ? 'doubao' : 'doubao',
    coreTone: report.coreTone,
    formData: {
      // 仅存低敏摘要所需字段 + 重算所需精度；不存精确出生时刻到历史列表展示层
      name: formData.name,
      timePrecision: formData.timePrecision,
      focusTheme: formData.focusTheme,
    },
    reportData: {
      chartFacts,
      report,
    },
    profileSummary: {
      name: formData.name || '匿名',
      gender: '',
      birthDate: chartFacts.birthTimestamp,
    },
  };
}

/** 判断历史记录摘要是否已脱敏（不含敏感出生信息）。 */
export function isPreviewSanitized(preview: string): boolean {
  // 不允许出现精确时间、度数、城市坐标、月亮/上升等可反推出生时段的内容
  const forbidden = /(\d{1,2}:\d{2}|\d+°|上升|度数|经纬)/;
  return !forbidden.test(preview);
}
