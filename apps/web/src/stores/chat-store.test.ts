import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from './chat-store';
import { authFetch } from '@/lib/api/client';
import { checkAndWarnLowBalance } from '@/lib/billing/balance-warning';

// 网络层 mock：sendMessage 的编排（authFetch → !ok → SSE 消费）使用真实
// consumeChatResponse/streamChatResponse 执行，锁定三种返回语义与消息状态
// （评审 C4：此前 store 无测试）。
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));

vi.mock('@/lib/billing/balance-warning', () => ({
  checkAndWarnLowBalance: vi.fn(),
}));

const mockedAuthFetch = vi.mocked(authFetch);
const mockedCheckAndWarnLowBalance = vi.mocked(checkAndWarnLowBalance);

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
    mockedCheckAndWarnLowBalance.mockReset();
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
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledTimes(1);
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledWith(null);
  });

  it('成功携带 usage：assistant 消息中包含 usage 字段', async () => {
    const expectedUsage = {
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      estimated: false,
    };
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"回复"}\n\n',
        `data: {"type":"done","usage":${JSON.stringify(expectedUsage)}}\n\n`,
      ])
    );
    useChatStore.setState({ activeConversationId: 'conv-test-123' });

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('sent');
    const { messages } = useChatStore.getState();
    expect(messages[1].usage).toEqual(expectedUsage);
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledWith('conv-test-123');
  });

  it('HTTP !ok：返回 failed，设置 error 并移除空的 assistant 消息，不触发预警', async () => {
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
    expect(mockedCheckAndWarnLowBalance).not.toHaveBeenCalled();
  });

  it('AbortError：返回 aborted，不设置 error，空内容的 assistant 消息被移除（空删有留），不触发预警', async () => {
    const abortError = new Error('canceled');
    abortError.name = 'AbortError';
    mockedAuthFetch.mockRejectedValue(abortError);

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('aborted');
    const { messages, error, isLoading } = useChatStore.getState();
    expect(error).toBeNull();
    // 空内容中止：assistant 消息删除，仅保留用户消息
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe('user');
    expect(isLoading).toBe(false);
    expect(mockedCheckAndWarnLowBalance).not.toHaveBeenCalled();
  });
});

describe('useChatStore.reload（重新生成守卫与行为）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
  });

  it('对非最后一轮的 user 消息调用 reload(msgId) → 状态不变、不发请求、console.warn 一次', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const initialMessages = [
      { id: 'user-1', role: 'user' as const, content: '第 1 轮提问' },
      { id: 'assistant-1', role: 'assistant' as const, content: '第 1 轮回答' },
      { id: 'user-2', role: 'user' as const, content: '第 2 轮提问' },
      { id: 'assistant-2', role: 'assistant' as const, content: '第 2 轮回答' },
    ];
    useChatStore.setState({
      activeConversationId: 'conv-multi-round',
      messages: initialMessages,
    });

    await useChatStore.getState().reload('user-1');

    expect(mockedAuthFetch).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[chat] 仅支持重新生成最后一轮回答，已忽略对历史轮次的请求'
    );
    const { messages, isLoading, error } = useChatStore.getState();
    expect(messages).toEqual(initialMessages);
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
    warnSpy.mockRestore();
  });

  it('对最后一轮 user 消息 reload(msgId) → 正常截掉旧回答重新请求', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"新第 2 轮回答"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    useChatStore.setState({
      activeConversationId: 'conv-multi-round',
      messages: [
        { id: 'user-1', role: 'user', content: '第 1 轮提问' },
        { id: 'assistant-1', role: 'assistant', content: '第 1 轮回答' },
        { id: 'user-2', role: 'user', content: '第 2 轮提问' },
        { id: 'assistant-2', role: 'assistant', content: '第 2 轮旧回答' },
      ],
    });

    await useChatStore.getState().reload('user-2');

    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    const { messages, isLoading, error } = useChatStore.getState();
    expect(messages).toHaveLength(4);
    expect(messages[0]).toMatchObject({ id: 'user-1', content: '第 1 轮提问' });
    expect(messages[1]).toMatchObject({ id: 'assistant-1', content: '第 1 轮回答' });
    expect(messages[2].role).toBe('user');
    expect(messages[2].content).toBe('第 2 轮提问');
    expect(messages[3]).toMatchObject({
      role: 'assistant',
      content: '新第 2 轮回答',
      isStreaming: false,
    });
    expect(isLoading).toBe(false);
    expect(error).toBeNull();
  });

  it('无参 reload() → 正常重新生成最后一轮并触发预警检查', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"重新生成成功"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    useChatStore.setState({
      activeConversationId: 'conv-reload',
      messages: [
        { id: 'user-1', role: 'user', content: '原始问题' },
        { id: 'assistant-1', role: 'assistant', content: '旧回答' },
      ],
    });

    await useChatStore.getState().reload();

    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledWith('conv-reload');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: '重新生成成功',
      isStreaming: false,
    });
  });

  it('无效调用：不存在的 msgId 或非 user 消息不触发请求且状态保持不变', async () => {
    const initialMessages = [
      { id: 'user-1', role: 'user' as const, content: '问题' },
      { id: 'assistant-1', role: 'assistant' as const, content: '回答' },
    ];
    useChatStore.setState({ messages: initialMessages });

    await useChatStore.getState().reload('non-existent');
    await useChatStore.getState().reload('assistant-1');

    expect(mockedAuthFetch).not.toHaveBeenCalled();
    expect(useChatStore.getState().messages).toEqual(initialMessages);
  });
});
