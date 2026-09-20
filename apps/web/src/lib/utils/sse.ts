/**
 * 共享 SSE 编码工具
 *
 * 说明：
 * - 统一 `data: <json>\n\n` 线协议格式
 * - 提供标准 SSE 响应头，避免各 route handler 重复定义
 * - 每条流式链路都有契约版编码器（chat / destiny），不做泛型透传，
 *   未在契约内的事件在编译期被拒绝
 */

import {
  encodeChatStreamEvent,
  encodeDestinyStreamEvent,
  type ChatStreamEvent,
  type BaziStreamEvent,
  type ZiweiStreamEvent,
} from '@repo/shared';

const encoder = new TextEncoder();

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * 聊天契约专用编码器：输入必须是 ChatStreamEvent（@repo/shared 定义），
 * 输出帧与 consumeChatResponse 的解析产物同源，杜绝双端字符串漂移。
 */
export function encodeChatSseEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(encodeChatStreamEvent(event));
}

/**
 * destiny 报告流契约专用编码器：输入必须是 BaziStreamEvent/ZiweiStreamEvent
 * （@repo/shared destiny-stream-contract 定义），未在契约内的事件编译期拒绝。
 */
export function encodeDestinySseEvent(
  event: BaziStreamEvent | ZiweiStreamEvent
): Uint8Array {
  return encoder.encode(encodeDestinyStreamEvent(event));
}

/**
 * 将 SSE 事件 payload 编码为标准 SSE 帧字节
 * （星座寰宇等尚未纳入共享契约的链路使用）
 */
export function encodeSseEvent(payload: Record<string, unknown>): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 用标准 SSE 响应头包裹 ReadableStream
 */
export function createSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
