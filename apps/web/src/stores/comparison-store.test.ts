import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useComparisonStore, resetStreamPersistThrottle } from './comparison-store';
import { useConversationsStore, type Conversation } from './conversations-store';
import type { ModelRun } from '@/types/comparison';
import { authFetch } from '@/lib/api/client';
import { checkAndWarnLowBalance } from '@/lib/billing/balance-warning';

// 评审 C4：comparison-store 此前无测试，锁定 runModel 编排（经 streamChatResponse）
// 的「故障局部化」语义：单模型失败不阻塞其它模型，轮次仍执行成功。
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

/** 构造受控 SSE 流，供测试精确推进 chunk 与控制时钟 */
function createControlledStream() {
  let controllerRef!: ReadableStreamDefaultController<Uint8Array>;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controllerRef = controller;
    },
  });
  return {
    response: new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream; charset=utf-8' },
    }),
    pushChunk(text: string) {
      controllerRef.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'text-delta', text })}\n\n`)
      );
    },
    pushDone() {
      controllerRef.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
      controllerRef.close();
    },
  };
}

function resetState() {
  resetStreamPersistThrottle();
  useComparisonStore.setState({
    mode: 'compare',
    selectedModels: [],
    turns: [],
    activeComparisonId: null,
    input: '测试 prompt',
    error: null,
  });
  useConversationsStore.setState({
    conversations: [],
    currentConversationId: null,
    isLoaded: true,
    mode: 'compare',
    lastActiveSingleId: null,
    lastActiveCompareId: null,
  });
}

// 默认对比组合：xunfei:lite 与 doubao:doubao-seed-evolving（见 chat-models.ts）
const DEFAULT_RESERVATIONS = {
  reservations: [
    { provider: 'xunfei', model: 'lite', requestId: 'req-x', reservationId: 'res-x' },
    { provider: 'doubao', model: 'doubao-seed-evolving', requestId: 'req-d', reservationId: 'res-d' },
  ],
};

describe('useComparisonStore.sendComparison（评审 C4：故障局部化）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
  });

  it('成功模型写入完成结果；失败模型标记 failed 并带错误，轮次仍返回 sent', async () => {
    // 恢复默认已选模型（复制 defaultSelected 组合：xunfei lite + doubao seed）
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    mockedAuthFetch.mockImplementation(async (url, init) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.model === 'lite') {
        return sseResponse([
          'data: {"type":"text-delta","text":"我是讯飞"}\n\n',
          'data: {"type":"done"}\n\n',
        ]);
      }
      // doubao 模型失败：HTTP 500
      return new Response(JSON.stringify({ error: '模型暂时不可用' }), { status: 500 });
    });

    const result = await useComparisonStore.getState().sendComparison();

    expect(result).toBe('sent');
    const runs = useComparisonStore.getState().turns[0].runs;
    expect(runs['xunfei:lite'].status).toBe('completed');
    expect(runs['xunfei:lite'].content).toBe('我是讯飞');
    expect(runs['doubao:doubao-seed-evolving'].status).toBe('failed');
    expect(runs['doubao:doubao-seed-evolving'].error).toContain('模型暂时不可用');
    expect(useComparisonStore.getState().error).toBeNull();
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledTimes(1);
  });

  it('onDone 携带 usage 时：对应 run 完成后 run.usage 有值且字段正确，且 sendComparison 触发 checkAndWarnLowBalance', async () => {
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    const xunfeiUsage = {
      inputTokens: 514,
      outputTokens: 28,
      totalTokens: 542,
      estimated: false,
    };
    const doubaoUsage = {
      inputTokens: 600,
      outputTokens: 40,
      totalTokens: 640,
      estimated: true,
    };

    mockedAuthFetch.mockImplementation(async (url, init) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.model === 'lite') {
        return sseResponse([
          'data: {"type":"text-delta","text":"讯飞内容"}\n\n',
          `data: ${JSON.stringify({ type: 'done', usage: xunfeiUsage })}\n\n`,
        ]);
      }
      return sseResponse([
        'data: {"type":"text-delta","text":"豆包内容"}\n\n',
        `data: ${JSON.stringify({ type: 'done', usage: doubaoUsage })}\n\n`,
      ]);
    });

    const result = await useComparisonStore.getState().sendComparison();

    expect(result).toBe('sent');
    const runs = useComparisonStore.getState().turns[0].runs;
    expect(runs['xunfei:lite'].status).toBe('completed');
    expect(runs['xunfei:lite'].usage).toEqual(xunfeiUsage);
    expect(runs['doubao:doubao-seed-evolving'].status).toBe('completed');
    expect(runs['doubao:doubao-seed-evolving'].usage).toEqual(doubaoUsage);

    const convId = useComparisonStore.getState().activeComparisonId;
    expect(convId).toBeTruthy();
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledTimes(1);
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledWith(convId);
  });

  it('onDone 收到 undefined 时：run.usage 保持 undefined', async () => {
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    mockedAuthFetch.mockImplementation(async (url) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      return sseResponse([
        'data: {"type":"text-delta","text":"回答内容"}\n\n',
        'data: {"type":"done"}\n\n',
      ]);
    });

    const result = await useComparisonStore.getState().sendComparison();

    expect(result).toBe('sent');
    const runs = useComparisonStore.getState().turns[0].runs;
    expect(runs['xunfei:lite'].status).toBe('completed');
    expect(runs['xunfei:lite'].usage).toBeUndefined();
    expect(runs['doubao:doubao-seed-evolving'].status).toBe('completed');
    expect(runs['doubao:doubao-seed-evolving'].usage).toBeUndefined();
  });

  it('continueComparison 成功执行后调用一次 checkAndWarnLowBalance', async () => {
    const testConvId = 'conv-test-continue-id';
    useComparisonStore.setState({
      activeComparisonId: testConvId,
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
      turns: [
        {
          id: 'turn-first',
          prompt: '第一轮问题',
          createdAt: Date.now(),
          runs: {
            'xunfei:lite': {
              modelKey: 'xunfei:lite',
              provider: 'xunfei',
              model: 'lite',
              label: '讯飞星火 · Spark Lite（免费）',
              status: 'completed',
              content: '第一轮回答',
              branchMessages: [
                { role: 'user', content: '第一轮问题' },
                { role: 'assistant', content: '第一轮回答' },
              ],
            },
            'doubao:doubao-seed-evolving': {
              modelKey: 'doubao:doubao-seed-evolving',
              provider: 'doubao',
              model: 'doubao-seed-evolving',
              label: '豆包 · Doubao Seed',
              status: 'completed',
              content: '第一轮回答',
              branchMessages: [
                { role: 'user', content: '第一轮问题' },
                { role: 'assistant', content: '第一轮回答' },
              ],
            },
          },
          focusSlots: { left: 'xunfei:lite', right: 'doubao:doubao-seed-evolving' },
        },
      ],
    });

    mockedAuthFetch.mockImplementation(async (url) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      if (url === '/api/chat') {
        return sseResponse([
          'data: {"type":"text-delta","text":"追问回答"}\n\n',
          'data: {"type":"done"}\n\n',
        ]);
      }
      return new Response(JSON.stringify({ error: '404' }), { status: 404 });
    });

    const result = await useComparisonStore.getState().continueComparison('追问内容');

    expect(result).toBe('sent');
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledTimes(1);
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledWith(testConvId);
  });

  it('retryModel 重跑时：旧 usage 被重置（不残留），且完成后调用 checkAndWarnLowBalance', async () => {
    const turnId = 'turn-retry';
    const testConvId = 'conv-test-retry-id';
    useComparisonStore.setState({
      activeComparisonId: testConvId,
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
      ],
      turns: [
        {
          id: turnId,
          prompt: '用户问题',
          createdAt: Date.now(),
          runs: {
            'xunfei:lite': {
              modelKey: 'xunfei:lite',
              provider: 'xunfei',
              model: 'lite',
              label: '讯飞星火 · Spark Lite（免费）',
              status: 'completed',
              content: '旧回答文本',
              usage: {
                inputTokens: 100,
                outputTokens: 50,
                totalTokens: 150,
                estimated: false,
              },
              branchMessages: [
                { role: 'user', content: '用户问题' },
                { role: 'assistant', content: '旧回答文本' },
              ],
            },
          },
          focusSlots: { left: 'xunfei:lite', right: 'xunfei:lite' },
        },
      ],
    });

    mockedAuthFetch.mockImplementation(async (url) => {
      if (url === '/api/chat') {
        return sseResponse([
          'data: {"type":"text-delta","text":"重试后的新回答"}\n\n',
          'data: {"type":"done"}\n\n',
        ]);
      }
      return new Response(JSON.stringify({ error: '404' }), { status: 404 });
    });

    await useComparisonStore.getState().retryModel(turnId, 'xunfei:lite');

    const run = useComparisonStore.getState().turns[0].runs['xunfei:lite'];
    expect(run.status).toBe('completed');
    expect(run.content).toBe('重试后的新回答');
    expect(run.usage).toBeUndefined();
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledTimes(1);
    expect(mockedCheckAndWarnLowBalance).toHaveBeenCalledWith(testConvId);
  });
});

describe('useComparisonStore.loadComparison（清洗残留死状态）', () => {
  beforeEach(() => {
    resetState();
  });

  it('含 streaming run 的会话 loadComparison 后：该 run 状态为 stopped、content 保留、branchMessages 不变', () => {
    const testConvId = 'conv-test-streaming';
    const initialConversation: Conversation = {
      id: testConvId,
      title: '对比测试',
      messages: [],
      provider: 'compare',
      model: 'multi',
      createdAt: 1000,
      updatedAt: 1000,
      mode: 'compare',
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
      ],
      turns: [
        {
          id: 'turn-1',
          prompt: '用户问题 1',
          createdAt: 1000,
          focusSlots: { left: 'xunfei:lite', right: 'xunfei:lite' },
          runs: {
            'xunfei:lite': {
              modelKey: 'xunfei:lite',
              provider: 'xunfei',
              model: 'lite',
              label: '讯飞星火 · Spark Lite（免费）',
              status: 'streaming',
              content: '流式生成了一半的文本',
              branchMessages: [{ role: 'user', content: '用户问题 1' }],
            },
          },
        },
      ],
    };

    useConversationsStore.setState({
      conversations: [initialConversation],
    });

    useComparisonStore.getState().loadComparison(testConvId);

    const turn = useComparisonStore.getState().turns[0];
    const run = turn.runs['xunfei:lite'];
    expect(run.status).toBe('stopped');
    expect(run.content).toBe('流式生成了一半的文本');
    expect(run.branchMessages).toEqual([{ role: 'user', content: '用户问题 1' }]);
  });

  it('含 queued run 同样清洗为 stopped', () => {
    const testConvId = 'conv-test-queued';
    const initialConversation: Conversation = {
      id: testConvId,
      title: '对比测试',
      messages: [],
      provider: 'compare',
      model: 'multi',
      createdAt: 1000,
      updatedAt: 1000,
      mode: 'compare',
      selectedModels: [
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
      turns: [
        {
          id: 'turn-1',
          prompt: '排队中的问题',
          createdAt: 1000,
          focusSlots: { left: 'doubao:doubao-seed-evolving', right: 'doubao:doubao-seed-evolving' },
          runs: {
            'doubao:doubao-seed-evolving': {
              modelKey: 'doubao:doubao-seed-evolving',
              provider: 'doubao',
              model: 'doubao-seed-evolving',
              label: '豆包 · Doubao Seed',
              status: 'queued',
              content: '',
              branchMessages: [{ role: 'user', content: '排队中的问题' }],
            },
          },
        },
      ],
    };

    useConversationsStore.setState({
      conversations: [initialConversation],
    });

    useComparisonStore.getState().loadComparison(testConvId);

    const turn = useComparisonStore.getState().turns[0];
    const run = turn.runs['doubao:doubao-seed-evolving'];
    expect(run.status).toBe('stopped');
    expect(run.content).toBe('');
    expect(run.branchMessages).toEqual([{ role: 'user', content: '排队中的问题' }]);
  });

  it('completed / failed / stopped 的 run 原样不动', () => {
    const testConvId = 'conv-test-unchanged';
    const completedRun: ModelRun = {
      modelKey: 'xunfei:lite',
      provider: 'xunfei',
      model: 'lite',
      label: '讯飞星火 · Spark Lite（免费）',
      status: 'completed',
      content: '已完成回答',
      completedAt: 1500,
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimated: false },
      branchMessages: [
        { role: 'user', content: '问题' },
        { role: 'assistant', content: '已完成回答' },
      ],
    };
    const failedRun: ModelRun = {
      modelKey: 'doubao:doubao-seed-evolving',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      label: '豆包 · Doubao Seed',
      status: 'failed',
      content: '生成失败',
      completedAt: 1600,
      error: '豆包暂时不可用',
      branchMessages: [{ role: 'user', content: '问题' }],
    };
    const stoppedRun: ModelRun = {
      modelKey: 'xunfei:pro',
      provider: 'xunfei',
      model: 'pro',
      label: '讯飞星火 · Spark Pro',
      status: 'stopped',
      content: '此前被停止的回答',
      completedAt: 1400,
      branchMessages: [{ role: 'user', content: '问题' }],
    };

    const initialConversation: Conversation = {
      id: testConvId,
      title: '对比测试',
      messages: [],
      provider: 'compare',
      model: 'multi',
      createdAt: 1000,
      updatedAt: 1000,
      mode: 'compare',
      selectedModels: [],
      turns: [
        {
          id: 'turn-1',
          prompt: '问题',
          createdAt: 1000,
          focusSlots: { left: 'xunfei:lite', right: 'doubao:doubao-seed-evolving' },
          runs: {
            'xunfei:lite': completedRun,
            'doubao:doubao-seed-evolving': failedRun,
            'xunfei:pro': stoppedRun,
          },
        },
      ],
    };

    useConversationsStore.setState({
      conversations: [initialConversation],
    });

    useComparisonStore.getState().loadComparison(testConvId);

    const runs = useComparisonStore.getState().turns[0].runs;
    expect(runs['xunfei:lite']).toEqual(completedRun);
    expect(runs['doubao:doubao-seed-evolving']).toEqual(failedRun);
    expect(runs['xunfei:pro']).toEqual(stoppedRun);
  });

  it('清洗后 conversations-store 镜像里的 turns 也被写回为 stopped', () => {
    const testConvId = 'conv-test-sync-back';
    const initialConversation: Conversation = {
      id: testConvId,
      title: '对比测试',
      messages: [],
      provider: 'compare',
      model: 'multi',
      createdAt: 1000,
      updatedAt: 1000,
      mode: 'compare',
      selectedModels: [],
      turns: [
        {
          id: 'turn-1',
          prompt: '问题',
          createdAt: 1000,
          focusSlots: { left: 'xunfei:lite', right: 'doubao:doubao-seed-evolving' },
          runs: {
            'xunfei:lite': {
              modelKey: 'xunfei:lite',
              provider: 'xunfei',
              model: 'lite',
              label: '讯飞星火 · Spark Lite（免费）',
              status: 'streaming',
              content: '未完待续',
              branchMessages: [{ role: 'user', content: '问题' }],
            },
            'doubao:doubao-seed-evolving': {
              modelKey: 'doubao:doubao-seed-evolving',
              provider: 'doubao',
              model: 'doubao-seed-evolving',
              label: '豆包 · Doubao Seed',
              status: 'queued',
              content: '',
              branchMessages: [{ role: 'user', content: '问题' }],
            },
          },
        },
      ],
    };

    useConversationsStore.setState({
      conversations: [initialConversation],
    });

    useComparisonStore.getState().loadComparison(testConvId);

    // 验证 conversations-store 镜像已同步写回
    const syncedConv = useConversationsStore
      .getState()
      .conversations.find((c) => c.id === testConvId);
    expect(syncedConv).toBeDefined();
    const syncedRuns = syncedConv!.turns![0].runs;
    expect(syncedRuns['xunfei:lite'].status).toBe('stopped');
    expect(syncedRuns['xunfei:lite'].content).toBe('未完待续');
    expect(syncedRuns['doubao:doubao-seed-evolving'].status).toBe('stopped');
    expect(syncedRuns['doubao:doubao-seed-evolving'].content).toBe('');
  });

  it('全部 run 本就干净时：loadComparison 后镜像不被改写', () => {
    const testConvId = 'conv-test-clean-no-write';
    const initialUpdatedAt = 123456789;
    const initialConversation: Conversation = {
      id: testConvId,
      title: '对比测试',
      messages: [],
      provider: 'compare',
      model: 'multi',
      createdAt: 1000,
      updatedAt: initialUpdatedAt,
      mode: 'compare',
      selectedModels: [],
      turns: [
        {
          id: 'turn-1',
          prompt: '问题',
          createdAt: 1000,
          focusSlots: { left: 'xunfei:lite', right: 'xunfei:lite' },
          runs: {
            'xunfei:lite': {
              modelKey: 'xunfei:lite',
              provider: 'xunfei',
              model: 'lite',
              label: '讯飞星火 · Spark Lite（免费）',
              status: 'completed',
              content: '已完成回答',
              completedAt: 1500,
              branchMessages: [
                { role: 'user', content: '问题' },
                { role: 'assistant', content: '已完成回答' },
              ],
            },
          },
        },
      ],
    };

    useConversationsStore.setState({
      conversations: [initialConversation],
    });

    const updateSpy = vi.spyOn(useConversationsStore.getState(), 'updateComparisonTurns');

    useComparisonStore.getState().loadComparison(testConvId);

    // 1. 断言 updateComparisonTurns 未被调用（不写盘）
    expect(updateSpy).not.toHaveBeenCalled();

    // 2. 断言 conversations-store 镜像对象引用与 updatedAt 严格未变
    const convAfter = useConversationsStore
      .getState()
      .conversations.find((c) => c.id === testConvId);
    expect(convAfter).toBe(initialConversation);
    expect(convAfter?.updatedAt).toBe(initialUpdatedAt);

    updateSpy.mockRestore();
  });
});

describe('useComparisonStore 流中节流落盘（G1b）', () => {
  beforeEach(() => {
    mockedAuthFetch.mockReset();
    mockedCheckAndWarnLowBalance.mockReset();
    resetState();
    vi.restoreAllMocks();
  });

  it('流中落盘触发：mock Date.now 使两次 onChunk 间隔 >= 1s 时触发落盘，写入最新 accumulated 内容（patch 生效，非旧帧）', async () => {
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    const streamXunfei = createControlledStream();
    const streamDoubao = createControlledStream();

    mockedAuthFetch.mockImplementation(async (url, init) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.model === 'lite') {
        return streamXunfei.response;
      }
      return streamDoubao.response;
    });

    let mockTime = 10000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    const updateSpy = vi.spyOn(useConversationsStore.getState(), 'updateComparisonTurns');

    const sendPromise = useComparisonStore.getState().sendComparison();
    await new Promise((r) => setTimeout(r, 10));

    // 1. 第一个 chunk（t = 10000，初始 lastStreamPersistAt = 0，>= 1000ms 触发首次落盘）
    streamXunfei.pushChunk('第一段讯飞');
    await new Promise((r) => setTimeout(r, 10));

    // 断言首次落盘被触发，且写入的内容是最新的 '第一段讯飞'（patch 生效，而不是 store 旧帧里的空字符串）
    expect(updateSpy).toHaveBeenCalledTimes(1);
    const firstCallTurns = updateSpy.mock.calls[0][1];
    expect(firstCallTurns[0].runs['xunfei:lite'].content).toBe('第一段讯飞');

    // 2. 500ms 后收到第二个 chunk（t = 10500，距上次落盘 500ms < 1000ms，被节流拦截）
    mockTime = 10500;
    streamXunfei.pushChunk('第二段讯飞');
    await new Promise((r) => setTimeout(r, 10));

    // 依然只有 1 次落盘
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // 3. 距离上次落盘超过 1s（t = 11500，距上次 1500ms >= 1000ms），收到第三个 chunk
    mockTime = 11500;
    streamXunfei.pushChunk('第三段讯飞');
    await new Promise((r) => setTimeout(r, 10));

    // 再次触发流中落盘，调用次数递增为 2
    expect(updateSpy).toHaveBeenCalledTimes(2);
    const secondCallTurns = updateSpy.mock.calls[1][1];
    expect(secondCallTurns[0].runs['xunfei:lite'].content).toBe('第一段讯飞第二段讯飞第三段讯飞');

    // 结束流并等待完成
    streamXunfei.pushDone();
    streamDoubao.pushDone();
    await sendPromise;
    updateSpy.mockRestore();
  });

  it('全局节流：1s 内多个 chunk（含两个模型各自的）只落盘一次', async () => {
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    const streamXunfei = createControlledStream();
    const streamDoubao = createControlledStream();

    mockedAuthFetch.mockImplementation(async (url, init) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.model === 'lite') {
        return streamXunfei.response;
      }
      return streamDoubao.response;
    });

    let mockTime = 20000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockTime);

    const updateSpy = vi.spyOn(useConversationsStore.getState(), 'updateComparisonTurns');

    const sendPromise = useComparisonStore.getState().sendComparison();
    await new Promise((r) => setTimeout(r, 10));

    // 模型 A 第 1 个 chunk（触发首次落盘，记录 lastStreamPersistAt = 20000）
    streamXunfei.pushChunk('讯飞 chunk 1');
    await new Promise((r) => setTimeout(r, 10));
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // 200ms 后，模型 A 第 2 个 chunk
    mockTime = 20200;
    streamXunfei.pushChunk('讯飞 chunk 2');
    await new Promise((r) => setTimeout(r, 10));

    // 400ms 后，模型 B 第 1 个 chunk
    mockTime = 20400;
    streamDoubao.pushChunk('豆包 chunk 1');
    await new Promise((r) => setTimeout(r, 10));

    // 600ms 后，模型 B 第 2 个 chunk
    mockTime = 20600;
    streamDoubao.pushChunk('豆包 chunk 2');
    await new Promise((r) => setTimeout(r, 10));

    // 均在 1s 窗口内，全局节流器拦截，流中依然只落盘了 1 次
    expect(updateSpy).toHaveBeenCalledTimes(1);

    // 结束流
    streamXunfei.pushDone();
    streamDoubao.pushDone();
    await sendPromise;
    updateSpy.mockRestore();
  });

  it('1s 窗口内 activeComparisonId 为 null 时不炸且不触发落盘（防御分支）', async () => {
    useComparisonStore.setState({
      selectedModels: [
        {
          provider: 'xunfei',
          model: 'lite',
          providerLabel: '讯飞星火',
          label: '讯飞星火 · Spark Lite（免费）',
        },
        {
          provider: 'doubao',
          model: 'doubao-seed-evolving',
          providerLabel: '豆包',
          label: '豆包 · Doubao Seed',
        },
      ],
    });

    const streamXunfei = createControlledStream();
    const streamDoubao = createControlledStream();

    mockedAuthFetch.mockImplementation(async (url, init) => {
      if (url === '/api/chat/batch-reserve') {
        return new Response(JSON.stringify(DEFAULT_RESERVATIONS), { status: 200 });
      }
      const body = JSON.parse((init as RequestInit).body as string);
      if (body.model === 'lite') {
        return streamXunfei.response;
      }
      return streamDoubao.response;
    });

    vi.spyOn(Date, 'now').mockReturnValue(30000);
    const updateSpy = vi.spyOn(useConversationsStore.getState(), 'updateComparisonTurns');

    const sendPromise = useComparisonStore.getState().sendComparison();
    await new Promise((r) => setTimeout(r, 10));

    // 模拟在流式过程中 activeComparisonId 变为 null（例如会话被重置或关闭）
    useComparisonStore.setState({ activeComparisonId: null });

    // 推送 chunk，验证不抛错且 updateComparisonTurns 不被调用
    expect(() => {
      streamXunfei.pushChunk('测试内容');
    }).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));
    expect(updateSpy).not.toHaveBeenCalled();

    streamXunfei.pushDone();
    streamDoubao.pushDone();
    await sendPromise;
    updateSpy.mockRestore();
  });
});
