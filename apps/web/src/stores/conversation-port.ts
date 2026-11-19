'use client';

/**
 * 会话端口 —— 聊天 store 向外部同步会话快照、工具覆盖与历史记录的唯一边界。
 *
 * 聊天 store 只依赖本接口，不直接引用会话、历史、对比等 store（依赖倒置）。
 * 应用入口在启动时通过 conversationOrchestrator 注册默认实现；
 * 测试直接注入假实现，断言「保存了什么」而不是监听事件。
 */

import type { Artifact } from '@repo/shared';
import type { Message } from '@/types/chat-message';
import type { ChatHistoryItem } from '@/types/history';

export interface ConversationPort {
  /** 同步会话消息快照；artifacts 缺省表示不改动产物池 */
  saveMessages(id: string, messages: Message[], artifacts?: Artifact[]): void;
  /** 同步会话级工具覆盖字典 */
  saveToolOverrides(id: string, toolOverrides?: Record<string, boolean>): void;
  /** 追加一条聊天历史记录 */
  appendHistory(item: ChatHistoryItem): void;
}

/** 未注册时的安全空实现：测试或独立模块使用聊天 store 时不产生副作用 */
const noopPort: ConversationPort = {
  saveMessages: () => {},
  saveToolOverrides: () => {},
  appendHistory: () => {},
};

let currentPort: ConversationPort | null = null;

/** 注入当前端口实现（应用入口注册默认实现，测试注册假实现） */
export function setConversationPort(port: ConversationPort): void {
  currentPort = port;
}

/** 读取当前端口；未注入时返回安全空实现 */
export function getConversationPort(): ConversationPort {
  return currentPort ?? noopPort;
}

/** 复位为未注入状态（测试隔离用） */
export function resetConversationPort(): void {
  currentPort = null;
}
