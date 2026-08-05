/**
 * 星语真值守卫（truth-guard）。
 *
 * 真值先行架构的机械 enforcement：AI 解读只允许「引用」已计算的星盘真值，
 * 不得杜撰星体、星座、宫位或相位。本模块用确定性规则校验 AI 输出的
 * factReferences，凡不在 chart-facts 真值层（或被标记为 unstable 隐藏）的
 * 引用一律拒绝，防止 AI 改写或编造事实。
 */

import type {
  ChartFacts,
  PlanetBody,
  AspectType,
  ZodiacSignId,
} from '@/app/destiny/_components/astrology/astrology-types';

/** AI 输出中允许的事实引用键。 */
export type FactReference =
  | { kind: 'planet'; body: PlanetBody }
  | { kind: 'house'; number: number }
  | { kind: 'aspect'; planetA: PlanetBody; planetB: PlanetBody; type: AspectType }
  | { kind: 'sign'; sign: ZodiacSignId };

/** 校验结果。 */
export type TruthGuardResult =
  | { valid: true }
  | { valid: false; reason: string; offending?: FactReference };

/** 从 ChartFacts 构建可引用的真值索引。 */
function buildTruthIndex(chartFacts: ChartFacts) {
  const planets = new Set<PlanetBody>();
  const houses = new Set<number>();
  const signs = new Set<ZodiacSignId>();
  const aspects = new Set<string>();

  for (const p of chartFacts.planets ?? []) {
    // house === 0 表示未知/隐藏，视为不稳定，不作为可引用真值
    planets.add(p.body);
    if (p.zodiacSign) signs.add(p.zodiacSign);
  }
  for (const h of chartFacts.houses ?? []) {
    houses.add(h.number);
    if (h.zodiacSign) signs.add(h.zodiacSign);
  }
  for (const a of chartFacts.aspects ?? []) {
    aspects.add(aspectKey(a.planetA, a.planetB, a.type));
  }

  return { planets, houses, signs, aspects };
}

/** 相位去序键（A-B 与 B-A 等价）。 */
function aspectKey(a: PlanetBody, b: PlanetBody, type: AspectType): string {
  const pair = [a, b].sort().join('~');
  return `${pair}@${type}`;
}

/** 无宫位/时间未知时，宫位类引用不可用。 */
function hasHouses(chartFacts: ChartFacts): boolean {
  return Array.isArray(chartFacts.houses) && chartFacts.houses.length > 0;
}

/**
 * 校验单条事实引用是否存在于真值层。
 *
 * 规则：
 * - planet 引用：该行星必须在真值中（且为可计算项）。
 * - house 引用：仅在含宫位结果中可用；时间未知（无宫位）时一律拒绝。
 * - aspect 引用：该行星对 + 相位类型必须在真值相位列表中。
 * - sign 引用：该星座必须出现在任一可见行星或宫头中。
 */
export function validateFactReference(
  ref: FactReference,
  chartFacts: ChartFacts
): TruthGuardResult {
  const index = buildTruthIndex(chartFacts);

  switch (ref.kind) {
    case 'planet': {
      if (!index.planets.has(ref.body)) {
        return { valid: false, reason: `引用的行星 ${ref.body} 不在星盘真值中`, offending: ref };
      }
      return { valid: true };
    }
    case 'house': {
      if (!hasHouses(chartFacts)) {
        return {
          valid: false,
          reason: '当前为无宫位本命盘，引用宫位属于已隐藏事实',
          offending: ref,
        };
      }
      if (!index.houses.has(ref.number)) {
        return { valid: false, reason: `引用的宫位 ${ref.number} 不在星盘真值中`, offending: ref };
      }
      return { valid: true };
    }
    case 'aspect': {
      const key = aspectKey(ref.planetA, ref.planetB, ref.type);
      if (!index.aspects.has(key)) {
        return {
          valid: false,
          reason: `引用的相位 ${ref.planetA}-${ref.planetB} ${ref.type} 不在星盘真值中`,
          offending: ref,
        };
      }
      return { valid: true };
    }
    case 'sign': {
      if (!index.signs.has(ref.sign)) {
        return { valid: false, reason: `引用的星座 ${ref.sign} 不在星盘真值中`, offending: ref };
      }
      return { valid: true };
    }
    default:
      return { valid: false, reason: '未知的事实引用类型', offending: ref };
  }
}

/**
 * 批量校验事实引用；返回首个违规引用（若有）。
 */
export function assertFactReferencesValid(
  refs: FactReference[],
  chartFacts: ChartFacts
): TruthGuardResult {
  for (const ref of refs) {
    const result = validateFactReference(ref, chartFacts);
    if (!result.valid) return result;
  }
  return { valid: true };
}

/**
 * 过滤报告：移除所有引用了非法/隐藏事实的解读段。
 *
 * 输入报告段须携带 factReferences；返回仅保留全部引用合法的段。
 */
export function filterValidReport<T extends { factReferences?: FactReference[] }>(
  sections: T[],
  chartFacts: ChartFacts
): T[] {
  return sections.filter((section) => {
    const refs = section.factReferences ?? [];
    return assertFactReferencesValid(refs, chartFacts).valid;
  });
}
