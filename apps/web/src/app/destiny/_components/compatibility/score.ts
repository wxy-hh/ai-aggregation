import type { CompatibilityChartFacts, RelationType } from './types';

/**
 * 方案 B：双层分数（本地确定性，不经 LLM 改总分）
 * - 命盘底分 chartFacts.score：四视角共用
 * - 本视角适配分：底分 × 0.35 +（六维加权均值 + 关系事实偏置）× 0.65
 *   关系偏置由日主异同、五行互补/相似、地支呼应、资料完整度等确定性信号推导
 */

export type ScoreBand = 'high' | 'mid' | 'low';

export type DimensionScoreInput = {
  key: string;
  value: number;
};

/** 中心环文案：禁止「手感」字样，与双人主题默认标签对齐 */
export const RELATION_SCORE_LABEL: Record<RelationType, string> = {
  romance: '合拍指数',
  marriage: '经营稳度',
  friendship: '相处舒适度',
  partnership: '协作指数',
};

/** @deprecated 使用 RELATION_SCORE_LABEL */
export const FEEL_SCORE_LABEL = RELATION_SCORE_LABEL;

/** 各视角关键维度加权，拉开「这种关系好不好处」的差异 */
const DIMENSION_WEIGHTS: Record<RelationType, Record<string, number>> = {
  romance: {
    expression: 1.35,
    pace: 1.25,
    intimacy: 1.4,
    practical: 0.75,
    repair: 1.15,
    stability: 1.0,
  },
  marriage: {
    bond: 1.15,
    chores: 1.4,
    finance: 1.4,
    boundary: 1.3,
    repair: 1.2,
    vision: 1.1,
  },
  friendship: {
    trust: 1.3,
    contact: 1.4,
    support: 1.2,
    interest: 1.15,
    boundary: 1.3,
    repair: 1.0,
  },
  partnership: {
    alignment: 1.4,
    decision: 1.35,
    execution: 1.3,
    feedback: 1.1,
    risk: 1.35,
    credit: 1.25,
  },
};

const BASE_WEIGHT = 0.32;
const DIM_WEIGHT = 0.68;
/** 关系偏置可到 ±18，保证同盘四视角在六维接近时仍有可读分差 */
const BIAS_MIN = -18;
const BIAS_MAX = 18;

type ChartSignals = {
  sameDayMaster: boolean;
  /** 0–1：五行互补（一方偏强另一方偏弱） */
  elementComplement: number;
  /** 0–1：五行结构相似度 */
  elementSimilarity: number;
  /** 地支重叠数（年月日常见柱） */
  branchOverlap: number;
  partnerHasHour: boolean;
  /** 0–1：双方资料完整度 */
  completeness: number;
};

function clampScore(n: number) {
  return Math.max(22, Math.min(95, Math.round(n)));
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function bandOf(score: number): ScoreBand {
  if (score >= 75) return 'high';
  if (score >= 50) return 'mid';
  return 'low';
}

function elementMap(
  elements: Array<{ key: string; value: number }>
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const e of elements) {
    map[e.key] = Number(e.value) || 0;
  }
  return map;
}

/** 从 chartFacts 抽取可复现的结构信号（不依赖 LLM） */
export function extractChartSignals(
  facts: Pick<
    CompatibilityChartFacts,
    'self' | 'partner' | 'completeness'
  >
): ChartSignals {
  const selfMap = elementMap(facts.self.elements);
  const partnerMap = elementMap(facts.partner.elements);
  const keys = Array.from(
    new Set([...Object.keys(selfMap), ...Object.keys(partnerMap)])
  );

  let complementAcc = 0;
  let simAcc = 0;
  let weightAcc = 0;
  for (const key of keys) {
    const a = selfMap[key] ?? 0;
    const b = partnerMap[key] ?? 0;
    const maxAb = Math.max(a, b, 1);
    // 差距越大越「互补填空」，差距越小越「相似」
    const gap = Math.abs(a - b) / maxAb;
    complementAcc += gap;
    simAcc += 1 - gap;
    weightAcc += 1;
  }
  const n = Math.max(1, weightAcc);
  const elementComplement = clamp(complementAcc / n, 0, 1);
  const elementSimilarity = clamp(simAcc / n, 0, 1);

  const selfBranches = new Set(
    facts.self.pillars
      .filter((p) => p.label !== '时柱')
      .map((p) => p.branch)
      .filter(Boolean)
  );
  let branchOverlap = 0;
  for (const p of facts.partner.pillars) {
    if (p.label === '时柱' && !facts.partner.hasHourPillar) continue;
    if (p.branch && selfBranches.has(p.branch)) branchOverlap += 1;
  }

  const completenessScore = (c: CompatibilityChartFacts['completeness']['self']) => {
    if (c === 'full') return 1;
    if (c === 'partial-time' || c === 'partial-location') return 0.55;
    return 0.3;
  };
  const completeness =
    (completenessScore(facts.completeness.self) +
      completenessScore(facts.completeness.partner)) /
    2;

  return {
    sameDayMaster: facts.self.dayMaster === facts.partner.dayMaster,
    elementComplement,
    elementSimilarity,
    branchOverlap,
    partnerHasHour: Boolean(facts.partner.hasHourPillar),
    completeness,
  };
}

/**
 * 关系事实偏置：同一命盘在恋爱/婚姻/朋友/合作上的结构适配差。
 * 区间约 ±14，确定性、可复现。
 */
export function computeRelationBias(
  relationType: RelationType,
  signals: ChartSignals
): number {
  const {
    sameDayMaster,
    elementComplement,
    elementSimilarity,
    branchOverlap,
    partnerHasHour,
    completeness,
  } = signals;

  const overlapBoost =
    branchOverlap >= 3 ? 5 : branchOverlap >= 2 ? 3 : branchOverlap >= 1 ? 1.2 : -1.5;
  const completeBoost = (completeness - 0.6) * 8;

  let bias = 0;
  switch (relationType) {
    case 'romance':
      // 异日主 + 五行互补更利于吸引张力；地支呼应加分；缺时柱略降亲密确定性
      bias =
        (sameDayMaster ? -4 : 6) +
        elementComplement * 14 -
        5 +
        elementSimilarity * 2 +
        overlapBoost * 0.9 +
        (partnerHasHour ? 2 : -3.5) +
        completeBoost * 0.35;
      break;
    case 'marriage':
      // 稳定、相似结构与完整资料更利于共同生活；时柱更重要
      bias =
        (sameDayMaster ? 5 : 0.5) +
        elementSimilarity * 13 -
        4 +
        elementComplement * 3.5 +
        overlapBoost * 1.4 +
        (partnerHasHour ? 5 : -6) +
        completeBoost * 1.2;
      break;
    case 'friendship':
      // 共鸣与轻量边界：同日主/相似五行友好；对完整度要求低
      bias =
        (sameDayMaster ? 7 : 0.5) +
        elementSimilarity * 12 -
        3 +
        elementComplement * 1.5 +
        (branchOverlap >= 1 ? 2.5 : -0.5) +
        (partnerHasHour ? 0 : 2) +
        completeBoost * 0.15;
      break;
    case 'partnership':
      // 互补成事：异日主 + 高互补 + 风险/完整度
      bias =
        (sameDayMaster ? -3 : 5.5) +
        elementComplement * 16 -
        5 +
        elementSimilarity * 1.5 +
        overlapBoost * 0.7 +
        (partnerHasHour ? 3.5 : -4) +
        completeBoost * 1;
      break;
    default:
      bias = 0;
  }

  return clamp(bias, BIAS_MIN, BIAS_MAX);
}

/** 当前视角六维加权均值；无维度时返回 null */
export function weightedDimensionAverage(
  relationType: RelationType,
  dimensions: DimensionScoreInput[]
): number | null {
  if (!dimensions.length) return null;
  const weights = DIMENSION_WEIGHTS[relationType];
  let sum = 0;
  let wSum = 0;
  for (const d of dimensions) {
    const v = Number(d.value);
    if (!Number.isFinite(v)) continue;
    const w = weights[d.key] ?? 1;
    const clamped = Math.max(0, Math.min(100, v));
    sum += clamped * w;
    wSum += w;
  }
  if (wSum <= 0) return null;
  return sum / wSum;
}

export type RelationFeelScoreResult = {
  score: number;
  scoreBand: ScoreBand;
  dimAverage: number | null;
  /** 关系事实偏置（已钳制） */
  bias: number;
};

/**
 * 本视角适配分 =
 *   命盘底分 × 0.35 + max(0,min(100, 六维加权均值 + 关系偏置)) × 0.65
 * 无六维时：底分 + 偏置 × 0.55（仍随关系类型分化）
 */
export function computeRelationFeelScore(
  facts: Pick<
    CompatibilityChartFacts,
    'score' | 'self' | 'partner' | 'completeness'
  >,
  relationType: RelationType,
  dimensions: DimensionScoreInput[]
): RelationFeelScoreResult {
  const base = Math.max(0, Math.min(100, Number(facts.score) || 0));
  const signals = extractChartSignals(facts);
  const bias = computeRelationBias(relationType, signals);
  const dimAverage = weightedDimensionAverage(relationType, dimensions);

  let blended: number;
  if (dimAverage == null) {
    // 无六维时仍用偏置拉开关系类型（约 0.7 倍偏置）
    blended = base + bias * 0.7;
  } else {
    // 偏置直接叠到六维侧，再与底分混合
    const adjustedDim = clamp(dimAverage + bias, 0, 100);
    blended = base * BASE_WEIGHT + adjustedDim * DIM_WEIGHT;
  }

  const score = clampScore(blended);
  return { score, scoreBand: bandOf(score), dimAverage, bias };
}
