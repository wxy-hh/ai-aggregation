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

  it('AbortError：返回 aborted，不设错误且保留 assistant（用户中断语义）', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);
    const messages = makeMessages();
    const deps = createDeps(messages);

    const result = await runChatStreamSession(deps, assistantId, requestBody());

    expect(result).toBe('aborted');
    expect(deps.setError).not.toHaveBeenCalled();
    expect(messages.find((m) => m.id === assistantId)).toBeDefined();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});