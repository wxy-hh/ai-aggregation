import { z } from 'zod';

/**
 * 产物沉淀至知识库请求 Schema (ADR-0034)
 */
export const depositArtifactSchema = z.object({
  artifactId: z.string().min(1, '产物 ID 不能为空'),
  title: z.string().min(1, '标题不能为空').max(100, '标题不能超过 100 字符'),
  content: z.string().min(1, '内容不能为空').max(30000, '产物内容不能超过 30,000 字符'),
  type: z.enum(['markdown', 'table', 'code']),
  tags: z
    .array(z.string().regex(/^[a-zA-Z0-9_一-龥-]{1,20}$/, '标签格式不合法'))
    .max(10, '最多添加 10 个标签')
    .optional()
    .default([]),
  sourceSessionId: z.string().optional(),
});

export type DepositArtifactInput = z.infer<typeof depositArtifactSchema>;

/**
 * 消息智能提炼 FAQ 请求 Schema (ADR-0034)
 */
export const distillFaqRequestSchema = z.object({
  userQuery: z.string().min(1, '用户提问内容不能为空').max(2000, '用户提问不能超过 2000 字符'),
  aiResponse: z.string().min(1, 'AI 回答内容不能为空').max(10000, 'AI 回答不能超过 10000 字符'),
});

export type DistillFaqRequestInput = z.infer<typeof distillFaqRequestSchema>;

/**
 * 消息智能提炼 FAQ 响应 Schema (ADR-0034)
 */
export const distillFaqResponseSchema = z.object({
  question: z.string().min(1).max(200),
  answer: z.string().min(1).max(3000),
  similarQuestions: z.array(z.string()).max(5).default([]),
  isFallback: z.boolean().default(false),
});

export type DistillFaqResponseData = z.infer<typeof distillFaqResponseSchema>;
