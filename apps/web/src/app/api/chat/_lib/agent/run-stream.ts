/**
 * 运行事件流的泵与订阅 — ADR-0061 / 工单 01
 *
 * 执行流不再等于 HTTP 响应：
 * - pumpRunStream 与响应无关地读取编排器输出，逐帧追加到运行事件日志；
 * - createRunSubscriptionStream 把事件日志包装成 SSE 响应流，首帧为 run_attached；
 * - 订阅者取消只影响本次响应，不中止运行。
 */

import { encodeSseEvent } from '../sse';
import type { LiveRunHandle, RunRegistry } from './run-registry';

type TerminalStatus = 'completed' | 'failed';

/** 从单个完整 SSE 帧中识别终态 */
function terminalTypeOfFrame(frame: Uint8Array | string): TerminalStatus | null {
  const text = typeof frame === 'string' ? frame : new TextDecoder().decode(frame);
  for (const block of text.split('\n\n')) {
    const dataLines = block
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'));
    if (dataLines.length === 0) continue;
    const payload = dataLines.map((line) => line.slice(5).trimStart()).join('\n');
    if (!payload) continue;
    try {
      const event = JSON.parse(payload) as { type?: unknown };
      if (event.type === 'done') return 'completed';
      if (event.type === 'error') return 'failed';
    } catch {
      // 非 JSON 帧（如心跳注释）忽略
    }
  }
  return null;
}

/** 从跨 chunk 的文本缓冲中提取终态，并返回未消费的尾部 */
function consumeTerminal(buffer: string): { rest: string; terminal: TerminalStatus | null } {
  let rest = buffer;
  let terminal: TerminalStatus | null = null;
  let index = rest.indexOf('\n\n');
  while (index >= 0) {
    const block = rest.slice(0, index);
    rest = rest.slice(index + 2);
    const detected = terminalTypeOfFrame(block);
    if (detected) terminal = detected;
    index = rest.indexOf('\n\n');
  }
  return { rest, terminal };
}

/**
 * 把编排器输出泵入运行事件日志。
 *
 * 该函数返回后泵仍在后台执行；调用方不得依赖响应生命周期。
 */
export function pumpRunStream(source: ReadableStream<Uint8Array>, run: LiveRunHandle): void {
  const reader = source.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let terminal: TerminalStatus | null = null;

  void (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        run.append(value);
        buffer += decoder.decode(value, { stream: true });
        const consumed = consumeTerminal(buffer);
        buffer = consumed.rest;
        if (consumed.terminal) terminal = consumed.terminal;
      }
    } catch {
      // 源流异常时补一条终态错误帧，保证订阅者能收尾
      run.append(encodeSseEvent({ type: 'error', error: '智能体运行中断，请稍后重试' }));
      terminal = 'failed';
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // 忽略释放锁异常
      }
      run.finalize(terminal ?? (run.controller.signal.aborted ? 'aborted' : 'failed'));
    }
  })();
}

export interface RunSubscriptionStreamOptions {
  registry: RunRegistry;
  runId: string;
  userId: string;
  /** true = 重连挂载；false = 初始请求 */
  resumed: boolean;
  /** 运行不存在时的错误文案 */
  unavailableError?: string;
}

/**
 * 把运行事件日志包装为 SSE 流：
 * 首帧 run_attached（不写入日志），随后重放历史帧并转为实时推送。
 * 历史帧之后若已是终态则直接关闭。
 */
export function createRunSubscriptionStream(
  options: RunSubscriptionStreamOptions
): ReadableStream<Uint8Array> {
  const { registry, runId, userId, resumed } = options;
  let unsubscribe: (() => void) | null = null;
  let closed = false;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const close = () => {
        if (closed) return;
        closed = true;
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // 下游可能已关闭
        }
      };

      const enqueue = (frame: Uint8Array): boolean => {
        if (closed) return false;
        try {
          controller.enqueue(frame);
          return true;
        } catch {
          close();
          return false;
        }
      };

      const subscription = registry.subscribe(runId, userId, (frame) => {
        if (!enqueue(frame)) return;
        if (terminalTypeOfFrame(frame)) close();
      });

      if (!subscription) {
        enqueue(encodeSseEvent({ type: 'run_attached', runId, resumed }));
        enqueue(
          encodeSseEvent({
            type: 'error',
            error: options.unavailableError ?? '任务已不可用，可重新执行',
          })
        );
        close();
        return;
      }

      unsubscribe = subscription.unsubscribe;
      enqueue(encodeSseEvent({ type: 'run_attached', runId, resumed }));

      for (const frame of subscription.frames) {
        if (!enqueue(frame)) return;
        if (terminalTypeOfFrame(frame)) {
          close();
          return;
        }
      }

      if (subscription.status !== 'running') {
        close();
      }
    },
    cancel() {
      closed = true;
      unsubscribe?.();
      unsubscribe = null;
    },
  });
}
