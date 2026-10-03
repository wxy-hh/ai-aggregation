import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore } from './chat-store';
import { on, StoreEvents } from './store-events';
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

describe('useChatStore.sendMessage（推理流）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
  });

  it('成功携带推理流：assistant 消息持久化 reasoningContent 与 reasoningDurationMs', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"reasoning-delta","text":"推理片段"}\n\n',
        'data: {"type":"text-delta","text":"正文"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    const result = await useChatStore.getState().sendMessage();

    expect(result).toBe('sent');
    const { messages } = useChatStore.getState();
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({
      role: 'assistant',
      content: '正文',
      reasoningContent: '推理片段',
      isStreaming: false,
    });
    expect(messages[1].reasoningDurationMs).toEqual(expect.any(Number));
  });

  it('推理中调用 stop()：仅推理非空也保留消息并标记 stopped，推理内容与时长定格写入', async () => {
    const encoder = new TextEncoder();
    mockedAuthFetch.mockImplementation(async (_url, init) => {
      const signal = (init as RequestInit).signal;
      // 流先吐出一帧推理增量后挂起，直到 signal abort 才以 AbortError 结束
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"type":"reasoning-delta","text":"思考中"}\n\n')
          );
          signal?.addEventListener('abort', () => {
            const abortError = new Error('canceled');
            abortError.name = 'AbortError';
            controller.error(abortError);
          });
        },
      });
      return new Response(stream, {
        headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
      });
    });

    const sendPromise = useChatStore.getState().sendMessage();
    // 等推理增量被消费并经合帧写入消息（rAF 不存在时回退 setTimeout 0）
    await vi.waitFor(() => {
      expect(useChatStore.getState().messages[1]?.reasoningContent).toBe('思考中');
    });

    useChatStore.getState().stop();
    const result = await sendPromise;

    expect(result).toBe('aborted');
    const { messages, error } = useChatStore.getState();
    expect(error).toBeNull();
    // 有留空删扩展：content 为空但 reasoningContent 非空 → 保留并标记 stopped
    const assistant = messages.find((m) => m.role === 'assistant');
    expect(assistant).toBeDefined();
    expect(assistant).toMatchObject({
      content: '',
      reasoningContent: '思考中',
      isStreaming: false,
      stopped: true,
    });
    expect(assistant?.reasoningDurationMs).toEqual(expect.any(Number));
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

describe('useChatStore.loadConversation（toolCalls 恢复清洗，B-9）', () => {
  beforeEach(() => {
    resetState();
  });

  it('残留的 running 中间态归一为 failed，终态记录原样保留', () => {
    useChatStore.getState().loadConversation(
      'conv-1',
      [
        { id: 'u1', role: 'user', content: '画一张猫' },
        {
          id: 'a1',
          role: 'assistant',
          content: '已生成',
          toolCalls: [
            // 刷新前来不及收到 tool_result 的进行中残留
            { id: 'c1', name: 'image_generate', argsSummary: '{}', status: 'running', resultSummary: '' },
            // 已有终态的记录不受影响
            { id: 'c2', name: 'web_fetch', argsSummary: '{}', status: 'success', resultSummary: '已抓取' },
          ],
        },
      ],
      'doubao',
      'doubao-seed-evolving'
    );

    const calls = useChatStore.getState().messages[1].toolCalls;
    expect(calls?.[0]).toMatchObject({ id: 'c1', status: 'failed', resultSummary: '执行未完成' });
    expect(calls?.[1]).toMatchObject({ id: 'c2', status: 'success', resultSummary: '已抓取' });
  });

  it('形状非法的 toolCalls 记录被 schema 过滤（持久化数据可被手工篡改）', () => {
    useChatStore.getState().loadConversation(
      'conv-2',
      [
        {
          id: 'a1',
          role: 'assistant',
          content: '回答',
          // 刻意构造非法形状（缺 name / 空 id / 枚举外 status）：模拟被篡改的持久化数据，
          // 静态类型此时恰是要绕过的对象（as never[] = 明知不匹配）
          toolCalls: [
            { id: 'c1', argsSummary: '{}', status: 'success', resultSummary: 'x' },
            { id: '', name: 'web_fetch', argsSummary: '{}', status: 'success', resultSummary: 'x' },
            { id: 'c3', name: 'web_fetch', argsSummary: '{}', status: 'hacked', resultSummary: 'x' },
            // 唯一合法记录保留
            { id: 'c4', name: 'web_fetch', argsSummary: '{}', status: 'failed', resultSummary: '失败' },
          ] as never[],
        },
      ],
      'doubao',
      'doubao-seed-evolving'
    );

    const calls = useChatStore.getState().messages[0].toolCalls;
    expect(calls).toHaveLength(1);
    expect(calls?.[0]).toMatchObject({ id: 'c4', status: 'failed' });
  });

  it('过程旁白（agentNotes）还原时被剥离，工具记录原样保留（spec D-二期-6：旁白属过程性内容）', () => {
    // 流式期间的 CONVERSATION_UPDATED 落盘快照会带着旁白；刷新还原时剥离，
    // 但工具调用记录沿用一期 B-10 结构继续恢复
    useChatStore.getState().loadConversation(
      'conv-3',
      [
        {
          id: 'a1',
          role: 'assistant',
          content: '对比结果',
          toolCalls: [
            {
              id: 'c1',
              name: 'web_fetch',
              argsSummary: '{}',
              status: 'success',
              resultSummary: '已抓取',
            },
          ],
          agentNotes: [{ beforeCallIndex: 0, text: '先查 A' }],
        },
      ],
      'doubao',
      'doubao-seed-evolving'
    );

    const m = useChatStore.getState().messages[0];
    expect(m.agentNotes).toBeUndefined();
    expect(m.toolCalls).toHaveLength(1);
    expect(m.content).toBe('对比结果');
  });
});

describe('useChatStore.sendMessage（agent 过程旁白，二期）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
  });

  it('agent_note 进 agentNotes 并按到达时工具数锚定；正文只含收尾文本；旁白不入历史', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"agent_note","text":"先查 A"}\n\n',
        'data: {"type":"tool_call","call":{"id":"c1","name":"web_fetch","argsSummary":"https://a.example.com"}}\n\n',
        'data: {"type":"tool_result","callId":"c1","name":"web_fetch","status":"success","summary":"已抓取 A"}\n\n',
        'data: {"type":"agent_note","text":"再查 B"}\n\n',
        'data: {"type":"tool_call","call":{"id":"c2","name":"web_fetch","argsSummary":"https://b.example.com"}}\n\n',
        'data: {"type":"tool_result","callId":"c2","name":"web_fetch","status":"success","summary":"已抓取 B"}\n\n',
        'data: {"type":"text-delta","text":"A 与 B 的对比结果"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    useChatStore.setState({ activeConversationId: 'conv-agent-notes' });
    // 监听历史保存事件，锁定「旁白不写入历史持久化」（工单 04 验收口径）
    const savedItems: Array<{ messages: Array<Record<string, unknown>> }> = [];
    const off = on(
      StoreEvents.CHAT_HISTORY_SAVED,
      (payload: { item: { messages: Array<Record<string, unknown>> } }) =>
        savedItems.push(payload.item)
    );

    try {
      const result = await useChatStore.getState().sendMessage();

      expect(result).toBe('sent');
      const assistant = useChatStore.getState().messages[1];
      // 旁白进 agentNotes：第 1 条锚定在第 0 个工具前，第 2 条锚定在第 1 个工具前
      // （onAgentNote 回调为累计值口径，store 按已消费长度切出每轮增量）
      expect(assistant.agentNotes).toEqual([
        { beforeCallIndex: 0, text: '先查 A' },
        { beforeCallIndex: 1, text: '再查 B' },
      ]);
      // 正文只含收尾步文本，旁白不进正文
      expect(assistant.content).toBe('A 与 B 的对比结果');
      // 工具记录照常落终态（一期 B-10 不回归）
      expect(assistant.toolCalls).toHaveLength(2);
      expect(assistant.toolCalls?.[0]).toMatchObject({ id: 'c1', status: 'success' });
      expect(assistant.toolCalls?.[1]).toMatchObject({ id: 'c2', status: 'success' });

      // 历史拍平：保留工具记录、不携带旁白
      expect(savedItems).toHaveLength(1);
      const savedAssistant = savedItems[0].messages[1];
      expect(savedAssistant.toolCalls).toHaveLength(2);
      expect(savedAssistant).not.toHaveProperty('agentNotes');
      expect(savedAssistant.content).toBe('A 与 B 的对比结果');
    } finally {
      off();
    }
  });
});
