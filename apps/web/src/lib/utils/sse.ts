/**
 * 共享 SSE 编码工具
 *
 * 说明：
 * - 统一 `data: <json>\n\n` 线协议格式
 * - 提供标准 SSE 响应头，避免各 route handler 重复定义
 */

const encoder = new TextEncoder();

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

/**
 * 将 SSE 事件 payload 编码为标准 SSE 帧字节
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
