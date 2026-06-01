import type { DestinyLifeDimension, LifeDimensionKey } from '../types';

/** 五维相对强弱档位（仅用于本盘五者之间的对比） */
export type LifeDimensionLevel = 'low' | 'mid' | 'high';

export const LIFE_DIMENSION_META: Record<
  LifeDimensionKey,
  { label: string; hint: string; elementLabel: string }
> = {
  career: {
    label: '事业',
    hint: '职场节奏、目标感与做事冲劲',
    elementLabel: '火',
  },
  wealth: {
    label: '财运',
    hint: '求财方式、资源掌控与理财习惯',
    elementLabel: '金',
  },
  health: {
    label: '健康',
    hint: '精力状态、作息恢复与身心耐受',
    elementLabel: '木',
  },
  love: {
    label: '感情',
    hint: '亲密关系、情绪连结与社交温度',
    elementLabel: '土',
  },
  wisdom: {
    label: '智慧',
    hint: '学习领悟、思考深度与创意输出',
    elementLabel: '水',
  },
};

export const LIFE_DIMENSION_LEVEL_LABEL: Record<LifeDimensionLevel, string> = {
  low: '偏弱',
  mid: '中等',
  high: '偏强',
};

const LEVEL_FALLBACK_BY_KEY: Record<
  LifeDimensionKey,
  Record<LifeDimensionLevel, string>
> = {
  career: {
    low: '职场与目标不是当前主轴，可把精力放在更突出的领域。',
    mid: '事业节奏平稳，适合按计划推进，不必急于求成。',
    high: '做事目标感较强，适合在职场与项目中主动争取窗口。',
  },
  wealth: {
    low: '求财不是当下重心，宜守不宜冒进，先稳住基本盘。',
    mid: '财运起伏适中，适合稳健配置与长期积累。',
    high: '对资源与收入较敏感，适合把握可落地的求财机会。',
  },
  health: {
    low: '精力分配在其他领域更多，作息与恢复仍建议保持底线。',
    mid: '身心状态整体平稳，注意劳逸结合即可。',
    high: '精力与恢复力相对突出，适合保持运动与规律作息。',
  },
  love: {
    low: '情感与亲密不是当前主轴，社交宜少而精。',
    mid: '关系状态较平稳，适合慢慢建立信任与默契。',
    high: '情绪连结与亲密需求相对活跃，适合经营重要关系。',
  },
  wisdom: {
    low: '学习与创意不是当下重心，可按需充电即可。',
    mid: '思考与领悟力平稳，适合在熟悉领域深耕。',
    high: '学习吸收与复盘力较强，适合持续学习与输出。',
  },
};

/** 按分值在五维内排序，划分偏弱 / 中等 / 偏强 */
export function rankLifeDimensionLevels(
  dimensions: Pick<DestinyLifeDimension, 'key' | 'value'>[]
): Map<LifeDimensionKey, LifeDimensionLevel> {
  const sorted = [...dimensions].sort((a, b) => a.value - b.value);
  const order = new Map(sorted.map((item, index) => [item.key, index] as const));

  const result = new Map<LifeDimensionKey, LifeDimensionLevel>();
  for (const item of dimensions) {
    const index = order.get(item.key) ?? 2;
    if (index <= 1) result.set(item.key, 'low');
    else if (index >= 3) result.set(item.key, 'high');
    else result.set(item.key, 'mid');
  }
  return result;
}

export function getLifeDimensionDisplaySummary(
  dimension: DestinyLifeDimension,
  level: LifeDimensionLevel
): string {
  const trimmed = dimension.summary?.trim();
  if (trimmed) return trimmed;
  return LEVEL_FALLBACK_BY_KEY[dimension.key][level];
}
