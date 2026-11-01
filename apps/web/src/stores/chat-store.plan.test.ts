import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useChatStore, runChatStreamSession, type ChatStreamSessionDeps, type Message } from './chat-store';
import type { AgentPlan } from '@repo/shared';

// Mock 埋点
const trackerMock = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/events/tracker', () => ({ trackEvent: trackerMock.trackEvent }));

describe('TC04: 客户端 Chat Store 计划消费、持久化与干预动作', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().reset();
  });

  it('1. chatStore 在流式接收 plan_created 与 plan_step_update 时，实时累积到对应 streamingMessage.plan (TC04-1)', async () => {
    let messages: Message[] = [
      { id: 'user-1', role: 'user', content: '深度调研 Agent 框架' },
      { id: 'asst-1', role: 'assistant', content: '', isStreaming: true },
    ];

    const deps: ChatStreamSessionDeps = {
      getMessages: () => messages,
      updateMessages: (updater) => {
        messages = updater(messages);
        return messages;
      },
      setError: vi.fn(),
      activeConversationId: () => 'conv-test-1',
    };

    const initialPlan: AgentPlan = {
      id: 'plan-101',
      title: 'Agent 调研任务',
      steps: [
        { id: 's1', title: '收集竞品资料', status: 'pending' },
        { id: 's2', title: '性能对比', status: 'pending' },
      ],
    };

    const fakeBody = new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({
          type: 'plan_created',
          plan: initialPlan,
        });

        send({
          type: 'plan_step_update',
          stepId: 's1',
          status: 'running',
        });

        send({
          type: 'text-delta',
          text: '正在调研',
        });

        send({
          type: 'plan_step_update',
          stepId: 's1',
          status: 'completed',
          summary: '已收集主流 3 家框架资料',
        });

        send({
          type: 'done',
        });
        controller.close();
      },
    });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(fakeBody, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    );

    const outcome = await runChatStreamSession(deps, 'asst-1', {
      body: { messages: [] },
      signal: new AbortController().signal,
    });

    expect(outcome).toBe('sent');
    const asstMsg = messages.find((m) => m.id === 'asst-1');
    expect(asstMsg).toBeDefined();
    expect(asstMsg?.plan).toBeDefined();
    expect(asstMsg?.plan?.id).toBe('plan-101');
    expect(asstMsg?.plan?.steps[0].status).toBe('completed');
    expect(asstMsg?.plan?.steps[0].summary).toBe('已收集主流 3 家框架资料');
    expect(asstMsg?.content).toBe('正在调研');
  });

  it('2. 流式结束后，完整的 message.plan 随会话成功持久化到本地存储；重新加载会话时完整反序列化还原计划状态 (TC04-2)', () => {
    const store = useChatStore.getState();

    const historicalPlan: AgentPlan = {
      id: 'plan-hist-1',
      title: '历史已完成计划',
      steps: [
        { id: 's1', title: '需求分析', status: 'completed', summary: '需求已确认' },
        { id: 's2', title: '架构设计', status: 'completed', summary: 'ADR-0038已签署' },
      ],
    };

    const rawMessages: Message[] = [
      { id: 'u1', role: 'user', content: '开始分析' },
      {
        id: 'a1',
        role: 'assistant',
        content: '方案已落地。',
        plan: historicalPlan,
      },
    ];

    // 加载历史会话
    store.loadConversation('conv-hist-1', rawMessages, 'doubao', 'doubao-pro');

    const state = useChatStore.getState();
    expect(state.activeConversationId).toBe('conv-hist-1');
    expect(state.messages.length).toBe(2);

    const loadedAssistant = state.messages.find((m) => m.id === 'a1');
    expect(loadedAssistant?.plan).toEqual(historicalPlan);
    expect(loadedAssistant?.plan?.steps.length).toBe(2);
    expect(loadedAssistant?.plan?.steps[0].status).toBe('completed');
  });

  it('3. 用户在步骤进行中调用 interruptAndResumeWithPlan(messageId, modifiedPlan)，当前流被 Abort 中止，并携带修改后的计划发起后续请求 (TC04-3)', async () => {
    const store = useChatStore.getState();

    // 预设一条正在执行中的消息
    const runningPlan: AgentPlan = {
      id: 'plan-int-1',
      title: '执行中计划',
      steps: [
        { id: 's1', title: '步骤1', status: 'completed' },
        { id: 's2', title: '步骤2', status: 'running' },
        { id: 's3', title: '步骤3', status: 'pending' },
      ],
    };

    useChatStore.setState({
      activeConversationId: 'conv-active-1',
      messages: [
        { id: 'u-1', role: 'user', content: '执行任务' },
        { id: 'a-1', role: 'assistant', content: '第一阶段完成', isStreaming: true, plan: runningPlan },
      ],
      isLoading: true,
    });

    const modifiedPlan: AgentPlan = {
      ...runningPlan,
      steps: [
        { id: 's1', title: '步骤1', status: 'completed' },
        { id: 's2', title: '步骤2 (已修改目标)', status: 'pending' },
        { id: 's3', title: '步骤3 (已跳过)', status: 'skipped' },
      ],
    };

    const sendMessageSpy = vi.spyOn(useChatStore.getState(), 'sendMessage').mockResolvedValue('sent');

    await useChatStore.getState().interruptAndResumeWithPlan('a-1', modifiedPlan);

    // 验证旧消息的 plan 被更新为修改后的 plan
    const updatedA1 = useChatStore.getState().messages.find((m) => m.id === 'a-1');
    expect(updatedA1?.plan).toEqual(modifiedPlan);

    // 验证埋点被派发
    expect(trackerMock.trackEvent).toHaveBeenCalledWith(
      'plan.intervened',
      expect.objectContaining({
        planId: 'plan-int-1',
        stepCount: 3,
        action: 'modify_plan',
      })
    );

    // 验证触发了携带后续步骤提示词的 sendMessage
    expect(sendMessageSpy).toHaveBeenCalledWith(
      expect.stringContaining('请根据已调整的计划继续执行后续步骤：')
    );
  });

  it('4. 用户主动点击 stopGenerating() 时，当前消息中的计划卡片立即固化当前检查点状态，不丢失已完成步骤 (TC04-4)', () => {
    const planWithRunning: AgentPlan = {
      id: 'plan-stop-1',
      title: '中断测试计划',
      steps: [
        { id: 's1', title: '步骤1', status: 'completed', summary: '已完成' },
        { id: 's2', title: '步骤2', status: 'running' },
        { id: 's3', title: '步骤3', status: 'pending' },
      ],
    };

    useChatStore.setState({
      activeConversationId: 'conv-stop-1',
      messages: [
        { id: 'u-1', role: 'user', content: '开始测试' },
        {
          id: 'a-1',
          role: 'assistant',
          content: '生成了一半',
          isStreaming: true,
          plan: planWithRunning,
        },
      ],
      isLoading: true,
    });

    // 用户主动停止生成
    useChatStore.getState().stop();

    const state = useChatStore.getState();
    expect(state.isLoading).toBe(false);

    const stoppedMsg = state.messages.find((m) => m.id === 'a-1');
    expect(stoppedMsg).toBeDefined();
    expect(stoppedMsg?.isStreaming).toBe(false);
    expect(stoppedMsg?.stopped).toBe(true);

    // 检查点已完成步骤保留，未完成步骤收口为终态（aborted/skipped），无残留 running 态
    expect(stoppedMsg?.plan?.steps[0].status).toBe('completed');
    expect(stoppedMsg?.plan?.steps[1].status).toBe('failed'); // running 步骤被标记为中止
    expect(stoppedMsg?.plan?.steps[1].summary).toContain('中止');
    expect(stoppedMsg?.plan?.steps[2].status).toBe('skipped'); // 未开始步骤标记为跳过
  });

  it('5. 复制消息或提取纯文本正文时，message.plan 不进入正文字符串，Markdown 内容保持纯净 (TC04-5)', () => {
    const plan: AgentPlan = {
      id: 'plan-pure-1',
      title: '内部推演计划',
      steps: [
        { id: 's1', title: '秘密步骤A', status: 'completed' },
        { id: 's2', title: '秘密步骤B', status: 'completed' },
      ],
    };

    const message: Message = {
      id: 'a-clean',
      role: 'assistant',
      content: '这是最终为用户呈现的 Markdown 报告正文。\n- 成果 1\n- 成果 2',
      plan,
    };

    // 消息的 content 本身绝不包含 plan 的内部文本
    expect(message.content).not.toContain('内部推演计划');
    expect(message.content).not.toContain('秘密步骤A');
    expect(message.content).toBe('这是最终为用户呈现的 Markdown 报告正文。\n- 成果 1\n- 成果 2');
  });
});
