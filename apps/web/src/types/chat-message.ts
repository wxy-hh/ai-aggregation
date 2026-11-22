/**
 * 运行时聊天消息类型（单一事实源）
 *
 * 该类型同时是「本地快照」的字段契约：会话在本地持久化时保留全部字段。
 * 历史归档使用更窄的 ArchivedMessage，转换见 lib/conversation/message-snapshots。
 */

import type {
  AgentNote,
  AgentPlan,
  ChatStreamUsage,
  CitationAnchor,
  ToolCallRecord,
} from '@repo/shared';
import type { MessageApproval } from '@/lib/agent/approval-display';

// AI 提供商类型：讯飞星火、豆包或 DeepSeek
export type ProviderName = 'xunfei' | 'doubao' | 'deepseek';

// 附件上传状态：上传中 | 就绪 | 错误
export type AttachmentStatus = 'uploading' | 'ready' | 'error';

// 附件类型定义
export interface Attachment {
  id: string; // 附件唯一标识
  type: 'image' | 'file'; // 附件类型：图片或文件
  name: string; // 文件名
  size?: number; // 文件大小（字节）
  // 图片附件：存储 base64 编码的数据 URL
  imageUrl?: string;
  // 文件附件：存储上传后服务器返回的文件 ID
  fileId?: string;
  // 当前上传状态
  status: AttachmentStatus;
  // 错误信息（仅在 status 为 'error' 时有值）
  error?: string;
  // 来源标识（接力图片用：追踪接力来源，清空引用时清理）
  sourceId?: string;
}

// 运行时消息类型（本地快照的完整形态）
export interface Message {
  id: string; // 消息唯一标识
  role: 'user' | 'assistant' | 'system'; // 消息角色：用户 | AI助手 | 系统
  content: string; // 消息文本内容
  isStreaming?: boolean; // 是否正在流式传输（AI回复时为 true）
  stopped?: boolean; // 是否被用户/隐式中止（保留部分内容时标记）
  failed?: boolean; // 生成失败但保留了部分内容（流中途错误）
  truncationWarning?: string; // 回答可能被截断时的提示
  usage?: ChatStreamUsage; // 本次对话的 Token 消耗统计（done 帧携带）
  reasoningContent?: string; // 模型真实推理内容（仅 supportsReasoning 模型可能产生，永不回传上游）
  reasoningDurationMs?: number; // 思考时长：首个推理增量到达 → 分界点（首 text-delta / done / error / abort）冻结
  // 附件列表（可选）
  // 用户消息 = 用户上传的附件；AI 消息 = agent 工具产出的附件（如生成的图片）
  attachments?: Attachment[];
  // agent 模式下的工具调用记录（过程可见 + 刷新回看）。
  // 未开启 agent 或本轮无工具调用时为 undefined —— 渲染与现状完全一致。
  toolCalls?: ToolCallRecord[];
  // agent 模式的过程旁白（二期多步循环）：中间轮决策文本。
  // beforeCallIndex = 旁白到达时 toolCalls 的长度（即插入到第几个工具调用之前）。
  // 进过程卡片、不进正文、不入历史持久化（历史拍平时被丢弃）。类型单源在 @repo/shared。
  agentNotes?: AgentNote[];
  // 本条消息关联生成的产物标识引用列表（ADR-0015）
  artifactIds?: string[];
  // 结构化切片引用映射字典（ADR-0025 / KB-CHAT-CITE）
  citations?: Record<number, CitationAnchor>;
  // 智能体执行计划与阶段检查点 (AGENT-PLAN-DAG / ADR-0038)
  plan?: AgentPlan;
  // 写操作审批请求卡片 (AGENT-HITL-ACTION / ADR-0041)：一等字段随消息落盘，不进正文
  approval?: MessageApproval;
  // 本次回答所属的 Agent 运行标识 (ADR-0061)：随本地快照落盘，供断线重连时挂载
  runId?: string;
  // 运行是否仍待挂载：刷新恢复时保留；挂载结束或确认不可用后置为 false
  runPending?: boolean;
  // 运行已不可用（进程重启或日志过期）：半截内容保留，界面提示可重新执行
  runUnavailable?: boolean;
  // 当前重连尝试次数（运行态字段，不参与历史归档）
  reconnectingAttempt?: number;
  // 自动重连已放弃：保留待挂载标记，等待网络恢复或用户手动重新连接
  runReconnectFailed?: boolean;
  // 已发出停止请求但未在 5s 内收到服务端终态：界面诚实提示「已请求停止」
  stopUnconfirmed?: boolean;
}

/**
 * 历史归档消息：归档快照的字段契约。
 *
 * 只保留正文、工具调用记录、计划、审批与工具产出附件；
 * 用户上传附件原文（base64）、过程旁白、推理内容、用量、引用与产物关联
 * 刻意不入历史，避免撑爆本地存储，也避免历史唤起补造运行时才有的关联。
 */
export interface ArchivedMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCallRecord[];
  plan?: AgentPlan;
  approval?: MessageApproval;
  attachments?: Attachment[];
}
