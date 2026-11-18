/**
 * 聊天完成生命周期类型定义 (ChatCompletionLifecycle)
 *
 * 规范：ADR-0051 / spec.md 决策 6
 */

import type {
  QuotaSession,
  PersistMemoryTurnInput,
  PersistMemoryTurnResult,
} from '@repo/db';
import type { ChatStreamFinish } from '../types';

/**
 * 聊天完成生命周期执行上下文
 */
export interface ChatCompletionContext {
  /** 用户 ID */
  userId: string;
  /** 请求幂等标识 */
  requestId: string;
  /** 错误追踪标识 */
  errorId: string;
  /** 会话 ID（可选） */
  conversationId?: string | null;
  /** 稳定轮次标识：当前轮 user 消息的本地 ID（ADR-0058） */
  turnId?: string;
  /** 实际生效的 AI 提供方 */
  effectiveProvider: string;
  /** 模型名称 */
  modelName: string;
  /** 消息列表（用于提取 goalText 与计费元数据） */
  messages: Array<{ role?: string; content?: string }>;
  /** 配额会话管理器实例 */
  reservedSession: QuotaSession;
  /** 会话记忆检索开关（由调用方透传；缺省时内部单查用户表兜底） */
  memorySearchEnabled?: boolean;
  /** Agent 模式运行上下文配置（可选） */
  agentContext?: {
    /** 是否开启 Agent 模式 */
    enabled: boolean;
    /** 激活的能力包 */
    activeCapabilityPack?: { key: string };
    /** 被静默覆盖的原始请求提供商 */
    overriddenProvider?: string;
    /** 被静默覆盖的原始请求模型 */
    overriddenModel?: string;
  };
  /** 消息条数（可选，缺省时取 messages.length） */
  messagesCount?: number;
  /** 附件条数（可选，缺省时取 0） */
  attachmentCount?: number;
}

/**
 * 各副作用执行状态成败标记
 */
export interface ChatCompletionSideEffects {
  /** 安全合规命中的敏感主题（未命中为 null 或 undefined） */
  safetyFlag?: string | null;
  /** 配额结算是否成功闭环（底层异常或结算失败为 false） */
  quotaSettled: boolean;
  /** AgentRun 审计记录是否已落库（非 agent 模式或落库失败为 false） */
  agentRunPersisted: boolean;
  /** 记忆输入消息是否已写入（未开启、无正文或写入失败为 false） */
  memoryPersisted: boolean;
  /** 可观测性事件是否已刷新（超时熔断或失败为 false） */
  observabilityFlushed: boolean;
  /** 记忆索引任务是否已成功派发（未开启或派发失败为 false） */
  memoryJobDispatched: boolean;
}

/**
 * 聊天完成生命周期摘要（用于测试断言、审计与线上告警）
 */
export interface ChatCompletionSummary {
  /** 结算是否成功闭环 */
  settled: boolean;
  /** 最终结算单位数（token 数） */
  settledUnits: number;
  /** Agent 运行记录 ID（仅当 agentRun 落库成功时存在） */
  agentRunId?: string;
  /** 各副作用执行结果成败标记 */
  sideEffects: ChatCompletionSideEffects;
}

/**
 * 外部依赖注入接口（便于白盒单测与环境隔离）
 */
export interface ChatCompletionDependencies {
  /** Prisma 客户端，用于 agent_runs 落盘与 memorySearchEnabled 兜底查询 */
  prisma?: any;
  /** 安全敏感词检测函数 */
  detectSensitiveTopic?: (text: string) => string | null;
  /** 可观测性刷新函数 */
  flushObservability?: () => Promise<void>;
  /** 记忆队列客户端 */
  memoryIndexQueue?: {
    add: (name: string, data: any, opts: any) => Promise<any>;
  };
  /** 记忆输入消息持久化实现（默认使用 @repo/db 的事务写入；测试可注入替身） */
  persistMemoryTurnFn?: (
    input: PersistMemoryTurnInput
  ) => Promise<PersistMemoryTurnResult>;
  /** 观测性刷新超时限制（毫秒），默认 500ms */
  flushTimeoutMs?: number;
  /** 结构化日志记录器，默认 console */
  logger?: {
    warn: (message: string, ...args: any[]) => void;
    error?: (message: string, ...args: any[]) => void;
    info?: (message: string, ...args: any[]) => void;
  };
}
