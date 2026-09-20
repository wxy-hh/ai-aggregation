/**
 * transit-selection.ts —— 星座寰宇 · 本周行运筛选（03 工单）
 *
 * 为什么需要筛选：一个自然周的行运事实可达 50 条以上（T1 标注），全量进提示词会稀释
 * 模型的注意力、也让「本周行动三角」失去焦点；解读层的行运引用必须是筛后集合。
 *
 * 紧密度口径（行运事实层没有 orb 字段，这里用可复现的估算代理指标）：
 *   扫过角度 ≈ 在容许度内的时长（天）× 该星体日均运动（度/天）
 *   估算最小偏差 ≈ 容许度上限 − 扫过角度 ÷ 2
 * 依据：相位偏差随时间近似线性变化，落在容许度内的时段以精确成相时刻为中心对称，
 * 因此「在容许度内扫过的角度」越大，本周内的最小偏差越小（0 = 本周内精确成相）。
 * 两端被自然周窗口截断的行运（整周都在容许度内）无法据此估算，按「整周持续」标注，
 * 排序时沿用其截断时长——不臆造精确度，也不把它伪装成本周事件。
 */

import { ORB_TABLE, type AstrologyChartFacts, type PlanetBody, type TransitFact } from './chart-facts';
import { transitRefKey } from './interpretation';

/** 十星体日均运动（度/天，近似平运动，仅用于紧密度估算） */
export const TRANSIT_DAILY_MOTION: Record<PlanetBody, number> = {
  sun: 0.9856,
  moon: 13.1764,
  mercury: 1.383,
  venus: 1.2,
  mars: 0.524,
  jupiter: 0.0831,
  saturn: 0.0335,
  uranus: 0.0117,
  neptune: 0.006,
  pluto: 0.0039,
};

/** 单条入选行运（含估算紧密度与引用键） */
export interface SelectedTransit {
  refKey: string;
  fact: TransitFact;
  /** 估算最小偏差（度）：0 = 本周内精确成相（或整周都在容许度内） */
  orb: number;
  /** 两端被自然周窗口截断：整周都在容许度内的持续性行运 */
  coversWeek: boolean;
}

/** 提示词里最多带入的行运条数（工单建议 ≤8 条） */
export const MAX_PROMPT_TRANSITS = 8;

const DAY_MS = 24 * 60 * 60 * 1000;

/** 单条行运的紧密度与持续性估算（纯函数，便于单测） */
export function estimateTransitTightness(
  fact: TransitFact,
  window: { weekStartMs: number; weekEndMs: number }
): { orb: number; coversWeek: boolean } {
  const rawStart = Date.parse(fact.startsAt);
  const rawEnd = Date.parse(fact.endsAt);
  const start = Number.isFinite(rawStart) ? Math.max(rawStart, window.weekStartMs) : window.weekStartMs;
  const end = Number.isFinite(rawEnd) ? Math.min(rawEnd, window.weekEndMs) : window.weekEndMs;
  const spanDays = Math.max(0, end - start) / DAY_MS;
  const swept = spanDays * TRANSIT_DAILY_MOTION[fact.transitingBody];
  const orbLimit = ORB_TABLE[fact.aspect];
  return {
    orb: Math.max(0, orbLimit - swept / 2),
    coversWeek: rawStart <= window.weekStartMs && rawEnd >= window.weekEndMs,
  };
}

/**
 * 本周行运筛选：按估算紧密度升序（越紧越前）取前 limit 条，同一行运键只保留最紧的一条。
 * 排序完全由事实层与常数决定，同一份真值必得同一份筛选结果（可复现）。
 */
export function selectActiveTransits(
  facts: AstrologyChartFacts,
  options: { weekStartMs: number; weekEndMs: number; limit?: number }
): SelectedTransit[] {
  const limit = Math.max(0, options.limit ?? MAX_PROMPT_TRANSITS);
  const deduped = new Map<string, SelectedTransit>();
  for (const fact of facts.transits) {
    const refKey = transitRefKey(fact);
    const tightness = estimateTransitTightness(fact, options);
    const existing = deduped.get(refKey);
    if (existing && existing.orb <= tightness.orb) {
      existing.coversWeek = existing.coversWeek || tightness.coversWeek;
      continue;
    }
    deduped.set(refKey, {
      refKey,
      fact,
      orb: tightness.orb,
      coversWeek: existing?.coversWeek === true || tightness.coversWeek,
    });
  }
  return [...deduped.values()]
    .sort((a, b) => {
      if (a.orb !== b.orb) return a.orb - b.orb;
      if (a.fact.startsAt !== b.fact.startsAt) return a.fact.startsAt < b.fact.startsAt ? -1 : 1;
      return a.refKey < b.refKey ? -1 : a.refKey > b.refKey ? 1 : 0;
    })
    .slice(0, limit);
}
