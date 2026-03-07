/**
 * 简历编辑器数据模型类型定义
 *
 * 本文件定义了简历编辑器的完整数据结构，包括：
 * - 个人信息 (ResumePersonalInfo)
 * - 工作经历 (ResumeWorkExperience)
 * - 教育背景 (ResumeEducation)
 * - 项目经历 (ResumeProject)
 * - 技能 (ResumeSkill)
 * - 完整简历文档 (ResumeDocument)
 *
 * 所有字段长度限制参考 design.md 第 5 节
 */

/**
 * 个人信息
 */
export interface ResumePersonalInfo {
  /** 姓名，最大长度 100 字符 */
  name: string;

  /** 求职意向，最大长度 100 字符 */
  title: string;

  /** 邮箱地址，最大长度 200 字符，可选 */
  email?: string;

  /** 电话号码，最大长度 30 字符，可选 */
  phone?: string;

  /** 现居地，最大长度 100 字符，可选 */
  location?: string;

  /** 学历，最大长度 50 字符，可选 */
  education?: string;

  /** 专业，最大长度 100 字符，可选 */
  major?: string;

  /** 政治面貌，最大长度 50 字符，可选 */
  politicalStatus?: string;

  /** 目前状态，最大长度 50 字符，可选（在岗/离职） */
  currentStatus?: string;

  /** 专业技能，最大长度 2000 字符，可选 */
  summary?: string;
}

/**
 * 工作经历
 */
export interface ResumeWorkExperience {
  /** 唯一标识符 */
  id: string;

  /** 公司名称，最大长度 120 字符 */
  company: string;

  /** 职位名称，最大长度 100 字符 */
  position: string;

  /** 工作时间段，最大长度 60 字符，如 "2020.01 - 2023.06" */
  period: string;

  /** 工作描述/职责，最大长度 2000 字符 */
  description: string;
}

/**
 * 教育背景
 */
export interface ResumeEducation {
  /** 唯一标识符 */
  id: string;

  /** 学校名称，最大长度 120 字符 */
  school: string;

  /** 学位，最大长度 80 字符，如 "本科"、"硕士" */
  degree: string;

  /** 专业，最大长度 120 字符 */
  major: string;

  /** 就读时间段，最大长度 60 字符，如 "2016.09 - 2020.06" */
  period: string;
}

/**
 * 项目经历
 */
export interface ResumeProject {
  /** 唯一标识符 */
  id: string;

  /** 项目名称，最大长度 120 字符 */
  name: string;

  /** 项目介绍，最大长度 500 字符，可选 */
  description?: string;

  /** 项目职责，最大长度 1000 字符，可选 */
  responsibilities?: string;

  /** 技术栈，最大长度 500 字符，可选 */
  techStack?: string;

  /** 项目亮点，最大长度 1000 字符，可选 */
  highlights?: string;

  /** 项目时间段，最大长度 60 字符，可选 */
  period?: string;
}

/**
 * 技能等级
 */
export type SkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'expert';

/**
 * 技能
 */
export interface ResumeSkill {
  /** 唯一标识符 */
  id: string;

  /** 技能名称 */
  name: string;

  /** 技能等级，可选 */
  level?: SkillLevel;
}

/**
 * 完整简历文档
 *
 * 这是简历编辑器的核心数据结构，包含所有简历内容
 */
export interface ResumeDocument {
  /** 数据模型版本，用于未来升级和迁移 */
  schemaVersion: 'v1';

  /** 当前使用的模板 ID */
  templateId: string;

  /** 个人信息 */
  personalInfo: ResumePersonalInfo;

  /** 工作经历列表 */
  workExperiences: ResumeWorkExperience[];

  /** 教育背景列表 */
  educations: ResumeEducation[];

  /** 项目经历列表 */
  projects: ResumeProject[];

  /** 技能列表 */
  skills: ResumeSkill[];

  /** 最后更新时间，ISO 8601 格式 */
  updatedAt: string;
}

/**
 * AI 润色请求参数
 */
export interface PolishRequest {
  /** 目标字段路径，如 "work.description" */
  target: string;

  /** 待优化的文本 */
  text: string;

  /** 上下文信息 */
  context?: {
    /** 职位名称 */
    position?: string;
    /** 行业 */
    industry?: string;
  };

  /** 优化风格 */
  style?: 'professional' | 'creative' | 'concise';

  /** 语言 */
  language?: string;

  /** 隐私选项 */
  privacy?: {
    /** 是否允许发送联系方式字段 */
    allowContactFields?: boolean;
  };
}

/**
 * AI 润色响应
 */
export interface PolishResponse {
  /** 优化后的文本 */
  optimizedText: string;

  /** 优化要点 */
  highlights?: string[];
}

/**
 * AI 诊断请求参数
 */
export interface DiagnoseRequest {
  /** 完整简历数据 */
  resume: ResumeDocument;

  /** 可选的职位描述，用于关键词匹配 */
  jobDescription?: string;

  /** 隐私选项 */
  privacy?: {
    /** 是否允许发送联系方式字段 */
    allowContactFields?: boolean;
  };
}

/**
 * 建议优先级
 */
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * 简历优化建议
 */
export interface ResumeSuggestion {
  /** 建议唯一标识 */
  id: string;

  /** 优先级 */
  priority: SuggestionPriority;

  /** 建议标题 */
  title: string;

  /** 建议详细描述 */
  description: string;

  /** 目标字段路径，如 "workExperiences[0].description" */
  targetPath?: string;
}

/**
 * 评分维度
 */
export interface ScoreDimensions {
  /** 完整度 (0-100) */
  completeness: number;

  /** 影响力/量化成果 (0-100) */
  impact: number;

  /** 关键词匹配度 (0-100) */
  keywordMatch: number;

  /** 可读性 (0-100) */
  readability: number;
}

/**
 * AI 诊断响应
 */
export interface DiagnoseResponse {
  /** 综合评分 (0-100) */
  score: number;

  /** 各维度评分 */
  dimensions: ScoreDimensions;

  /** 优化建议列表 */
  suggestions: ResumeSuggestion[];

  /** 是否使用了回退方案（规则引擎） */
  fallback: boolean;
}

/**
 * 保存状态
 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * AI 处理状态
 */
export type AIStatus = 'idle' | 'polishing' | 'diagnosing' | 'error';

/**
 * 编辑模块类型
 */
export type EditModule = 'personal' | 'work' | 'education' | 'project' | 'skills';

/**
 * 隐私配置选项
 */
export interface PrivacyOptions {
  /** 是否允许将联系方式字段发送给 AI */
  allowContactFieldsToAI: boolean;
}

/**
 * 模板样式配置
 *
 * 定义简历模板的视觉样式和布局配置
 */
export interface TemplateStyleConfig {
  /** 主色调，十六进制颜色值 */
  primaryColor: string;

  /** 强调色，十六进制颜色值 */
  accentColor: string;

  /** 字体族 */
  fontFamily: string;

  /** 基础字体大小，单位 px */
  baseFontSize: number;

  /** 行高倍数 */
  lineHeight: number;

  /** 内边距，单位 px */
  padding: number;

  /** 模块间距，单位 px */
  moduleSpacing: number;

  /** 是否显示头像 */
  showAvatar: boolean;

  /** 布局类型 */
  layout: 'single-column' | 'two-column' | 'sidebar';

  /** 是否使用玻璃态效果 */
  useGlassmorphism: boolean;
}

/**
 * 简历模板
 *
 * 定义简历模板的完整信息，包括元数据和样式配置
 */
export interface ResumeTemplate {
  /** 模板唯一标识符 */
  id: string;

  /** 模板名称 */
  name: string;

  /** 模板描述 */
  description: string;

  /** 预览图 URL，可选 */
  previewImage?: string;

  /** 样式配置 */
  styleConfig: TemplateStyleConfig;

  /** 是否为默认模板 */
  isDefault?: boolean;

  /** 创建时间，ISO 8601 格式 */
  createdAt: string;

  /** 更新时间，ISO 8601 格式 */
  updatedAt: string;
}
