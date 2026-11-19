import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatCompletionLifecycle } from './lifecycle';
import type { ChatCompletionContext } from './types';
import type { ChatStreamFinish } from '../types';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';

describe('ChatCompletionLifecycle 记忆输入持久化 (ADR-0058)', () => {
  let mockPrisma: any;
  let mockLogger: any;
  let mockFlushObservability: any;
  let mockMemoryQueue: any;
  let mockDetectSensitiveTopic: any;
  let mockPersistMemoryTurn: any;

  beforeEach(() => {
    mockPrisma = {
      agentRun: { create: vi.fn().mockResolvedValue({ id: 'agent-run-1' }) },
      user: { findUnique: vi.fn().mockResolvedValue({ memorySearchEnabled: true }) },
    };
    mockLogger = { warn: vi.fn(), error: vi.fn(), info: vi.fn() };
    mockFlushObservability = vi.fn().mockResolvedValue(undefined);
    mockMemoryQueue = { add: vi.fn().mockResolvedValue({ id: 'job-1' }) };
    mockDetectSensitiveTopic = vi.fn().mockReturnValue(null);
    mockPersistMemoryTurn = vi.fn().mockResolvedValue({ persisted: true });
  });

  function createContext(overrides: Partial<ChatCompletionContext> = {}): ChatCompletionContext {
    return {
      userId: 'user-1',
      requestId: 'req-1',
      errorId: 'err-1',
      conversationId: 'conv-1',
      turnId: 'user-1700000000000',
      effectiveProvider: 'deepseek',
      modelName: 'deepseek-chat',
      messages: [
        { role: 'assistant', content: '上一轮回答' },
        { role: 'user', content: '暗号是蓝鲸58' },
      ],
      reservedSession: createFakeQuotaSession({
        settlementResult: { settled: true, settledUnits: 10 },
      }) as any,
      memorySearchEnabled: true,
      agentContext: { enabled: false },
      ...overrides,
    };
  }

  function createFinish(overrides: Partial<ChatStreamFinish> = {}): ChatStreamFinish {
    return {
      outcome: 'success',
      usage: null,
      outputText: '我记住了蓝鲸58',
      ...overrides,
    };
  }

  function createLifecycle(): ChatCompletionLifecycle {
    return new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: mockMemoryQueue,
      detectSensitiveTopic: mockDetectSensitiveTopic,
      persistMemoryTurnFn: mockPersistMemoryTurn,
    });
  }

  it('TC01-1: 记忆开启且正文完整时写入本轮 user/assistant 并派发', async () => {
    const summary = await createLifecycle().complete(createContext(), createFinish());

    expect(mockPersistMemoryTurn).toHaveBeenCalledTimes(1);
    expect(mockPersistMemoryTurn).toHaveBeenCalledWith({
      userId: 'user-1',
      sessionId: 'conv-1',
      turnId: 'user-1700000000000',
      requestId: 'req-1',
      userContent: '暗号是蓝鲸58',
      assistantContent: '我记住了蓝鲸58',
    });
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);
    expect(summary.sideEffects.memoryPersisted).toBe(true);
    expect(summary.sideEffects.memoryJobDispatched).toBe(true);
  });

  it('TC01-2: 记忆关闭时不写消息也不派发', async () => {
    const summary = await createLifecycle().complete(
      createContext({ memorySearchEnabled: false }),
      createFinish()
    );

    expect(mockPersistMemoryTurn).not.toHaveBeenCalled();
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
    expect(summary.sideEffects.memoryPersisted).toBe(false);
    expect(summary.sideEffects.memoryJobDispatched).toBe(false);
  });

  it('TC01-3: 纯附件空文本轮次不写消息也不派发', async () => {
    await createLifecycle().complete(
      createContext({ messages: [{ role: 'user', content: '' }] }),
      createFinish()
    );

    expect(mockPersistMemoryTurn).not.toHaveBeenCalled();
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
  });

  it('TC01-4: 失败且无正文的轮次不写消息也不派发', async () => {
    await createLifecycle().complete(
      createContext(),
      createFinish({ outcome: 'failed', outputText: '' })
    );

    expect(mockPersistMemoryTurn).not.toHaveBeenCalled();
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
  });

  it('TC01-5: partial 且正文非空时按原文写入并派发', async () => {
    await createLifecycle().complete(
      createContext(),
      createFinish({ outcome: 'partial', outputText: '截断回答' })
    );

    expect(mockPersistMemoryTurn).toHaveBeenCalledWith(
      expect.objectContaining({ assistantContent: '截断回答' })
    );
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);
  });

  it('TC01-6: user 正文仅空白时不写消息也不派发', async () => {
    await createLifecycle().complete(
      createContext({ messages: [{ role: 'user', content: '   \n ' }] }),
      createFinish()
    );

    expect(mockPersistMemoryTurn).not.toHaveBeenCalled();
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
  });

  it('TC01-7: conversationId 或缺 turnId 时不写消息也不派发', async () => {
    await createLifecycle().complete(createContext({ conversationId: null }), createFinish());
    await createLifecycle().complete(createContext({ turnId: undefined }), createFinish());

    expect(mockPersistMemoryTurn).not.toHaveBeenCalled();
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
  });

  it('TC02-1: 重复完成只写入一次并只派发一次', async () => {
    const lifecycle = createLifecycle();
    const context = createContext();

    await lifecycle.complete(context, createFinish());
    await lifecycle.complete(context, createFinish());

    expect(mockPersistMemoryTurn).toHaveBeenCalledTimes(1);
    expect(mockMemoryQueue.add).toHaveBeenCalledTimes(1);
  });

  it('TC02-3: 跨用户会话冲突不派发，日志不包含正文', async () => {
    mockPersistMemoryTurn.mockResolvedValue({
      persisted: false,
      reason: 'session_owned_by_other_user',
    });

    await createLifecycle().complete(createContext(), createFinish());

    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
    const serialized = JSON.stringify(mockLogger.warn.mock.calls);
    expect(serialized).toContain('session_owned_by_other_user');
    expect(serialized).toContain('conv-1');
    expect(serialized).not.toContain('蓝鲸58');
  });

  it('TC02-4: 持久化失败不派发且不抛出', async () => {
    mockPersistMemoryTurn.mockRejectedValue(new Error('db down'));

    const summary = await createLifecycle().complete(createContext(), createFinish());

    expect(summary.sideEffects.memoryPersisted).toBe(false);
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('TC02-5: 持久化发生在记忆派发之前', async () => {
    const sequence: string[] = [];
    mockPersistMemoryTurn.mockImplementation(async () => {
      sequence.push('persist');
      return { persisted: true };
    });
    mockMemoryQueue.add.mockImplementation(async () => {
      sequence.push('dispatch');
      return { id: 'job-1' };
    });

    await createLifecycle().complete(createContext(), createFinish());

    expect(sequence).toEqual(['persist', 'dispatch']);
  });

  it('TC10-1: 同一会话的两轮完成使用同一个延迟任务 jobId', async () => {
    const jobIds = new Set<string>();
    const dedupeQueue = {
      add: vi.fn(async (_name: string, _data: unknown, options: { jobId: string }) => {
        jobIds.add(options.jobId);
        return { id: options.jobId };
      }),
    };

    const first = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: dedupeQueue,
      detectSensitiveTopic: mockDetectSensitiveTopic,
      persistMemoryTurnFn: mockPersistMemoryTurn,
    });
    const second = new ChatCompletionLifecycle({
      prisma: mockPrisma,
      logger: mockLogger,
      flushObservability: mockFlushObservability,
      memoryIndexQueue: dedupeQueue,
      detectSensitiveTopic: mockDetectSensitiveTopic,
      persistMemoryTurnFn: mockPersistMemoryTurn,
    });

    await first.complete(
      createContext({ turnId: 'user-a', requestId: 'req-a' }),
      createFinish()
    );
    await second.complete(
      createContext({ turnId: 'user-b', requestId: 'req-b' }),
      createFinish()
    );

    expect(dedupeQueue.add).toHaveBeenCalledTimes(2);
    expect([...jobIds]).toEqual(['memory-index-conv-1']);
  });

  it('TC11-1: 对比模式（无 conversationId）不写不派发', async () => {
    const summary = await createLifecycle().complete(
      createContext({ conversationId: null, agentContext: { enabled: false } }),
      createFinish()
    );

    expect(mockPersistMemoryTurn).not.toHaveBeenCalled();
    expect(mockMemoryQueue.add).not.toHaveBeenCalled();
    expect(summary.sideEffects.memoryPersisted).toBe(false);
  });
});
