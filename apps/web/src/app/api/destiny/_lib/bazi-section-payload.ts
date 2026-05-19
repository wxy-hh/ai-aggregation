import { z } from 'zod';
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
  'profileOverview',
  'coreDestinyTone',
  'pillars',
  'elementsAndTenGods',
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

const recoverableSectionKeys = new Set<RecoverableBaziSectionKey>([
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
  tag: z.string().trim().min(1),
  chartSummary: z.string().trim().min(1),
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
  bullets: z.array(z.string().trim().min(1)).min(2).max(4),
});

const TimelineSectionSchema = z
  .array(
    z.object({
      year: z.number(),
      title: z.string().trim().min(1),
      summary: z.string().trim().min(1),
      detail: z.object({
        opportunities: z.array(z.string().trim().min(1)).min(1),
        risks: z.array(z.string().trim().min(1)).min(1),
        actions: z.array(z.string().trim().min(1)).min(1),
      }),
    })
  )
  .length(3);

export type BaziSectionParseResult<K extends BaziSectionKey> = {
  payload: BaziSectionPayloadMap[K];
  recovery: RecoveryMode;
};

export function parseBaziSectionPayload<K extends BaziSectionKey>({
  sectionKey,
  rawPayload,
  input,
  currentYear,
}: {
  sectionKey: K;
  rawPayload: string;
  input: DestinyReportRequest;
  currentYear: number;
}): BaziSectionParseResult<K> {
  try {
    return {
      payload: normalizeSectionPayload(sectionKey, parseModelJson(rawPayload), input, currentYear),
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
        currentYear
      ) as BaziSectionPayloadMap[K],
      recovery: 'recovered',
    };
  }
}

export function buildMissingRecoverableSections(
  sections: BaziLockedSections,
  input: DestinyReportRequest,
  currentYear: number
): Array<{
  sectionKey: RecoverableBaziSectionKey;
  payload: BaziSectionPayloadMap[RecoverableBaziSectionKey];
}> {
  const fallback = normalizeDestinyReport({}, input, currentYear);

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
  currentYear: number
): BaziSectionPayloadMap[K] {
  switch (sectionKey) {
    case 'profileOverview': {
      const parsed = ProfileSectionSchema.parse(raw);
      return normalizeDestinyReport({ profile: parsed }, input, currentYear)
        .profile as BaziSectionPayloadMap[K];
    }
    case 'coreDestinyTone': {
      const parsed = CoreToneSectionSchema.parse(raw);
      return normalizeDestinyReport({ coreTone: parsed }, input, currentYear)
        .coreTone as BaziSectionPayloadMap[K];
    }
    case 'pillars': {
      const parsed = z.array(PillarSchema).length(4).parse(raw);
      return normalizeDestinyReport({ pillars: parsed }, input, currentYear)
        .pillars as BaziSectionPayloadMap[K];
    }
    case 'elementsAndTenGods': {
      const parsed = normalizeElementsAndTenGodsSection(raw, input, currentYear);
      return parsed as BaziSectionPayloadMap[K];
    }
    case 'modulePersonality': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { personality: parsed } }, input, currentYear)
        .modules.personality as BaziSectionPayloadMap[K];
    }
    case 'moduleCareer': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { career: parsed } }, input, currentYear).modules
        .career as BaziSectionPayloadMap[K];
    }
    case 'moduleLove': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { love: parsed } }, input, currentYear).modules
        .love as BaziSectionPayloadMap[K];
    }
    case 'moduleWealth': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { wealth: parsed } }, input, currentYear).modules
        .wealth as BaziSectionPayloadMap[K];
    }
    case 'moduleHealth': {
      const parsed = ModuleSectionSchema.parse(raw);
      return normalizeDestinyReport({ modules: { health: parsed } }, input, currentYear).modules
        .health as BaziSectionPayloadMap[K];
    }
    case 'timeline': {
      const parsed = TimelineSectionSchema.parse(raw);
      return normalizeDestinyReport({ timeline: parsed }, input, currentYear)
        .timeline as BaziSectionPayloadMap[K];
    }
  }
}

function normalizeElementsAndTenGodsSection(
  raw: unknown,
  input: DestinyReportRequest,
  currentYear: number
): BaziSectionPayloadMap['elementsAndTenGods'] {
  const parsedCore = ElementsAndTenGodsCoreSectionSchema.parse(raw);
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const lifeDimensions = z.array(LifeDimensionSchema).length(5).safeParse(source.lifeDimensions);
  const lifeDimensionHighlights = LifeDimensionHighlightsSchema.safeParse(
    source.lifeDimensionHighlights
  );
  const tenGodDomains = z.array(TenGodDomainSchema).length(5).safeParse(source.tenGodDomains);
  const balanceInsight = BalanceInsightSchema.safeParse(source.balanceInsight);
  const patternHighlights = z
    .array(PatternInsightSchema)
    .min(2)
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
    currentYear
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
  currentYear: number
): BaziSectionPayloadMap[RecoverableBaziSectionKey] {
  switch (sectionKey) {
    case 'timeline':
      return recoverTimelinePayload(rawPayload, input, currentYear);
    case 'modulePersonality':
    case 'moduleCareer':
    case 'moduleLove':
    case 'moduleWealth':
    case 'moduleHealth':
      return recoverModulePayload(sectionKey, rawPayload, input, currentYear);
  }
}

function recoverTimelinePayload(
  rawPayload: string,
  input: DestinyReportRequest,
  currentYear: number
): DestinyReport['timeline'] {
  const parsed = tryParseModelJson(rawPayload);
  const recovered = normalizeDestinyReport({ timeline: parsed ?? [] }, input, currentYear).timeline;
  return recovered.length > 0
    ? recovered
    : buildFallbackSectionPayload('timeline', normalizeDestinyReport({}, input, currentYear));
}

function recoverModulePayload(
  sectionKey: ModuleSectionKey,
  rawPayload: string,
  input: DestinyReportRequest,
  currentYear: number
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
    currentYear
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
  const bulletsFromObject = coerceBullets(source.bullets);
  const bullets =
    bulletsFromObject.length > 0
      ? bulletsFromObject
      : extractBulletsFromMalformedPayload(rawPayload);

  return {
    title,
    summary,
    bullets,
  };
}

function buildFallbackSectionPayload<K extends RecoverableBaziSectionKey>(
  sectionKey: K,
  fallback: DestinyReport
): BaziSectionPayloadMap[K] {
  switch (sectionKey) {
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
