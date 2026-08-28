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

// 模拟 billing manager（记录调用）
function createMockBilling() {
  const calls: any[] = [];
  return {
    outputLimit: 2048,
    calls,
    async release(reason: string) { calls.push({ action: 'release', reason }); },
    async settle(usage: any, tokens: number, status: string) { calls.push({ action: 'settle', usage, tokens, status }); },
    async recordUsage(usage: any, status: string) { calls.push({ action: 'recordUsage', usage, status }); },
  };
}

describe('DoubaoAdapter - 空流处理', () => {
  it('收到 response.done 但无文本时应该发送 error 事件而不是 done', async () => {
    const billing = createMockBilling();
    const adapter = new DoubaoAdapter(billing as any, 'test-key', 'http://localhost:3999');
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createEmptyDoubaoStream(),
    } as any);

    const ctx = {
      userId: 'test',
      provider: 'doubao' as const,
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '测试' }],
      outputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
    };

    const result = await adapter.stream(ctx);
    const output = await new Response(result.stream).text();
    
    console.log('空流 SSE 输出:', JSON.stringify(output));
    console.log('空流结算调用:', JSON.stringify(billing.calls));
    
    // 修复后：应该只发送 error 事件，不发送 done 事件
    expect(output).toContain('error');
    expect(output).not.toContain('"type":"done"');
    expect(billing.calls[0].action).toBe('release');
    expect(billing.calls[0].reason).toBe('模型未返回任何内容');
  });

  it('收到 response.done 且有文本时应该发送 done 事件并正常结算', async () => {
    const billing = createMockBilling();
    const adapter = new DoubaoAdapter(billing as any, 'test-key', 'http://localhost:3999');
    
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createTextDoubaoStream(),
    } as any);

    const ctx = {
      userId: 'test',
      provider: 'doubao' as const,
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '测试' }],
      outputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
    };

    const result = await adapter.stream(ctx);
    const output = await new Response(result.stream).text();
    
    console.log('文本流 SSE 输出:', JSON.stringify(output));
    console.log('文本流结算调用:', JSON.stringify(billing.calls));
    
    // 有文本：应该发送 done 事件并正常结算
    expect(output).toContain('"type":"text-delta"');
    expect(output).toContain('"type":"done"');
    expect(billing.calls[0].action).toBe('recordUsage');
    expect(billing.calls[0].status).toBe('success');
  });
});
