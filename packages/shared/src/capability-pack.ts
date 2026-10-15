/**
 * 场景能力包（CapabilityPack）不可变配置中心 — ADR-0014
 *
 * 领域术语见 GLOSSARY.md：CapabilityPack。
 * 平台针对垂直任务场景预置的流水线策略组合，包含专项目标设定、内置工具白名单与步数预算上限。
 */

export type CapabilityPackKey = 'deep-research' | 'visual-report';

export interface CapabilityPack {
  /** 唯一标识键名 */
  readonly key: CapabilityPackKey;
  /** 界面展示中文名称 */
  readonly name: string;
  /** 场景定位与功能描述 */
  readonly description: string;
  /** 图标标识符 */
  readonly icon: string;
  /** 平台内置工具白名单（严格物理隔离，非白名单内置工具绝对拦截） */
  readonly toolWhitelist: readonly string[];
  /** 场景步数上限（深度调研 8 步，其余 5 步） */
  readonly maxSteps: number;
  /** 决策步注入的专项系统提示词 */
  readonly systemPrompt: string;
  /** 空态卡片点击预填的结构化模板 */
  readonly promptTemplate: string;
}

/** 深度调研场景系统提示词 */
const DEEP_RESEARCH_SYSTEM_PROMPT = `你是一个专业的深度调研与研报分析专家。
你的任务是围绕用户提出的主题展开严肃、系统、深入的调研，并最终输出高质量、结构严谨的专业研究报告。

行为准则：
1. 专注使用检索与网页阅读工具（web_search 与 web_fetch）获取最新、权威的一手数据与事实，进行多信源交叉比对与验证。
2. 严禁生成图片或尝试使用任何非调研工具。
3. 调研必须具备深度，主动挖掘行业背景、核心机制、关键数据、多方观点与潜在风险，避免浮于表面。
4. 最终输出应具备研报级结构：包含执行摘要/背景概述、核心发现与论点、深度数据论证、多维度对比分析与总结建议。`;

/** 图文报告场景系统提示词 */
const VISUAL_REPORT_SYSTEM_PROMPT = `你是一个资深的图文内容策划与报告编撰专家。
你的任务是围绕用户的主题输出图文并茂、排版精美、生动详实的综合报告。

行为准则：
1. 兼顾深度信息检索与视觉构思，在梳理报告脉络的同时，主动识别适合可视化的关键节点。
2. 在合适章节自主规划并调用生图工具（image_generate），生成符合报告语境的高质量插图，与正文内容形成图文呼应。
3. 结构清晰，排版考究，使用 Markdown 格式（标题、要点列表、引用、强调等）提升可读性。`;

/** 深度调研模板 */
const DEEP_RESEARCH_PROMPT_TEMPLATE = `请针对 [调研主题/行业赛道] 展开深度调研，通过多方网络检索与网页深度阅读，交叉验证核心事实与数据，并输出包含背景现状、核心论点、数据支撑与未来趋势的结构化调研报告。`;

/** 图文报告模板 */
const VISUAL_REPORT_PROMPT_TEMPLATE = `请针对 [主题/内容] 撰写一份图文并茂的深度报告，合理规划内容结构并在关键章节自主生成高质量插图，以图文混排的形式生动呈现。`;

/** 官方内置场景能力包清单（不可变数组） */
export const CAPABILITY_PACKS: readonly CapabilityPack[] = [
  {
    key: 'deep-research',
    name: '深度调研',
    description: '专注多级网络检索与网页交叉验证，输出结构化专业研报（支持最多 8 步深度探索）',
    icon: 'Search',
    toolWhitelist: ['web_search', 'web_fetch'],
    maxSteps: 8,
    systemPrompt: DEEP_RESEARCH_SYSTEM_PROMPT,
    promptTemplate: DEEP_RESEARCH_PROMPT_TEMPLATE,
  },
  {
    key: 'visual-report',
    name: '图文报告',
    description: '多维信息检索与自主配图生成混排，打造视觉生动的综合图文报告',
    icon: 'FileText',
    toolWhitelist: ['image_generate', 'web_search'],
    maxSteps: 5,
    systemPrompt: VISUAL_REPORT_SYSTEM_PROMPT,
    promptTemplate: VISUAL_REPORT_PROMPT_TEMPLATE,
  },
] as const;

/** 内部快速查找表 */
const PACKS_BY_KEY = new Map<string, CapabilityPack>(
  CAPABILITY_PACKS.map((pack) => [pack.key, pack])
);

/**
 * 根据 key 获取对应的场景能力包定义
 */
export function getCapabilityPack(key: string | undefined | null): CapabilityPack | undefined {
  if (!key) return undefined;
  return PACKS_BY_KEY.get(key);
}

/**
 * 校验字符串是否为合法场景能力包 key
 */
export function isCapabilityPackKey(key: string): key is CapabilityPackKey {
  return PACKS_BY_KEY.has(key);
}
