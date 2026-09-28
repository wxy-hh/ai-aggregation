/**
 * SSE 共享工具 — 供 chat 适配器和 handler 使用
 *
 * 职责：
 * - 将原始文本流（ReadableStream<Uint8Array>）转换为 SSE 事件流
 * - 提供 SSE 编码、响应头、响应构造
 * - 注入 SSE 注释心跳帧，防止中间层空闲断流
 *
 * 事件协议：仅产出 @repo/shared 定义的 ChatStreamEvent（text-delta / done /
 * warning / error），类型化签名拒绝任何未在契约内的事件。
 */

import { encodeChatStreamEvent, type ChatStreamEvent, type ChatStreamUsage } from '@repo/shared';

const encoder = new TextEncoder();
const HEARTBEAT_BYTES = encoder.encode(': ping\n\n');

export const SSE_HEADERS: Record<string, string> = {
  'Content-Type': 'text/event-stream; charset=utf-8',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
};

export function encodeSseEvent(event: ChatStreamEvent): Uint8Array {
  return encoder.encode(encodeChatStreamEvent(event));
}

/**
 * 为 SSE 输出流注入心跳注释帧（: ping\n\n），防止网络中间层因空闲静默而断开连接。
 *
 * @param source     - 待注入心跳的原始 SSE 字节流
 * @param intervalMs - 心跳触发间隔（毫秒），默认 15,000ms（15 秒）
 */
export function withSseHeartbeat(
  source: ReadableStream<Uint8Array>,
  intervalMs = 15_000
): ReadableStream<Uint8Array> {
  const reader = source.getReader();
  let timer: ReturnType<typeof setInterval> | null = null;
  let isClosed = false;

  const stopTimer = () => {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };

  return new ReadableStream<Uint8Array>({
    start(controller) {
      timer = setInterval(() => {
        if (isClosed) return;
        try {
          controller.enqueue(HEARTBEAT_BYTES);
        } catch {
          // 下游控制器可能已关闭或异常，清理定时器并避免抛错
          stopTimer();
        }
      }, intervalMs);

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done || isClosed) {
              break;
            }
            try {
              controller.enqueue(value);
            } catch {
              // 消费者已取消或下游已关闭，停止转发
              break;
            }
          }
          if (!isClosed) {
            isClosed = true;
            stopTimer();
            try {
              controller.close();
            } catch {
              // 下游控制器已关闭时忽略
            }
          }
        } catch (error) {
          if (!isClosed) {
            isClosed = true;
            stopTimer();
            try {
              controller.error(error);
            } catch {
              // 下游控制器已处理异常时忽略
            }
          }
        } finally {
          isClosed = true;
          stopTimer();
          try {
            reader.releaseLock();
          } catch {
            // 忽略释放锁异常
          }
        }
      })();
    },
    async cancel(reason) {
      isClosed = true;
      stopTimer();
      try {
        await reader.cancel(reason);
      } catch {
        // 忽略底层流取消异常
      } finally {
        try {
          reader.releaseLock();
        } catch {
          // 忽略释放锁异常
        }
      }
    },
  });
}

export function createSseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(withSseHeartbeat(stream), { headers: SSE_HEADERS });
}

/**
 * 将原始 UTF-8 文本流包装为 SSE text-delta 事件流。
 *
 * @param source  - 提供方返回的原始 ReadableStream
 * @param onText  - 每收到一个 chunk 时的回调（用于累计 token 统计等）
 * @param onDone  - 流正常结束后的回调（用于触发配额结算并可选返回 usage）
 * @param onError - 流异常时的回调（用于释放预留额度）
 */
export function textStreamToSse(
  source: ReadableStream<Uint8Array>,
  opts: {
    onText?: (text: string) => void;
    onDone?: () => Promise<ChatStreamUsage | void> | ChatStreamUsage | void;
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
            const usage = await opts.onDone?.();
            controller.enqueue(encodeSseEvent(usage ? { type: 'done', usage } : { type: 'done' }));
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
        try { reader.releaseLock(); } catch { /* 忽略错误 */ }
      }
    },
  });
}
