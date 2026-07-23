/**
 * 多模型聚焦比较对话 — 数据契约（纯类型，无运行时逻辑）
 *
 * 放在独立的 types 文件中，避免 store 之间循环依赖：
 * comparison-store、conversations-store、比较 UI 组件、history 均从这里导入类型。
 */

// 比较模式：单聊（现有）| 并行对比（新增）
export type ComparisonMode = 'single' | 'compare';

// AI 提供商：与 packages/providers 的 ProviderName 保持一致
export type ProviderName = 'xunfei' | 'doubao';

// 已选模型（比较模式下一个可对比的模型变体）
export interface SelectedModel {
  provider: ProviderName; // 提供商标识
  model: string; // 模型变体 id，如 'generalv3.5'
  providerLabel: string; // 提供商展示名，如 '讯飞星火'
  label: string; // 完整展示名，如 '讯飞星火 · Spark Max'
}

// 模型运行状态：排队 | 生成中 | 已完成 | 失败 | 已停止
export type ModelRunStatus = 'queued' | 'streaming' | 'completed' | 'failed' | 'stopped';

// 分支消息（某模型独立上下文中的单条消息）
export interface BranchMessage {
  role: 'user' | 'assistant';
  content: string;
}

// 单个模型在某一轮中的运行结果（含独立分支上下文）
export interface ModelRun {
  modelKey: string; // 唯一键：`${provider}:${model}`
  provider: ProviderName;
  model: string;
  label: string;
  status: ModelRunStatus; // 当前状态
  startedAt?: number; // 开始生成的时间戳
  completedAt?: number; // 完成/失败/停止的时间戳
  content: string; // 本轮累计生成的回答正文
  error?: string; // 失败原因（含模型名与可操作下一步）
  truncationWarning?: string; // 回答被截断时的提示
  branchMessages: BranchMessage[]; // 该模型自己的多轮上下文（分支隔离核心）
}

// 双列聚焦槽位（只影响 UI 呈现，不影响请求/缓存/历史）
export interface FocusSlots {
  left: string; // 左列聚焦的 modelKey
  right: string; // 右列聚焦的 modelKey
}

// 比较会话中的一轮（一个共享 Prompt → 多模型并发结果）
export interface ComparisonTurn {
  id: string;
  prompt: string; // 本轮共享用户问题
  createdAt: number;
  runs: Record<string, ModelRun>; // key = modelKey
  focusSlots: FocusSlots;
}

// 模型目录项（可供选择的模型变体）
export interface ModelCatalogItem {
  provider: ProviderName;
  providerLabel: string;
  model: string;
  label: string;
}

// 生成模型唯一键
export function toModelKey(provider: ProviderName, model: string): string {
  return `${provider}:${model}`;
}
