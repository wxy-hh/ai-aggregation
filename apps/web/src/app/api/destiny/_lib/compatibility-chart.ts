import {
  computeBaziChart,
  type BaziChartBasis,
  type BaziChartInput,
  type FiveElementKey,
} from '@repo/shared';
import type {
  CompatibilityChartFacts,
  CompatibilityCompleteness,
  CompatibilityPillarSummary,
  RelationType,
} from '@/app/destiny/_components/compatibility/types';
import { DIMENSIONS_BY_RELATION } from '@/app/destiny/_components/compatibility/constants';

export type CompatibilityPersonInput = {
  name: string;
  gender?: 'male' | 'female' | null;
  calendarType: 'lunar' | 'solar';
  birthDate: { year: number; month: number; day: number; isLeapMonth?: boolean };
  birthTime?: { hour: string; minute: string } | null;
  location?: { name: string; lat: number | null; lon: number | null } | null;
};

const ELEMENT_LABEL: Record<FiveElementKey, string> = {
  metal: '金',
  wood: '木',
  water: '水',
  fire: '火',
  earth: '土',
};

/** 生成可用的排盘输入：时间未知时用 12:00 仅作日柱排盘，并在 facts 中剔除时柱 */
function toChartInput(person: CompatibilityPersonInput, role: 'self' | 'partner'): {
  input: BaziChartInput;
  timeUnknown: boolean;
  locationPartial: boolean;
} {
  const timeUnknown = !person.birthTime?.hour || !person.birthTime?.minute;
  const locationPartial = !person.location?.name?.trim();
  const gender = person.gender === 'female' ? 'female' : 'male';

  return {
    input: {
      name: person.name?.trim() || (role === 'self' ? '我' : 'TA'),
      gender,
      calendarType: person.calendarType,
      birthDate: person.birthDate,
      birthTime: timeUnknown
        ? { hour: '12', minute: '00' }
        : { hour: person.birthTime!.hour, minute: person.birthTime!.minute },
      location: person.location?.name
        ? {
            name: person.location.name,
            lat: person.location.lat,
            lon: person.location.lon,
          }
        : { name: '未提供', lat: null, lon: null },
    },
    timeUnknown,
    locationPartial,
  };
}

function summarizePillars(basis: BaziChartBasis, includeHour: boolean): CompatibilityPillarSummary[] {
  return basis.pillars
    .filter((p) => includeHour || p.label !== '时柱')
    .map((p) => ({
      label: p.label,
      name: p.name,
      stem: p.stem,
      branch: p.branch,
      element: ELEMENT_LABEL[p.displayElement] ?? p.displayElement,
    }));
}

function elementVector(basis: BaziChartBasis): Array<{ key: string; label: string; value: number }> {
  return basis.elementStats.map((e) => ({
    key: e.key,
    label: e.label,
    value: Math.round(e.value),
  }));
}

function completenessOf(
  timeUnknown: boolean,
  locationPartial: boolean
): CompatibilityCompleteness['self'] {
  if (timeUnknown && locationPartial) return 'partial';
  if (timeUnknown) return 'partial-time';
  if (locationPartial) return 'partial-location';
  return 'full';
}

/**
 * 确定性合拍指数：基于五行互补、日主异同、柱位重叠等，不依赖 LLM。
 * 区间语气由 scoreBand 决定，分数本身不是关系判决。
 */
export function computeHarmonyScore(
  self: BaziChartBasis,
  partner: BaziChartBasis,
  partnerHasHour: boolean
): { score: number; scoreBand: 'high' | 'mid' | 'low'; hints: string[] } {
  const selfMap = Object.fromEntries(self.elementStats.map((e) => [e.key, e.weight])) as Record<
    FiveElementKey,
    number
  >;
  const partnerMap = Object.fromEntries(partner.elementStats.map((e) => [e.key, e.weight])) as Record<
    FiveElementKey,
    number
  >;

  // 五行互补：一方偏强另一方偏弱时记正向
  let balance = 0;
  (Object.keys(selfMap) as FiveElementKey[]).forEach((key) => {
    const a = selfMap[key] ?? 0;
    const b = partnerMap[key] ?? 0;
    balance += Math.max(0, 12 - Math.abs(a - b));
  });
  const balanceScore = Math.min(40, Math.round((balance / (12 * 5)) * 40));

  // 日主：同则偏共鸣，异则偏互补，各有空间
  const sameDayMaster = self.dayMaster.stem === partner.dayMaster.stem;
  const dayScore = sameDayMaster ? 18 : 22;

  // 地支重叠（年月日常见柱；双方均忽略未知时柱）
  const selfBranches = new Set(
    self.pillars.filter((p) => p.label !== '时柱').map((p) => p.branch)
  );
  const partnerBranches = partner.pillars
    .filter((p) => partnerHasHour || p.label !== '时柱')
    .map((p) => p.branch);
  let overlap = 0;
  partnerBranches.forEach((b) => {
    if (selfBranches.has(b)) overlap += 1;
  });
  const overlapScore = Math.min(20, overlap * 5);

  // 资料完整度微调：缺时柱略降确定性，但不惩罚关系本身
  const completenessBonus = partnerHasHour ? 12 : 8;

  let score = balanceScore + dayScore + overlapScore + completenessBonus;
  score = Math.max(28, Math.min(92, Math.round(score)));

  const scoreBand = score >= 75 ? 'high' : score >= 50 ? 'mid' : 'low';
  const hints: string[] = [];
  if (sameDayMaster) hints.push('日主相同，表达方式可能相近');
  else hints.push('日主不同，节奏与需求更容易形成互补');
  if (!partnerHasHour) hints.push('TA 未提供出生时间，时柱相关细节未纳入');
  if (overlap >= 2) hints.push('部分地支呼应，相处中可能有熟悉感');

  return { score, scoreBand, hints };
}

export function buildCompatibilityChartFacts(args: {
  self: CompatibilityPersonInput;
  partner: CompatibilityPersonInput;
}): CompatibilityChartFacts {
  const selfMeta = toChartInput(args.self, 'self');
  const partnerMeta = toChartInput(args.partner, 'partner');

  const selfBasis = computeBaziChart(selfMeta.input);
  const partnerBasis = computeBaziChart(partnerMeta.input);

  const partnerHasHour = !partnerMeta.timeUnknown;
  const selfHasHour = !selfMeta.timeUnknown;

  const labels: string[] = [];
  if (partnerMeta.timeUnknown) labels.push('TA 未提供出生时间，本报告未纳入时柱相关信息');
  if (selfMeta.timeUnknown) labels.push('我的出生时间不完整，部分细节已降级');
  if (partnerMeta.locationPartial) labels.push('TA 未提供出生地点，真太阳时未校正');
  if (selfMeta.locationPartial) labels.push('我的出生地点不完整');

  const { score, scoreBand, hints } = computeHarmonyScore(
    selfBasis,
    partnerBasis,
    partnerHasHour
  );

  return {
    self: {
      name: selfMeta.input.name,
      dayMaster: selfBasis.dayMaster.stem,
      dayMasterElement: ELEMENT_LABEL[selfBasis.dayMaster.element],
      pillars: summarizePillars(selfBasis, selfHasHour),
      elements: elementVector(selfBasis),
    },
    partner: {
      name: partnerMeta.input.name,
      dayMaster: partnerBasis.dayMaster.stem,
      dayMasterElement: ELEMENT_LABEL[partnerBasis.dayMaster.element],
      pillars: summarizePillars(partnerBasis, partnerHasHour),
      elements: elementVector(partnerBasis),
      hasHourPillar: partnerHasHour,
    },
    completeness: {
      self: completenessOf(selfMeta.timeUnknown, selfMeta.locationPartial),
      partner: completenessOf(partnerMeta.timeUnknown, partnerMeta.locationPartial),
      labels,
    },
    score,
    scoreBand,
    scoreHints: hints,
  };
}

export function emptyDimensions(relationType: RelationType) {
  return DIMENSIONS_BY_RELATION[relationType].map((d) => ({
    key: d.key,
    label: d.label,
    value: 50,
    note: undefined as string | undefined,
  }));
}

export function buildLiteFactsForPrompt(facts: CompatibilityChartFacts) {
  return {
    self: {
      name: facts.self.name,
      dayMaster: `${facts.self.dayMaster}（${facts.self.dayMasterElement}）`,
      pillars: facts.self.pillars.map((p) => `${p.label}${p.name}`).join('、'),
      elements: facts.self.elements.map((e) => `${e.label}${e.value}`).join('、'),
    },
    partner: {
      name: facts.partner.name,
      dayMaster: `${facts.partner.dayMaster}（${facts.partner.dayMasterElement}）`,
      pillars: facts.partner.pillars.map((p) => `${p.label}${p.name}`).join('、'),
      elements: facts.partner.elements.map((e) => `${e.label}${e.value}`).join('、'),
      hasHourPillar: facts.partner.hasHourPillar,
    },
    completenessLabels: facts.completeness.labels,
    score: facts.score,
    scoreBand: facts.scoreBand,
    scoreHints: facts.scoreHints,
  };
}
