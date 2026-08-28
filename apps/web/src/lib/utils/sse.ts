/**
 * 共享 SSE 编码工具
 *
 * 说明：
 * - 统一 `data: <json>\n\n` 线协议格式
 * - 提供标准 SSE 响应头，避免各 route handler 重复定义
 */

import { encodeChatStreamEvent, type ChatStreamEvent } from '@repo/shared';

const encoder = new TextEncoder();

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * 将 SSE 事件 payload 编码为标准 SSE 帧字节。
 * 通用版本，用于非聊天契约协议（如 destiny 报告的 status/section-final 事件）。
 */
export function encodeSseEvent<T extends object>(payload: T): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

/**
 * 聊天契约专用编码器：输入必须是 ChatStreamEvent（@repo/shared 定义），
 * 输出帧与 consumeChatResponse 的解析产物同源，杜绝双端字符串漂移。
 */
export function encodeChatSseEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(encodeChatStreamEvent(event));
}

/**
 * 用标准 SSE 响应头包裹 ReadableStream
 */
export function createSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: SSE_HEADERS,
  });
}
