import { z } from 'zod';
import { mergeDecadeFortuneInsights, type BaziChartBasis } from '@repo/shared';
import {
  buildDecadeFortuneInsights,
  fillDecadeFortuneInsightFallbacks,
} from '@/lib/destiny/decade-fortune-insight';
import type {
  BaziLockedSections,
  BaziSectionKey,
  BaziSectionPayloadMap,
  DestinyModule,
  DestinyReport,
  DestinyReportRequest,
} from '@/app/destiny/_components/types';
import { extractJsonBlock } from './ark-response';
import { normalizeDestinyReport } from './report-normalizer';

export const BAZI_SECTION_ORDER = [
  'baziBasis',
  'profileOverview',
  'coreDestinyTone',
  'pillars',
  'elementsAndTenGods',
  'decadeFortuneInsights',
  'modulePersonality',
  'moduleCareer',
  'moduleLove',
  'moduleWealth',
  'moduleHealth',
  'timeline',
] as const satisfies readonly BaziSectionKey[];

export const BAZI_MODEL_SECTION_ORDER = [
  'coreDestinyTone',
  'pillars',
  'elementsAndTenGods',
  'decadeFortuneInsights',
  'modulePersonality',
  'moduleCareer',
  'moduleLove',
  'moduleWealth',
  'moduleHealth',
  'timeline',
] as const satisfies readonly BaziSectionKey[];

export const PRIMARY_SECTION_KEYS = [
  'profileOverview',
  'coreDestinyTone',
  'pillars',
  'elementsAndTenGods',
] as const satisfies readonly BaziSectionKey[];

type RecoverableBaziSectionKey = Exclude<BaziSectionKey, (typeof PRIMARY_SECTION_KEYS)[number]>;
type ModuleSectionKey =
  | 'modulePersonality'
  | 'moduleCareer'
  | 'moduleLove'
  | 'moduleWealth'
  | 'moduleHealth';
type RecoveryMode = 'none' | 'recovered';

const DecadeFortuneInsightDraftSchema = z.object({
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  stemPhase: z.string().trim().min(1),
  branchPhase: z.string().trim().min(1),
  natalNotes: z.array(z.string().trim().min(1)).max(2).optional(),
});

const recoverableSectionKeys = new Set<RecoverableBaziSectionKey>([
  'decadeFortuneInsights',
  'modulePersonality',
  'moduleCareer',
  'moduleLove',
  'moduleWealth',
  'moduleHealth',
  'timeline',
]);

const ProfileSectionSchema = z.object({
  name: z.string().trim().min(1),
  genderLabel: z.string().trim().min(1),
  birthText: z.string().trim().min(1),
  locationText: z.string().trim().min(1),
  lunarText: z.string().trim().min(1).optional(),
});

const CoreToneSectionSchema = z.object({
  tag: z.string().trim().min(1).optional(),
  chartSummary: z.string().trim().min(1).optional(),
  headline: z.string().trim().min(1),
  description: z.string().trim().min(1),
});

const PillarSchema = z.object({
  stem: z.string().trim().min(1),
  branch: z.string().trim().min(1),
  label: z.string().trim().min(1),
  element: z.enum(['metal', 'wood', 'water', 'fire', 'earth']),
  tooltip: z.string().trim().min(1),
});

const PillarCommentarySchema = z.object({
  label: z.string().trim().min(1),
  tooltip: z.string().trim().min(1),
});

const BalanceInsightSchema = z.object({
  title: z.string().trim().min(1),
  value: z.string().trim().min(1),
  tooltip: z.string().trim().min(1),
});

const PatternInsightSchema = z.object({
  label: z.string().trim().min(1),
  tooltip: z.string().trim().min(1),
});

const LifeDimensionSchema = z.object({
  key: z.enum(['career', 'wealth', 'health', 'love', 'wisdom']),
  label: z.string().trim().min(1).optional(),
  value: z.number(),
  summary: z.string().trim().min(1).optional(),
});

const LifeDimensionHighlightsSchema = z.object({
  strength: z.string().trim().min(1),
  caution: z.string().trim().min(1),
});

const TenGodDomainSchema = z.object({
  key: z.enum(['self', 'expression', 'wealth', 'order', 'resource']),
  label: z.string().trim().min(1),
  technicalLabel: z.string().trim().min(1),
  value: z.number(),
  description: z.string().trim().min(1),
  positive: z.string().trim().optional(),
  negative: z.string().trim().optional(),
});

const ElementsAndTenGodsCoreSectionSchema = z.object({
  elements: z
    .array(
      z.object({
        key: z.enum(['metal', 'wood', 'water', 'fire', 'earth']),
        label: z.string().trim().min(1).optional(),
        value: z.number(),
      })
    )
    .length(5)
    .superRefine((items, ctx) => {
      const keys = new Set(items.map((item) => item.key));
      if (keys.size !== 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'elements 必须完整返回五行五项且不可重复',
        });
      }
    }),
  tenGods: z
    .array(
      z.object({
        key: z.string().trim().min(1),
        label: z.string().trim().min(1),
        value: z.number(),
        tooltip: z.string().trim().min(1),
      })
    )
    .length(4),
});

const ModuleSectionSchema = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  advantages: z.array(z.string().trim().min(1)).max(3).optional(),
  suggestions: z.array(z.string().trim().min(1)).max(3).optional(),
  bullets: z.array(z.string().trim().min(1)).max(4).optional(),
});

const TimelineSectionSchema = z
  .array(
    z.object({
      year: z.number().optional(),
      title: z.string().trim().min(1),
      summary: z.string().trim().min(1),
      detail: z.object({
        opportunities: z.array(z.string().trim()).default([]),
        risks: z.array(z.string().trim()).default([]),
        actions: z.array(z.string().trim()).default([]),
      }).default({ opportunities: [], risks: [], actions: [] }),
    })
  )
  .min(1);

export type BaziSectionParseResult<K extends BaziSectionKey> = {
  payload: BaziSectionPayloadMap[K];
  recovery: RecoveryMode;
};

export function parseBaziSectionPayload<K extends BaziSectionKey>({
  sectionKey,
  rawPayload,
  input,
  currentYear,
  basis,
}: {
  sectionKey: K;
  rawPayload: string;
  input: DestinyReportRequest;
  currentYear: number;
  basis?: BaziChartBasis;
}): BaziSectionParseResult<K> {
  try {
    return {
      payload: normalizeSectionPayload(sectionKey, parseModelJson(rawPayload), input, currentYear, basis),
      recovery: 'none',
    };
  } catch (error) {
    if (!isRecoverableSectionKey(sectionKey)) {
      throw error;
    }

    return {
      payload: recoverRecoverableSectionPayload(
        sectionKey,
        rawPayload,
        input,
        currentYear,
        basis
      ) as BaziSectionPayloadMap[K],
      recovery: 'recovered',
    };
  }
}

export function buildMissingRecoverableSections(
  sections: BaziLockedSections,
  input: DestinyReportRequest,
  currentYear: number,
  options: { basis?: BaziChartBasis } = {}
): Array<{
  sectionKey: RecoverableBaziSectionKey;
  payload: BaziSectionPayloadMap[RecoverableBaziSectionKey];
}> {
  const fallback = normalizeDestinyReport({}, input, currentYear, options);

  return BAZI_SECTION_ORDER.filter(
    (sectionKey): sectionKey is RecoverableBaziSectionKey =>
      isRecoverableSectionKey(sectionKey) && !sections[sectionKey]
  ).map((sectionKey) => ({
    sectionKey,
    payload: buildFallbackSectionPayload(sectionKey, fallback),
  }));
}

function isRecoverableSectionKey(
  sectionKey: BaziSectionKey
): sectionKey is RecoverableBaziSectionKey {
  return recoverableSectionKeys.has(sectionKey as RecoverableBaziSectionKey);
}

function normalizeSectionPayload<K extends BaziSectionKey>(
  sectionKey: K,
  raw: unknown,
  input: DestinyReportRequest,
  currentYear: number,
  basis?: BaziChartBasis
): BaziSectionPayloadMap[K] {
  switch (sectionKey) {
    case 'baziBasis': {
      if (!basis) {
        throw new Error('missing bazi basis');
      }
      return basis as BaziSectionPayloadMap[K];
    }
    case 'profileOverview': {
      const parsed = ProfileSectionSchema.parse(raw);
      return normalizeDestinyReport({ profile: parsed }, input, currentYear, { basis })
        .profile as BaziSectionPayloadMap[K];
    }
    case 'coreDestinyTone': {
      const parsed = CoreToneSectionSchema.safeParse(raw);
      const coreTone = parsed.success
        ? parsed.data
        : { headline: '', description: '' };
      return normalizeDestinyReport({ coreTone }, input, currentYear, { basis })
        .coreTone as BaziSectionPayloadMap[K];
    }
    case 'pillars': {
      const parsed = normalizePillarsSection(raw, basis);
      return normalizeDestinyReport({ pillars: parsed }, input, currentYear, { basis })
        .pillars as BaziSectionPayloadMap[K];
    }
    case 'elementsAndTenGods': {
      const parsed = normalizeElementsAndTenGodsSection(raw, input, currentYear, basis);
      return parsed as BaziSectionPayloadMap[K];
    }
    case 'decadeFortuneInsights': {
      if (!basis) {
        throw new Error('missing bazi basis');
      }
      const parsed = z.array(DecadeFortuneInsightDraftSchema).parse(raw);
      const merged = mergeDecadeFortuneInsights(basis, parsed);
      return fillDecadeFortuneInsightFallbacks(basis, merged) as BaziSectionPayloadMap[K];
    }
    case 'modulePersonality': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { personality: parsed } }, input, currentYear, { basis })
        .modules.personality as BaziSectionPayloadMap[K];
    }
    case 'moduleCareer': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { career: parsed } }, input, currentYear, { basis }).modules
        .career as BaziSectionPayloadMap[K];
    }
    case 'moduleLove': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { love: parsed } }, input, currentYear, { basis }).modules
        .love as BaziSectionPayloadMap[K];
    }
    case 'moduleWealth': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { wealth: parsed } }, input, currentYear, { basis }).modules
        .wealth as BaziSectionPayloadMap[K];
    }
    case 'moduleHealth': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { health: parsed } }, input, currentYear, { basis }).modules
        .health as BaziSectionPayloadMap[K];
    }
    case 'timeline': {
      const parsed = TimelineSectionSchema.parse(raw);
      return normalizeDestinyReport({ timeline: parsed }, input, currentYear, { basis })
        .timeline as BaziSectionPayloadMap[K];
    }
  }
}

function normalizeElementsAndTenGodsSection(
  raw: unknown,
  input: DestinyReportRequest,
  currentYear: number,
  basis?: BaziChartBasis
): BaziSectionPayloadMap['elementsAndTenGods'] {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const parsedCore = basis
    ? {
        elements: basis.reportSeed.elements,
        tenGods: basis.reportSeed.tenGods,
      }
    : ElementsAndTenGodsCoreSectionSchema.parse(raw);
  const lifeDimensions = z.array(LifeDimensionSchema).length(5).safeParse(source.lifeDimensions);
  const lifeDimensionHighlights = LifeDimensionHighlightsSchema.safeParse(
    source.lifeDimensionHighlights
  );
  const tenGodDomains = z.array(TenGodDomainSchema).length(5).safeParse(source.tenGodDomains);
  const balanceInsight = BalanceInsightSchema.safeParse(source.balanceInsight);
  const patternHighlights = z
    .array(PatternInsightSchema)
    .max(4)
    .safeParse(source.patternHighlights);

  const report = normalizeDestinyReport(
    {
      elements: parsedCore.elements,
      tenGods: parsedCore.tenGods,
      lifeDimensions: lifeDimensions.success ? lifeDimensions.data : undefined,
      lifeDimensionHighlights: lifeDimensionHighlights.success
        ? lifeDimensionHighlights.data
        : undefined,
      tenGodDomains: tenGodDomains.success ? tenGodDomains.data : undefined,
      balanceInsight: balanceInsight.success ? balanceInsight.data : undefined,
      patternHighlights: patternHighlights.success ? patternHighlights.data : undefined,
    },
    input,
    currentYear,
    { basis }
  );

  return {
    elements: report.elements,
    tenGods: report.tenGods,
    balanceInsight: report.balanceInsight,
    patternHighlights: report.patternHighlights,
    lifeDimensions: report.lifeDimensions,
    lifeDimensionHighlights: report.lifeDimensionHighlights,
    tenGodDomains: report.tenGodDomains,
  };
}

function recoverRecoverableSectionPayload(
  sectionKey: RecoverableBaziSectionKey,
  rawPayload: string,
  input: DestinyReportRequest,
  currentYear: number,
  basis?: BaziChartBasis
): BaziSectionPayloadMap[RecoverableBaziSectionKey] {
  switch (sectionKey) {
    case 'decadeFortuneInsights': {
      try {
        return normalizeSectionPayload(
          'decadeFortuneInsights',
          tryParseModelJson(rawPayload) ?? [],
          input,
          currentYear,
          basis
        );
      } catch {
        return buildFallbackSectionPayload(
          'decadeFortuneInsights',
          normalizeDestinyReport({}, input, currentYear, { basis })
        );
      }
    }
    case 'timeline':
      return recoverTimelinePayload(rawPayload, input, currentYear, basis);
    case 'modulePersonality':
    case 'moduleCareer':
    case 'moduleLove':
    case 'moduleWealth':
    case 'moduleHealth':
      return recoverModulePayload(sectionKey, rawPayload, input, currentYear, basis);
  }

  throw new Error(`Unsupported recoverable section: ${sectionKey}`);
}

function recoverTimelinePayload(
  rawPayload: string,
  input: DestinyReportRequest,
  currentYear: number,
  basis?: BaziChartBasis
): DestinyReport['timeline'] {
  const parsed = tryParseModelJson(rawPayload);
  const recovered = normalizeDestinyReport({ timeline: parsed ?? [] }, input, currentYear, {
    basis,
  }).timeline;
  return recovered.length > 0
    ? recovered
    : buildFallbackSectionPayload(
        'timeline',
        normalizeDestinyReport({}, input, currentYear, { basis })
      );
}

function recoverModulePayload(
  sectionKey: ModuleSectionKey,
  rawPayload: string,
  input: DestinyReportRequest,
  currentYear: number,
  basis?: BaziChartBasis
): DestinyReport['modules'][ModuleSlot] {
  const parsed = tryParseModelJson(rawPayload);
  const recovered = normalizeLooseModule(parsed, rawPayload);
  const report = normalizeDestinyReport(
    {
      modules: {
        [toModuleSlot(sectionKey)]: recovered,
      },
    },
    input,
    currentYear,
    { basis }
  );

  switch (sectionKey) {
    case 'modulePersonality':
      return report.modules.personality;
    case 'moduleCareer':
      return report.modules.career;
    case 'moduleLove':
      return report.modules.love;
    case 'moduleWealth':
      return report.modules.wealth;
    case 'moduleHealth':
      return report.modules.health;
  }
}

type ModuleSlot = keyof DestinyReport['modules'];

function toModuleSlot(sectionKey: ModuleSectionKey): ModuleSlot {
  switch (sectionKey) {
    case 'modulePersonality':
      return 'personality';
    case 'moduleCareer':
      return 'career';
    case 'moduleLove':
      return 'love';
    case 'moduleWealth':
      return 'wealth';
    case 'moduleHealth':
      return 'health';
  }
}

function normalizeLooseModule(raw: unknown, rawPayload: string): DestinyModule {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const title = asString(source.title) || extractNamedStringField(rawPayload, 'title');
  const summary = asString(source.summary) || extractNamedStringField(rawPayload, 'summary');

  // 优先解析新字段 advantages / suggestions
  const advantagesFromObject = coerceBullets(source.advantages);
  const suggestionsFromObject = coerceBullets(source.suggestions);

  // 兜底：从 rawPayload 正则提取新字段（应对 JSON 损坏场景）
  const advantages =
    advantagesFromObject.length > 0
      ? advantagesFromObject
      : extractBulletsFromMalformedPayloadByField(rawPayload, 'advantages');
  const suggestions =
    suggestionsFromObject.length > 0
      ? suggestionsFromObject
      : extractBulletsFromMalformedPayloadByField(rawPayload, 'suggestions');

  // 兼容旧格式 bullets
  const bulletsFromObject = coerceBullets(source.bullets);
  const bullets =
    bulletsFromObject.length > 0
      ? bulletsFromObject
      : extractBulletsFromMalformedPayload(rawPayload);

  return {
    title,
    summary,
    advantages: advantages.length > 0 ? advantages : undefined,
    suggestions: suggestions.length > 0 ? suggestions : undefined,
    bullets: bullets.length > 0 ? bullets : undefined,
  };
}

function normalizePillarsSection(raw: unknown, basis?: BaziChartBasis) {
  if (!basis) {
    const parsed = z.array(PillarSchema).safeParse(raw);
    return parsed.success ? parsed.data : [];
  }

  const parsed = z.array(PillarCommentarySchema).safeParse(raw);
  const byLabel = new Map(
    parsed.success ? parsed.data.map((item) => [item.label, item.tooltip]) : []
  );
  return basis.reportSeed.pillars.map((pillar) => ({
    ...pillar,
    tooltip: byLabel.get(pillar.label) || '',
  }));
}

function buildFallbackSectionPayload<K extends RecoverableBaziSectionKey>(
  sectionKey: K,
  fallback: DestinyReport
): BaziSectionPayloadMap[K] {
  switch (sectionKey) {
    case 'decadeFortuneInsights': {
      if (!fallback.baziBasis) {
        throw new Error('missing bazi basis for decade fortune fallback');
      }
      return buildDecadeFortuneInsights(fallback.baziBasis) as BaziSectionPayloadMap[K];
    }
    case 'modulePersonality':
      return fallback.modules.personality as BaziSectionPayloadMap[K];
    case 'moduleCareer':
      return fallback.modules.career as BaziSectionPayloadMap[K];
    case 'moduleLove':
      return fallback.modules.love as BaziSectionPayloadMap[K];
    case 'moduleWealth':
      return fallback.modules.wealth as BaziSectionPayloadMap[K];
    case 'moduleHealth':
      return fallback.modules.health as BaziSectionPayloadMap[K];
    case 'timeline':
      return fallback.timeline as BaziSectionPayloadMap[K];
  }

  throw new Error(`Unsupported fallback section: ${sectionKey}`);
}

function coerceBullets(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asString(item).trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  const text = asString(value).trim();
  return text ? [text] : [];
}

function extractNamedStringField(rawPayload: string, fieldName: string): string {
  const match = rawPayload.match(new RegExp(`"${fieldName}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 's'));
  return match?.[1] ? decodeJsonString(match[1]).trim() : '';
}

function extractBulletsFromMalformedPayload(rawPayload: string): string[] {
  const arrayMatch = rawPayload.match(/"bullets"\s*:\s*\[([\s\S]*?)\]/);
  if (arrayMatch?.[1]) {
    return extractQuotedStrings(arrayMatch[1]);
  }

  const tailMatch = rawPayload.match(/"bullets"\s*:\s*([\s\S]*)$/);
  return tailMatch?.[1] ? extractQuotedStrings(tailMatch[1]) : [];
}

/** 从损坏的 JSON 中按字段名提取字符串数组（用于 advantages / suggestions） */
function extractBulletsFromMalformedPayloadByField(rawPayload: string, fieldName: string): string[] {
  const regex = new RegExp(`"${fieldName}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 's');
  const arrayMatch = rawPayload.match(regex);
  if (arrayMatch?.[1]) {
    return extractQuotedStrings(arrayMatch[1]);
  }

  const tailRegex = new RegExp(`"${fieldName}"\\s*:\\s*([\\s\\S]*)$`, 's');
  const tailMatch = rawPayload.match(tailRegex);
  return tailMatch?.[1] ? extractQuotedStrings(tailMatch[1]) : [];
}

function extractQuotedStrings(raw: string): string[] {
  const matches = raw.matchAll(/"((?:\\.|[^"\\])*)"/g);
  return Array.from(matches, (match) => decodeJsonString(match[1]).trim())
    .filter(Boolean)
    .slice(0, 4);
}

function decodeJsonString(value: string): string {
  try {
    return JSON.parse(`"${value}"`) as string;
  } catch {
    return value;
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function tryParseModelJson(text: string): unknown | null {
  try {
    return parseModelJson(text);
  } catch {
    return null;
  }
}

function parseModelJson(text: string): unknown {
  const source = extractJsonBlock(text).trim();

  try {
    return JSON.parse(source);
  } catch {
    const arrayMatch = source.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      const candidate = arrayMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(candidate);
    }

    const objectMatch = source.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      const candidate = objectMatch[0]
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/[\u0000-\u001F]+/g, ' ');
      return JSON.parse(candidate);
    }

    throw new SyntaxError('模型 JSON 解析失败');
  }
}
