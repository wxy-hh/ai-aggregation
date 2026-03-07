/**
 * 简历编辑器 Zod Schema 验证
 *
 * 本文件定义了简历编辑器所有数据模型的 Zod schema，用于：
 * - 运行时数据验证
 * - 导入导出数据校验
 * - API 请求/响应校验
 *
 * 字段长度限制和必填规则参考 requirements.md 需求 14 和 design.md 第 5 节
 */

import { z } from 'zod';

/**
 * 技能等级枚举
 */
export const SkillLevelSchema = z.enum(['beginner', 'intermediate', 'advanced', 'expert'], {
  errorMap: () => ({ message: '技能等级必须是 beginner、intermediate、advanced 或 expert' }),
});

/**
 * 个人信息 Schema（用于编辑器）
 */
export const ResumePersonalInfoSchema = z.object({
  name: z.string({ required_error: '姓名为必填项' }).max(100, '姓名最多 100 个字符'),

  title: z.string({ required_error: '求职意向为必填项' }).max(100, '求职意向最多 100 个字符'),

  email: z
    .string()
    .email('邮箱格式不正确')
    .max(200, '邮箱最多 200 个字符')
    .optional()
    .or(z.literal('')),

  phone: z.string().max(30, '电话号码最多 30 个字符').optional().or(z.literal('')),

  location: z.string().max(100, '现居地最多 100 个字符').optional().or(z.literal('')),

  education: z.string().max(50, '学历最多 50 个字符').optional().or(z.literal('')),

  major: z.string().max(100, '专业最多 100 个字符').optional().or(z.literal('')),

  politicalStatus: z.string().max(50, '政治面貌最多 50 个字符').optional().or(z.literal('')),

  currentStatus: z.string().max(50, '目前状态最多 50 个字符').optional().or(z.literal('')),

  summary: z.string().max(2000, '专业技能最多 2000 个字符').optional().or(z.literal('')),
});

/**
 * 工作经历 Schema
 */
export const ResumeWorkExperienceSchema = z.object({
  id: z.string({ required_error: '工作经历 ID 为必填项' }).min(1, 'ID 不能为空'),

  company: z.string({ required_error: '公司名称为必填项' }).max(120, '公司名称最多 120 个字符'),

  position: z.string({ required_error: '职位名称为必填项' }).max(100, '职位名称最多 100 个字符'),

  period: z.string({ required_error: '工作时间段为必填项' }).max(60, '工作时间段最多 60 个字符'),

  description: z
    .string({ required_error: '工作描述为必填项' })
    .max(2000, '工作描述最多 2000 个字符'),
});

/**
 * 教育背景 Schema
 */
export const ResumeEducationSchema = z.object({
  id: z.string({ required_error: '教育背景 ID 为必填项' }).min(1, 'ID 不能为空'),

  school: z.string({ required_error: '学校名称为必填项' }).max(120, '学校名称最多 120 个字符'),

  degree: z.string({ required_error: '学位为必填项' }).max(80, '学位最多 80 个字符'),

  major: z.string({ required_error: '专业为必填项' }).max(120, '专业最多 120 个字符'),

  period: z.string({ required_error: '就读时间段为必填项' }).max(60, '就读时间段最多 60 个字符'),
});

/**
 * 项目经历 Schema
 */
export const ResumeProjectSchema = z.object({
  id: z.string({ required_error: '项目 ID 为必填项' }).min(1, 'ID 不能为空'),

  name: z.string({ required_error: '项目名称为必填项' }).max(120, '项目名称最多 120 个字符'),

  description: z.string().max(500, '项目介绍最多 500 个字符').optional().or(z.literal('')),

  responsibilities: z.string().max(1000, '项目职责最多 1000 个字符').optional().or(z.literal('')),

  techStack: z.string().max(500, '技术栈最多 500 个字符').optional().or(z.literal('')),

  highlights: z.string().max(1000, '项目亮点最多 1000 个字符').optional().or(z.literal('')),

  period: z.string().max(60, '项目时间段最多 60 个字符').optional().or(z.literal('')),
});

/**
 * 技能 Schema
 */
export const ResumeSkillSchema = z.object({
  id: z.string({ required_error: '技能 ID 为必填项' }).min(1, 'ID 不能为空'),

  name: z.string({ required_error: '技能名称为必填项' }).max(100, '技能名称最多 100 个字符'),

  level: SkillLevelSchema.optional(),
});

/**
 * 完整简历文档 Schema
 */
export const ResumeDocumentSchema = z.object({
  schemaVersion: z.literal('v1', {
    errorMap: () => ({ message: '数据模型版本必须为 v1' }),
  }),

  templateId: z.string({ required_error: '模板 ID 为必填项' }).min(1, '模板 ID 不能为空'),

  personalInfo: ResumePersonalInfoSchema,

  workExperiences: z.array(ResumeWorkExperienceSchema).default([]),

  educations: z.array(ResumeEducationSchema).default([]),

  projects: z.array(ResumeProjectSchema).default([]),

  skills: z.array(ResumeSkillSchema).default([]),

  updatedAt: z
    .string({ required_error: '更新时间为必填项' })
    .datetime({ message: '更新时间必须是有效的 ISO 8601 格式' }),
});

/**
 * AI 润色请求 Schema
 */
export const PolishRequestSchema = z.object({
  target: z.string({ required_error: '目标字段路径为必填项' }).min(1, '目标字段路径不能为空'),

  text: z
    .string({ required_error: '待优化文本为必填项' })
    .trim()
    .min(1, '待优化文本不能为空')
    .max(5000, '待优化文本最多 5000 个字符'),

  context: z
    .object({
      position: z.string().max(100).optional(),
      industry: z.string().max(100).optional(),
      company: z.string().max(100).optional(),
    })
    .optional(),

  style: z.enum(['professional', 'creative', 'concise']).optional(),

  language: z.string().max(10).optional(),

  privacy: z
    .object({
      allowContactFields: z.boolean().optional(),
    })
    .optional(),
});

/**
 * AI 润色响应 Schema
 */
export const PolishResponseSchema = z.object({
  optimizedText: z.string({ required_error: '优化后文本为必填项' }).min(1, '优化后文本不能为空'),

  highlights: z.array(z.string()).optional(),
});

/**
 * AI 诊断请求 Schema
 */
export const DiagnoseRequestSchema = z.object({
  resume: ResumeDocumentSchema,

  jobDescription: z.string().max(10000).optional(),

  privacy: z
    .object({
      allowContactFields: z.boolean().optional(),
    })
    .optional(),
});

/**
 * 建议优先级 Schema
 */
export const SuggestionPrioritySchema = z.enum(['high', 'medium', 'low'], {
  errorMap: () => ({ message: '优先级必须是 high、medium 或 low' }),
});

/**
 * 简历优化建议 Schema
 */
export const ResumeSuggestionSchema = z.object({
  id: z.string({ required_error: '建议 ID 为必填项' }).min(1, 'ID 不能为空'),

  priority: SuggestionPrioritySchema,

  title: z
    .string({ required_error: '建议标题为必填项' })
    .min(1, '建议标题不能为空')
    .max(200, '建议标题最多 200 个字符'),

  description: z
    .string({ required_error: '建议描述为必填项' })
    .min(1, '建议描述不能为空')
    .max(1000, '建议描述最多 1000 个字符'),

  targetPath: z.string().optional(),
});

/**
 * 评分维度 Schema
 */
export const ScoreDimensionsSchema = z.object({
  completeness: z
    .number({ required_error: '完整度评分为必填项' })
    .min(0, '评分不能小于 0')
    .max(100, '评分不能大于 100'),

  impact: z
    .number({ required_error: '影响力评分为必填项' })
    .min(0, '评分不能小于 0')
    .max(100, '评分不能大于 100'),

  keywordMatch: z
    .number({ required_error: '关键词匹配度评分为必填项' })
    .min(0, '评分不能小于 0')
    .max(100, '评分不能大于 100'),

  readability: z
    .number({ required_error: '可读性评分为必填项' })
    .min(0, '评分不能小于 0')
    .max(100, '评分不能大于 100'),
});

/**
 * AI 诊断响应 Schema
 */
export const DiagnoseResponseSchema = z.object({
  score: z
    .number({ required_error: '综合评分为必填项' })
    .min(0, '评分不能小于 0')
    .max(100, '评分不能大于 100'),

  dimensions: ScoreDimensionsSchema,

  suggestions: z.array(ResumeSuggestionSchema).max(5, '建议最多 5 条'),

  fallback: z.boolean({ required_error: '回退标识为必填项' }),
});

/**
 * 保存状态 Schema
 */
export const SaveStatusSchema = z.enum(['idle', 'saving', 'saved', 'error'], {
  errorMap: () => ({ message: '保存状态必须是 idle、saving、saved 或 error' }),
});

/**
 * AI 处理状态 Schema
 */
export const AIStatusSchema = z.enum(['idle', 'polishing', 'diagnosing', 'error'], {
  errorMap: () => ({ message: 'AI 状态必须是 idle、polishing、diagnosing 或 error' }),
});

/**
 * 编辑模块类型 Schema
 */
export const EditModuleSchema = z.enum(['personal', 'work', 'education', 'project', 'skills'], {
  errorMap: () => ({ message: '编辑模块必须是 personal、work、education、project 或 skills' }),
});

/**
 * 隐私配置选项 Schema
 */
export const PrivacyOptionsSchema = z.object({
  allowContactFieldsToAI: z.boolean({ required_error: '隐私配置为必填项' }),
});

/**
 * 模板布局类型 Schema
 */
export const TemplateLayoutSchema = z.enum(['single-column', 'two-column', 'sidebar'], {
  errorMap: () => ({ message: '布局类型必须是 single-column、two-column 或 sidebar' }),
});

/**
 * 模板样式配置 Schema
 */
export const TemplateStyleConfigSchema = z.object({
  primaryColor: z
    .string({ required_error: '主色调为必填项' })
    .regex(/^#[0-9A-Fa-f]{6}$/, '主色调必须是有效的十六进制颜色值'),

  accentColor: z
    .string({ required_error: '强调色为必填项' })
    .regex(/^#[0-9A-Fa-f]{6}$/, '强调色必须是有效的十六进制颜色值'),

  fontFamily: z
    .string({ required_error: '字体族为必填项' })
    .min(1, '字体族不能为空')
    .max(200, '字体族最多 200 个字符'),

  baseFontSize: z
    .number({ required_error: '基础字体大小为必填项' })
    .min(8, '字体大小不能小于 8px')
    .max(24, '字体大小不能大于 24px'),

  lineHeight: z
    .number({ required_error: '行高倍数为必填项' })
    .min(1, '行高倍数不能小于 1')
    .max(3, '行高倍数不能大于 3'),

  padding: z
    .number({ required_error: '内边距为必填项' })
    .min(0, '内边距不能小于 0')
    .max(100, '内边距不能大于 100px'),

  moduleSpacing: z
    .number({ required_error: '模块间距为必填项' })
    .min(0, '模块间距不能小于 0')
    .max(100, '模块间距不能大于 100px'),

  showAvatar: z.boolean({ required_error: '是否显示头像为必填项' }),

  layout: TemplateLayoutSchema,

  useGlassmorphism: z.boolean({ required_error: '是否使用玻璃态效果为必填项' }),
});

/**
 * 简历模板 Schema
 */
export const ResumeTemplateSchema = z.object({
  id: z.string({ required_error: '模板 ID 为必填项' }).min(1, '模板 ID 不能为空'),

  name: z
    .string({ required_error: '模板名称为必填项' })
    .min(1, '模板名称不能为空')
    .max(100, '模板名称最多 100 个字符'),

  description: z
    .string({ required_error: '模板描述为必填项' })
    .min(1, '模板描述不能为空')
    .max(500, '模板描述最多 500 个字符'),

  previewImage: z.string().url('预览图必须是有效的 URL').optional().or(z.literal('')),

  styleConfig: TemplateStyleConfigSchema,

  isDefault: z.boolean().optional(),

  createdAt: z
    .string({ required_error: '创建时间为必填项' })
    .datetime({ message: '创建时间必须是有效的 ISO 8601 格式' }),

  updatedAt: z
    .string({ required_error: '更新时间为必填项' })
    .datetime({ message: '更新时间必须是有效的 ISO 8601 格式' }),
});

/**
 * 导出所有 Schema 类型推断
 */
export type ResumePersonalInfoInput = z.input<typeof ResumePersonalInfoSchema>;
export type ResumeWorkExperienceInput = z.input<typeof ResumeWorkExperienceSchema>;
export type ResumeEducationInput = z.input<typeof ResumeEducationSchema>;
export type ResumeProjectInput = z.input<typeof ResumeProjectSchema>;
export type ResumeSkillInput = z.input<typeof ResumeSkillSchema>;
export type ResumeDocumentInput = z.input<typeof ResumeDocumentSchema>;
export type PolishRequestInput = z.input<typeof PolishRequestSchema>;
export type DiagnoseRequestInput = z.input<typeof DiagnoseRequestSchema>;
export type TemplateStyleConfigInput = z.input<typeof TemplateStyleConfigSchema>;
export type ResumeTemplateInput = z.input<typeof ResumeTemplateSchema>;
