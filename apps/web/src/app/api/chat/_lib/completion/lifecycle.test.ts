import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatCompletionLifecycle } from './lifecycle';
import type { ChatCompletionContext } from './types';
import type { ChatStreamFinish } from '../types';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';

describe('ChatCompletionLifecycle 单元测试矩阵 (TC07 / ADR-0051)', () => {
  let mockPrisma: any;
  let mockLogger: any;
  let mockFlushObservability: any;
  let mockMemoryQueue: any;
  let mockDetectSensitiveTopic: any;
  let mockPersistMemoryTurn: any;

  beforeEach(() => {
    mockPrisma = {
      agentRun: {
        create: vi.fn().mockResolvedValue({ id: 'agent-run-123' }),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ memorySearchEnabled: true }),
      },
    };

    mockLogger = {
      warn: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    mockFlushObservability = vi.fn().mockResolvedValue(undefined);

    mockMemoryQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-123' }),
    };

    mockDetectSensitiveTopic = vi.fn().mockReturnValue(null);
    mockPersistMemoryTurn = vi.fn().mockResolvedValue({ persisted: true });
  });

  function createTestContext(overrides?: Partial<ChatCompletionContext>): {
    context: ChatCompletionContext;
    fakeSession: ReturnType<typeof createFakeQuotaSession>;
  } {
    const fakeSession = createFakeQuotaSession({
      settlementResult: { settled: true, settledUnits: 200 },
    });

    const context: ChatCompletionContext = {
      userId: 'user-001',
      requestId: 'req-001',
      errorId: 'err-001',
      conversationId: 'conv-001',
      turnId: 'user-turn-001',
      effectiveProvider: 'deepseek',
      modelName: 'deepseek-chat',
      messages: [
        { role: 'user', content: '请帮我写一段测试代码' },
        { role: 'assistant', content: '好的' },
      ],
      reservedSession: fakeSession as any,
      memorySearchEnabled: true,
      agentContext: {
        enabled: true,
        activeCapabilityPack: { key: 'research-pack' },
      },
      ...overrides,
    };

    return { context, fakeSession };
  }

  function createTestFinish(overrides?: Partial<ChatStreamFinish>): ChatStreamFinish {
    return {
      outcome: 'success',
      usage: { promptTokens: 100, completionTokens: 100, totalTokens: 200 },
      outputText: '这是测试输出文本',
      steps: 2,
      toolCalls: [
        {
          id: 'call-1',
          name: 'web-search',
          argsSummary: '{"q":"test"}',
          status: 'success',
          summary: 'search done',
          durationMs: 50,
        },
      ],
      artifactRefs: [],
      durationMs: 1200,
      ...overrides,
    };
  }

  // ==========================================
  // 断言 1: 重复完成幂等 (TC07-1)
  // ==========================================
  it('TC07-1: 重复完成幂等：第二次 complete 为 no-op，结算与落库调用计数不增，且输出结构化告警一条', async () => {
    const { context, fakeSession } = createTestContext();
    const finish1 = createTestFinish({ outcome: 'success' });
    const finish2 = createTestFinish({ outcome: 'failed' });

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    // 第一次完成
    const summary1 = await lifecycle.complete(context, finish1);
    expect(summary1.settled).toBe(true);
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(mockPrisma.agentRun.create).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledTimes(0);

    // 第二次完成 (重复完成)
    const summary2 = await lifecycle.complete(context, finish2);

    // 副作用计数不增
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(mockPrisma.agentRun.create).toHaveBeenCalledTimes(1);
    expect(mockFlushObservability).toHaveBeenCalledTimes(1);
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);

    // 返回相同 summary
    expect(summary2).toEqual(summary1);

    // 输出结构化告警一条（带 requestId 与双终态）
    expect(mockLogger.warn).toHaveBeenCalledTimes(1);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[chat] 重复完成调用被忽略',
      expect.objectContaining({
        requestId: 'req-001',
        initialOutcome: 'success',
        duplicateOutcome: 'failed',
      })
    );
  });

  // ==========================================
  // 断言 2: 副作用严格同步顺序契约 (TC07-2)
  // ==========================================
  it('TC07-2: 副作用顺序：合规前置，结算先于审计落库，观测 flush 先于记忆派发', async () => {
    const callSequence: string[] = [];

    mockDetectSensitiveTopic.mockImplementation(() => {
      callSequence.push('detect_safety');
      return 'politics';
    });

    const fakeSession = {
      finalize: vi.fn().mockImplementation(async (_outcome, ctx) => {
        callSequence.push('finalize_settle');
        // 验证合规安全标记在 finalize 前已置入元数据
        expect(ctx.metadata.safetyFlag).toBe('politics');
        return { settled: true, settledUnits: 250 };
      }),
      release: vi.fn(),
    };

    mockPrisma.agentRun.create.mockImplementation(async () => {
      callSequence.push('agent_run_persist');
      return { id: 'run-seq-1' };
    });

    mockFlushObservability.mockImplementation(async () => {
      callSequence.push('observability_flush');
    });

    mockPersistMemoryTurn.mockImplementation(async () => {
      callSequence.push('memory_persist');
      return { persisted: true };
    });

    mockMemoryQueue.add.mockImplementation(async () => {
      callSequence.push('memory_dispatch');
      return { id: 'job-1' };
    });

    const { context } = createTestContext({
      reservedSession: fakeSession as any,
    });
    const finish = createTestFinish();

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summary = await lifecycle.complete(context, finish);

    expect(callSequence).toEqual([
      'detect_safety',
      'finalize_settle',
      'agent_run_persist',
      'memory_persist',
      'observability_flush',
      'memory_dispatch',
    ]);
    expect(summary.sideEffects.safetyFlag).toBe('politics');
  });

  // ==========================================
  // 断言 3: 落库失败不阻断后续 (TC07-3)
  // ==========================================
  it('TC07-3: 落库失败不阻断：落库抛错时观测 flush 与记忆派发仍执行，complete 不 reject', async () => {
    mockPrisma.agentRun.create.mockRejectedValue(new Error('Prisma database connection error'));

    const { context, fakeSession } = createTestContext();
    const finish = createTestFinish();

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    let summary;
    await expect(
      (async () => {
        summary = await lifecycle.complete(context, finish);
        return summary;
      })()
    ).resolves.toBeDefined();

    // 结算已完成
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    // 落库失败但记录了警告
    expect(summary!.sideEffects.agentRunPersisted).toBe(false);
    expect(summary!.agentRunId).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[chat] agent_runs 记录落盘失败 (容错不阻断):',
      expect.any(Error)
    );
    // 观测 flush 与记忆派发仍执行
    expect(mockFlushObservability).toHaveBeenCalledTimes(1);
    expect(summary!.sideEffects.observabilityFlushed).toBe(true);
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);
    expect(summary!.sideEffects.memoryJobDispatched).toBe(true);
  });

  // ==========================================
  // 断言 4: 观测 flush 超时熔断 (TC07-4)
  // ==========================================
  it('TC07-4: 观测 flush 超时熔断：flush 挂起超过设定期限被熔断，记忆派发仍执行', async () => {
    // 模拟挂起 2000ms 的 flushObservability
    mockFlushObservability.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 2000))
    );

    const { context } = createTestContext();
    const finish = createTestFinish();

    // 设定 50ms 熔断超时（模拟 500ms 熔断机制，保证单测高频快速运行）
    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
      flushTimeoutMs: 50,
    });

    const startTime = Date.now();
    const summary = await lifecycle.complete(context, finish);
    const duration = Date.now() - startTime;

    // 总耗时应远小于 2000ms，在 50~200ms 间
    expect(duration).toBeLessThan(800);
    expect(summary.sideEffects.observabilityFlushed).toBe(false);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[chat] 观测事件刷新超时熔断或失败 (容错不阻断):',
      expect.any(Error)
    );

    // 记忆派发仍正常执行
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);
    expect(summary.sideEffects.memoryJobDispatched).toBe(true);
  });

  // ==========================================
  // 断言 5: 非法终态降级 (TC07-5)
  // ==========================================
  it('TC07-5: 非法终态降级：未知 outcome 按失败处理并驱动释放恰一次', async () => {
    const mockRelease = vi.fn().mockResolvedValue(undefined);
    const fakeSession = {
      finalize: vi.fn().mockImplementation(async (outcome: string, ctx: any) => {
        if (outcome === 'failed') {
          await mockRelease({ reason: ctx.reason ?? '流式失败', meterType: 'tokens' });
          return { settled: true, settledUnits: 0 };
        }
        return { settled: true, settledUnits: 100 };
      }),
      release: mockRelease,
    };

    const { context } = createTestContext({
      reservedSession: fakeSession as any,
    });
    // 传入未知的非法 outcome
    const finish = createTestFinish({
      outcome: 'invalid_outcome_status' as any,
    });

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summary = await lifecycle.complete(context, finish);

    // 记录降级告警
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[chat] 未知完成终态，已降级为 failed',
      expect.objectContaining({
        requestId: 'req-001',
        rawOutcome: 'invalid_outcome_status',
      })
    );

    // finalize 接收到的 outcome 为 failed
    expect(fakeSession.finalize).toHaveBeenCalledWith(
      'failed',
      expect.objectContaining({ requestId: 'req-001' })
    );

    // 驱动配额释放恰好一次
    expect(mockRelease).toHaveBeenCalledTimes(1);
    expect(summary.settled).toBe(true);
    expect(summary.settledUnits).toBe(0);

    // 落库时 outcome 记录为 failed 且 quotaCost 为 0
    expect(mockPrisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: 'failed',
          quotaCost: 0,
        }),
      })
    );
  });

  // ==========================================
  // 断言 6: 非 Agent 模式携带审计字段静默告警忽略 (TC07-6)
  // ==========================================
  it('TC07-6: 非 Agent 模式携带审计字段：静默告警忽略且不落库', async () => {
    const { context } = createTestContext({
      agentContext: { enabled: false }, // 非 Agent 模式
    });

    // finish 携带多步工具审计字段
    const finish = createTestFinish({
      steps: 4,
      toolCalls: [
        {
          id: 'call-2',
          name: 'tool',
          argsSummary: '{}',
          status: 'success',
          summary: 'done',
        },
      ],
      durationMs: 800,
    });

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summary = await lifecycle.complete(context, finish);

    // 不落库
    expect(mockPrisma.agentRun.create).toHaveBeenCalledTimes(0);
    expect(summary.sideEffects.agentRunPersisted).toBe(false);

    // 记录静默忽略告警
    expect(mockLogger.warn).toHaveBeenCalledWith(
      '[chat] 非 Agent 模式携带审计字段，已忽略不落库',
      expect.objectContaining({ requestId: 'req-001' })
    );
  });

  // ==========================================
  // 断言 7: AgentRun 配额成本消费结算结果 (TC07-7)
  // ==========================================
  it('TC07-7: AgentRun 配额成本消费结算结果：假会话返回固定结算额时落库 quotaCost 与之相等，未闭环记 0', async () => {
    // 场景 A: 结算成功，返回固定 666 单位
    const fakeSessionA = createFakeQuotaSession({
      settlementResult: { settled: true, settledUnits: 666 },
    });
    const { context: contextA } = createTestContext({
      reservedSession: fakeSessionA as any,
    });
    const finishA = createTestFinish({ outcome: 'success' });

    const lifecycleA = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summaryA = await lifecycleA.complete(contextA, finishA);
    expect(summaryA.settledUnits).toBe(666);
    expect(mockPrisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quotaCost: 666,
        }),
      })
    );

    // 场景 B: 底层结算物理失败 (settled: false)
    mockPrisma.agentRun.create.mockClear();
    const fakeSessionB = createFakeQuotaSession({
      settlementResult: { settled: false, settledUnits: 666 },
    });
    const { context: contextB } = createTestContext({
      reservedSession: fakeSessionB as any,
    });
    const finishB = createTestFinish({ outcome: 'success' });

    const lifecycleB = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summaryB = await lifecycleB.complete(contextB, finishB);
    expect(summaryB.settled).toBe(false);
    // settled=false 时 quotaCost 诚实记为 0
    expect(mockPrisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          quotaCost: 0,
        }),
      })
    );
  });

  // ==========================================
  // 断言 8: 完成摘要暴露各副作用成败标记 (TC07-8)
  // ==========================================
  it('TC07-8: 完成摘要暴露各副作用成败标记', async () => {
    mockDetectSensitiveTopic.mockReturnValue('sensitive_token');

    const fakeSession = createFakeQuotaSession({
      settlementResult: { settled: true, settledUnits: 320 },
    });

    const { context } = createTestContext({
      reservedSession: fakeSession as any,
      memorySearchEnabled: true,
      agentContext: { enabled: true },
    });
    const finish = createTestFinish();

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summary = await lifecycle.complete(context, finish);

    expect(summary).toMatchObject({
      settled: true,
      settledUnits: 320,
      agentRunId: 'agent-run-123',
      sideEffects: {
        safetyFlag: 'sensitive_token',
        quotaSettled: true,
        agentRunPersisted: true,
        observabilityFlushed: true,
        memoryJobDispatched: true,
      },
    });
  });

  // ==========================================
  // 额外场景: 契约违例 fail-fast 检验
  // ==========================================
  it('契约违例 fail-fast: 空上下文或缺少关键字段时抛出 TypeError', async () => {
    const lifecycle = new ChatCompletionLifecycle();
    const finish = createTestFinish();

    await expect(lifecycle.complete(null as any, finish)).rejects.toThrow(TypeError);
    await expect(
      lifecycle.complete({ userId: 'u1' } as any, finish)
    ).rejects.toThrow(TypeError);
    await expect(
      lifecycle.complete(
        { userId: 'u1', requestId: 'r1', reservedSession: {} } as any,
        null as any
      )
    ).rejects.toThrow(TypeError);
  });

  // ==========================================
  // 额外场景: memorySearchEnabled 缺省时单查用户表兜底
  // ==========================================
  it('memorySearchEnabled 缺省时单查用户表兜底', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ memorySearchEnabled: true });

    const { context } = createTestContext({
      memorySearchEnabled: undefined, // 未显式传
      conversationId: 'c-999',
    });
    const finish = createTestFinish();

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    const summary = await lifecycle.complete(context, finish);
    expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
      where: { id: 'user-001' },
      select: { memorySearchEnabled: true },
    });
    expect(summary.sideEffects.memoryJobDispatched).toBe(true);
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 额外场景: goalText 提取与截断 (2000字上限与无user消息兜底)
  // ==========================================
  it('AgentRun goalText 提取：取最后一条 user 消息并截取 2000 字符，无 user 消息时兜底为无目标文本', async () => {
    const longPrompt = 'A'.repeat(2500);
    const { context: contextLong } = createTestContext({
      messages: [
        { role: 'user', content: longPrompt },
        { role: 'assistant', content: '好的' },
      ],
    });
    const finish = createTestFinish();

    const lifecycle = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });

    await lifecycle.complete(contextLong, finish);
    expect(mockPrisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          goalText: 'A'.repeat(2000),
        }),
      })
    );

    // 无 user 消息
    mockPrisma.agentRun.create.mockClear();
    const { context: contextNoUser } = createTestContext({
      messages: [{ role: 'system', content: '系统提示词' }],
    });
    const lifecycle2 = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      persistMemoryTurnFn: mockPersistMemoryTurn,
      detectSensitiveTopic: mockDetectSensitiveTopic,
    });
    await lifecycle2.complete(contextNoUser, finish);
    expect(mockPrisma.agentRun.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          goalText: '无目标文本',
        }),
      })
    );
  });
});
