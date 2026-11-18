import { describe, expect, it, vi } from 'vitest';
import { segmentForIndex } from '@repo/text';
import { processMemoryIndexJob } from './memory-index/processor';

describe('会话记忆增量索引 Worker (工单 09 / QA-005 / QA-006)', () => {
  const dummyVector = new Array(1024).fill(0.1);

  it('用户未开启会话记忆检索时严格跳过 (Opt-in 边界保障)', async () => {
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-disabled',
          memorySearchEnabled: false,
        }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      message: {
        findMany: vi.fn(),
      },
    } as any;

    const mockEmbedTexts = vi.fn();

    const result = await processMemoryIndexJob(
      { userId: 'user-disabled', sessionId: 'sess-1' },
      {
        prismaClient: mockDb,
        embedTextsFn: mockEmbedTexts,
      }
    );

    expect(result.success).toBe(true);
    expect(result.skipped).toBe(true);
    expect(result.chunkCount).toBe(0);
    expect(result.reason).toContain('用户未开启');
    expect(mockEmbedTexts).not.toHaveBeenCalled();
    expect(mockDb.message.findMany).not.toHaveBeenCalled();
  });

  it('增量水位线防漏防重：首轮对话索引成功，递增生成切片', async () => {
    const mockInsertedChunks: any[] = [];
    const mockInsertChunksFn = vi.fn(async (chunks) => {
      mockInsertedChunks.push(...chunks);
      return chunks.length;
    });

    const now = new Date();
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-enabled',
          memorySearchEnabled: true,
        }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue(null), // 暂无切片
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-1',
            sessionId: 'sess-watermark',
            role: 'user',
            content: '我的测试暗号是蓝色大象42',
            createdAt: new Date(now.getTime() - 10000),
          },
          {
            id: 'msg-2',
            sessionId: 'sess-watermark',
            role: 'assistant',
            content: '好的，我已经记住了您的暗号是蓝色大象42。',
            createdAt: new Date(now.getTime() - 5000),
          },
        ]),
      },
    } as any;

    const mockEmbedTexts = vi.fn().mockResolvedValue([dummyVector]);

    const result = await processMemoryIndexJob(
      { userId: 'user-enabled', sessionId: 'sess-watermark' },
      {
        prismaClient: mockDb,
        embedTextsFn: mockEmbedTexts,
        insertChunksFn: mockInsertChunksFn,
      }
    );

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBe(1);
    expect(mockEmbedTexts).toHaveBeenCalledTimes(1);
    expect(mockEmbedTexts.mock.calls[0]?.[0]).toEqual(
      mockInsertedChunks.map((chunk: any) => chunk.content)
    );
    expect(mockEmbedTexts.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ feature: 'memory-index' })
    );
    expect(mockInsertChunksFn).toHaveBeenCalled();
    expect(mockInsertedChunks[0].content).toContain('蓝色大象42');
    expect(mockInsertedChunks[0].chunkIndex).toBe(0);
    expect(mockInsertedChunks[0].contentSegmented).toBe(
      segmentForIndex(mockInsertedChunks[0].content)
    );
  });

  it('连续多轮对话后：第二轮只索引新消息，无重复切片、无遗漏消息', async () => {
    const t0 = new Date('2026-10-23T10:00:00Z');
    const t1 = new Date('2026-10-23T10:01:00Z');
    const t2 = new Date('2026-10-23T10:02:00Z');

    const mockInsertedChunks: any[] = [];
    const mockInsertChunksFn = vi.fn(async (chunks) => {
      mockInsertedChunks.push(...chunks);
      return chunks.length;
    });

    // 假设已存在第 0 块切片（已索引到 msg-1, msg-2）
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-enabled',
          memorySearchEnabled: true,
        }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue({
          chunkIndex: 0,
          metadata: { lastIndexedMessageCreatedAt: t1.toISOString() },
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            messageId: 'msg-2',
            metadata: { lastIndexedMessageCreatedAt: t1.toISOString() },
          },
        ]),
      },
      message: {
        findMany: vi.fn().mockImplementation(({ where }) => {
          // 模拟数据库 where createdAt > t1
          const allNew = [
            {
              id: 'msg-3',
              sessionId: 'sess-multi',
              role: 'user',
              content: '请问我们刚才说的暗号是什么？',
              createdAt: t2,
            },
          ];
          if (where.createdAt?.gt) {
            return allNew.filter((m) => m.createdAt > where.createdAt.gt);
          }
          return allNew;
        }),
      },
    } as any;

    const mockEmbedTexts = vi.fn().mockResolvedValue([dummyVector]);

    const result = await processMemoryIndexJob(
      { userId: 'user-enabled', sessionId: 'sess-multi' },
      {
        prismaClient: mockDb,
        embedTextsFn: mockEmbedTexts,
        insertChunksFn: mockInsertChunksFn,
      }
    );

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBe(1);
    expect(mockInsertChunksFn).toHaveBeenCalled();
    // 验证新切片 chunkIndex 递增为 1
    expect(mockInsertedChunks[0].chunkIndex).toBe(1);
    expect(mockInsertedChunks[0].content).toContain('刚才说的暗号是什么');
    // 验证查库时传入了水位线大于时间过滤
    expect(mockDb.message.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gt: t1 },
        }),
      })
    );
  });

  it('若无高于水位线的新消息，直接跳过处理且不调用向量化', async () => {
    const t1 = new Date('2026-10-23T10:01:00Z');

    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-enabled',
          memorySearchEnabled: true,
        }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue({
          chunkIndex: 0,
          metadata: { lastIndexedMessageCreatedAt: t1.toISOString() },
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            messageId: 'msg-2',
            metadata: { lastIndexedMessageCreatedAt: t1.toISOString() },
          },
        ]),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([]), // 无新消息
      },
    } as any;

    const mockEmbedTexts = vi.fn();

    const result = await processMemoryIndexJob(
      { userId: 'user-enabled', sessionId: 'sess-empty' },
      {
        prismaClient: mockDb,
        embedTextsFn: mockEmbedTexts,
      }
    );

    expect(result.success).toBe(true);
    expect(result.chunkCount).toBe(0);
    expect(result.reason).toContain('无未索引的新消息');
    expect(mockEmbedTexts).not.toHaveBeenCalled();
  });

  it('补派发：插入后发现高于水位线的新消息时返回 needsCatchup=true', async () => {
    const now = new Date();
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-enabled', memorySearchEnabled: true }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-1',
            sessionId: 'sess-catchup',
            role: 'user',
            content: '第一轮问题',
            createdAt: new Date(now.getTime() - 2000),
          },
          {
            id: 'msg-2',
            sessionId: 'sess-catchup',
            role: 'assistant',
            content: '第一轮回答',
            createdAt: new Date(now.getTime() - 1000),
          },
        ]),
        findFirst: vi.fn().mockResolvedValue({ id: 'msg-3' }),
      },
    } as any;

    const result = await processMemoryIndexJob(
      { userId: 'user-enabled', sessionId: 'sess-catchup' },
      {
        prismaClient: mockDb,
        embedTextsFn: vi.fn().mockResolvedValue([dummyVector]),
        insertChunksFn: vi.fn(async (chunks) => chunks.length),
      }
    );

    expect(result.needsCatchup).toBe(true);
    expect(mockDb.message.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId: 'sess-catchup',
          createdAt: { gt: expect.any(Date) },
        },
      })
    );
  });

  it('补派发：没有更高水位线的新消息时返回 needsCatchup=false', async () => {
    const now = new Date();
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-enabled', memorySearchEnabled: true }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-1',
            sessionId: 'sess-catchup-2',
            role: 'user',
            content: '第一轮问题',
            createdAt: new Date(now.getTime() - 2000),
          },
          {
            id: 'msg-2',
            sessionId: 'sess-catchup-2',
            role: 'assistant',
            content: '第一轮回答',
            createdAt: new Date(now.getTime() - 1000),
          },
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any;

    const result = await processMemoryIndexJob(
      { userId: 'user-enabled', sessionId: 'sess-catchup-2' },
      {
        prismaClient: mockDb,
        embedTextsFn: vi.fn().mockResolvedValue([dummyVector]),
        insertChunksFn: vi.fn(async (chunks) => chunks.length),
      }
    );

    expect(result.needsCatchup).toBe(false);
  });

  it('切片写入守卫返回 0 时标记 skipped 且不补派发', async () => {
    const now = new Date();
    const mockDb = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'user-enabled', memorySearchEnabled: true }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-1',
            sessionId: 'sess-race',
            role: 'user',
            content: '关闭期间的问题',
            createdAt: new Date(now.getTime() - 2000),
          },
          {
            id: 'msg-2',
            sessionId: 'sess-race',
            role: 'assistant',
            content: '关闭期间的回答',
            createdAt: new Date(now.getTime() - 1000),
          },
        ]),
        findFirst: vi.fn().mockResolvedValue({ id: 'msg-3' }),
      },
    } as any;

    const result = await processMemoryIndexJob(
      { userId: 'user-enabled', sessionId: 'sess-race' },
      {
        prismaClient: mockDb,
        embedTextsFn: vi.fn().mockResolvedValue([dummyVector]),
        insertChunksFn: vi.fn().mockResolvedValue(0),
      }
    );

    expect(result.skipped).toBe(true);
    expect(result.chunkCount).toBe(0);
    expect(result.needsCatchup).toBe(false);
    expect(result.reason).toContain('关闭');
  });
});
