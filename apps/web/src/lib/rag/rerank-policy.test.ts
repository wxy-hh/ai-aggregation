import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { applyCrossEncoderRerank } from './rerank-policy';
import type { RetrievedChunk } from '@repo/shared';
import type { RerankProvider, RerankResult } from '@repo/providers';
import type { Logger } from '@repo/logger';

describe('CrossEncoderRerank 统一精排政策 Deep Module (ADR-0030 / TC03)', () => {
  beforeEach(() => {
    vi.stubEnv('RAG_RERANK_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const createMockChunk = (id: string, score: number, content: string): RetrievedChunk => ({
    chunkId: id,
    documentId: `doc_${id}`,
    documentName: `doc_${id}.md`,
    documentVersion: 1,
    content,
    contentSegmented: content,
    score,
    rrfScore: score,
    denseRank: 1,
    lexicalRank: 1,
    similarity: 0.9,
    lexicalScore: 0.8,
    citationAnchor: {
      knowledgeBaseId: 'kb_1',
      documentId: `doc_${id}`,
      documentName: `doc_${id}.md`,
      documentVersion: 1,
      pageNumber: 1,
      headingPath: '1. 章节',
      chunkIndex: 0,
      snippet: content.slice(0, 300),
    },
  });

  const mockLogger: Logger = {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  };

  it('TC03-1: 候选集规模硬上限截断：超过 maxCandidates(30) 时自动截断送入精排', async () => {
    const manyChunks = Array.from({ length: 35 }, (_, idx) =>
      createMockChunk(`c_${idx}`, 0.05 - idx * 0.001, `切片内容 ${idx}`)
    );

    const mockProvider: RerankProvider = {
      name: 'mock-rerank',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockImplementation((_q: string, docs: string[]) =>
        Promise.resolve(
          docs.map((_, idx) => ({ index: idx, relevanceScore: 0.9 - idx * 0.01 }))
        )
      ),
    };

    const result = await applyCrossEncoderRerank({
      query: '截断测试',
      candidates: manyChunks,
      topK: 5,
      enableRerank: true,
      rerankProvider: mockProvider,
      logger: mockLogger,
    });

    expect(mockProvider.rerank).toHaveBeenCalledTimes(1);
    const sentDocs = (mockProvider.rerank as any).mock.calls[0][1];
    expect(sentDocs.length).toBe(30);
    expect(result.chunks.length).toBe(5);
    expect(result.isReranked).toBe(true);
    expect(result.isDegraded).toBe(false);
  });

  it('TC03-2: 低于 minRelevanceScore(0.20) 阈值的切片被物理剔除，并准确统计 filteredLowScoreCount', async () => {
    const chunkA = createMockChunk('c_a', 0.05, '高相关切片 A');
    const chunkB = createMockChunk('c_b', 0.04, '低相关切片 B');

    const mockProvider: RerankProvider = {
      name: 'mock-rerank',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([
        { index: 0, relevanceScore: 0.85 },
        { index: 1, relevanceScore: 0.12 }, // 低于 0.20
      ]),
    };

    const result = await applyCrossEncoderRerank({
      query: '阈值过滤测试',
      candidates: [chunkA, chunkB],
      topK: 5,
      enableRerank: true,
      rerankProvider: mockProvider,
      logger: mockLogger,
    });

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunkId).toBe('c_a');
    expect(result.chunks[0].score).toBe(0.85);
    expect(result.chunks[0].rerankScore).toBe(0.85);
    expect(result.filteredLowScoreCount).toBe(1);
    expect(result.isReranked).toBe(true);
    expect(result.isDegraded).toBe(false);
  });

  it('TC03-3: 当全员精排得分均低于 0.20 时，返回空切片列表并标记 isReranked = true', async () => {
    const chunkA = createMockChunk('c_a', 0.05, '切片 A');
    const chunkB = createMockChunk('c_b', 0.04, '切片 B');

    const mockProvider: RerankProvider = {
      name: 'mock-rerank',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([
        { index: 0, relevanceScore: 0.15 },
        { index: 1, relevanceScore: 0.05 },
      ]),
    };

    const result = await applyCrossEncoderRerank({
      query: '全员低分测试',
      candidates: [chunkA, chunkB],
      topK: 5,
      enableRerank: true,
      rerankProvider: mockProvider,
      logger: mockLogger,
    });

    expect(result.chunks.length).toBe(0);
    expect(result.filteredLowScoreCount).toBe(2);
    expect(result.isReranked).toBe(true);
    expect(result.isDegraded).toBe(false);
  });

  describe('TC03-4: 响应不可信防御拦截与 RerankFallback', () => {
    it('下标越界 (index >= candidatePool.length) 时整份响应降级', async () => {
      const chunkA = createMockChunk('c_a', 0.05, '切片 A');
      const chunkB = createMockChunk('c_b', 0.04, '切片 B');

      const mockProvider: RerankProvider = {
        name: 'mock-rerank',
        model: 'BAAI/bge-reranker-v2-m3',
        rerank: vi.fn().mockResolvedValue([
          { index: 99, relevanceScore: 0.95 }, // 越界下标 99
          { index: 0, relevanceScore: 0.88 },
        ]),
      };

      const result = await applyCrossEncoderRerank({
        query: '越界降级测试',
        candidates: [chunkA, chunkB],
        topK: 2,
        enableRerank: true,
        rerankProvider: mockProvider,
        logger: mockLogger,
      });

      expect(result.isReranked).toBe(false);
      expect(result.isDegraded).toBe(true);
      expect(result.chunks.length).toBe(2);
      expect(result.chunks[0].chunkId).toBe('c_a');
      expect(result.chunks[1].chunkId).toBe('c_b');
      expect(result.chunks[0].rerankScore).toBeUndefined();
    });

    it('下标为负数或非整数时整份响应降级', async () => {
      const chunkA = createMockChunk('c_a', 0.05, '切片 A');

      const mockProvider: RerankProvider = {
        name: 'mock-rerank',
        model: 'BAAI/bge-reranker-v2-m3',
        rerank: vi.fn().mockResolvedValue([
          { index: -1, relevanceScore: 0.95 },
        ]),
      };

      const result = await applyCrossEncoderRerank({
        query: '负数下标测试',
        candidates: [chunkA],
        topK: 1,
        enableRerank: true,
        rerankProvider: mockProvider,
        logger: mockLogger,
      });

      expect(result.isDegraded).toBe(true);
      expect(result.isReranked).toBe(false);
    });

    it('返回重复下标时整份响应降级', async () => {
      const chunkA = createMockChunk('c_a', 0.05, '切片 A');
      const chunkB = createMockChunk('c_b', 0.04, '切片 B');

      const mockProvider: RerankProvider = {
        name: 'mock-rerank',
        model: 'BAAI/bge-reranker-v2-m3',
        rerank: vi.fn().mockResolvedValue([
          { index: 0, relevanceScore: 0.95 },
          { index: 0, relevanceScore: 0.85 }, // 重复下标 0
        ]),
      };

      const result = await applyCrossEncoderRerank({
        query: '重复下标测试',
        candidates: [chunkA, chunkB],
        topK: 2,
        enableRerank: true,
        rerankProvider: mockProvider,
        logger: mockLogger,
      });

      expect(result.isDegraded).toBe(true);
      expect(result.isReranked).toBe(false);
    });

    it('返回 null/undefined 时整份响应降级', async () => {
      const chunkA = createMockChunk('c_a', 0.05, '切片 A');

      const mockProvider: RerankProvider = {
        name: 'mock-rerank',
        model: 'BAAI/bge-reranker-v2-m3',
        rerank: vi.fn().mockResolvedValue(null as any),
      };

      const result = await applyCrossEncoderRerank({
        query: '空结果测试',
        candidates: [chunkA],
        topK: 1,
        enableRerank: true,
        rerankProvider: mockProvider,
        logger: mockLogger,
      });

      expect(result.isDegraded).toBe(true);
      expect(result.isReranked).toBe(false);
      expect(result.chunks[0].chunkId).toBe('c_a');
    });
  });

  it('TC03-5: 触发弹性降级时输出包含 feature: rag-rerank, degradation: rrf-fallback 的标准结构化告警日志', async () => {
    const chunkA = createMockChunk('c_a', 0.05, '切片 A');
    const failingProvider: RerankProvider = {
      name: 'mock-rerank',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockRejectedValue(new Error('500 Service Unavailable')),
    };

    const localLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    };

    const result = await applyCrossEncoderRerank({
      query: '日志测试',
      candidates: [chunkA],
      topK: 1,
      enableRerank: true,
      rerankProvider: failingProvider,
      logger: localLogger,
    });

    expect(result.isDegraded).toBe(true);
    expect(localLogger.warn).toHaveBeenCalledTimes(1);
    expect(localLogger.warn).toHaveBeenCalledWith(
      expect.stringContaining('Rerank 二次精排异常'),
      expect.objectContaining({
        feature: 'rag-rerank',
        degradation: 'rrf-fallback',
        query: '日志测试',
        candidateCount: 1,
      })
    );
  });
});
