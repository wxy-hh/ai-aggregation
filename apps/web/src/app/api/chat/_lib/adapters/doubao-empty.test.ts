import { describe, it, expect, vi } from 'vitest';
import { ReadableStream } from 'stream/web';
import { TextEncoder } from 'util';
import { DoubaoAdapter } from './doubao';

// 模拟豆包 API 返回空的 SSE 流（只有 response.done，没有文本）
function createEmptyDoubaoStream() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.created","response":{"id":"resp_123"}}\n\n'));
      setTimeout(() => {
        controller.enqueue(encoder.encode('data: {"type":"response.done","response":{"id":"resp_123","usage":{"input_tokens":10,"output_tokens":0}}}\n\n'));
        controller.close();
      }, 50);
    }
  });
  return stream;
}

// 模拟有文本的豆包流
function createTextDoubaoStream() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"type":"response.created","response":{"id":"resp_123"}}\n\n'));
      controller.enqueue(encoder.encode('data: {"type":"response.output_text.delta","delta":"你好"}\n\n'));
      setTimeout(() => {
        controller.enqueue(encoder.encode('data: {"type":"response.done","response":{"id":"resp_123","usage":{"input_tokens":10,"output_tokens":2}}}\n\n'));
        controller.close();
      }, 50);
    }
  });
  return stream;
}

// 模拟 onFinish 回调（adapter 只报告流结束物料，结算由 handler 侧 QuotaSession 处理）
function createMockOnFinish() {
  const calls: Array<{ outcome: string; usage: unknown; outputText: string; reason?: string }> = [];
  return {
    calls,
    async onFinish(finish: { outcome: string; usage: unknown; outputText: string; reason?: string }) {
      calls.push(finish);
    },
  };
}

describe('DoubaoAdapter - 空流处理', () => {
  it('收到 response.done 但无文本时应该发送 error 事件而不是 done', async () => {
    const finisher = createMockOnFinish();
    const adapter = new DoubaoAdapter('test-key', 'http://localhost:3999');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createEmptyDoubaoStream(),
    } as any);

    const ctx = {
      userId: 'test',
      provider: 'doubao' as const,
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user' as const, content: '测试', createdAt: new Date(), sessionId: 's1' }],
      outputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      onFinish: finisher.onFinish,
    };

    const stream = await adapter.stream(ctx);
    const output = await new Response(stream).text();

    // 空流：只发送 error 事件，不发送 done 事件；完成态标记为 failed（无产出不扣费）
    expect(output).toContain('error');
    expect(output).not.toContain('"type":"done"');
    expect(finisher.calls[0].outcome).toBe('failed');
    expect(finisher.calls[0].reason).toBe('模型未返回任何内容');
  });

  it('收到 response.done 且有文本时应该发送 done 事件并报告 success', async () => {
    const finisher = createMockOnFinish();
    const adapter = new DoubaoAdapter('test-key', 'http://localhost:3999');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createTextDoubaoStream(),
    } as any);

    const ctx = {
      userId: 'test',
      provider: 'doubao' as const,
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user' as const, content: '测试', createdAt: new Date(), sessionId: 's1' }],
      outputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      onFinish: finisher.onFinish,
    };

    const stream = await adapter.stream(ctx);
    const output = await new Response(stream).text();

    // 有文本：发送 text-delta + done 事件；完成态标记为 success 并携带累计文本
    expect(output).toContain('"type":"text-delta"');
    expect(output).toContain('"type":"done"');
    expect(finisher.calls[0].outcome).toBe('success');
    expect(finisher.calls[0].outputText).toBe('你好');
  });
});