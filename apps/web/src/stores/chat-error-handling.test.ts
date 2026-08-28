import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from './chat-store';
import { authFetch } from '@/lib/api/client';

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

function resetState() {
  useChatStore.setState({
    messages: [],
    input: '你好',
    isLoading: false,
    error: null,
    provider: 'doubao',
    model: 'doubao-seed-evolving',
    activeConversationId: null,
    attachment: null,
  });
}

describe('useChatStore.sendMessage - 豆包空流处理', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('收到 error 事件时返回 failed 并移除空的 assistant 消息', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"error","error":"模型未返回任何内容，请重试"}\n\n',
      ])
    );

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('failed');
    const { messages, error } = useChatStore.getState();
    // 失败的 AI 消息应该被移除
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(error?.message).toBe('模型未返回任何内容，请重试');
  });

  it('正常文本流时返回 sent 且消息包含文本', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"你好"}\n\n',
        'data: {"type":"text-delta","text":"世界"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('sent');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1].content).toBe('你好世界');
  });
});
