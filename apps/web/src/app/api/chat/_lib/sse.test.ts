import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSseResponse, withSseHeartbeat } from './sse';

describe('withSseHeartbeat', () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('静默源流推进 15s 后下游收到 : ping 字节，推进 30s 收到两次', async () => {
    // 构造永不出数据的静默源流（需要手动控制）
    let sourceController!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
      },
    });

    const stream = withSseHeartbeat(source, 15_000);
    const reader = stream.getReader();

    // 推进 15s，应当收到第 1 个心跳帧
    await vi.advanceTimersByTimeAsync(15_000);
    const chunk1 = await reader.read();
    expect(chunk1.done).toBe(false);
    expect(decoder.decode(chunk1.value)).toBe(': ping\n\n');

    // 再推进 15s（累计 30s），应当收到第 2 个心跳帧
    await vi.advanceTimersByTimeAsync(15_000);
    const chunk2 = await reader.read();
    expect(chunk2.done).toBe(false);
    expect(decoder.decode(chunk2.value)).toBe(': ping\n\n');

    // 清理流
    sourceController.close();
    await reader.cancel();
  });

  it('源有真实 chunk 时字节原样透传，且与心跳交错时顺序先到先出', async () => {
    let sourceController!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
      },
    });

    const stream = withSseHeartbeat(source, 15_000);
    const reader = stream.getReader();

    // 1. 源发送真实 chunk 1
    sourceController.enqueue(encoder.encode('data-1'));
    const chunk1 = await reader.read();
    expect(chunk1.done).toBe(false);
    expect(decoder.decode(chunk1.value)).toBe('data-1');

    // 2. 静默 15s，触发心跳
    await vi.advanceTimersByTimeAsync(15_000);
    const chunk2 = await reader.read();
    expect(chunk2.done).toBe(false);
    expect(decoder.decode(chunk2.value)).toBe(': ping\n\n');

    // 3. 源发送真实 chunk 2
    sourceController.enqueue(encoder.encode('data-2'));
    const chunk3 = await reader.read();
    expect(chunk3.done).toBe(false);
    expect(decoder.decode(chunk3.value)).toBe('data-2');

    // 4. 源正常关闭
    sourceController.close();
    const chunk4 = await reader.read();
    expect(chunk4.done).toBe(true);
  });

  it('源 close 后定时器被清理，继续推进时间不再产生 ping 且不发生 enqueue 抛错', async () => {
    let sourceController!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
      },
    });

    const stream = withSseHeartbeat(source, 15_000);
    const reader = stream.getReader();

    // 源流正常关闭
    sourceController.close();
    const end = await reader.read();
    expect(end.done).toBe(true);

    // 继续推进 60s，不应抛出任何错误（如向已关闭流入队抛出的 TypeError）
    expect(() => {
      vi.advanceTimersByTime(60_000);
    }).not.toThrow();

    // 再次读取仍处于已结束状态，且队列无多余心跳
    const next = await reader.read();
    expect(next.done).toBe(true);
    expect(next.value).toBeUndefined();
  });

  it('消费者 cancel() 后底层源的 cancel 被调用，且定时器被清理', async () => {
    const cancelSpy = vi.fn();
    const source = new ReadableStream<Uint8Array>({
      start() {},
      cancel(reason) {
        cancelSpy(reason);
      },
    });

    const stream = withSseHeartbeat(source, 15_000);
    const reader = stream.getReader();

    // 消费者主动取消
    await reader.cancel('client_abort');

    // 底层流的 cancel 必须收到透传的原因
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(cancelSpy).toHaveBeenCalledWith('client_abort');

    // 继续推进时间不会触发心跳入队或抛错
    expect(() => {
      vi.advanceTimersByTime(60_000);
    }).not.toThrow();
  });

  it('源流异常时向下游透传错误并清理定时器', async () => {
    let sourceController!: ReadableStreamDefaultController<Uint8Array>;
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        sourceController = controller;
      },
    });

    const stream = withSseHeartbeat(source, 15_000);
    const reader = stream.getReader();

    const mockError = new Error('上游网络异常');
    sourceController.error(mockError);

    await expect(reader.read()).rejects.toThrow('上游网络异常');

    // 定时器已清理，继续推进时间不抛错
    expect(() => {
      vi.advanceTimersByTime(60_000);
    }).not.toThrow();
  });
});

describe('createSseResponse', () => {
  it('正确包装心跳流并附带标准 SSE 响应头', async () => {
    const encoder = new TextEncoder();
    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('测试响应体'));
        controller.close();
      },
    });

    const response = createSseResponse(source);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream; charset=utf-8');
    expect(response.headers.get('Cache-Control')).toBe('no-cache, no-transform');
    expect(response.headers.get('Connection')).toBe('keep-alive');
    expect(response.headers.get('X-Accel-Buffering')).toBe('no');

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader!.read();
    expect(new TextDecoder().decode(chunk.value)).toBe('测试响应体');
    const end = await reader!.read();
    expect(end.done).toBe(true);
  });
});
