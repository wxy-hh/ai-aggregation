import { describe, it, expect, vi } from 'vitest';
import { ReadableStream } from 'stream/web';
import { TextEncoder } from 'util';
import { DoubaoAdapter } from './doubao';

// 构造豆包 SSE 上游流：按给定帧字符串顺序入队后关闭
function createDoubaoStream(frames: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${frame}\n\n`));
      }
      controller.close();
    },
  });
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

function createCtx(finisher: ReturnType<typeof createMockOnFinish>, messages: unknown[] = [
  { id: 'm1', role: 'user', content: '测试', createdAt: new Date(), sessionId: 's1' },
]) {
  return {
    userId: 'test',
    provider: 'doubao' as const,
    model: 'doubao-seed-evolving',
    messages: messages as any,
    outputLimit: 2048,
    signal: new AbortController().signal,
    errorId: 'test',
    onFinish: finisher.onFinish,
  };
}

// 解析输出 SSE 帧为事件对象数组（保持顺序）
function parseOutputFrames(output: string): Array<Record<string, unknown>> {
  return output
    .split('\n\n')
    .map((block) => block.split('\n').find((l) => l.startsWith('data: ')))
    .filter((l): l is string => !!l)
    .map((l) => JSON.parse(l.slice(6)));
}

describe('DoubaoAdapter - 推理流打捞与 D1 计费语义', () => {
  it('推理帧 + 正文帧 + response.completed：按序输出 reasoning-delta → text-delta → done（带 usage），outcome=success', async () => {
    const finisher = createMockOnFinish();
    const adapter = new DoubaoAdapter('test-key', 'http://localhost:3999');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createDoubaoStream([
        '{"type":"response.created","response":{"id":"resp_123"}}',
        '{"type":"response.reasoning_summary_text.delta","delta":"先分析"}',
        '{"type":"response.reasoning_summary_text.delta","delta":"再推理"}',
        '{"type":"response.output_text.delta","delta":"你好"}',
        '{"type":"response.output_text.delta","delta":"世界"}',
        '{"type":"response.completed","response":{"id":"resp_123","usage":{"input_tokens":10,"output_tokens":5}}}',
      ]),
    } as any);

    const stream = await adapter.stream(createCtx(finisher));
    const output = await new Response(stream).text();
    const events = parseOutputFrames(output);

    // 帧顺序：reasoning-delta* → text-delta* → done
    expect(events.map((e) => e.type)).toEqual([
      'reasoning-delta',
      'reasoning-delta',
      'text-delta',
      'text-delta',
      'done',
    ]);
    expect(events[0].text).toBe('先分析');
    expect(events[1].text).toBe('再推理');
    // done 帧携带真实 usage
    const doneEvent = events[4] as { usage?: { estimated?: boolean } };
    expect(doneEvent.usage).toMatchObject({ inputTokens: 10, outputTokens: 5, estimated: false });
    // 结算：success，outputText 只含正文（推理不进审计文本）
    expect(finisher.calls[0].outcome).toBe('success');
    expect(finisher.calls[0].outputText).toBe('你好世界');
  });

  it('推理-only 截断（无结束事件直接 EOF）：补 warning + done，outcome=partial', async () => {
    const finisher = createMockOnFinish();
    const adapter = new DoubaoAdapter('test-key', 'http://localhost:3999');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createDoubaoStream([
        '{"type":"response.created","response":{"id":"resp_123"}}',
        '{"type":"response.reasoning_summary_text.delta","delta":"思考到一半"}',
      ]),
    } as any);

    const stream = await adapter.stream(createCtx(finisher));
    const output = await new Response(stream).text();
    const events = parseOutputFrames(output);

    // D1：推理-only 截断算 partial——warning + done，而非 error
    expect(events.map((e) => e.type)).toEqual(['reasoning-delta', 'warning', 'done']);
    expect(output).toContain('回答在此处被截断，内容可能不完整');
    expect(finisher.calls[0].outcome).toBe('partial');
    expect(finisher.calls[0].reason).toBe('上游流截断');
    // outputText 仍只传正文（此处为空）
    expect(finisher.calls[0].outputText).toBe('');
  });

  it('空完成（只有 response.completed 无任何增量）：error 帧 + outcome failed', async () => {
    const finisher = createMockOnFinish();
    const adapter = new DoubaoAdapter('test-key', 'http://localhost:3999');

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      body: createDoubaoStream([
        '{"type":"response.completed","response":{"id":"resp_123","usage":{"input_tokens":10,"output_tokens":0}}}',
      ]),
    } as any);

    const stream = await adapter.stream(createCtx(finisher));
    const output = await new Response(stream).text();

    expect(output).toContain('模型未返回任何内容');
    expect(output).not.toContain('"type":"done"');
    expect(finisher.calls[0].outcome).toBe('failed');
    expect(finisher.calls[0].reason).toBe('模型未返回任何内容');
  });

  it('回传锁定：历史消息中的 reasoningContent 不出现在发给上游的请求体中', async () => {
    const finisher = createMockOnFinish();
    const adapter = new DoubaoAdapter('test-key', 'http://localhost:3999');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      body: createDoubaoStream([
        '{"type":"response.output_text.delta","delta":"好的"}',
        '{"type":"response.completed","response":{"id":"resp_123","usage":{"input_tokens":10,"output_tokens":2}}}',
      ]),
    } as any);
    global.fetch = fetchMock;

    const messages = [
      { id: 'm1', role: 'user', content: '第一个问题', createdAt: new Date(), sessionId: 's1' },
      // 历史 assistant 消息携带持久化的推理内容
      { id: 'm2', role: 'assistant', content: '第一轮回答', reasoningContent: '绝密推理过程不应回传', createdAt: new Date(), sessionId: 's1' },
      { id: 'm3', role: 'user', content: '第二个问题', createdAt: new Date(), sessionId: 's1' },
    ];

    const stream = await adapter.stream(createCtx(finisher, messages));
    await new Response(stream).text();

    const requestBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    const serialized = JSON.stringify(requestBody);
    expect(serialized).not.toContain('绝密推理过程不应回传');
    expect(serialized).not.toContain('reasoningContent');
    // 正文 content 正常回传
    expect(serialized).toContain('第一轮回答');
  });
});
