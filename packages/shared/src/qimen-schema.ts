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

export { qimenStrategyOverviewSchema, qimenTimingWindowsSchema };