import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  class SegmentationUnavailableError extends Error {
    constructor(message = 'mock segmentation unavailable') {
      super(message);
      this.name = 'SegmentationUnavailableError';
    }
  }
  return {
    SegmentationUnavailableError,
    segmentForIndex: vi.fn(() => {
      throw new SegmentationUnavailableError();
    }),
    embedTexts: vi.fn(async (values: string[]) =>
      values.map(() => new Array(1024).fill(0.1))
    ),
  };
});

vi.mock('@repo/text', () => ({
  SegmentationUnavailableError: mocks.SegmentationUnavailableError,
  segmentForIndex: mocks.segmentForIndex,
  embedTexts: mocks.embedTexts,
}));

import { processMemoryIndexJob } from './memory-index/processor';

describe('会话记忆索引端分词失败语义 (TC05)', () => {
  it('TC05-3 分词器不可用时 processMemoryIndexJob 拒绝并传播 SegmentationUnavailableError', async () => {
    const now = new Date();
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'user-enabled',
          memorySearchEnabled: true,
        }),
      },
      conversationMemoryChunk: {
        findFirst: vi.fn().mockResolvedValue(null),
        findMany: vi.fn().mockResolvedValue([]),
      },
      message: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'msg-1',
            sessionId: 'sess-failure',
            role: 'user',
            content: '连败熔断机制说明',
            createdAt: new Date(now.getTime() - 10000),
          },
          {
            id: 'msg-2',
            sessionId: 'sess-failure',
            role: 'assistant',
            content: '已记录连败熔断机制。',
            createdAt: new Date(now.getTime() - 5000),
          },
        ]),
      },
    } as any;

    const insertChunks = vi.fn();

    await expect(
      processMemoryIndexJob(
        { userId: 'user-enabled', sessionId: 'sess-failure' },
        {
          prismaClient: db,
          embedTextsFn: mocks.embedTexts as any,
          insertChunksFn: insertChunks,
        }
      )
    ).rejects.toBeInstanceOf(mocks.SegmentationUnavailableError);

    expect(mocks.embedTexts).toHaveBeenCalledTimes(1);
    expect(mocks.segmentForIndex).toHaveBeenCalled();
    expect(insertChunks).toHaveBeenCalledTimes(0);
  });
});
