import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChatStore, type Message } from './chat-store';
import { useSettingsStore } from './settings-store';
import { authFetch } from '@/lib/api/client';
import type { AgentPlan } from '@repo/shared';
import type { MessageApproval } from '@/lib/agent/approval-display';

// 网络层 mock：观察是否发出 /api/chat 请求及请求体（与 chat-store.test.ts 同款）
vi.mock('@/lib/api/client', () => ({
  authFetch: vi.fn(),
  fetchWithAuth: vi.fn(),
  authHeaders: vi.fn(),
}));
vi.mock('@/lib/billing/balance-warning', () => ({
  checkAndWarnLowBalance: vi.fn(),
}));
vi.mock('@/lib/events/tracker', () => ({ trackEvent: vi.fn() }));

const mockedAuthFetch = vi.mocked(authFetch);

/** 构造 SSE 流式 Response */
function sseResponse(events: unknown[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
  });
}

/** 取第 n 次 /api/chat 请求体 */
function requestBody(n = 0): Record<string, unknown> {
  const init = mockedAuthFetch.mock.calls[n][1] as { body: string };
  return JSON.parse(init.body) as Record<string, unknown>;
}

const TOKEN = 'signed-token-abc';

function makeApproval(overrides: Partial<MessageApproval> = {}): MessageApproval {
  return {
    callId: 'call-1',
    toolName: 'wh_notify',
    host: 'hooks.example.com',
    params: { message: '发布完成' },
    token: TOKEN,
    expiresAt: Date.now() + 10 * 60 * 1000,
    status: 'pending',
    ...overrides,
  };
}

const plan: AgentPlan = {
  id: 'plan-1',
  title: '发布通知',
  steps: [
    { id: 's1', title: '检索发布说明', status: 'completed', summary: '已找到 3 条发布说明' },
    { id: 's2', title: '发送通知', status: 'running' },
  ],
};

function pausedMessages(approval: MessageApproval = makeApproval(), withPlan = false): Message[] {
  return [
    { id: 'u-1', role: 'user', content: '把发布结果通知到群里' },
    {
      id: 'a-1',
      role: 'assistant',
      content: '',
      approval,
      ...(withPlan ? { plan } : {}),
    },
  ];
}

describe('TC08: Chat Store 审批卡片：拒绝、确认恢复、落盘与失效', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuthFetch.mockReset();
    useSettingsStore.setState({ agentModeEnabled: true });
    useChatStore.getState().reset();
    useChatStore.setState({ provider: 'doubao', model: 'doubao-pro' });
  });

  it('1. 拒绝卡片后审批状态为已拒绝，且没有发出任何 /api/chat 请求 (TC08-1)', () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });

    useChatStore.getState().rejectApproval('a-1');

    const card = useChatStore.getState().messages.find((m) => m.id === 'a-1');
    expect(card?.approval?.status).toBe('rejected');
    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });

  it('2. 拒绝后对话不进入流式状态，没有调用模型 (TC08-2)', () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    const loadingSeen: boolean[] = [];
    const unsubscribe = useChatStore.subscribe((state) => loadingSeen.push(state.isLoading));

    useChatStore.getState().rejectApproval('a-1');
    unsubscribe();

    expect(loadingSeen).not.toContain(true);
    expect(useChatStore.getState().isLoading).toBe(false);
    expect(useChatStore.getState().messages.some((m) => m.isStreaming)).toBe(false);
    expect(mockedAuthFetch).not.toHaveBeenCalled();
  });

  it('3. 拒绝后发送下一条消息，请求历史含「用户拒绝了执行 X」 (TC08-3)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(sseResponse([{ type: 'text-delta', text: '好的' }, { type: 'done' }]));

    useChatStore.getState().rejectApproval('a-1');
    await useChatStore.getState().sendMessage('那就不发了');

    const sent = requestBody().messages as Array<{ role: string; content: string }>;
    expect(sent.some((m) => m.content.includes('用户拒绝了执行 wh_notify'))).toBe(true);
    expect(sent[sent.length - 1].content).toBe('那就不发了');
  });

  it('4. 确认卡片发起的恢复请求携带审批凭证、对话历史与计划已完成检查点 (TC08-4)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages(makeApproval(), true) });
    mockedAuthFetch.mockResolvedValueOnce(sseResponse([{ type: 'text-delta', text: '已通知' }, { type: 'done' }]));

    await useChatStore.getState().confirmApproval('a-1');

    expect(mockedAuthFetch).toHaveBeenCalledTimes(1);
    const body = requestBody();
    expect(body.approvalResume).toEqual({
      token: TOKEN,
      callId: 'call-1',
      toolName: 'wh_notify',
      params: { message: '发布完成' },
    });
    expect(body.agent).toBe(true);
    expect(body.approvalScope).toBe('conv-1');
    expect(body.turnId).toBe('u-1');
    const sent = body.messages as Array<{ role: string; content: string }>;
    expect(sent[0]).toMatchObject({ role: 'user', content: '把发布结果通知到群里' });
    const checkpoint = sent.find((m) => m.content.includes('检索发布说明'));
    expect(checkpoint?.content).toContain('已找到 3 条发布说明');
    // 未完成的步骤不属于已完成检查点
    expect(sent.some((m) => m.content.includes('发送通知'))).toBe(false);
    // 卡片置为已确认，续答作为新的助手消息追加
    const messages = useChatStore.getState().messages;
    expect(messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('confirmed');
    expect(messages[messages.length - 1].content).toBe('已通知');
  });

  it('5. 从持久化恢复的 10 分钟内待确认卡片仍为待确认 (TC08-5)', () => {
    const approval = makeApproval({ expiresAt: Date.now() + 5 * 60 * 1000 });

    useChatStore.getState().loadConversation('conv-1', pausedMessages(approval), 'doubao', 'doubao-pro');

    const card = useChatStore.getState().messages.find((m) => m.id === 'a-1');
    expect(card?.approval?.status).toBe('pending');
  });

  it('6. 从持久化恢复的已超过 10 分钟的待确认卡片为已失效 (TC08-6)', () => {
    const approval = makeApproval({ expiresAt: Date.now() - 60 * 1000 });

    useChatStore.getState().loadConversation('conv-1', pausedMessages(approval), 'doubao', 'doubao-pro');

    const card = useChatStore.getState().messages.find((m) => m.id === 'a-1');
    expect(card?.approval?.status).toBe('expired');
  });

  it('7. 其后已有新消息的待确认卡片为已失效 (TC08-7)', () => {
    const messages: Message[] = [
      ...pausedMessages(),
      { id: 'u-2', role: 'user', content: '算了，换个话题' },
      { id: 'a-2', role: 'assistant', content: '好的' },
    ];

    useChatStore.getState().loadConversation('conv-1', messages, 'doubao', 'doubao-pro');

    const card = useChatStore.getState().messages.find((m) => m.id === 'a-1');
    expect(card?.approval?.status).toBe('expired');
  });

  it('8. 流式收到审批请求后，审批凭证不出现在消息正文 content 中 (TC08-8)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1' });
    mockedAuthFetch.mockResolvedValueOnce(
      sseResponse([
        { type: 'text-delta', text: '我将发送通知' },
        {
          type: 'tool_approval_request',
          approval: {
            callId: 'call-1',
            toolName: 'wh_notify',
            host: 'hooks.example.com',
            params: { message: '发布完成' },
            token: TOKEN,
            expiresAt: Date.now() + 10 * 60 * 1000,
          },
        },
        { type: 'done' },
      ])
    );

    await useChatStore.getState().sendMessage('把发布结果通知到群里');

    const assistant = useChatStore.getState().messages.find((m) => m.role === 'assistant');
    expect(assistant?.approval?.token).toBe(TOKEN);
    expect(assistant?.approval?.status).toBe('pending');
    expect(assistant?.content).toBe('我将发送通知');
    expect(assistant?.content).not.toContain(TOKEN);
  });

  it('9. 用户发送的普通聊天请求体不含审批凭证字段 (TC08-9)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(sseResponse([{ type: 'text-delta', text: '好' }, { type: 'done' }]));

    await useChatStore.getState().sendMessage('继续聊别的');

    const body = requestBody();
    expect(body).not.toHaveProperty('approvalResume');
    expect(JSON.stringify(body)).not.toContain(TOKEN);
  });

  it('10. 发送新消息后，此前待确认的卡片置为已失效 (TC08-10)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(sseResponse([{ type: 'text-delta', text: '好' }, { type: 'done' }]));

    await useChatStore.getState().sendMessage('继续聊别的');

    const card = useChatStore.getState().messages.find((m) => m.id === 'a-1');
    expect(card?.approval?.status).toBe('expired');
  });

  it('11. 确认时服务端返回 503（审批服务不可用），卡片退回待确认，可再次确认 (TC08-11)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '审批服务暂时不可用，该操作未执行，请稍后重试' }), { status: 503 })
    );

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    const state = useChatStore.getState();
    expect(state.messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('pending');
    expect(state.error?.message).toContain('请稍后重试');
    // 再次确认能重新发出恢复请求
    mockedAuthFetch.mockResolvedValueOnce(sseResponse([{ type: 'text-delta', text: '已通知' }, { type: 'done' }]));
    await useChatStore.getState().confirmApproval('a-1');
    expect(mockedAuthFetch).toHaveBeenCalledTimes(2);
  });

  it('12. 确认时网络中断且没有任何产出，卡片退回待确认 (TC08-12)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    expect(useChatStore.getState().messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('pending');
  });

  it('13. 确认时服务端返回 409（凭证已被使用），卡片保持已确认，不允许重试 (TC08-13)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '该审批已被使用，操作不会重复执行' }), { status: 409 })
    );

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    expect(useChatStore.getState().messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('confirmed');
  });

  it('14. 会话里有更早的失败消息时，确认遇 503 仍退回待确认 (TC08-14)', async () => {
    const history: Message[] = [
      { id: 'u-0', role: 'user', content: '先前的提问' },
      { id: 'a-0', role: 'assistant', content: '半截回答', failed: true },
      ...pausedMessages(),
    ];
    useChatStore.setState({ activeConversationId: 'conv-1', messages: history });
    mockedAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '审批服务暂时不可用，该操作未执行，请稍后重试' }), { status: 503 })
    );

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    expect(useChatStore.getState().messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('pending');
  });

  it('15. 确认后流中途中断且助手已有产出，卡片保持已确认 (TC08-15)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    const encoder = new TextEncoder();
    // 第一次拉取给出正文，第二次拉取再报错；直接在 start 里 error 会清掉尚未被读走的队列
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        if (pulls === 1) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text: '已发送，正在整理' })}\n\n`)
          );
        } else {
          controller.error(new TypeError('network error'));
        }
      },
    });
    mockedAuthFetch.mockResolvedValueOnce(
      new Response(stream, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
    );

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    const state = useChatStore.getState();
    expect(state.messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('confirmed');
    expect(state.messages.some((m) => m.failed && m.content.includes('已发送'))).toBe(true);
  });

  it('16. 确认时服务端返回 402（额度不足，凭证未消耗），卡片退回待确认 (TC08-16)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '当前额度不足以处理本次对话' }), { status: 402 })
    );

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    expect(useChatStore.getState().messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('pending');
  });

  it('17. 确认时服务端返回 429（请求过于频繁，凭证未消耗），卡片退回待确认 (TC08-17)', async () => {
    useChatStore.setState({ activeConversationId: 'conv-1', messages: pausedMessages() });
    mockedAuthFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: '请求过于频繁，请稍后再试' }), { status: 429 })
    );

    const outcome = await useChatStore.getState().confirmApproval('a-1');

    expect(outcome).toBe('failed');
    expect(useChatStore.getState().messages.find((m) => m.id === 'a-1')?.approval?.status).toBe('pending');
  });
});
