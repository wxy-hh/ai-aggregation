import type { CompatibilityChartFacts, RelationType } from './types';

/**
 * 方案 B：双层分数（本地确定性，不经 LLM 改总分）
 * - 命盘底分 chartFacts.score：四视角共用（确定性 0-100，存储为原始值）
 * - 本视角适配分：底分 × 0.32 +（六维加权均值 + 关系事实偏置）× 0.68，
 *   再经 calibrateScore 标定到展示口径（差 30-45 / 中 55-70 / 高 75-88）
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
/** 关系偏置经优势侧放大后可达 ±22，保证同盘四视角在六维接近时仍有可读分差 */
const BIAS_MIN = -22;
const BIAS_MAX = 22;
/** 优势侧放大系数：仅放大高于四视角均值的偏置，低于均值的保持原值（不下压） */
const BIAS_SPREAD_GAIN_UP = 1.8;

const ALL_RELATIONS: RelationType[] = ['romance', 'marriage', 'friendship', 'partnership'];

/**
 * 放大四视角偏置的分差（只放大优势侧）：
 * 原始偏置被混合权重(0.68)与展示标定双重稀释，有效传导仅 ~0.6，
 * 导致同一命盘四个 tab 分数挤在一起。高于均值的偏置以均值为中心放大 ×GAIN，
 * 低于均值的保持原值——避免把部分视角压得过低、让用户误读为「不合适」。
 * 映射单调连续，视角排序不变，确定性可复现。
 */
export function amplifyRelationBias(rawBias: number, signals: ChartSignals): number {
  const all = ALL_RELATIONS.map((r) => computeRelationBias(r, signals));
  const mean = all.reduce((sum, v) => sum + v, 0) / all.length;
  const amplified =
    rawBias > mean ? mean + (rawBias - mean) * BIAS_SPREAD_GAIN_UP : rawBias;
  return clamp(amplified, BIAS_MIN, BIAS_MAX);
}

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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/**
 * 展示口径标定：把 raw 0-100 单调映射到目标分布锚点
 * - 弱匹配 ~35 → ~45（差 30-45：差异大需协商）
 * - 典型组合 ~55 → ~62（中带主体：避免典型组合被误读为「刚及格不及格线」）
 * - 强匹配 ~80 → ~82（高 75-88：默契基础较好）
 * 主分与子分共用，保证口径一致。
 */
export function calibrateScore(raw: number): number {
  const value = Number.isFinite(raw) ? raw : 50;
  return Math.round(clamp(16.4 + value * 0.82, 30, 90));
}

function bandOf(score: number): ScoreBand {
  if (score >= 75) return 'high';
  if (score >= 55) return 'mid';
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
  /** 关系事实偏置（已钳制、已放大） */
  bias: number;
  /** 评分依据：供前端展示「这个分怎么来的」，与 score 同口径（展示标定后） */
  breakdown: {
    /** 命盘底分（确定性结构分，四视角共用） */
    base: number;
    /** 六维加权均值 + 视角修正后的混合分（未标定的原始口径） */
    blended: number;
  };
};

/**
 * 本视角适配分 =
 *   calibrateScore( 命盘底分 × 0.32 + max(0,min(100, 六维加权均值 + 关系偏置)) × 0.68 )
 * 无六维时：calibrateScore(底分 + 偏置 × 0.7)（仍随关系类型分化）
 * 返回的 dimAverage 也按展示口径标定，与主分/子分保持一致。
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
  // 偏置以四视角均值为中心放大离散度：只拉开视角间差距，不移整体水平
  const bias = amplifyRelationBias(
    computeRelationBias(relationType, signals),
    signals
  );
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

  const score = calibrateScore(blended);
  const calibratedDim = dimAverage == null ? null : calibrateScore(dimAverage);
  return {
    score,
    scoreBand: bandOf(score),
    dimAverage: calibratedDim,
    bias,
    breakdown: { base, blended },
  };
}

/** 视角偏置的通俗解读：按放大后偏置的相对位置描述本视角适配方向 */
function biasToneText(bias: number, meanBias: number): string {
  const delta = bias - meanBias;
  if (delta >= 6) return '结构信号对这个关系形态明显加分';
  if (delta >= 2) return '结构信号对这种相处方式略有助益';
  if (delta <= -6) return '结构信号在这个关系形态下需要更多经营';
  if (delta <= -2) return '结构信号对这种相处方式稍有挑战';
  return '结构信号与其他视角接近，无额外倾斜';
}

/**
 * 评分依据：把总分拆成三段可读来源，随分数一起返回给展示层。
 * - 命盘底分：五行互补/日主异同/地支呼应等确定性结构分（四视角共用）
 * - 六维加权：AI 按该关系关键维度给出的加权均分
 * - 视角修正：同一命盘在恋爱/婚姻/朋友/合作上的结构适配差
 * 全部使用与主分一致的展示口径，确定性可复现。
 */
export function buildScoreBasis(
  facts: Pick<
    CompatibilityChartFacts,
    'score' | 'self' | 'partner' | 'completeness'
  >,
  relationType: RelationType,
  feel: RelationFeelScoreResult
): {
  basePart: number;
  dimPart: number | null;
  basisLines: string[];
} {
  const signals = extractChartSignals(facts);
  const meanBias =
    ALL_RELATIONS.reduce(
      (sum, r) => sum + computeRelationBias(r, signals),
      0
    ) / ALL_RELATIONS.length;

  // 展示口径：底分标定后、六维标定后，与主分一致
  const basePart = calibrateScore(feel.breakdown.base);
  const dimPart = feel.dimAverage;
  const lines: string[] = [];

  const overlap = signals.branchOverlap;
  lines.push(
    `命盘底分 ${basePart}：由双方五行互补${
      signals.elementComplement >= 0.5 ? '较强' : signals.elementComplement >= 0.3 ? '中等' : '有限'
    }、日主${signals.sameDayMaster ? '相同（表达相近）' : '不同（节奏互补）'}、地支呼应 ${overlap} 处等结构信号构成，四视角共用`
  );
  if (dimPart != null) {
    lines.push(
      `六维加权 ${dimPart}：按${RELATION_LABEL_ZH[relationType]}最看重的维度加权平均（如亲密需求/日常分工/决策节奏）`
    );
  }
  lines.push(
    `视角修正 ${feel.bias >= 0 ? '+' : ''}${Math.round(feel.bias * 10) / 10}：${biasToneText(feel.bias, meanBias)}`
  );

  return { basePart, dimPart, basisLines: lines };
}

const RELATION_LABEL_ZH: Record<RelationType, string> = {
  romance: '恋爱',
  marriage: '婚姻',
  friendship: '朋友',
  partnership: '合作',
};
