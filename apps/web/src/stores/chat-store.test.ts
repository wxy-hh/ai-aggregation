import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChatStore, type Message } from './chat-store';
import type { Artifact } from '@repo/shared';
import { resetConversationPort, setConversationPort } from './conversation-port';
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
    const reloadBody = JSON.parse(mockedAuthFetch.mock.calls[0][1]?.body as string);
    expect(reloadBody.turnId).toBe('user-2');
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
    // 流式期间的会话落盘快照会带着旁白；刷新还原时剥离，
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
    // 通过假端口观察历史保存，锁定「旁白不写入历史持久化」（工单 04 验收口径）
    const savedItems: Array<{ messages: Array<Record<string, unknown>> }> = [];
    setConversationPort({
      saveMessages: () => {},
      saveToolOverrides: () => {},
      appendHistory: (item) =>
        savedItems.push(item as unknown as { messages: Array<Record<string, unknown>> }),
    });

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
      resetConversationPort();
    }
  });
});

describe('useChatStore.sendMessage（tool_result durationMs 耗时合并，工单 P0a-01）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
  });

  it('tool_result 带 durationMs 时记录获得该字段；不带时记录无该字段', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"tool_call","call":{"id":"c1","name":"web_fetch","argsSummary":"url1"}}\n\n',
        'data: {"type":"tool_result","callId":"c1","name":"web_fetch","status":"success","summary":"抓取1完成","durationMs":240}\n\n',
        'data: {"type":"tool_call","call":{"id":"c2","name":"web_fetch","argsSummary":"url2"}}\n\n',
        'data: {"type":"tool_result","callId":"c2","name":"web_fetch","status":"success","summary":"抓取2完成"}\n\n',
        'data: {"type":"text-delta","text":"完成回答"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    const result = await useChatStore.getState().sendMessage();
    expect(result).toBe('sent');

    const assistant = useChatStore.getState().messages[1];
    expect(assistant.toolCalls).toHaveLength(2);

    const firstCall = assistant.toolCalls?.[0];
    const secondCall = assistant.toolCalls?.[1];

    expect(firstCall?.id).toBe('c1');
    expect(firstCall?.durationMs).toBe(240);

    expect(secondCall?.id).toBe('c2');
    expect(secondCall?.durationMs).toBeUndefined();
    expect('durationMs' in (secondCall ?? {})).toBe(false);
  });
});

describe('useChatStore 会话级工具临时启停覆盖 (toolOverrides · ADR-0014 / 工单 02)', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
  });

  it('setToolOverride 正确更新临时启停字典', () => {
    expect(useChatStore.getState().toolOverrides).toEqual({});

    useChatStore.getState().setToolOverride('image_generate', false);
    expect(useChatStore.getState().toolOverrides).toEqual({ image_generate: false });

    useChatStore.getState().setToolOverride('image_generate', true);
    expect(useChatStore.getState().toolOverrides).toEqual({ image_generate: true });
  });

  it('setToolOverride 变更一次：工具覆盖经会话端口落盘恰好一次', () => {
    // 通过假端口观察落盘调用，断言单次开关只产生一次持久化请求
    const savedOverrides: Array<{ id: string; overrides?: Record<string, boolean> }> = [];
    setConversationPort({
      saveMessages: () => {},
      saveToolOverrides: (id, overrides) => savedOverrides.push({ id, overrides }),
      appendHistory: () => {},
    });

    try {
      useChatStore.setState({ activeConversationId: 'conv-tools', toolOverrides: {} });
      useChatStore.getState().setToolOverride('web_search', false);

      expect(savedOverrides).toHaveLength(1);
      expect(savedOverrides[0]).toEqual({
        id: 'conv-tools',
        overrides: { web_search: false },
      });
    } finally {
      resetConversationPort();
    }
  });

  it('loadConversation 正确恢复消息列表、产物池、能力包及工具覆盖字典', () => {
    const mockMessages: Message[] = [
      { id: 'u1', role: 'user', content: '分析这份代码' },
      { id: 'a1', role: 'assistant', content: '这是分析结果' },
    ];
    const mockArtifacts: Artifact[] = [
      { id: 'art-1', type: 'code', title: '分析脚本', content: 'console.log(1)', status: 'complete' },
    ];

    useChatStore.getState().loadConversation(
      'conv-override-1',
      mockMessages,
      'doubao',
      'doubao-seed-evolving',
      'deep-research',
      { web_fetch: false, weather: true },
      mockArtifacts
    );

    const state = useChatStore.getState();
    expect(state.activeConversationId).toBe('conv-override-1');
    expect(state.messages).toEqual(mockMessages);
    expect(state.artifacts).toEqual(mockArtifacts);
    expect(state.activeArtifactId).toBe('art-1');
    expect(state.activeCapabilityPackKey).toBe('deep-research');
    expect(state.toolOverrides).toEqual({ web_fetch: false, weather: true });

    useChatStore.getState().reset();
    expect(useChatStore.getState().activeConversationId).toBeNull();
    expect(useChatStore.getState().messages).toEqual([]);
    expect(useChatStore.getState().artifacts).toEqual([]);
    expect(useChatStore.getState().activeCapabilityPackKey).toBeNull();
    expect(useChatStore.getState().toolOverrides).toEqual({});
  });

  it('sendMessage 请求体携带当前用户消息的 turnId', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"收到"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );
    useChatStore.setState({ activeConversationId: 'conv-turn-send', input: '记住暗号' });

    await useChatStore.getState().sendMessage();

    const sentUserMessage = useChatStore.getState().messages[0];
    const body = JSON.parse(mockedAuthFetch.mock.calls[0][1]?.body as string);
    expect(body.turnId).toBe(sentUserMessage.id);
  });

  it('agent 模式下 sendMessage 计算并携带 disabledToolKeys（差异减项传参）', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"已排除画图工具回答"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    // 启用 agent 模式并设置画图被临时禁用
    useChatStore.setState({
      input: '写一份报告',
      toolOverrides: { image_generate: false, web_search: true },
    });

    // 引入 settingsStore 并开启 agentMode
    const { useSettingsStore } = await import('@/stores/settings-store');
    useSettingsStore.setState({ agentModeEnabled: true });

    const result = await useChatStore.getState().sendMessage();
    expect(result).toBe('sent');
    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);

    const callArgs = mockedAuthFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);

    expect(body.agent).toBe(true);
    // 仅携带启停为 false 的工具项（差异减项传输）
    expect(body.disabledToolKeys).toEqual(['image_generate']);
  });

  it('所有工具全开（无 false 覆盖）时，sendMessage 请求体不带 disabledToolKeys', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"text-delta","text":"全开回答"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    useChatStore.setState({
      input: '写一份报告',
      toolOverrides: { image_generate: true, web_search: true },
    });

    const { useSettingsStore } = await import('@/stores/settings-store');
    useSettingsStore.setState({ agentModeEnabled: true });

    const result = await useChatStore.getState().sendMessage();
    expect(result).toBe('sent');

    const callArgs = mockedAuthFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1]?.body as string);

    expect(body.agent).toBe(true);
    expect(body.disabledToolKeys).toBeUndefined();
  });
  describe('产物上下文请求字段（ADR-0037 §4 / TC13）', () => {
    const doneSse = () =>
      sseResponse(['data: {"type":"text-delta","text":"好"}\n\n', 'data: {"type":"done"}\n\n']);
    const artifact = (id: string, content: string) => ({
      id,
      type: 'markdown' as const,
      title: `标题-${id}`,
      content,
      status: 'complete' as const,
    });
    const sendAndGetBody = async () => {
      const { useSettingsStore } = await import('@/stores/settings-store');
      useSettingsStore.setState({ agentModeEnabled: true });
      expect(await useChatStore.getState().sendMessage()).toBe('sent');
      return JSON.parse(mockedAuthFetch.mock.calls[0][1]?.body as string);
    };

    it('agent 模式 + 工作台展开 + 有聚焦产物 → 请求体携带聚焦产物全文与目录', async () => {
      mockedAuthFetch.mockResolvedValue(doneSse());
      useChatStore.setState({
        input: '把第二章改短',
        artifacts: [artifact('a', '# A\n\n## 一\n甲'), artifact('b', '# B\n\n## 二\n乙')],
        activeArtifactId: 'b',
        isWorkspaceOpen: true,
      });
      const body = await sendAndGetBody();
      expect(body.artifactContext.workspaceOpen).toBe(true);
      expect(body.artifactContext.focus).toMatchObject({ id: 'b', content: '# B\n\n## 二\n乙' });
      expect(body.artifactContext.directory.map((d: { id: string }) => d.id)).toEqual(['a', 'b']);
    });

    it('工作台关闭 → 只携带目录，不携带任何产物正文', async () => {
      mockedAuthFetch.mockResolvedValue(doneSse());
      useChatStore.setState({
        input: '继续',
        artifacts: [artifact('a', '# A\n\n## 一\n绝密正文')],
        activeArtifactId: 'a',
        isWorkspaceOpen: false,
      });
      const body = await sendAndGetBody();
      expect(body.artifactContext.workspaceOpen).toBe(false);
      expect(body.artifactContext.focus).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain('绝密正文');
    });

    it('没有产物时请求体不带 artifactContext（与改造前一致）', async () => {
      mockedAuthFetch.mockResolvedValue(doneSse());
      useChatStore.setState({ input: '你好', artifacts: [] });
      const body = await sendAndGetBody();
      expect('artifactContext' in body).toBe(false);
    });

    it('未开启 agent 模式 → 即使有产物也不携带 artifactContext', async () => {
      mockedAuthFetch.mockResolvedValue(doneSse());
      const { useSettingsStore } = await import('@/stores/settings-store');
      useSettingsStore.setState({ agentModeEnabled: false });
      useChatStore.setState({
        input: '你好',
        artifacts: [artifact('a', '# A\n\n## 一\n甲')],
        activeArtifactId: 'a',
        isWorkspaceOpen: true,
      });
      expect(await useChatStore.getState().sendMessage()).toBe('sent');
      const body = JSON.parse(mockedAuthFetch.mock.calls[0][1]?.body as string);
      expect('artifactContext' in body).toBe(false);
    });
  });
});

describe('run_attached 持久化（ADR-0061 / 工单 01）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('收到 run_attached 后把 runId 写入助手消息并随快照落盘', async () => {
    const saved: Message[][] = [];
    setConversationPort({
      saveMessages: (_id, messages) => saved.push(messages),
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    useChatStore.setState({ activeConversationId: 'conv-run-attached' });
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"run_attached","runId":"run-xyz","resumed":false}\n\n',
        'data: {"type":"text-delta","text":"回答"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    try {
      expect(await useChatStore.getState().sendMessage()).toBe('sent');
      const assistant = useChatStore.getState().messages[1];
      expect(assistant.runId).toBe('run-xyz');
      expect(saved.at(-1)?.[1]?.runId).toBe('run-xyz');
    } finally {
      resetConversationPort();
    }
  });
});

describe('断点挂载与消息重建（ADR-0061 / 工单 03）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('加载含 runId 的流式消息时自动挂载并清空重建', async () => {
    mockedAuthFetch.mockResolvedValue(
      sseResponse([
        'data: {"type":"run_attached","runId":"run-r","resumed":true}\n\n',
        'data: {"type":"text-delta","text":"完整回答"}\n\n',
        'data: {"type":"done"}\n\n',
      ])
    );

    useChatStore.getState().loadConversation(
      'conv-attach',
      [
        { id: 'u1', role: 'user', content: '问题' },
        { id: 'a1', role: 'assistant', content: '半截内容', isStreaming: true, runId: 'run-r' },
      ],
      'xunfei',
      'lite'
    );

    await vi.waitFor(() => {
      expect(mockedAuthFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/chat/agent/resume?runId=run-r'),
        expect.anything()
      );
    });

    await vi.waitFor(() => {
      const assistant = useChatStore.getState().messages.find((m) => m.id === 'a1');
      expect(assistant?.content).toBe('完整回答');
      expect(assistant?.isStreaming).toBe(false);
      expect(assistant?.runPending).toBe(false);
      expect(assistant?.runUnavailable).toBe(false);
    });
  });

  it('挂载返回 410 时保留半截内容并标记任务不可用', async () => {
    mockedAuthFetch.mockResolvedValue(
      new Response(JSON.stringify({ error: '任务已不可用，可重新执行', code: 'RUN_UNAVAILABLE' }), {
        status: 410,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    useChatStore.getState().loadConversation(
      'conv-gone',
      [
        { id: 'u1', role: 'user', content: '问题' },
        { id: 'a1', role: 'assistant', content: '半截内容', isStreaming: true, runId: 'run-gone' },
      ],
      'xunfei',
      'lite'
    );

    await vi.waitFor(() => {
      const assistant = useChatStore.getState().messages.find((m) => m.id === 'a1');
      expect(assistant?.runUnavailable).toBe(true);
      expect(assistant?.runPending).toBe(false);
      expect(assistant?.content).toBe('半截内容');
    });
  });
});

describe('停止真实生效（ADR-0061 / 工单 05）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('请求服务端中止，5s 未收到终态时本地提示已请求停止', async () => {
    setConversationPort({
      saveMessages: () => {},
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    useChatStore.setState({
      activeConversationId: 'conv-stop',
      isLoading: true,
      messages: [
        { id: 'u1', role: 'user', content: '问题' },
        { id: 'a1', role: 'assistant', content: '半截内容', isStreaming: true, runId: 'run-stop' },
      ],
    });
    mockedAuthFetch.mockResolvedValue(
      new Response(JSON.stringify({ success: true, status: 'aborting' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      useChatStore.getState().stop();
      expect(mockedAuthFetch).toHaveBeenCalledWith(
        '/api/chat/agent/abort',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ runId: 'run-stop' }),
        })
      );

      await vi.advanceTimersByTimeAsync(5000);
      const assistant = useChatStore.getState().messages.find((m) => m.id === 'a1');
      expect(assistant?.stopped).toBe(true);
      expect(assistant?.stopUnconfirmed).toBe(true);
      expect(assistant?.isStreaming).toBe(false);
      expect(assistant?.content).toBe('半截内容');
    } finally {
      resetConversationPort();
    }
  });
});

describe('并发保护（ADR-0061 / 工单 06）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('409 时移除本轮占位、恢复草稿并挂载现有任务', async () => {
    setConversationPort({
      saveMessages: () => {},
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    mockedAuthFetch
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: '当前任务仍在执行，请先停止或等待完成',
            code: 'RUN_IN_PROGRESS',
            runId: 'run-active',
          }),
          { status: 409, headers: { 'Content-Type': 'application/json' } }
        )
      )
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"run_attached","runId":"run-active","resumed":true}\n\n',
          'data: {"type":"text-delta","text":"已有任务继续"}\n\n',
          'data: {"type":"done"}\n\n',
        ])
      );

    useChatStore.setState({ input: '新问题', activeConversationId: 'conv-409' });

    try {
      const result = await useChatStore.getState().sendMessage();
      expect(result).toBe('failed');
      expect(useChatStore.getState().input).toBe('新问题');

      await vi.waitFor(() => {
        const messages = useChatStore.getState().messages;
        expect(
          messages.some(
            (message) => message.runId === 'run-active' && message.content === '已有任务继续'
          )
        ).toBe(true);
      });
      expect(mockedAuthFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/chat/agent/resume?runId=run-active'),
        expect.anything()
      );
    } finally {
      resetConversationPort();
    }
  });
});

describe('传输中断自动转入挂载重连（ADR-0061 / 工单 04 回归）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
  });

  it('流被截断时保留待挂载并重连取回完整结果，不标记失败', async () => {
    setConversationPort({
      saveMessages: () => {},
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    mockedAuthFetch
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"run_attached","runId":"run-drop","resumed":false}\n\n',
          'data: {"type":"text-delta","text":"半截内容"}\n\n',
        ])
      )
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"run_attached","runId":"run-drop","resumed":true}\n\n',
          'data: {"type":"text-delta","text":"完整回答"}\n\n',
          'data: {"type":"done"}\n\n',
        ])
      );

    useChatStore.setState({ input: '问题', activeConversationId: 'conv-drop' });

    try {
      await useChatStore.getState().sendMessage();
      await vi.waitFor(() => {
        const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
        expect(assistant?.content).toBe('完整回答');
        expect(assistant?.runPending).toBe(false);
        expect(assistant?.failed).not.toBe(true);
      });
      expect(mockedAuthFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('/api/chat/agent/resume?runId=run-drop'),
        expect.anything()
      );
    } finally {
      resetConversationPort();
    }
  });
});

describe('重连状态（ADR-0061 / 工单 04）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    resetState();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('重连期间 isStreaming 保持 true 并记录尝试次数', async () => {
    setConversationPort({
      saveMessages: () => {},
      saveToolOverrides: () => {},
      appendHistory: () => {},
    });
    mockedAuthFetch
      .mockRejectedValueOnce(new TypeError('network down'))
      .mockResolvedValueOnce(
        sseResponse([
          'data: {"type":"run_attached","runId":"run-reconnect","resumed":true}\n\n',
          'data: {"type":"text-delta","text":"完整回答"}\n\n',
          'data: {"type":"done"}\n\n',
        ])
      );
    useChatStore.setState({
      activeConversationId: 'conv-reconnect',
      messages: [
        {
          id: 'a1',
          role: 'assistant',
          content: '半截',
          isStreaming: false,
          runPending: true,
          runId: 'run-reconnect',
        },
      ],
    });

    try {
      const attach = useChatStore.getState().attachAgentRun('run-reconnect', 'a1');
      await vi.advanceTimersByTimeAsync(0);
      const mid = useChatStore.getState().messages.find((m) => m.id === 'a1');
      expect(mid?.isStreaming).toBe(true);
      expect(mid?.reconnectingAttempt).toBe(1);

      await vi.advanceTimersByTimeAsync(1000);
      await attach;
      const done = useChatStore.getState().messages.find((m) => m.id === 'a1');
      expect(done?.content).toBe('完整回答');
      expect(done?.runPending).toBe(false);
    } finally {
      resetConversationPort();
    }
  });
});
