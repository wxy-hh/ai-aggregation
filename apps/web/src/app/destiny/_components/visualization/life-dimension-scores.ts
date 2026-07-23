import type { DestinyLifeDimension, FiveElementKey, LifeDimensionKey } from '../types';
import type { PartialDestinyReport } from '../types';

/** 五行 → 人生五维（与 life-summary-card 展示一致） */
export const ELEMENT_TO_LIFE_DIMENSION: Array<{
  element: FiveElementKey;
  dimKey: LifeDimensionKey;
  dimLabel: string;
}> = [
  { element: 'fire', dimKey: 'career', dimLabel: '事业' },
  { element: 'earth', dimKey: 'love', dimLabel: '感情' },
  { element: 'metal', dimKey: 'wealth', dimLabel: '财运' },
  { element: 'water', dimKey: 'wisdom', dimLabel: '智慧' },
  { element: 'wood', dimKey: 'health', dimLabel: '健康' },
];

type BaziBasisLike = NonNullable<PartialDestinyReport['baziBasis']>;

/**
 * 由本地排盘五行统计推导五维能量指数（0–100）。
 * 算法：按五行在命局中的占比映射到对应人生领域，再线性拉伸到 42–88，避免整图偏低。
 */
export function deriveLifeDimensionsFromBasis(basis: BaziBasisLike): DestinyLifeDimension[] {
  const stats = basis.elementStats;
  const maxVal = Math.max(...stats.map((s) => s.value), 1);

  return ELEMENT_TO_LIFE_DIMENSION.map(({ element, dimKey, dimLabel }) => {
    const stat = stats.find((s) => s.key === element);
    const share = stat ? stat.value / maxVal : 0;
    const value = Math.round(share * 46 + 42);
    return {
      key: dimKey,
      label: dimLabel,
      value: Math.min(88, Math.max(42, value)),
    };
  });
}

/**
 * 当仅有 AI 返回的五维分时，按相对排序拉伸到中性偏积极区间，保留强弱关系。
 */
export function normalizeAiLifeDimensionValues(
  dimensions: DestinyLifeDimension[]
): DestinyLifeDimension[] {
  const values = dimensions.map((d) => Math.max(0, Math.min(100, d.value)));
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const span = max - min;

  return dimensions.map((item, index) => {
    let value: number;
    if (span < 1) {
      value = 62;
    } else {
      const t = (values[index] - min) / span;
      value = Math.round(t * 46 + 48);
    }
    return {
      ...item,
      value: Math.min(88, Math.max(48, value)),
    };
  });
}

/**
 * 合并展示用五维数据：分值优先本地排盘，文案标签可采纳 AI。
 */
export function resolveLifeDimensionsForDisplay(input: {
  lifeDimensions?: PartialDestinyReport['lifeDimensions'];
  baziBasis?: PartialDestinyReport['baziBasis'];
}): DestinyLifeDimension[] | null {
  const { lifeDimensions, baziBasis } = input;

  let scored: DestinyLifeDimension[] | null = null;

  if (baziBasis?.elementStats?.length) {
    scored = deriveLifeDimensionsFromBasis(baziBasis);
  } else if (lifeDimensions?.length === 5 && lifeDimensions.some((d) => d.value > 0)) {
    scored = normalizeAiLifeDimensionValues(lifeDimensions);
  }

  if (!scored) return null;

  if (!lifeDimensions?.length) {
    return scored;
  }

  const labelByKey = new Map(lifeDimensions.map((item) => [item.key, item.label?.trim()]));
  const summaryByKey = new Map(
    lifeDimensions.map((item) => [item.key, item.summary?.trim()] as const)
  );
  return scored.map((item) => ({
    ...item,
    label: labelByKey.get(item.key) || item.label,
    summary: summaryByKey.get(item.key) || item.summary,
  }));
}
