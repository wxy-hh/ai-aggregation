import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runChatStreamSession, type ChatStreamSessionDeps, type Message } from './chat-store';
import { authFetch } from '@/lib/api/client';
import { on, StoreEvents } from './store-events';

// 网络层 mock：runChatStreamSession 走真实 streamChatResponse / consumeChatResponse（评审 C6 三态单点可测）
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

const mockedAuthFetch = vi.mocked(authFetch);
const assistantId = 'assistant-1';

/** 构造 SSE 流式 Response */
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

/** 构造中途抛出 AbortError 的 SSE 流式 Response：首帧正常返回增量文本，随后流中断 */
function abortedSseResponse(firstChunk: string): Response {
  const encoder = new TextEncoder();
  const abortError = new Error('canceled');
  abortError.name = 'AbortError';
  let readOnce = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!readOnce) {
        readOnce = true;
        controller.enqueue(encoder.encode(firstChunk));
      } else {
        controller.error(abortError);
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

/** 构造中途抛出普通错误的 SSE 流式 Response：首帧正常返回增量文本，随后流中断抛出普通错误 */
function failingSseResponse(firstChunk: string, error = new Error('upstream broken')): Response {
  const encoder = new TextEncoder();
  let readOnce = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (!readOnce) {
        readOnce = true;
        controller.enqueue(encoder.encode(firstChunk));
      } else {
        controller.error(error);
      }
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

function createDeps(messages: Message[]) {
  const deps: ChatStreamSessionDeps = {
    updateMessages: (updater) => {
      const next = updater(messages);
      messages.splice(0, messages.length, ...next);
      return messages;
    },
    setError: vi.fn(),
    activeConversationId: () => 'conv-1',
  };
  return deps as typeof deps & { setError: ReturnType<typeof vi.fn> };
}

function makeMessages(): Message[] {
  return [
    { id: 'user-1', role: 'user', content: '你好' },
    { id: assistantId, role: 'assistant', content: '', isStreaming: true },
  ];
}

function requestBody() {
  return {
    body: { messages: [{ role: 'user', content: '你好' }], provider: 'xunfei', model: undefined },
    signal: new AbortController().signal,
  };
}

describe('runChatStreamSession（评审 C6：统一会话语义映射）', () => {
  let onUpdated: (payload: unknown) => void;
  let off: () => void;

  beforeEach(() => {
    mockedAuthFetch.mockReset();
    onUpdated = vi.fn((_payload: unknown) => undefined);
    off = on(StoreEvents.CONVERSATION_UPDATED, onUpdated);
  });

  afterEach(() => {
    off();
  });

  it('成功流：返回 sent，assistant 关闭 isStreaming，onDone 收到最终消息并同步会话', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"你好"}\n\n',
        'data: {"type":"text-delta","text":"世界"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    const messages = makeMessages();
    const deps = createDeps(messages);
    const onDone = vi.fn();

    const result = await runChatStreamSession(deps, assistantId, requestBody(), onDone);

    expect(result).toBe('sent');
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant?.content).toBe('你好世界');
    expect(assistant?.isStreaming).toBe(false);
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('HTTP !ok：返回 failed，设置错误并移除空的 assistant 消息', async () => {
    mockedAuthFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '额度不足' }), { status: 500 })
    );
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('failed');
    expect(deps.setError).toHaveBeenCalledWith(expect.objectContaining({ message: '额度不足' }));
    expect(messages.find((m) => m.id === assistantId)).toBeUndefined();
    expect(onUpdated).toHaveBeenCalledWith({
      id: 'conv-1',
      messages: [expect.objectContaining({ id: 'user-1' })],
    });
  });

  it('AbortError 且内容为空：返回 aborted，assistant 空消息被移除，不设错误，同步会话列表', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    expect(messages.find((m) => m.id === assistantId)).toBeUndefined();
    expect(onUpdated).toHaveBeenCalledWith({
      id: 'conv-1',
      messages: [expect.objectContaining({ id: 'user-1' })],
    });
  });

  it('AbortError 且已有部分内容：返回 aborted，消息保留并标记 isStreaming:false + stopped:true，不设错误，同步会话列表', async () => {
    mockedAuthFetch.mockResolvedValue(
      abortedSseResponse('data: {"type":"text-delta","text":"部分回答"}\n\n')
    );
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe('部分回答');
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.stopped).toBe(true);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('AbortError 且已被同步收尾：返回 aborted，幂等不重复 emit', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);
    const messages: Message[] = [
      { id: 'user-1', role: 'user', content: '你好' },
      { id: assistantId, role: 'assistant', content: '已收尾内容', isStreaming: false, stopped: true },
    ];
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it('流中途错误且已有部分内容：返回 failed，消息保留并标记 failed:true + isStreaming:false，设置错误，同步会话列表', async () => {
    mockedAuthFetch.mockResolvedValue(
      failingSseResponse('data: {"type":"text-delta","text":"部分回答"}\n\n')
    );
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('failed');
    expect(deps.setError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'upstream broken' })
    );
    const assistant = messages.find((m) => m.id === assistantId);
    expect(assistant).toBeDefined();
    expect(assistant?.content).toBe('部分回答');
    expect(assistant?.isStreaming).toBe(false);
    expect(assistant?.failed).toBe(true);
    expect(onUpdated).toHaveBeenCalledWith({ id: 'conv-1', messages });
  });

  it('流中节流落盘：chunk 间隔超过 1s 时同步会话列表', async () => {
    vi.useFakeTimers();
    try {
      const encoder = new TextEncoder();
      let step = 0;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (step === 0) {
            step++;
            controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第一段"}\n\n'));
          } else if (step === 1) {
            step++;
            vi.setSystemTime(Date.now() + 2000);
            controller.enqueue(encoder.encode('data: {"type":"text-delta","text":"第二段"}\n\n'));
          } else if (step === 2) {
            step++;
            controller.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
            controller.close();
          }
        },
      });
      mockedAuthFetch.mockResolvedValue(
        new Response(stream, {
          headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
        })
      );
      const messages = makeMessages();
      const deps = createDeps(messages);
      let updateCallsBeforeDone = 0;
      const onDone = vi.fn(() => {
        updateCallsBeforeDone = (onUpdated as any).mock.calls.length;
      });

      const result = await runChatStreamSession(deps, assistantId, requestBody(), onDone);

      expect(result).toBe('sent');
      // 流式进行中（done 之前）已触发过同步
      expect(updateCallsBeforeDone).toBeGreaterThanOrEqual(1);
      // 整个会话过程中 onUpdated 调用次数 ≥ 2（流中节流落盘 + 最终完成）
      expect((onUpdated as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
