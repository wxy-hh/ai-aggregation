import {
  setupAiSdkMocks,
  streamTextMock,
  generateTextMock,
} from '../testing/mock-ai-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatHandler } from '../chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { createToolRegistry } from '@/lib/agent/registry';
import { NextRequest } from 'next/server';
import { z } from 'zod';

const mocks = vi.hoisted(() => {
  process.env.ARK_API_KEY = 'test-ark-key-32-bytes-long-for-test!';
  process.env.DEEPSEEK_MODEL = 'test-deepseek-key-32-bytes-long!';
  process.env.APPROVAL_TOKEN_SECRET = 'test-approval-secret-32-bytes-minimum!!';
  return {
    currentUser: { id: 'user_agent_run_test', role: 'user' },
    rateLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) },
    prismaAgentRunCreate: vi.fn(),
    quotaSessionReserveMock: vi.fn(),
    // 审批凭证签发依赖 Redis SET NX（失败关闭），缺省模拟签发成功
    approvalRedisSet: vi.fn().mockResolvedValue('OK'),
    // 工具注册表接缝：默认回落真实注册表，需要工具成功执行的用例注入替身
    toolRegistryHolder: { current: null as unknown },
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => mocks.currentUser),
}));

vi.mock('@repo/redis', () => ({
  getRateLimiter: () => mocks.rateLimiter,
  getRedisClient: () => ({ set: mocks.approvalRedisSet }),
}));

vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: mocks.quotaSessionReserveMock },
}));

vi.mock('@repo/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/db')>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      agentRun: {
        create: mocks.prismaAgentRunCreate,
      },
      userWebhookTool: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    },
  };
});

vi.mock('@/lib/billing/quota-service', () => ({
  getAvailableQuota: vi.fn().mockResolvedValue(100000),
}));

// 工具注册表接缝（对齐 chat-handler.agent.test.ts 先例）：默认回落真实注册表，
// 仅工具执行相关用例注入替身，真实 web_fetch 走 node:http 不受全局 fetch spy 影响
vi.mock('./tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./tools')>();
  return {
    ...actual,
    getDefaultToolRegistry: () =>
      mocks.toolRegistryHolder.current ?? actual.getDefaultToolRegistry(),
  };
});

describe('agent-runs 事务落盘集成测试 (ADR-0015 / 工单 02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAiSdkMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    vi.stubEnv('DEEPSEEK_MODEL', 'test-deepseek-key');
    vi.stubEnv('APPROVAL_TOKEN_SECRET', 'test-approval-secret-32-bytes-minimum!!');
  });

  it('agent 任务执行完成时，将目标文本、步骤、工具与 Quota 结算结果同源写入 agent_runs', async () => {
    const fakeSession = createFakeQuotaSession({
      finalize: vi.fn().mockResolvedValue({
        finalTokens: 1888,
        success: true,
      }),
    });

    const handler = createChatHandler({
      getAdapter: () => ({ name: 'doubao', stream: vi.fn() as any }),
    });

    // mock 决策步与收尾步
    streamTextMock.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '已为您调研完毕，生成报告。' };
      })(),
      toolCalls: Promise.resolve([]),
      usage: Promise.resolve({ inputTokens: 100, outputTokens: 200, totalTokens: 300 }),
      finishReason: Promise.resolve('stop'),
      response: Promise.resolve({ messages: [] }),
    });

    // 伪造 quotaSessionReserve
    mocks.quotaSessionReserveMock.mockResolvedValueOnce(fakeSession);

    const req = new NextRequest('http://localhost:3030/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '请调研 2026 年多模态大模型' }],
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        agent: true,
        capabilityPack: 'deep-research',
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    // 读取流直到完成
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    // 验证 finalize 调用
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);

    // 验证落盘写入
    expect(mocks.prismaAgentRunCreate).toHaveBeenCalledTimes(1);
    expect(mocks.prismaAgentRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user_agent_run_test',
        goalText: '请调研 2026 年多模态大模型',
        capabilityPack: 'deep-research',
        outcome: 'success',
        quotaCost: 300, // 与结算同源
      }),
    });
  });

  it('TC04-1: 模型首轮即挂，落库 outcome=failed、steps=1、工具产物为空、durationMs 大于 0', async () => {
    const fakeSession = createFakeQuotaSession();
    mocks.quotaSessionReserveMock.mockResolvedValueOnce(fakeSession);

    const handler = createChatHandler({
      getAdapter: () => ({ name: 'doubao', stream: vi.fn() as any }),
    });

    // streamText 首调用即抛错
    streamTextMock.mockImplementationOnce(() => {
      throw new Error('上游模型服务不可用');
    });

    const req = new NextRequest('http://localhost:3030/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '测试首轮即挂' }],
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        agent: true,
      }),
    });

    const res = await handler(req);
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    expect(mocks.prismaAgentRunCreate).toHaveBeenCalledTimes(1);
    const createData = mocks.prismaAgentRunCreate.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      outcome: 'failed',
      steps: 1,
      toolCalls: [],
      artifactRefs: [],
    });
    // 红灯断言：真实耗时大于 0 毫秒（现状异常路径丢失 durationMs，落库为默认值 0）
    expect(createData.durationMs).toBeGreaterThan(0);
  });

  it('TC04-2: 多步执行中途故障，第一轮工具成功、第二轮模型挂，落库 outcome=partial、保留第一轮工具流水与真实耗时、steps=2', async () => {
    const fakeSession = createFakeQuotaSession();
    mocks.quotaSessionReserveMock.mockResolvedValueOnce(fakeSession);

    // 注入 web_fetch 替身：真实工具策略/校验照常参与，仅把 execute 换成本地成功实现
    //（真实 web_fetch 走 node:http，全局 fetch spy 拦不到，直接打真实网络会导致 404 装配失败）
    const fakeSpec = {
      name: 'web_fetch',
      description: '抓取网页（测试替身）',
      parameters: z.object({ url: z.string() }),
      execute: vi.fn().mockResolvedValue({
        ok: true,
        contentForModel: '网页正文内容：测试网页内容',
        summaryForDisplay: '已抓取 example.com/data（正文 6 字）',
      }),
    };
    mocks.toolRegistryHolder.current = {
      get: (name: string) => (name === 'web_fetch' ? fakeSpec : undefined),
      list: () => [fakeSpec],
      has: (name: string) => name === 'web_fetch',
    };

    const handler = createChatHandler({
      getAdapter: () => ({ name: 'doubao', stream: vi.fn() as any }),
    });

    // 第一轮：成功执行 web_fetch 工具
    streamTextMock.mockReturnValueOnce({
      fullStream: (async function* () {})(),
      toolCalls: Promise.resolve([
        {
          toolCallId: 'call_fetch_1',
          toolName: 'web_fetch',
          input: { url: 'https://example.com/data' },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 50, outputTokens: 20, totalTokens: 70 }),
      finishReason: Promise.resolve('tool-calls'),
      response: Promise.resolve({ messages: [] }),
    });

    // 第二轮：模型调用故障抛错
    streamTextMock.mockImplementationOnce(() => {
      throw new Error('上游模型第二轮调用故障');
    });

    const req = new NextRequest('http://localhost:3030/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '测试多步中途故障' }],
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        agent: true,
      }),
    });

    const res = await handler(req);
    mocks.toolRegistryHolder.current = null;
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done } = await reader.read();
        if (done) break;
      }
    }

    expect(fakeSpec.execute).toHaveBeenCalledTimes(1);
    expect(mocks.prismaAgentRunCreate).toHaveBeenCalledTimes(1);
    const createData = mocks.prismaAgentRunCreate.mock.calls[0][0].data;
    // 红灯断言：部分交付 outcome='partial'、保留步数 2、保留第一轮工具流水、真实耗时 > 0
    expect(createData.outcome).toBe('partial');
    expect(createData.steps).toBe(2);
    expect(createData.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'call_fetch_1',
          name: 'web_fetch',
        }),
      ])
    );
    expect(createData.durationMs).toBeGreaterThan(0);
  });

  it('TC04-3: 审批挂起后中断，挂起即有效终态按 success 收尾，落库记录包含挂起工具信息', async () => {
    const fakeSession = createFakeQuotaSession();
    mocks.quotaSessionReserveMock.mockResolvedValueOnce(fakeSession);

    const notifyTool: any = {
      id: 'tool_approval_notify',
      userId: 'user_agent_run_test',
      name: '发送外部通知',
      // spec 名 = wh_{callName}，须与模型侧 toolName 'wh_notify' 对齐
      callName: 'notify',
      description: '发送外部通知需要人工审批',
      url: 'https://hooks.example.com/notify',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [{ name: 'content', type: 'string', required: true, description: '通知内容' }],
      enabled: true,
      requiresApproval: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const handler = createChatHandler({
      getAdapter: () => ({ name: 'doubao', stream: vi.fn() as any }),
      getUserTools: async () => [notifyTool],
    });

    // 首轮模型返回需要审批的工具调用
    streamTextMock.mockReturnValueOnce({
      fullStream: (async function* () {})(),
      toolCalls: Promise.resolve([
        {
          toolCallId: 'call_notify_1',
          toolName: 'wh_notify',
          input: { content: '重要审批内容' },
        },
      ]),
      usage: Promise.resolve({ inputTokens: 50, outputTokens: 20, totalTokens: 70 }),
      finishReason: Promise.resolve('tool-calls'),
      response: Promise.resolve({ messages: [] }),
    });

    const abortController = new AbortController();
    const req = new NextRequest('http://localhost:3030/api/chat', {
      method: 'POST',
      signal: abortController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '请发送外部通知' }],
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        agent: true,
        approvalScope: 'conv-test-approval',
      }),
    });

    const res = await handler(req);
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          if (chunk.includes('tool_approval_request')) {
            abortController.abort();
          }
        }
      } catch {
        // 中断引发流读取异常为预期行为
      }
    }

    expect(mocks.prismaAgentRunCreate).toHaveBeenCalledTimes(1);
    const createData = mocks.prismaAgentRunCreate.mock.calls[0][0].data;
    // 断言（计划变更 1）：审批挂起本身是有效终态（agent-runner「等待审批本身是有效终态」语义），
    // 挂起完成后的用户中断按 success 正常收尾；中断回调必然晚于同步执行的挂起段，partial 时序不可确定性构造。
    // 本用例锁定：挂起工具信息进入运行审计流水（TC04-3 的核心漂移修复点）
    expect(createData.outcome).toBe('success');
    expect(createData.toolCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'wh_notify',
        }),
      ])
    );
  });

  it('TC04-4: Planner 降级隔离，非流式入口 reject 时编排走无计划分支，全流程零外网调用且流正常收尾', async () => {
    const fakeSession = createFakeQuotaSession();
    mocks.quotaSessionReserveMock.mockResolvedValueOnce(fakeSession);

    const fetchSpy = vi.spyOn(global, 'fetch');

    const handler = createChatHandler({
      getAdapter: () => ({ name: 'doubao', stream: vi.fn() as any }),
    });

    // 显式特化非流式入口 reject（Planner 规划生成失败）
    generateTextMock.mockRejectedValueOnce(new Error('Planner 非流式调用上游异常'));

    // 流式入口正常输出回答
    streamTextMock.mockReturnValueOnce({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '无计划分支正常交付' };
      })(),
      toolCalls: Promise.resolve([]),
      usage: Promise.resolve({ inputTokens: 120, outputTokens: 80, totalTokens: 200 }),
      finishReason: Promise.resolve('stop'),
      response: Promise.resolve({ messages: [] }),
    });

    const req = new NextRequest('http://localhost:3030/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '请详细调研 2026 年多模态模型' }],
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        agent: true,
      }),
    });

    const res = await handler(req);
    expect(res.status).toBe(200);

    const events: Array<Record<string, unknown>> = [];
    const reader = res.body?.getReader();
    const decoder = new TextDecoder();
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const text = decoder.decode(value);
        for (const line of text.split('\n\n')) {
          const match = line.match(/^data:\s*(.*)$/);
          if (match && match[1]) {
            try {
              events.push(JSON.parse(match[1]));
            } catch {
              // 忽略非 JSON 行
            }
          }
        }
      }
    }

    // 1. 计划事件数 = 0（走无计划分支，不抛出 plan_created）
    const planEvents = events.filter((e) => e.type === 'plan_created');
    expect(planEvents).toHaveLength(0);

    // 2. 全流程零外网调用
    expect(fetchSpy).not.toHaveBeenCalled();

    // 3. 流正常收尾（正常结算与 done 事件下发）
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(events.some((e) => e.type === 'done')).toBe(true);

    fetchSpy.mockRestore();
  });
});
