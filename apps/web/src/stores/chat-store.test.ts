import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from './chat-store';
import { authFetch } from '@/lib/api/client';

// 网络层 mock：sendMessage 的编排（authFetch → !ok → SSE 消费）使用真实
// consumeChatResponse/streamChatResponse 执行，锁定三种返回语义与消息状态
// （评审 C4：此前 store 无测试）。
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

const mockedAuthFetch = vi.mocked(authFetch);

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

/** 重置 store 到可发送状态（无激活对话，避免依赖事件总线） */
function resetState() {
  useChatStore.setState({
    messages: [],
    input: '你好',
    isLoading: false,
    error: null,
    provider: 'xunfei',
    model: undefined,
    activeConversationId: null,
    attachment: null,
  });
}

describe('useChatStore.sendMessage（评审 C4：编排语义）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('成功：返回 sent，assistant 消息含累计内容且 isStreaming 关闭', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"你好"}\n\n',
        'data: {"type":"text-delta","text":"世界"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('sent');
    const { messages, isLoading, error } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: '你好世界',
      isStreaming: false,
    });
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it('HTTP !ok：返回 failed，设置 error 并移除空的 assistant 消息', async () => {
    mockedAuthFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '额度不足' }), { status: 500 })
    );

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('failed');
    const { messages, error, isLoading } = useChatStore.getState();
    expect(error?.message).toBe('额度不足');
    expect(messages).toHaveLength(1); // assistant 被移除，user 保留
    expect(messages[0].role).toBe('user');
    expect(isLoading).toBe(false);
  });

  it('AbortError：返回 aborted，不设置 error，assistant 消息保留（用户中断语义）', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('aborted');
    const { messages, error, isLoading } = useChatStore.getState();
    expect(error).toBeNull();
    expect(messages).toHaveLength(2);
    expect(isLoading).toBe(false);
  });
});
