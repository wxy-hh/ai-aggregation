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

const mocks = vi.hoisted(() => {
  process.env.ARK_API_KEY = 'test-ark-key-32-bytes-long-for-test!';
  process.env.DEEPSEEK_MODEL = 'test-deepseek-key-32-bytes-long!';
  return {
    currentUser: { id: 'user_agent_run_test', role: 'user' },
    rateLimiter: { check: vi.fn().mockResolvedValue({ allowed: true }) },
    prismaAgentRunCreate: vi.fn(),
    quotaSessionReserveMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: vi.fn(async () => mocks.currentUser),
}));

vi.mock('@repo/redis', () => ({
  getRateLimiter: () => mocks.rateLimiter,
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

describe('agent-runs 事务落盘集成测试 (ADR-0015 / 工单 02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAiSdkMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    vi.stubEnv('DEEPSEEK_MODEL', 'test-deepseek-key');
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
});
