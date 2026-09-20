/**
 * transit-selection.test.ts —— 星座寰宇 · 本周行运筛选（03 工单）
 *
 * 锁定的外部行为：
 * - 行运进提示词前按估算紧密度升序取前 N（默认 8 条），同一行运键只保留最紧的一条；
 * - 紧密度用「在容许度内的时长 × 日均运动」估算，可复现（同一份真值必得同一份筛选）；
 * - 两端被自然周窗口截断的行运标注为「整周持续」，不臆造精确度。
 */

import { describe, expect, it } from 'vitest';
import { computeChartFacts } from './chart-engine';
import type { AstrologyChartFacts, TransitFact } from './chart-facts';
import { SAMPLE_PROFILE_ACCURATE } from './sample-chart';
import {
  MAX_PROMPT_TRANSITS,
  estimateTransitTightness,
  selectActiveTransits,
  TRANSIT_DAILY_MOTION,
} from './transit-selection';

const WEEK_START = Date.parse('2026-08-31T00:00:00Z');
const WEEK_END = WEEK_START + 7 * 24 * 60 * 60 * 1000;
const WINDOW = { weekStartMs: WEEK_START, weekEndMs: WEEK_END };

function transit(partial: Partial<TransitFact> & Pick<TransitFact, 'transitingBody' | 'natalTarget'>): TransitFact {
  return {
    startsAt: new Date(WEEK_START).toISOString(),
    endsAt: new Date(WEEK_END).toISOString(),
    aspect: 'conjunction',
    theme: '主题',
    ...partial,
  };
}

function factsWith(transits: TransitFact[]): AstrologyChartFacts {
  return { ...computeChartFacts(SAMPLE_PROFILE_ACCURATE), transits };
}

describe('紧密度估算', () => {
  it('扫过角度越大 → 估算偏差越小（快速星体的短窗口即紧相位）', () => {
    // 月亮合相：容许度 8°，日均运动 13.18° → 1.3 天窗口扫过约 17.1°（跨满容许度）→ 估算 0°
    const tight = estimateTransitTightness(
      transit({
        transitingBody: 'moon',
        natalTarget: 'sun',
        startsAt: new Date(WEEK_START + 3 * 24 * 3600 * 1000).toISOString(),
        endsAt: new Date(WEEK_START + 3 * 24 * 3600 * 1000 + 1.3 * 24 * 3600 * 1000).toISOString(),
      }),
      WINDOW
    );
    expect(tight.orb).toBe(0);
    expect(tight.coversWeek).toBe(false);

    // 月亮只在容许度边缘掠过 0.2 天：扫过约 2.6° → 估算偏差约 8 − 1.3 = 6.7°
    const loose = estimateTransitTightness(
      transit({
        transitingBody: 'moon',
        natalTarget: 'sun',
        startsAt: new Date(WEEK_START + 5 * 24 * 3600 * 1000).toISOString(),
        endsAt: new Date(WEEK_START + 5 * 24 * 3600 * 1000 + 0.2 * 24 * 3600 * 1000).toISOString(),
      }),
      WINDOW
    );
    expect(loose.orb).toBeCloseTo(8 - (0.2 * TRANSIT_DAILY_MOTION.moon) / 2, 6);
  });

  it('整周都在容许度内：标注为持续性行运，估算值不臆造为精确成相', () => {
    const slow = estimateTransitTightness(
      transit({ transitingBody: 'saturn', natalTarget: 'sun' }),
      WINDOW
    );
    expect(slow.coversWeek).toBe(true);
    // 土星一周扫过约 0.23°，估算偏差接近容许度上限（无法判断何时精确）
    expect(slow.orb).toBeGreaterThan(7.8);
  });
});

describe('本周行运筛选', () => {
  it('真实盘面：条数不超过上限，按估算紧密度升序，引用键唯一', () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    const selected = selectActiveTransits(facts, { ...WINDOW });
    expect(facts.transits.length).toBeGreaterThan(0);
    expect(selected.length).toBeLessThanOrEqual(MAX_PROMPT_TRANSITS);
    for (let i = 1; i < selected.length; i += 1) {
      expect(selected[i - 1].orb).toBeLessThanOrEqual(selected[i].orb);
    }
    expect(new Set(selected.map((s) => s.refKey)).size).toBe(selected.length);
  });

  it('同一份真值必得同一份筛选（确定性）', () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    expect(selectActiveTransits(facts, WINDOW).map((s) => s.refKey)).toEqual(
      selectActiveTransits(facts, WINDOW).map((s) => s.refKey)
    );
  });

  it('紧行运优先于松行运；同一行运键的多个时段只保留最紧的一条', () => {
    const tightMoon = transit({
      transitingBody: 'moon',
      natalTarget: 'sun',
      startsAt: new Date(WEEK_START + 2 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(WEEK_START + 3.4 * 24 * 3600 * 1000).toISOString(),
    });
    const looseMoon = transit({
      transitingBody: 'moon',
      natalTarget: 'sun',
      startsAt: new Date(WEEK_START + 5 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(WEEK_START + 5.2 * 24 * 3600 * 1000).toISOString(),
    });
    const farVenus = transit({
      transitingBody: 'venus',
      natalTarget: 'pluto',
      aspect: 'square',
      startsAt: new Date(WEEK_START + 4 * 24 * 3600 * 1000).toISOString(),
      endsAt: new Date(WEEK_START + 4.1 * 24 * 3600 * 1000).toISOString(),
    });

    const selected = selectActiveTransits(factsWith([looseMoon, tightMoon, farVenus]), {
      ...WINDOW,
      limit: 8,
    });
    expect(selected.map((s) => s.refKey)).toEqual(['transit:moon:conjunction:sun', 'transit:venus:square:pluto']);
    expect(selected[0].orb).toBe(0);
  });

  it('limit 为 0 时返回空集合（调用方显式关闭行运引用）', () => {
    const facts = computeChartFacts(SAMPLE_PROFILE_ACCURATE);
    expect(selectActiveTransits(facts, { ...WINDOW, limit: 0 })).toEqual([]);
  });
});
