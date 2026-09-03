/**
 * 奇门分析 schema 层（评审 C3 内部分段）。
 * 容纳请求/结果校验 zod schema 与 Doubao json_schema 结构化输出常量。
 */
import { z } from 'zod';

export const qimenAnalyzeRequestSchema = z.object({
  context: z.object({
    datetime: z.string().min(1, '起局时间不能为空'),
    location: z.string().min(1, '地点不能为空'),
    chartMethod: z.enum(['time', 'daily']),
    longitude: z.number().optional(),
  }),
  question: z.object({
    category: z.enum(['career', 'wealth', 'love', 'health', 'decision', 'study', 'other']),
    description: z.string().trim().min(10, '问题描述至少 10 字').max(300, '问题描述最多 300 字'),
    focus: z.enum(['short_term', 'long_term', 'risk_control']),
    outputStyle: z.enum(['professional', 'plain']),
    outputLength: z.enum(['brief', 'detailed']),
  }),
});

const qimenCellSchema = z.object({
  palace: z.string().trim().min(1),
  luoshu: z.number().int().min(1).max(9),
  direction: z.string().trim().min(1),
  god: z.string().trim().min(1),
  star: z.string().trim().min(1),
  door: z.string().trim().min(1),
  heavenStem: z.string().trim().min(1),
  earthStem: z.string().trim().min(1),
  isValueSymbol: z.boolean().optional(),
  isValueDoor: z.boolean().optional(),
  isVoid: z.boolean().optional(),
  isHorse: z.boolean().optional(),
  wuxing: z.string().optional(),
  pattern: z.string().optional(),
});

const qimenBaseResultSchema = z.object({
  chartTitle: z.string().trim().min(1),
  chartMeta: z.object({
    dun: z.string().trim().min(1),
    ju: z.string().trim().min(1),
    jiaziXunkong: z.string().trim().min(1),
    horsePosition: z.string().trim().min(1),
    valueSymbol: z.string().trim().min(1),
    valueDoor: z.string().trim().min(1),
    xunshou: z.string().trim().min(1),
    riGan: z.string().trim().min(1),
    shiGan: z.string().trim().min(1),
    trueSolarTime: z.string().optional(),
  }),
  board: z.array(qimenCellSchema).min(9).max(9),
  score: z.number().int().min(40).max(95),
  disclaimer: z.string().trim().min(1),
});

const qimenStrategyOverviewSchema = z.object({
  overallAssessment: z.string().trim().min(1),
  riskAlerts: z.array(z.string().trim().min(1)).min(3).max(6),
  actionSuggestions: z.array(z.string().trim().min(1)).min(3).max(6),
});

const qimenTimingWindowsSchema = z.array(
  z.object({
    period: z.string().trim().min(1),
    guidance: z.string().trim().min(1),
  })
);

// JSON Schema 常量，用于 Doubao json_schema 结构化输出
export const QIMEN_BASE_RESULT_SCHEMA = {
  type: 'object',
  properties: {
    chartTitle: { type: 'string' },
    chartMeta: {
      type: 'object',
      properties: {
        dun: { type: 'string' },
        ju: { type: 'string' },
        jiaziXunkong: { type: 'string' },
        horsePosition: { type: 'string' },
        valueSymbol: { type: 'string' },
        valueDoor: { type: 'string' },
      },
      required: ['dun', 'ju', 'jiaziXunkong', 'horsePosition', 'valueSymbol', 'valueDoor'],
      additionalProperties: false,
    },
    board: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          palace: { type: 'string' },
          luoshu: { type: 'integer', minimum: 1, maximum: 9 },
          direction: { type: 'string' },
          god: { type: 'string' },
          star: { type: 'string' },
          door: { type: 'string' },
          heavenStem: { type: 'string' },
          earthStem: { type: 'string' },
          isValueSymbol: { type: 'boolean' },
          isValueDoor: { type: 'boolean' },
          isVoid: { type: 'boolean' },
          isHorse: { type: 'boolean' },
        },
        required: [
          'palace',
          'luoshu',
          'direction',
          'god',
          'star',
          'door',
          'heavenStem',
          'earthStem',
        ],
        additionalProperties: false,
      },
    },
    score: { type: 'integer', minimum: 40, maximum: 95 },
    disclaimer: { type: 'string' },
  },
  required: ['chartTitle', 'chartMeta', 'board', 'score', 'disclaimer'],
  additionalProperties: false,
} as const;

export const QIMEN_STRATEGY_OVERVIEW_SCHEMA = {
  type: 'object',
  properties: {
    overallAssessment: { type: 'string' },
    riskAlerts: { type: 'array', items: { type: 'string' } },
    actionSuggestions: { type: 'array', items: { type: 'string' } },
  },
  required: ['overallAssessment', 'riskAlerts', 'actionSuggestions'],
  additionalProperties: false,
} as const;

export const QIMEN_TIMING_WINDOWS_SCHEMA = {
  type: 'object',
  properties: {
    timingWindows: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          period: { type: 'string' },
          guidance: { type: 'string' },
        },
        required: ['period', 'guidance'],
        additionalProperties: false,
      },
    },
  },
  required: ['timingWindows'],
  additionalProperties: false,
} as const;

export const QIMEN_CHART_SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    chartSummary: { type: 'string' },
  },
  required: ['chartSummary'],
  additionalProperties: false,
} as const;

export type JsonSchemaConfig = { name: string; schema: Record<string, unknown> };

export { qimenBaseResultSchema, qimenStrategyOverviewSchema, qimenTimingWindowsSchema };