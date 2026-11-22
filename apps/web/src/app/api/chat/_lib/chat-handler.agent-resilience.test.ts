/**
 * Agent 运行时连接韧性 HTTP 级测试（ADR-0061 / 工单 01）
 *
 * 只验证产品外部可观察行为：
 * - 首帧 run_attached 与 runId 归属；
 * - 客户端断开后运行继续到终态；
 * - run_attached 不进入共享事件日志；
 * - 普通对话不产生 run_attached。
 */
import { setupAiSdkMocks, streamTextMock } from './testing/mock-ai-sdk';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createChatHandler } from './chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { createRunRegistry, type RunRegistry } from './agent/run-registry';
import { createToolRegistry } from '@/lib/agent/registry';
import { parseChatStreamEvent } from '@repo/shared';

const {
  currentUserMock,
  rateLimiterMock,
  quotaSessionReserveMock,
  getAvailableQuotaMock,
  agentRunCreateMock,
  toolRegistryHolder,
} = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  rateLimiterMock: { check: vi.fn() },
  quotaSessionReserveMock: vi.fn(),
  getAvailableQuotaMock: vi.fn(),
  agentRunCreateMock: vi.fn(),
  toolRegistryHolder: { current: null as unknown },
}));

vi.mock('@repo/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/db')>();
  const prisma = new Proxy(actual.prisma, {
    get(target, prop, receiver) {
      if (prop === 'agentRun') return { create: agentRunCreateMock };
      return Reflect.get(target, prop, receiver);
    },
  });
  return { ...actual, prisma };
});
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: currentUserMock }));
vi.mock('@repo/redis', () => ({ getRateLimiter: () => rateLimiterMock }));
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: quotaSessionReserveMock },
}));
vi.mock('@/lib/billing/quota-service', () => ({
  getAvailableQuota: getAvailableQuotaMock,
}));
vi.mock('./agent/planner', () => ({
  generateAgentPlan: vi.fn().mockResolvedValue(null),
}));
vi.mock('./agent/tools', () => ({
  getDefaultToolRegistry: () => toolRegistryHolder.current,
}));

function makeFakeResult(opts: {
  textParts?: string[];
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  usage?: unknown;
}) {
  return {
    fullStream: (async function* () {
      for (const text of opts.textParts ?? []) {
        yield { type: 'text-delta', text };
      }
    })(),
    toolCalls: Promise.resolve(opts.toolCalls ?? []),
    usage: Promise.resolve(opts.usage ?? null),
    finishReason: Promise.resolve('stop'),
    response: Promise.resolve({ messages: [{ role: 'assistant', content: '决策步消息' }] }),
  };
}

function agentRequest(overrides: Record<string, unknown> = {}, signal?: AbortSignal) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '帮我看看这个网页' }],
      provider: 'xunfei',
      model: 'lite',
      agent: true,
      conversationId: 'conv-resilience',
      ...overrides,
    }),
    ...(signal ? { signal } : {}),
  });
}

function firstSseEvent(chunk: Uint8Array) {
  const text = new TextDecoder().decode(chunk);
  const block = text.split('\n\n').find((item) => item.startsWith('data:'));
  return block ? parseChatStreamEvent(JSON.parse(block.replace(/^data:\s*/, ''))) : null;
}

describe('Agent 运行时连接韧性（HTTP 级）', () => {
  let handler: ReturnType<typeof createChatHandler>;
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;
  let registry: RunRegistry;

  beforeEach(() => {
    vi.clearAllMocks();
    setupAiSdkMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    vi.stubEnv('DEEPSEEK_MODEL', 'test-deepseek-key');

    currentUserMock.mockResolvedValue({ id: 'test-user-id', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({
      allowed: true,
      remaining: 60,
      reset: Date.now() + 60000,
    });
    getAvailableQuotaMock.mockResolvedValue(100_000);
    agentRunCreateMock.mockResolvedValue({ id: 'agent-run-record' });

    fakeSession = createFakeQuotaSession({ outputLimit: 4096 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
    toolRegistryHolder.current = createToolRegistry([]);

    registry = createRunRegistry({ createRunId: () => 'run-resilience-1' });
    handler = createChatHandler({
      getAdapter: () => ({
        stream: async () =>
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
              controller.close();
            },
          }),
      }),
      runRegistry: registry,
    });
  });

  it('Agent 请求首帧为 run_attached（resumed=false），结束后注册表为 completed', async () => {
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['这是最终回答。'] }));

    const response = await handler(agentRequest());
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(firstSseEvent(first.value!)).toEqual({
      type: 'run_attached',
      runId: 'run-resilience-1',
      resumed: false,
    });

    // 消费剩余流直到结束
    let done = false;
    while (!done) {
      const next = await reader.read();
      done = Boolean(next.done);
    }

    expect(registry.inspect('run-resilience-1')?.status).toBe('completed');
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
  });

  it('客户端断开响应后，运行继续到终态且事件日志完整', async () => {
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ textParts: ['断开后仍要继续完成的任务。'] })
    );

    const response = await handler(agentRequest());
    const reader = response.body!.getReader();
    await reader.read();
    await reader.cancel();

    await vi.waitFor(
      () => {
        expect(registry.inspect('run-resilience-1')?.status).toBe('completed');
      },
      { timeout: 3000 }
    );

    const subscription = registry.subscribe('run-resilience-1', 'test-user-id', () => {})!;
    const frames = subscription.frames.map((frame) => new TextDecoder().decode(frame));
    expect(frames.length).toBeGreaterThan(0);
    expect(frames.some((frame) => frame.includes('run_attached'))).toBe(false);
    expect(frames.join('')).toContain('断开后仍要继续完成的任务。');
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
  });

  it('普通对话首帧不是 run_attached', async () => {
    const response = await handler(agentRequest({ agent: false }));
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(firstSseEvent(first.value!)?.type).not.toBe('run_attached');
    await reader.cancel();
  });

  it('主动中止在下一检查点停止，状态为 aborted 且只结算一次', async () => {
    let toolStartedResolve: (() => void) | undefined;
    const toolStarted = new Promise<void>((resolve) => {
      toolStartedResolve = resolve;
    });
    const execute = vi.fn(async (_args: unknown, ctx: { signal: AbortSignal }) => {
      toolStartedResolve?.();
      await new Promise((_resolve, reject) => {
        if (ctx.signal.aborted) {
          reject(new Error('aborted'));
          return;
        }
        ctx.signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
      return { ok: true, contentForModel: '', summaryForDisplay: '' };
    });
    toolRegistryHolder.current = createToolRegistry([
      {
        name: 'web_fetch',
        description: '抓取网页（测试替身）',
        parameters: z.object({ url: z.string() }),
        execute,
      },
    ]);
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [
          { toolCallId: 'call_abort', toolName: 'web_fetch', input: { url: 'https://example.com' } },
        ],
      })
    );

    const response = await handler(agentRequest());
    const reader = response.body!.getReader();
    await reader.read(); // run_attached
    await toolStarted;

    expect(registry.abort('run-resilience-1', 'test-user-id')).toEqual({ outcome: 'aborted' });
    await vi.waitFor(
      () => {
        expect(registry.inspect('run-resilience-1')?.status).toBe('aborted');
      },
      { timeout: 3000 }
    );
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    await reader.cancel();
  });

  it('同一进程内 runId 唯一且按会话可查询活跃运行', async () => {
    let seq = 0;
    registry = createRunRegistry({ createRunId: () => `run-${++seq}` });
    handler = createChatHandler({
      getAdapter: () => ({
        stream: async () => new ReadableStream<Uint8Array>({ start: (c) => c.close() }),
      }),
      runRegistry: registry,
    });
    streamTextMock
      .mockReturnValueOnce(makeFakeResult({ textParts: ['第一次'] }))
      .mockReturnValueOnce(makeFakeResult({ textParts: ['第二次'] }));

    const firstResponse = await handler(agentRequest());
    const firstReader = firstResponse.body!.getReader();
    await firstReader.read();

    expect(registry.getActiveByConversation('conv-resilience')).toEqual({
      runId: 'run-1',
      userId: 'test-user-id',
    });

    await firstReader.cancel();
    await vi.waitFor(() => expect(registry.inspect('run-1')?.status).toBe('completed'), {
      timeout: 3000,
    });

    const secondResponse = await handler(agentRequest());
    const secondReader = secondResponse.body!.getReader();
    await secondReader.read();
    expect(registry.getActiveByConversation('conv-resilience')).toEqual({
      runId: 'run-2',
      userId: 'test-user-id',
    });
    await secondReader.cancel();
  });
});
