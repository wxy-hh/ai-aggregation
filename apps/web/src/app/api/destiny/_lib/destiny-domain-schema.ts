/**
 * 领域 Schema 单一权威定义
 *
 * 说明：
 * - 统一 Profile / CoreTone / Pillar / BalanceInsight / PatternInsight /
 *   LifeDimension / LifeDimensionHighlights / TenGodDomain / Module / Timeline 等 schema
 * - 提供 base（optional / loose）与 require（required / strict）两套变体，
 *   让 bazi-section-payload 与 report-normalizer 共用同一份字段定义
 */

import { z } from 'zod';

// ─── 枚举元组 ───

export const fiveElementTuple = ['metal', 'wood', 'water', 'fire', 'earth'] as const;
export const lifeDimensionTuple = ['career', 'wealth', 'health', 'love', 'wisdom'] as const;
export const tenGodDomainTuple = ['self', 'expression', 'wealth', 'order', 'resource'] as const;

// ─── 基础 schema（默认 optional / loose）───

export const ProfileSchema = z.object({
  name: z.string().min(1).optional(),
  genderLabel: z.string().min(1).optional(),
  birthText: z.string().min(1).optional(),
  locationText: z.string().min(1).optional(),
  lunarText: z.string().min(1).optional(),
});

export const CoreToneSchema = z.object({
  tag: z.string().optional(),
  chartSummary: z.string().optional(),
  headline: z.string().optional(),
  description: z.string().optional(),
});

export const PillarSchema = z.object({
  stem: z.string().min(1),
  branch: z.string().min(1),
  label: z.string().min(1),
  element: z.enum(fiveElementTuple),
  tooltip: z.string().min(1),
});

export const BalanceInsightSchema = z.object({
  title: z.string().min(1).optional(),
  value: z.string().min(1).optional(),
  tooltip: z.string().min(1).optional(),
});

export const PatternInsightSchema = z.object({
  label: z.string().min(1),
  tooltip: z.string().min(1),
});

export const LifeDimensionSchema = z.object({
  key: z.enum(lifeDimensionTuple),
  label: z.string().min(1).optional(),
  value: z.number(),
  summary: z.string().min(1).optional(),
});

export const LifeDimensionHighlightsSchema = z.object({
  strength: z.string().trim().min(1).optional(),
  caution: z.string().trim().min(1).optional(),
});

export const TenGodDomainSchema = z.object({
  key: z.enum(tenGodDomainTuple),
  label: z.string().min(1).optional(),
  technicalLabel: z.string().min(1).optional(),
  value: z.number(),
  description: z.string().min(1).optional(),
  positive: z.string().min(1).optional(),
  negative: z.string().min(1).optional(),
});

export const ElementSchema = z.object({
  key: z.enum(fiveElementTuple),
  label: z.string().min(1).optional(),
  value: z.number(),
});

export const TenGodSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  value: z.number(),
  tooltip: z.string().min(1).optional(),
});

export const ModuleSchema = z.object({
  title: z.string().optional(),
  summary: z.string().optional(),
  advantages: z.array(z.string()).optional(),
  suggestions: z.array(z.string()).optional(),
  bullets: z.array(z.string()).optional(),
});

export const TimelineItemSchema = z.object({
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

// ─── strict / required 变体（供 bazi-section-payload 使用）───

export const RequireProfileSchema = ProfileSchema.required({
  name: true,
  genderLabel: true,
  birthText: true,
  locationText: true,
});

export const RequireCoreToneSchema = CoreToneSchema.required({
  headline: true,
  description: true,
});

export const RequireTenGodDomainSchema = TenGodDomainSchema.required({
  label: true,
  technicalLabel: true,
  description: true,
});

export function RequireModuleSchema(options?: { withBulletsMax?: number }) {
  const bulletsMax = options?.withBulletsMax ?? 4;

  return ModuleSchema.required({
    title: true,
    summary: true,
  }).extend({
    advantages: z.array(z.string().trim().min(1)).max(3).optional(),
    suggestions: z.array(z.string().trim().min(1)).max(3).optional(),
    bullets: z.array(z.string().trim().min(1)).max(bulletsMax).optional(),
  });
}

export function RequireTimelineItemSchema(options?: { withMinLength?: number }) {
  const strictItem = TimelineItemSchema.required({
    title: true,
    summary: true,
  }).extend({
    detail: z
      .object({
        opportunities: z.array(z.string().trim()).default([]),
        risks: z.array(z.string().trim()).default([]),
        actions: z.array(z.string().trim()).default([]),
      })
      .default({ opportunities: [], risks: [], actions: [] }),
  });

  return options?.withMinLength
    ? z.array(strictItem).min(options.withMinLength)
    : z.array(strictItem);
}
