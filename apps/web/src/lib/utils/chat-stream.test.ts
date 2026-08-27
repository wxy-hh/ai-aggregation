import { describe, it, expect, vi } from 'vitest';
import { consumeChatResponse } from './chat-stream';

/** 构造 SSE 字符串流对应的 Response */
function sseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

describe('consumeChatResponse', () => {
  it('正常流（text-delta + done）时逐块回调内容', async () => {
    const res = sseResponse([
      'data: {"type":"text-delta","text":"你好"}\n\n',
      'data: {"type":"text-delta","text":"世界"}\n\n',
      'data: {"type":"done"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).resolves.toBeUndefined();
    expect(onChunk).toHaveBeenCalledTimes(2);
    expect(onChunk.mock.calls.map((c) => c[0])).toEqual(['你好', '世界']);
  });

  it('回归：流被截断（无 done / 无 error）时必须抛错，不能静默产出空回答', async () => {
    // 模拟部署超时截断 / 上游空流：只有 delta，永远没有完成事件
    const res = sseResponse([
      'data: {"type":"text-delta","text":"被截断的"}\n\n',
      'data: {"type":"text-delta","text":"内容"}\n\n',
    ]);
    const onChunk = vi.fn();

    await expect(consumeChatResponse(res, onChunk)).rejects.toThrow('回答流被中断');
    expect(onChunk).toHaveBeenCalledTimes(2); // 已到达的文本仍应回调
  });

  it('回归：完全空的流（无任何事件）必须抛错，不能显示为已成功', async () => {
    const res = sseResponse(['data: {"type":"response.created","foo":1}\n\n']);
    await expect(consumeChatResponse(res, vi.fn())).rejects.toThrow('回答流被中断');
  });

  it('error 事件直接抛出错误信息', async () => {
    const res = sseResponse([
      'data: {"type":"error","error":"模型未返回任何内容，请重试"}\n\n',
    ]);
    await expect(consumeChatResponse(res, vi.fn())).rejects.toThrow(
      '模型未返回任何内容，请重试'
    );
  });
});
