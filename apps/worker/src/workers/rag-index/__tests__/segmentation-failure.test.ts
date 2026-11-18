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
    segmentForQuery: vi.fn(() => null),
    embedTexts: vi.fn(async () => []),
  };
});

vi.mock('@repo/text', () => ({
  SegmentationUnavailableError: mocks.SegmentationUnavailableError,
  segmentForIndex: mocks.segmentForIndex,
  segmentForQuery: mocks.segmentForQuery,
  embedTexts: mocks.embedTexts,
}));

import { DocumentParseError, parseDocument } from '../parser';
import { processRagIndexJob } from '../processor';

describe('RAG 索引端分词失败语义 (TC02)', () => {
  it('TC02-3 分词器不可用时 Markdown 解析拒绝并抛出致命 DocumentParseError', async () => {
    try {
      await parseDocument(Buffer.from('# 标题\n连败熔断机制说明。', 'utf-8'), 'test.md', 'md');
      expect.unreachable('分词不可用时不应解析成功');
    } catch (error) {
      expect(error).toBeInstanceOf(DocumentParseError);
      expect((error as DocumentParseError).isFatal).toBe(true);
    }
  });

  it('TC02-4 同一故障经处理器处理时文档状态更新为 failed 恰好 1 次', async () => {
    const { result, update } = await runProcessorWithSegmentationFailure();
    expect(result.success).toBe(false);
    const failedCalls = update.mock.calls.filter(
      (call) => call[0]?.data?.status === 'failed'
    );
    expect(failedCalls).toHaveLength(1);
  });

  it('TC02-5 同一故障的失败载荷 errorMessage 包含中文「分词」', async () => {
    const { update } = await runProcessorWithSegmentationFailure();
    const failedCall = update.mock.calls.find(
      (call) => call[0]?.data?.status === 'failed'
    );
    expect(String(failedCall?.[0]?.data?.errorMessage)).toContain('分词');
  });

  it('TC02-6 同一故障的处理器返回 isFatal=true 且不向外抛出错误', async () => {
    const { result } = await runProcessorWithSegmentationFailure();
    expect(result.isFatal).toBe(true);
  });
});

async function runProcessorWithSegmentationFailure() {
  const update = vi.fn(async (..._args: any[]) => undefined);
  const replaceChunks = vi.fn();
  const db = {
    document: {
      findUnique: vi.fn(async () => ({
        id: 'doc_1',
        status: 'pending',
        deletedAt: null,
        errorMessage: null,
        tags: [],
        sourceType: 'file',
        storageKey: 'docs/user_1/doc_1/v1/test.md',
        metadata: {},
      })),
      update,
    },
  } as any;
  const storage = {
    download: vi.fn(async () => Buffer.from('# 标题\n连败熔断机制说明。', 'utf-8')),
  } as any;

  const result = await processRagIndexJob(
    {
      documentId: 'doc_1',
      knowledgeBaseId: 'kb_1',
      userId: 'user_1',
      version: 1,
      storageKey: 'docs/user_1/doc_1/v1/test.md',
      fileName: 'test.md',
    },
    {
      prismaClient: db,
      storage,
      replaceChunksFn: replaceChunks as any,
    }
  );

  expect(replaceChunks).toHaveBeenCalledTimes(0);
  return { result, update, replaceChunks };
}
