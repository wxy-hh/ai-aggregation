/**
 * sample-chart.test.ts —— 冻结示例盘的可复现性测试
 *
 * 冻结档案必须能由真实计算域在冻结时刻（SAMPLE_CHART_META.frozenAt）原样重算出来：
 * 除行运（示例盘不冻结行运，恒为空数组）外逐字段一致。若引擎口径升级后忘记重新冻结，
 * 本测试会立即失败——它守住「入口首页示例与真实产出同口径」这条承诺。
 */

import { describe, expect, it } from 'vitest';
import type { AstroBirthProfile, AstrologyChartFacts } from './chart-facts';
import { computeChartFactsAt } from './chart-engine';
import {
  SAMPLE_CHART_ACCURATE,
  SAMPLE_CHART_APPROXIMATE,
  SAMPLE_CHART_META,
  SAMPLE_CHART_UNKNOWN,
  SAMPLE_PROFILE_ACCURATE,
  SAMPLE_PROFILE_APPROXIMATE,
  SAMPLE_PROFILE_UNKNOWN,
} from './sample-chart';

/** 冻结档案不含行运：比对前把重算结果的行运清空 */
function withoutTransits(facts: AstrologyChartFacts): AstrologyChartFacts {
  return { ...facts, transits: [] };
}

const CASES: Array<[string, AstroBirthProfile, AstrologyChartFacts]> = [
  ['accurate', SAMPLE_PROFILE_ACCURATE, SAMPLE_CHART_ACCURATE],
  ['approximate', SAMPLE_PROFILE_APPROXIMATE, SAMPLE_CHART_APPROXIMATE],
  ['unknown', SAMPLE_PROFILE_UNKNOWN, SAMPLE_CHART_UNKNOWN],
];

describe('冻结示例盘可复现（引擎口径未漂移）', () => {
  const frozenAt = new Date(SAMPLE_CHART_META.frozenAt);

  for (const [label, profile, frozen] of CASES) {
    it(`${label} 档：冻结时刻重算与冻结档案逐字段一致`, () => {
      expect(withoutTransits(computeChartFactsAt(profile, frozenAt))).toEqual(frozen);
    });
  }

  it('冻结档案的引擎与口径版本与回填一致', () => {
    expect(SAMPLE_CHART_ACCURATE.engineVersion).toBe(SAMPLE_CHART_META.engineVersion);
    expect(SAMPLE_CHART_ACCURATE.orbTableVersion).toBe(SAMPLE_CHART_META.orbTableVersion);
    expect(SAMPLE_CHART_ACCURATE.calculatedAt).toBe(SAMPLE_CHART_META.frozenAt);
    for (const [, , frozen] of CASES) {
      expect(frozen.transits).toEqual([]);
    }
  });
});
