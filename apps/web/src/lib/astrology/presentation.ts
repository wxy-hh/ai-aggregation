/**
 * presentation.ts —— 星座寰宇展示层领域口径唯一的家
 *
 * 核心职责：
 * - 统一收敛所有展示层领域函数：出生摘要（birthSummary）、时间精度标签（precisionBadge）、
 *   宫制文案（houseSystemLabel）、三要素术语行（placementTermLine）；
 * - 纯函数模块，无 React 依赖，零副作用，供所有视图组件与纯单元测试复用；
 * - 消除组件间互相反向 import 函数的不良依赖，维持单向数据流动。
 */

import type { AstrologyFormData } from '@/app/destiny/_components/astrology-types';
import type { AstrologyChartFacts } from './chart-facts';
import { ZODIAC_CN } from './zh-names';
import { APPROXIMATE_SLOTS, formatDegreeMinute } from '@/app/destiny/_components/astrology/astrology-mappers';

/**
 * 统一出生资料摘要函数
 *
 * 口径规范：
 * - 无 opts.name：[date, time, location].filter(Boolean).join(' · ')（对应护照头文案形态）
 * - 有 opts.name：[name, date, time, location].filter(Boolean).join(' · ')（对应仪式页文案形态）
 * - 时间格式化（防御版）：
 *   - accurate 且 hour !== '' → HH:(minute || '0') 补齐两位；
 *   - approximate 且有 approximateSlot → 查找 APPROXIMATE_SLOTS 获取 label（未命中取 slot 原值），拼接「约 ...」；
 *   - 其它情况 → 「时间未知」。
 */
export function birthSummary(
  formData: AstrologyFormData,
  opts?: { name?: string }
): string {
  const d = formData.birthDate;
  const date = d ? `${d.year} 年 ${d.month} 月 ${d.day} 日` : '';
  let time = '时间未知';

  if (formData.timePrecision === 'accurate' && formData.birthTime.hour !== '') {
    time = `${formData.birthTime.hour.padStart(2, '0')}:${(formData.birthTime.minute || '0').padStart(2, '0')}`;
  } else if (formData.timePrecision === 'approximate' && formData.approximateSlot) {
    const slot = APPROXIMATE_SLOTS.find((s) => s.value === formData.approximateSlot);
    time = `约 ${slot?.label ?? formData.approximateSlot}`;
  }

  const parts =
    opts?.name !== undefined
      ? [opts.name, date, time, formData.location.name]
      : [date, time, formData.location.name];

  return parts.filter(Boolean).join(' · ');
}

/**
 * 时间精度标签（沿用表单语义色：准确靛蓝 / 约时琥珀 / 未知月光紫）
 * 约时降级（区间内角点不稳定 → 无宫位范围）必须如实标注「部分盘面范围不稳定」（§6.2）
 */
export function precisionBadge(
  formData: AstrologyFormData,
  facts: AstrologyChartFacts
): { text: string; className: string } {
  if (formData.timePrecision === 'accurate') {
    return {
      text: '准确到分钟',
      className:
        'border-indigo-300/50 bg-indigo-100/60 text-indigo-700 dark:border-indigo-300/25 dark:bg-indigo-400/10 dark:text-indigo-200',
    };
  }
  if (formData.timePrecision === 'approximate') {
    const degraded = facts.factStability.houses.reason === 'unstable-in-range';
    return {
      text: degraded ? '约时 · 部分盘面范围不稳定' : '大约时段 · 已校验稳定性',
      className:
        'border-amber-300/50 bg-amber-100/60 text-amber-700 dark:border-amber-300/25 dark:bg-amber-400/10 dark:text-amber-200',
    };
  }
  return {
    text: '时间未知 · 无宫位行星盘',
    className:
      'border-violet-300/50 bg-violet-100/60 text-violet-700 dark:border-violet-300/25 dark:bg-violet-400/10 dark:text-violet-200',
  };
}

/**
 * 口径行里的宫制文案：普拉西德制为默认，整宫制为高纬回退，无宫位为降级盘
 */
export function houseSystemLabel(facts: AstrologyChartFacts): string {
  if (facts.houseSystem === 'placidus') return '普拉西德制';
  if (facts.houseSystem === 'whole-sign') return '整宫制';
  return '无宫位';
}

/**
 * 三要素卡的术语层（太阳/月亮/上升各自取数，缺项不渲染）
 */
export function placementTermLine(
  facts: AstrologyChartFacts,
  key: 'sun' | 'moon' | 'ascendant'
): string {
  if (key === 'ascendant') {
    const a = facts.angles.ascendant;
    return a.sign
      ? `${ZODIAC_CN[a.sign]}${a.degree !== null && a.degree !== undefined ? ` ${formatDegreeMinute(a.degree)}` : ''}`
      : '';
  }
  const p = facts.planets.find((pl) => pl.body === key);
  if (!p?.sign) return '';
  const bits = [
    `${ZODIAC_CN[p.sign]}${p.degree !== null && p.degree !== undefined ? ` ${formatDegreeMinute(p.degree)}` : ''}`,
  ];
  if (p.house !== null && p.house !== undefined) bits.push(`第 ${p.house} 宫`);
  if (p.retrograde) bits.push('逆行中');
  return bits.join(' · ');
}
