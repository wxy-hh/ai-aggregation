import { z } from 'zod';
import type {
  DestinyCoreTone,
  DestinyLifeDimension,
  DestinyLifeDimensionHighlights,
  DestinyModule,
  DestinyReport,
  DestinyReportRequest,
  DestinyTenGodDomain,
  DestinyTimelineItem,
  FiveElementKey,
  LifeDimensionKey,
  TenGodDomainKey,
  ZiweiCenterInfo,
  ZiweiPalace,
} from '@/app/destiny/_components/types';

const fiveElementTuple = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
const fiveElementOrder: FiveElementKey[] = [...fiveElementTuple];
const lifeDimensionTuple = ['career', 'wealth', 'health', 'love', 'wisdom'] as const;
const lifeDimensionOrder: LifeDimensionKey[] = [...lifeDimensionTuple];
const tenGodDomainTuple = ['self', 'expression', 'wealth', 'order', 'resource'] as const;
const tenGodDomainOrder: TenGodDomainKey[] = [...tenGodDomainTuple];

const ProfileSchema = z.object({
  name: z.string().min(1).optional(),
  genderLabel: z.string().min(1).optional(),
  birthText: z.string().min(1).optional(),
  lunarText: z.string().min(1).optional(),
  locationText: z.string().min(1).optional(),
});

const CoreToneSchema = z.object({
  tag: z.string().min(1).optional(),
  chartSummary: z.string().min(1).optional(),
  headline: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
});

const BalanceInsightSchema = z.object({
  title: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  tooltip: z.string().min(1).optional(),
});

const PatternInsightSchema = z.object({
  label: z.string().min(1),
  tooltip: z.string().min(1),
});

const LifeDimensionSchema = z.object({
  key: z.enum(lifeDimensionTuple),
  label: z.string().min(1).optional(),
  value: z.number(),
});

const LifeDimensionHighlightsSchema = z.object({
  strength: z.string().min(1).optional(),
  caution: z.string().min(1).optional(),
});

const TenGodDomainSchema = z.object({
  key: z.enum(tenGodDomainTuple),
  label: z.string().min(1).optional(),
  technicalLabel: z.string().min(1).optional(),
  value: z.number(),
  description: z.string().min(1).optional(),
});

const PillarSchema = z.object({
  stem: z.string().min(1),
  branch: z.string().min(1),
  label: z.string().min(1),
  element: z.enum(fiveElementTuple),
  tooltip: z.string().min(1),
});

const ElementSchema = z.object({
  key: z.enum(fiveElementTuple),
  label: z.string().min(1).optional(),
  value: z.number(),
});

const TenGodSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  tooltip: z.string().min(1).optional(),
});

const ModuleSchema = z.object({
  title: z.string(),
  summary: z.string(),
  bullets: z.array(z.string()),
});

const TimelineItemSchema = z.object({
  year: z.number().optional(),
  title: z.string().min(1),
  summary: z.string().min(1),
  detail: z
    .object({
      opportunities: z.array(z.string()).optional(),
      risks: z.array(z.string()).optional(),
      actions: z.array(z.string()).optional(),
    })
    .optional(),
});

const ZiweiPalaceSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  branch: z.string().min(1).optional(),
  stars: z.array(z.string()).optional(),
  summary: z.string().min(1).optional(),
  suggestions: z.array(z.string()).optional(),
  dominant: z.string().min(1).optional(),
});

const ZiweiCenterSchema = z.object({
  chartTitle: z.string().min(1).optional(),
  mingZhu: z.string().min(1).optional(),
  shenZhu: z.string().min(1).optional(),
});

function convertLooseRaw(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const source = raw as Record<string, unknown>;

  const profileSource = (source.profile ?? {}) as Record<string, unknown>;
  const coreToneSource = (source.coreTone ?? source.coreDestinyTone ?? {}) as Record<string, unknown>;
  const profile = {
    name: asString(profileSource.name),
    genderLabel: asString(profileSource.genderLabel) || asString(profileSource.gender),
    birthText: asString(profileSource.birthText) || asString(profileSource.birth),
    locationText: asString(profileSource.locationText) || asString(profileSource.birthPlace),
  };

  const pillars = normalizeLoosePillars(source.pillars);
  const elements = normalizeLooseElements(source.elements);
  const tenGods = normalizeLooseTenGods(source.tenGods);
  const modules = normalizeLooseModules(source.modules);
  const timeline = normalizeLooseTimeline(source.timeline);

  return {
    profile,
    coreTone: {
      tag: asString(coreToneSource.tag),
      chartSummary:
        asString(coreToneSource.chartSummary) ||
        asString(coreToneSource.chart) ||
        asString(coreToneSource.chart_text),
      headline: asString(coreToneSource.headline) || asString(coreToneSource.title),
      description:
        asString(coreToneSource.description) ||
        asString(coreToneSource.summary) ||
        asString(coreToneSource.content),
    },
    balanceInsight: source.balanceInsight,
    patternHighlights: source.patternHighlights,
    lifeDimensions: source.lifeDimensions,
    lifeDimensionHighlights: source.lifeDimensionHighlights,
    tenGodDomains: source.tenGodDomains,
    pillars,
    elements,
    tenGods,
    modules,
    timeline,
  };
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = asString(value).trim();
    if (text) return text;
  }
  return '';
}

function normalizeTimelineDetailList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => asString(item).trim())
    .filter(Boolean)
    .slice(0, 3);
}

function buildTimelineSummary(source: {
  summary?: unknown;
  fortune?: unknown;
  content?: unknown;
  advice?: unknown;
  overview?: unknown;
  detail?: { opportunities?: unknown; risks?: unknown; actions?: unknown } | unknown;
}): string {
  const directSummary = firstNonEmptyString(
    source.summary,
    source.fortune,
    source.content,
    source.advice,
    source.overview
  );
  if (directSummary) return directSummary;

  const detail = source.detail && typeof source.detail === 'object'
    ? (source.detail as Record<string, unknown>)
    : undefined;
  const firstDetailText = firstNonEmptyString(
    normalizeTimelineDetailList(detail?.opportunities)[0],
    normalizeTimelineDetailList(detail?.actions)[0],
    normalizeTimelineDetailList(detail?.risks)[0]
  );

  return firstDetailText;
}

function normalizeLoosePillars(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  if (raw.length === 0) return raw;
  if (typeof raw[0] === 'string') {
    return (raw as unknown[])
      .slice(0, 4)
      .map((item, index) => {
        const value = typeof item === 'string' ? item.trim() : '';
        const stem = value[0] || '';
        const branch = value[1] || '';
        if (!stem || !branch) return null;
        return {
          stem,
          branch,
          label: ['年柱', '月柱', '日柱', '时柱'][index],
          element: guessElementByStem(stem),
          tooltip: '',
        };
      })
      .filter(Boolean);
  }
  if (typeof raw[0] === 'object') {
    return (raw as Array<Record<string, unknown>>)
      .slice(0, 4)
      .map((item, index) => {
        const stem = asString(item.stem);
        const branch = asString(item.branch);
        if (!stem || !branch) return null;
        const elementFromField = mapLooseElement(asString(item.element));
        return {
          stem,
          branch,
          label: asString(item.label) || ['年柱', '月柱', '日柱', '时柱'][index],
          element: elementFromField || guessElementByStem(stem),
          tooltip: asString(item.tooltip),
        };
      })
      .filter(Boolean);
  }
  return raw;
}

function normalizeLooseElements(raw: unknown) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const obj = raw as Record<string, unknown>;
  const mapping: Record<string, FiveElementKey> = {
    金: 'metal',
    metal: 'metal',
    木: 'wood',
    wood: 'wood',
    水: 'water',
    water: 'water',
    火: 'fire',
    fire: 'fire',
    土: 'earth',
    earth: 'earth',
  };

  const list: Array<{ key: FiveElementKey; value: number }> = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = mapping[k];
    if (!key) continue;
    const num = typeof v === 'number' ? v : Number(v);
    if (!Number.isFinite(num)) continue;
    list.push({ key, value: num });
  }
  return list.length > 0 ? list : raw;
}

function mapLooseElement(value: string): FiveElementKey | null {
  if (!value) return null;
  if (value.includes('金') || /metal/i.test(value)) return 'metal';
  if (value.includes('木') || /wood/i.test(value)) return 'wood';
  if (value.includes('水') || /water/i.test(value)) return 'water';
  if (value.includes('火') || /fire/i.test(value)) return 'fire';
  if (value.includes('土') || /earth/i.test(value)) return 'earth';
  return null;
}

function lifeDimensionLabel(key: LifeDimensionKey): string {
  switch (key) {
    case 'career':
      return '事业';
    case 'wealth':
      return '财运';
    case 'health':
      return '健康';
    case 'love':
      return '感情';
    case 'wisdom':
      return '智慧/创造';
  }
}

function getTenGodDomainPreset(key: TenGodDomainKey) {
  switch (key) {
    case 'self':
      return {
        label: '自我与社交',
        technicalLabel: '比肩/劫财',
        description:
          '这部分代表你的主见、竞争感与人际边界，数值越高，越容易在关系里坚持自我，也更敢主动争取位置。',
      };
    case 'expression':
      return {
        label: '创造与表达',
        technicalLabel: '食神/伤官',
        description:
          '这部分反映你的输出欲、灵感与表达张力，数值越高，越容易靠创意、观点和行动感吸引机会。',
      };
    case 'wealth':
      return {
        label: '物质与掌控',
        technicalLabel: '正财/偏财',
        description:
          '这部分对应资源感知、结果意识与财富掌控力，数值越高，越看重效率、回报与可落地的成果。',
      };
    case 'order':
      return {
        label: '秩序与责任',
        technicalLabel: '正官/七杀',
        description:
          '这部分代表规则意识、责任阈值与抗压能力，数值越高，越容易以目标感和纪律感驱动自己前进。',
      };
    case 'resource':
      return {
        label: '资源与守护',
        technicalLabel: '正印/偏印',
        description:
          '这部分对应学习吸收、贵人支持与自我修复力，数值越高，越擅长沉淀经验，也更容易被资源托住。',
      };
  }
}

function normalizeLooseTenGods(raw: unknown) {
  return raw;
}

function normalizeLooseModules(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  const list = raw as Array<Record<string, unknown>>;
  const slots: Array<'personality' | 'career' | 'love' | 'wealth' | 'health'> = [
    'personality',
    'career',
    'love',
    'wealth',
    'health',
  ];
  const result: Record<string, { title: string; summary: string; bullets: string[] }> = {};
  list.slice(0, 5).forEach((item, index) => {
    const key = slots[index];
    const title = asString(item.name) || `${key}分析`;
    const content = asString(item.content);
    result[key] = {
      title,
      summary: content,
      bullets: content ? [content] : [],
    };
  });
  return Object.keys(result).length > 0 ? result : raw;
}

function normalizeLooseTimeline(raw: unknown) {
  if (!Array.isArray(raw)) return raw;
  return (raw as unknown[]).map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = item as Record<string, unknown>;
    const summary = buildTimelineSummary({
      summary: row.summary,
      fortune: row.fortune,
      content: row.content,
      advice: row.advice,
      overview: row.overview,
      detail: row.detail,
    });
    return {
      year: typeof row.year === 'number' ? row.year : undefined,
      title: `${typeof row.year === 'number' ? row.year : ''}年流年`,
      summary,
      detail: {
        opportunities: normalizeTimelineDetailList(
          row.detail && typeof row.detail === 'object'
            ? (row.detail as Record<string, unknown>).opportunities
            : undefined
        ),
        risks: normalizeTimelineDetailList(
          row.detail && typeof row.detail === 'object'
            ? (row.detail as Record<string, unknown>).risks
            : undefined
        ),
        actions: normalizeTimelineDetailList(
          row.detail && typeof row.detail === 'object'
            ? (row.detail as Record<string, unknown>).actions
            : undefined
        ),
      },
    };
  });
}

function guessElementByStem(stem: string): FiveElementKey {
  if (['甲', '乙'].includes(stem)) return 'wood';
  if (['丙', '丁'].includes(stem)) return 'fire';
  if (['戊', '己'].includes(stem)) return 'earth';
  if (['庚', '辛'].includes(stem)) return 'metal';
  return 'water';
}

function formatBirthText(input: DestinyReportRequest): string {
  const { birthDate, birthTime } = input;
  return `${birthDate.year}年${birthDate.month}月${birthDate.day}日 ${birthTime.hour}:${birthTime.minute}`;
}

function buildDefaultCoreTone(): DestinyCoreTone {
  return {
    tag: '核心命理定调',
    chartSummary: '',
    headline: '',
    description: '',
  };
}

function normalizePillarTooltip(input: string | undefined, label: string): string {
  const text = input?.trim();
  if (!text) return '';
  if (
    text === `${label}命理解读` ||
    /^(年柱：外在环境与早年基调。?|月柱：事业根基与社会关系。?|日柱：自我与核心驱动力。?|时柱：行动方式与未来趋势。?)$/.test(
      text
    )
  ) {
    return '';
  }
  return text;
}

function buildFallbackBalanceInsight() {
  return {
    title: '',
    value: '',
    tooltip: '',
  };
}

function normalizeBalanceInsight(
  input: Partial<DestinyReport['balanceInsight']> | undefined,
  fallback: DestinyReport['balanceInsight']
): DestinyReport['balanceInsight'] {
  return {
    title: input?.title?.trim() || fallback.title,
    value: input?.value?.trim() || fallback.value,
    tooltip: input?.tooltip?.trim() || fallback.tooltip,
  };
}

function normalizePatternHighlights(
  input: Array<Partial<DestinyReport['patternHighlights'][number]>> | undefined
): DestinyReport['patternHighlights'] {
  return (input ?? [])
    .map((item) => ({
      label: item.label?.trim() || '',
      tooltip: item.tooltip?.trim() || '',
    }))
    .filter((item) => item.label && item.tooltip)
    .slice(0, 4);
}

function normalizePercentValue(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeLifeDimensions(
  raw: Array<{ key: LifeDimensionKey; label?: string; value: number }> | undefined
): DestinyLifeDimension[] | undefined {
  if (!raw?.length) return undefined;

  const map = new Map<LifeDimensionKey, DestinyLifeDimension>();
  for (const item of raw) {
    map.set(item.key, {
      key: item.key,
      label: item.label?.trim() || lifeDimensionLabel(item.key),
      value: normalizePercentValue(item.value),
    });
  }

  if (lifeDimensionOrder.some((key) => !map.has(key))) {
    return undefined;
  }

  return lifeDimensionOrder.map((key) => map.get(key)!);
}

function normalizeLifeDimensionHighlights(
  input: Partial<DestinyLifeDimensionHighlights> | undefined
): DestinyLifeDimensionHighlights | undefined {
  const strength = input?.strength?.trim() || '';
  const caution = input?.caution?.trim() || '';

  if (!strength || !caution) {
    return undefined;
  }

  return { strength, caution };
}

function normalizeTenGodDomains(
  raw: Array<{
    key: TenGodDomainKey;
    label?: string;
    technicalLabel?: string;
    value: number;
    description?: string;
  }> | undefined
): DestinyTenGodDomain[] | undefined {
  if (!raw?.length) return undefined;

  const fromRaw = new Map<TenGodDomainKey, DestinyTenGodDomain>();
  for (const item of raw) {
    const preset = getTenGodDomainPreset(item.key);
    fromRaw.set(item.key, {
      key: item.key,
      label: item.label?.trim() || preset.label,
      technicalLabel: item.technicalLabel?.trim() || preset.technicalLabel,
      value: normalizePercentValue(item.value),
      description: item.description?.trim() || '',
    });
  }

  if (tenGodDomainOrder.some((key) => !fromRaw.has(key))) {
    return undefined;
  }

  const normalized = tenGodDomainOrder.map((key) => fromRaw.get(key)!);
  return normalized.every((item) => item.description.trim()) ? normalized : undefined;
}

function normalizeCoreTone(
  input: Partial<DestinyCoreTone> | undefined,
  fallback: DestinyCoreTone
): DestinyCoreTone {
  return {
    tag: input?.tag?.trim() || fallback.tag,
    chartSummary: input?.chartSummary?.trim() || fallback.chartSummary,
    headline: input?.headline?.trim() || fallback.headline,
    description: input?.description?.trim() || fallback.description,
  };
}

function safeModule(input: Partial<DestinyModule> | undefined, fallbackTitle: string): DestinyModule {
  const title = input?.title?.trim() || fallbackTitle;
  const summary = input?.summary?.trim() || '';
  const bullets = (input?.bullets ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    title,
    summary,
    bullets,
  };
}

function normalizeElements(raw: Array<{ key: FiveElementKey; label?: string; value: number }> | undefined) {
  const map = new Map<FiveElementKey, number>();
  for (const item of raw ?? []) {
    map.set(item.key, normalizePercentValue(item.value));
  }

  return fiveElementOrder
    .filter((key) => map.has(key))
    .map((key) => ({
      key,
      label: elementLabel(key),
      value: map.get(key) ?? 0,
    }));
}

function normalizeTimeline(raw: unknown, _currentYear: number): DestinyTimelineItem[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .slice(0, 3)
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const source = item as Record<string, unknown>;
      const sourceDetail =
        source.detail && typeof source.detail === 'object'
          ? (source.detail as Record<string, unknown>)
          : undefined;
      const year = typeof source.year === 'number' ? source.year : undefined;
      const title = firstNonEmptyString(source.title, source.name);
      const summary = buildTimelineSummary({
        summary: source.summary,
        fortune: source.fortune,
        content: source.content,
        advice: source.advice,
        overview: source.overview,
        detail: sourceDetail,
      });
      if (!year || !title || !summary) return null;

      return {
        year,
        title,
        summary,
        detail: {
          opportunities: normalizeTimelineDetailList(sourceDetail?.opportunities),
          risks: normalizeTimelineDetailList(sourceDetail?.risks),
          actions: normalizeTimelineDetailList(sourceDetail?.actions),
        },
      };
    })
    .filter((item): item is DestinyTimelineItem => Boolean(item));
}

function elementLabel(key: FiveElementKey): string {
  switch (key) {
    case 'metal':
      return '金';
    case 'wood':
      return '木';
    case 'water':
      return '水';
    case 'fire':
      return '火';
    case 'earth':
      return '土';
  }
}

export function normalizeDestinyReport(
  raw: unknown,
  input: DestinyReportRequest,
  currentYear: number
): DestinyReport {
  const adapted = convertLooseRaw(raw);
  const source = adapted && typeof adapted === 'object' ? (adapted as Record<string, unknown>) : {};
  const profile = ProfileSchema.safeParse(source.profile);
  const coreTone = CoreToneSchema.safeParse(source.coreTone);
  const balanceInsight = BalanceInsightSchema.safeParse(source.balanceInsight);
  const patternHighlights = z.array(PatternInsightSchema).safeParse(source.patternHighlights);
  const lifeDimensions = z.array(LifeDimensionSchema).safeParse(source.lifeDimensions);
  const lifeDimensionHighlights = LifeDimensionHighlightsSchema.safeParse(source.lifeDimensionHighlights);
  const tenGodDomains = z.array(TenGodDomainSchema).safeParse(source.tenGodDomains);
  const pillars = z.array(PillarSchema).safeParse(source.pillars);
  const elements = z.array(ElementSchema).safeParse(source.elements);
  const tenGods = z.array(TenGodSchema).safeParse(source.tenGods);
  const timeline = z.array(TimelineItemSchema).safeParse(source.timeline);
  const ziweiPalaces = z.array(ZiweiPalaceSchema).safeParse(source.ziweiPalaces);
  const ziweiCenter = ZiweiCenterSchema.safeParse(source.ziweiCenter);
  const modulesSource =
    source.modules && typeof source.modules === 'object' ? (source.modules as Record<string, unknown>) : {};
  const modules = {
    career: ModuleSchema.safeParse(modulesSource.career),
    love: ModuleSchema.safeParse(modulesSource.love),
    wealth: ModuleSchema.safeParse(modulesSource.wealth),
    health: ModuleSchema.safeParse(modulesSource.health),
    personality: ModuleSchema.safeParse(modulesSource.personality),
  };

  const locationText =
    input.location.name && input.location.lat != null && input.location.lon != null
      ? `${input.location.name}（${input.location.lat.toFixed(2)}, ${input.location.lon.toFixed(2)}）`
      : input.location.name || '出生地待确认';

  const defaultProfile = {
    name: input.name.trim() || '命主',
    genderLabel: input.gender === 'female' ? '坤造（女命）' : '乾造（男命）',
    birthText: formatBirthText(input),
    locationText,
  };

  const safePillars = (pillars.success ? pillars.data : []).slice(0, 4);
  const normalizedPillars =
    safePillars.length === 4
      ? safePillars.map((item, index) => ({
          ...item,
          label: ['年柱', '月柱', '日柱', '时柱'][index],
        }))
      : [];

  const safeTenGods = (tenGods.success ? tenGods.data : [])
    .slice(0, 4)
    .map((item, index) => ({
      key: item.key || `ten-god-${index + 1}`,
      label: item.label,
      value: normalizePercentValue(item.value),
      tooltip: item.tooltip?.trim() || '',
    }));

  const normalizedTenGods = safeTenGods;

  const normalizedTimeline = normalizeTimeline(timeline.success ? timeline.data : source.timeline, currentYear);
  const normalizedElements = normalizeElements(elements.success ? elements.data : undefined);
  const finalPillars = normalizedPillars.map((item) => ({
    ...item,
    tooltip: normalizePillarTooltip(item.tooltip, item.label),
  }));
  const finalBalanceInsight = normalizeBalanceInsight(
    balanceInsight.success ? balanceInsight.data : undefined,
    buildFallbackBalanceInsight()
  );
  const finalPatternHighlights = normalizePatternHighlights(
    patternHighlights.success ? patternHighlights.data : undefined
  );
  const finalLifeDimensions = normalizeLifeDimensions(
    lifeDimensions.success ? lifeDimensions.data : undefined
  );
  const finalLifeDimensionHighlights = normalizeLifeDimensionHighlights(
    lifeDimensionHighlights.success ? lifeDimensionHighlights.data : undefined
  );
  const finalTenGodDomains = normalizeTenGodDomains(
    tenGodDomains.success ? tenGodDomains.data : undefined
  );

  const normalizedZiweiPalaces = normalizeZiweiPalaces(
    ziweiPalaces.success ? ziweiPalaces.data : undefined,
    []
  );

  const normalizedZiweiCenter = normalizeZiweiCenter(
    ziweiCenter.success ? ziweiCenter.data : undefined,
    input,
    normalizedZiweiPalaces
  );
  const defaultCoreTone = buildDefaultCoreTone();

  return {
    profile: {
      name: profile.success ? profile.data.name?.trim() || defaultProfile.name : defaultProfile.name,
      genderLabel: profile.success
        ? profile.data.genderLabel?.trim() || defaultProfile.genderLabel
        : defaultProfile.genderLabel,
      birthText: profile.success ? profile.data.birthText?.trim() || defaultProfile.birthText : defaultProfile.birthText,
      lunarText: profile.success ? profile.data.lunarText?.trim() || undefined : undefined,
      locationText: profile.success
        ? profile.data.locationText?.trim() || defaultProfile.locationText
        : defaultProfile.locationText,
    },
    coreTone: normalizeCoreTone(coreTone.success ? coreTone.data : undefined, defaultCoreTone),
    pillars: finalPillars,
    elements: normalizedElements,
    tenGods: normalizedTenGods,
    balanceInsight: finalBalanceInsight,
    patternHighlights: finalPatternHighlights,
    lifeDimensions: finalLifeDimensions,
    lifeDimensionHighlights: finalLifeDimensionHighlights,
    tenGodDomains: finalTenGodDomains,
    modules: {
      career: safeModule(modules.career.success ? modules.career.data : undefined, '事业发展潜力解析'),
      love: safeModule(modules.love.success ? modules.love.data : undefined, '感情模式与关系建议'),
      wealth: safeModule(modules.wealth.success ? modules.wealth.data : undefined, '财运结构与风险节奏'),
      health: safeModule(modules.health.success ? modules.health.data : undefined, '健康关注点与作息建议'),
      personality: safeModule(
        modules.personality.success ? modules.personality.data : undefined,
        '性格底色与优势'
      ),
    },
    timeline: normalizedTimeline,
    ziweiPalaces: normalizedZiweiPalaces.length > 0 ? normalizedZiweiPalaces : undefined,
    ziweiCenter:
      normalizedZiweiCenter.chartTitle || normalizedZiweiCenter.mingZhu || normalizedZiweiCenter.shenZhu
        ? normalizedZiweiCenter
        : undefined,
  };
}

function normalizeZiweiPalaces(input: unknown, fallback: ZiweiPalace[]): ZiweiPalace[] {
  if (!Array.isArray(input) || input.length === 0) return fallback;

  const list = (input as Array<z.infer<typeof ZiweiPalaceSchema>>).slice(0, 12);
  const normalized = list.map((item) => {
    const stars = (item.stars ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 3);
    return {
      key: item.key?.trim() || '',
      label: item.label?.trim() || '',
      branch: item.branch?.trim() || '',
      stars,
      dominant: item.dominant?.trim() || stars[0] || '',
      summary: item.summary?.trim() || '',
      suggestions: (item.suggestions ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
    };
  });

  if (normalized.length < 12) {
    return [...normalized, ...fallback.slice(normalized.length, 12)];
  }

  return normalized;
}

function normalizeZiweiCenter(
  input: { chartTitle?: string; mingZhu?: string; shenZhu?: string } | undefined,
  _request: DestinyReportRequest,
  _palaces: ZiweiPalace[]
): ZiweiCenterInfo {
  return {
    chartTitle: input?.chartTitle?.trim() || '',
    mingZhu: input?.mingZhu?.trim() || '',
    shenZhu: input?.shenZhu?.trim() || '',
  };
}
