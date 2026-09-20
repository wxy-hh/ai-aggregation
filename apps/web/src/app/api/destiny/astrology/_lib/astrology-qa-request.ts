/**
 * astrology-qa-request.ts —— 星语问答路由的请求体口径（04 工单）
 *
 * 请求体携带报告上下文（盘面事实 + 生活模块）、用户问题、本报告已提问数与模型口径：
 * - 盘面事实按真实计算域的形状校验（客户端送来的是报告路由下发的同一份真值）；
 * - 生活模块只取问答需要的字段（id / 标题 / 摘要 / 行动 / 标签 / 依据），最多五个；
 * - 3 问上限由服务端按 askedCount 强制（前端同时做计数 UI，两层一致）。
 */

import { z } from 'zod';
import type {
  AspectType,
  AstrologyChartFacts,
  PlanetBody,
  PlacementStability,
  TimePrecision,
  ZodiacSign,
} from '@/lib/astrology/chart-facts';

/* ---------- 事实层枚举（与 chart-facts 类型同源，satisfies 保证不漂移） ---------- */

const ZODIAC_SIGNS = [
  'aries',
  'taurus',
  'gemini',
  'cancer',
  'leo',
  'virgo',
  'libra',
  'scorpio',
  'sagittarius',
  'capricorn',
  'aquarius',
  'pisces',
] as const satisfies readonly ZodiacSign[];

const PLANET_BODIES = [
  'sun',
  'moon',
  'mercury',
  'venus',
  'mars',
  'jupiter',
  'saturn',
  'uranus',
  'neptune',
  'pluto',
] as const satisfies readonly PlanetBody[];

const ASPECT_TYPES = ['conjunction', 'sextile', 'square', 'trine', 'opposition'] as const satisfies
  readonly AspectType[];

const STABILITIES = ['stable', 'signOnly', 'unstable'] as const satisfies
  readonly PlacementStability[];

/* ---------- 事实层 schema ---------- */

const StabilityStatusSchema = z.object({
  displayable: z.boolean(),
  reason: z.enum(['unstable-in-range', 'time-unknown']).nullable(),
  detail: z.string().nullable(),
});

const PlanetPlacementSchema = z.object({
  body: z.enum(PLANET_BODIES),
  sign: z.enum(ZODIAC_SIGNS).nullable(),
  degree: z.number().nullable(),
  house: z.number().nullable(),
  retrograde: z.boolean().nullable(),
  stability: z.enum(STABILITIES),
});

const AngleFactSchema = z.object({
  point: z.enum(['ascendant', 'midheaven']),
  sign: z.enum(ZODIAC_SIGNS).nullable(),
  degree: z.number().nullable(),
  longitude: z.number().nullable(),
  stability: z.enum(STABILITIES),
});

const HouseFactSchema = z.object({
  number: z.number(),
  sign: z.enum(ZODIAC_SIGNS),
  cuspDegree: z.number(),
  stability: z.enum(STABILITIES),
});

const AspectFactSchema = z.object({
  source: z.enum(PLANET_BODIES),
  target: z.enum(PLANET_BODIES),
  type: z.enum(ASPECT_TYPES),
  orb: z.number().nullable(),
  strength: z.number().nullable(),
  stability: z.enum(STABILITIES),
});

const TransitFactSchema = z.object({
  startsAt: z.string(),
  endsAt: z.string(),
  transitingBody: z.enum(PLANET_BODIES),
  natalTarget: z.enum(PLANET_BODIES),
  aspect: z.enum(ASPECT_TYPES),
  theme: z.string(),
});

/** 事实层台账：placements 十星体齐备（真值必然齐备，不按可选值收敛） */
const PlacementStabilityShape = PLANET_BODIES.reduce(
  (shape, body) => ({ ...shape, [body]: StabilityStatusSchema }),
  {} as Record<PlanetBody, typeof StabilityStatusSchema>
);

const FactStabilitySchema = z.object({
  angles: StabilityStatusSchema,
  houses: StabilityStatusSchema,
  placements: z.object(PlacementStabilityShape),
  aspects: StabilityStatusSchema,
  note: z.string().nullable(),
});

const AstrologyChartFactsSchema = z.object({
  zodiacSystem: z.literal('tropical'),
  houseSystem: z.enum(['whole-sign', 'placidus']).nullable(),
  calculatedAt: z.string(),
  engineVersion: z.string(),
  orbTableVersion: z.string(),
  calculationRevision: z.string(),
  planets: z.array(PlanetPlacementSchema),
  angles: z.object({ ascendant: AngleFactSchema, midheaven: AngleFactSchema }),
  houses: z.array(HouseFactSchema),
  aspects: z.array(AspectFactSchema),
  transits: z.array(TransitFactSchema),
  factStability: FactStabilitySchema,
  dataCompleteness: z.enum(['with-houses', 'without-houses']),
});

/* ---------- 生活模块（问答只用到这六个字段） ---------- */

const AstrologyModuleSchema = z.object({
  id: z.enum(['who', 'love', 'career', 'strengths', 'week']),
  title: z.string(),
  summary: z.string(),
  tags: z.array(z.string()).default([]),
  action: z.string().default(''),
  factReferences: z.array(z.string()).default([]),
});

/* ---------- 请求体 ---------- */

export const AstrologyQaRequestSchema = z.object({
  report: z.object({
    facts: AstrologyChartFactsSchema,
    modules: z.array(AstrologyModuleSchema).max(5, '生活模块数量超出范围').default([]),
  }),
  question: z.string().trim().min(1, '问题不能为空').max(200, '问题过长，请精简后再问'),
  /** 出生时间精度（提示词降级口径）；缺省按盘面范围推导 */
  timePrecision: z.enum(['accurate', 'approximate', 'unknown']).optional(),
  provider: z.enum(['doubao', 'deepseek']).default('doubao'),
});

export type AstrologyQaRequestBody = z.infer<typeof AstrologyQaRequestSchema>;

/** 时间精度：请求体优先；缺省按盘面范围推导（无宫位盘即视为时间未知档，仅影响提示词口径） */
export function resolveQaTimePrecision(body: AstrologyQaRequestBody): TimePrecision {
  if (body.timePrecision) return body.timePrecision;
  const facts: AstrologyChartFacts['dataCompleteness'] = body.report.facts.dataCompleteness;
  return facts === 'without-houses' ? 'unknown' : 'accurate';
}
