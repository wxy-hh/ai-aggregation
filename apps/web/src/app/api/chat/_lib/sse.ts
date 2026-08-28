/**
 * SSE 共享工具 — 供 chat 适配器和 handler 使用
 *
 * 职责：
 * - 将原始文本流（ReadableStream<Uint8Array>）转换为 SSE 事件流
 * - 提供 SSE 编码、响应头、响应构造
 *
 * 事件协议：仅产出 @repo/shared 定义的 ChatStreamEvent（text-delta / done /
 * warning / error），类型化签名拒绝任何未在契约内的事件。
 */

import { encodeChatStreamEvent, type ChatStreamEvent } from '@repo/shared';

const encoder = new TextEncoder();

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export function encodeSseEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(encodeChatStreamEvent(event));
}

export function createSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, { headers: SSE_HEADERS });
}

/**
 * 将原始 UTF-8 文本流包装为 SSE text-delta 事件流。
 *
 * @param source  - 提供方返回的原始 ReadableStream
 * @param onText  - 每收到一个 chunk 时的回调（用于累计 token 统计等）
 * @param onDone  - 流正常结束后的回调（用于触发配额结算）
 * @param onError - 流异常时的回调（用于释放预留额度）
 */
export function textStreamToSse(
  source: ReadableStream<Uint8Array>,
  opts: {
    onText?: (text: string) => void;
    onDone?: () => Promise<void> | void;
    onError?: (error: unknown) => Promise<void> | void;
  } = {}
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  const decoder = new TextDecoder();

  return new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            const rest = decoder.decode();
            if (rest) {
              opts.onText?.(rest);
              controller.enqueue(encodeSseEvent({ type: 'text-delta', text: rest }));
            }
            await opts.onDone?.();
            controller.enqueue(encodeSseEvent({ type: 'done' }));
            break;
          }
          const chunk = decoder.decode(value, { stream: true });
          if (chunk) {
            opts.onText?.(chunk);
            controller.enqueue(encodeSseEvent({ type: 'text-delta', text: chunk }));
          }
        }
        controller.close();
      } catch (error) {
        await opts.onError?.(error);
        try {
          const message = error instanceof Error ? error.message : String(error);
          controller.enqueue(encodeSseEvent({ type: 'error', error: message }));
          controller.enqueue(encodeSseEvent({ type: 'done' }));
          controller.close();
        } catch {
          // 流已关闭时忽略
        }
      } finally {
        try { reader.releaseLock(); } catch { /* ignore */ }
      }
    },
  });
}
