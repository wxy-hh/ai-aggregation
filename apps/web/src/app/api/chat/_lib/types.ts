/**
 * 聊天提供方适配器 — 统一接口
 *
 * 每个 AI 提供方（讯飞、豆包、通用）实现此接口，
 * chat/route.ts 只负责鉴权、限流、配额，其余委派给适配器。
 */

import type { ProviderName } from '@repo/providers';
import type { Attachment, Message as ChatMessage } from '@/stores/chat-store';
import type { BillingMeasurement } from '@repo/shared';

/** 适配器流式输出的逐块回调签名 */
export type OnChunk = (text: string) => void;

/** 适配器必须返回的结果 */
export interface StreamResult {
  /** SSE 事件流 */
  stream: ReadableStream<Uint8Array>;
  /**
   * 流正常结束后调用，返回供配额结算使用的原始 usage 数据。
   * 适配器内部在流结束时解析 usage，此处仅暴露最终值。
   */
  getUsage: () => BillingMeasurement | null;
}

export interface ChatContext {
  userId: string;
  provider: ProviderName;
  model: string;
  messages: ChatMessage[];
  outputLimit: number;
  signal: AbortSignal;
  errorId: string;
}

export interface ChatProviderAdapter {
  /** 创建并返回 SSE 流；由调用方包装为 HTTP 响应 */
  stream(ctx: ChatContext): Promise<StreamResult>;
}
