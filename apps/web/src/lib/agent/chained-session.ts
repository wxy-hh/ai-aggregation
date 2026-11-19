/**
 * 链式会话状态机深模块（chained-session.ts）
 *
 * 架构接缝（Candidate 03 · ADR-0010）：
 * - 封装火山 Ark Responses API 的 previous_response_id 链式追踪与增量消息推演；
 * - 封装断链回退全量与断链后自愈机制（Auto-fallback & Self-healing）；
 * - 编排器（agent-runner.ts）以极窄接口索取每步发送载荷，彻底消除双轨状态与手动数组同步。
 */

import type { ModelMessage } from 'ai';
import type { WireMessage } from '@repo/shared';

/** 单步发送载荷契约 */
export interface StepPayload {
  /** 本步待发送给模型的消息列表（链式为增量单条，回退时为全量累积历史） */
  messages: ModelMessage[];
  /** 链式调用时的上一轮响应 ID；未建链或断链回退时为 undefined */
  previousResponseId?: string;
  /** 是否处于链式状态 */
  isChained: boolean;
}

/** 会话初始化选项 */
export interface ChainedMessageSessionOptions {
  /** 初始历史消息（支持窄化线上消息 WireMessage 数组或 ModelMessage 数组） */
  initialMessages: WireMessage[] | ModelMessage[];
  /** 是否启用服务端链式传输（仅火山引擎豆包 Ark Responses API 支持；DeepSeek 等标准 OpenAI 接口必须为 false） */
  supportsChaining?: boolean;
}

/** 兼容 AI SDK 响应格式的结构 */
export interface ModelResponseLike {
  id?: string;
  messages?: ModelMessage[];
}

/** 链式会话深模块接口契约 */
export interface ChainedMessageSession {
  /** 索取当前步骤发送载荷（窄接口）：自动根据当前链状态决定是发增量还是发全量 */
  getStepPayload(): StepPayload;

  /**
   * 记录模型响应：
   * 1. 提取 responseId 更新链追踪状态；若无 id 则标记断链（自愈回退机制触发）
   * 2. 暂存决策响应产生的 assistant 消息，供回退池使用
   */
  recordResponse(response: ModelResponseLike): void;

  /**
   * 追加待发增量消息：
   * 内部同时推演增量状态与维护全量回退池
   */
  appendIncrement(
    message: ModelMessage,
    options?: { withDecisionMessages?: boolean }
  ): void;

  /** 追加工具执行结果增量（便捷语义包装） */
  appendToolResult(toolMessage: ModelMessage): void;

  /** 追加引导语增量（便捷语义包装） */
  appendNudge(nudgeMessage: ModelMessage): void;

  /** 获取当前累积的全量历史池（用于审计或状态快照） */
  getCurrentMessages(): ModelMessage[];

  /** 获取当前链追踪 ID */
  getPreviousResponseId(): string | null;
}

/** 把线上消息或 ModelMessage 投影为规范的模型消息 */
function normalizeInitialMessages(
  messages: Array<WireMessage | ModelMessage>
): ModelMessage[] {
  return messages.map((m) => ({
    role: m.role,
    content: m.content,
  })) as ModelMessage[];
}

/** 链式会话状态机默认实现 */
class DefaultChainedMessageSession implements ChainedMessageSession {
  /** 全量累积消息历史池（用于断链回退或非链式提供方） */
  private currentMessages: ModelMessage[];

  /** 是否允许启用服务端链式追踪（仅豆包 Responses API 支持） */
  private supportsChaining: boolean;

  /** 链式状态：上一步响应 id；null = 未建链或已断链 */
  private previousResponseId: string | null = null;

  /** 链式增量：下一步要回发的消息 */
  private pendingIncrement: ModelMessage | null = null;

  /** 本轮决策步产生的 assistant 消息（暂存待回注至历史池） */
  private pendingDecisionMessages: ModelMessage[] = [];

  constructor(options: ChainedMessageSessionOptions) {
    this.currentMessages = normalizeInitialMessages(options.initialMessages);
    this.supportsChaining = options.supportsChaining ?? true;
  }

  getStepPayload(): StepPayload {
    if (this.supportsChaining && this.previousResponseId !== null && this.pendingIncrement !== null) {
      return {
        isChained: true,
        previousResponseId: this.previousResponseId,
        messages: [{ ...this.pendingIncrement }],
      };
    }
    return {
      isChained: false,
      previousResponseId: undefined,
      messages: this.currentMessages.map((m) => ({ ...m })),
    };
  }

  recordResponse(response: ModelResponseLike): void {
    // 缺 id 必须断链回退全量：沿用旧 id 链式发送新工具结果会因 call_id 不在被引链上而被上游拒绝
    this.previousResponseId = response.id ?? null;
    this.pendingDecisionMessages = response.messages ? [...response.messages] : [];
  }

  appendIncrement(
    message: ModelMessage,
    options?: { withDecisionMessages?: boolean }
  ): void {
    this.pendingIncrement = message;
    if (options?.withDecisionMessages) {
      this.currentMessages = [
        ...this.currentMessages,
        ...this.pendingDecisionMessages,
        message,
      ];
      this.pendingDecisionMessages = [];
    } else {
      this.currentMessages = [...this.currentMessages, message];
    }
  }

  appendToolResult(toolMessage: ModelMessage): void {
    this.appendIncrement(toolMessage, { withDecisionMessages: true });
  }

  appendNudge(nudgeMessage: ModelMessage): void {
    this.appendIncrement(nudgeMessage, { withDecisionMessages: false });
  }

  getCurrentMessages(): ModelMessage[] {
    return this.currentMessages.map((m) => ({ ...m }));
  }

  getPreviousResponseId(): string | null {
    return this.previousResponseId;
  }
}

/** 创建链式会话状态机深模块实例 */
export function createChainedMessageSession(
  options: ChainedMessageSessionOptions
): ChainedMessageSession {
  return new DefaultChainedMessageSession(options);
}
