import { describe, expect, it, vi } from 'vitest';
import {
  hybridRetrieval,
  prepareLexicalQuery,
  type RetrievedChunk,
} from './hybrid-retrieval';
import type {
  DocumentChunkDenseMatch,
  DocumentChunkLexicalMatch,
} from '@repo/db';

describe('RAG 混合检索深模块 (hybrid-retrieval) 单元测试', () => {
  it('1. prepareLexicalQuery：正确切分中文字词并保留技术编号', () => {
    const res1 = prepareLexicalQuery('连败熔断');
    expect(res1).toContain('连败');
    expect(res1).toContain('熔断');

    const res2 = prepareLexicalQuery('ADR-0008');
    expect(res2).toContain('ADR');
    expect(res2).toContain('0008');

    const res3 = prepareLexicalQuery('   ');
    expect(res3).toBe('');
  });

  it('2. hybridRetrieval：并发两路检索、手写 RRF 融合与来源锚点结构化装配', async () => {
    // 构造模拟切片数据
    const mockDenseMatch1: DocumentChunkDenseMatch = {
      id: 'chunk_1',
      documentId: 'doc_1',
      documentName: 'architecture.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '连败熔断机制：连续 3 次工具调用失败触发熔断',
      contentSegmented: '连败 熔断 机制 连续 3 次 工具 调用 失败 触发 熔断',
      headingPath: '设计方案 > 熔断',
      pageNumber: 1,
      tokenCount: 45,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.95,
    };

    const mockDenseMatch2: DocumentChunkDenseMatch = {
      id: 'chunk_2',
      documentId: 'doc_1',
      documentName: 'architecture.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 1,
      content: '普通的次要切片内容',
      contentSegmented: '普通 的 次要 切片 内容',
      headingPath: '设计方案 > 其他',
      pageNumber: 2,
      tokenCount: 30,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.8,
    };

    const mockLexicalMatch1: DocumentChunkLexicalMatch = {
      id: 'chunk_1',
      documentId: 'doc_1',
      documentName: 'architecture.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '连败熔断机制：连续 3 次工具调用失败触发熔断',
      contentSegmented: '连败 熔断 机制 连续 3 次 工具 调用 失败 触发 熔断',
      headingPath: '设计方案 > 熔断',
      pageNumber: 1,
      tokenCount: 45,
      metadata: {},
      createdAt: new Date(),
      rank: 0.42,
    };

    const mockLexicalMatch3: DocumentChunkLexicalMatch = {
      id: 'chunk_3',
      documentId: 'doc_2',
      documentName: 'adr-log.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 2,
      chunkIndex: 0,
      content: 'ADR-0008 详细变更历史',
      contentSegmented: 'ADR-0008 详细 变更 历史',
      headingPath: '变更记录',
      pageNumber: null,
      tokenCount: 25,
      metadata: {},
      createdAt: new Date(),
      rank: 0.35,
    };

    const mockEmbedFn = vi.fn().mockResolvedValue(new Array(1024).fill(0.1));
    const mockSearchDenseFn = vi.fn().mockResolvedValue([mockDenseMatch1, mockDenseMatch2]);
    const mockSearchLexicalFn = vi.fn().mockResolvedValue([mockLexicalMatch1, mockLexicalMatch3]);

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '连败熔断 ADR-0008',
        topK: 2,
      },
      {
        embedQueryFn: mockEmbedFn,
        searchDenseFn: mockSearchDenseFn,
        searchLexicalFn: mockSearchLexicalFn,
      }
    );

    // 验证调用参数
    expect(mockEmbedFn).toHaveBeenCalledWith('连败熔断 ADR-0008');
    expect(mockSearchDenseFn).toHaveBeenCalled();
    expect(mockSearchLexicalFn).toHaveBeenCalled();

    // 验证结果属性
    expect(result.query).toBe('连败熔断 ADR-0008');
    expect(result.topK).toBe(2);
    expect(result.chunks.length).toBe(2); // 截取 topK

    // 第一名 chunk_1 两路都是第 1 名，必须排在首位
    const topChunk = result.chunks[0];
    expect(topChunk.chunkId).toBe('chunk_1');
    expect(topChunk.denseRank).toBe(1);
    expect(topChunk.lexicalRank).toBe(1);
    expect(topChunk.score).toBeCloseTo(1 / 61 + 1 / 61, 8);

    // 验证来源锚点 (CitationAnchor 补齐物理坐标与切片快照)
    expect(topChunk.citationAnchor).toEqual({
      knowledgeBaseId: 'kb_123',
      documentId: 'doc_1',
      documentName: 'architecture.md',
      documentVersion: 1,
      pageNumber: 1,
      headingPath: '设计方案 > 熔断',
      chunkIndex: 0,
      snippet: '连败熔断机制：连续 3 次工具调用失败触发熔断',
    });

    // 验证两路 Top-20 明细与排名记录
    expect(result.denseMatches.length).toBe(2);
    expect(result.denseMatches[0].rank).toBe(1);
    expect(result.denseMatches[1].rank).toBe(2);

    expect(result.lexicalMatches.length).toBe(2);
    expect(result.lexicalMatches[0].rank).toBe(1);
    expect(result.lexicalMatches[1].rank).toBe(2);

    // 验证耗时统计字段
    expect(result.stats).toBeDefined();
    expect(result.stats.embeddingDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.denseDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.lexicalDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.fusionDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('3. 边界测试：空查询校验与单路无结果容错', async () => {
    // 空查询校验
    await expect(
      hybridRetrieval({
        userId: 'u1',
        knowledgeBaseId: 'kb1',
        query: '   ',
      })
    ).rejects.toThrowError(/不能为空/);

    // 仅词法路有命中（例如纯技术编号）
    const mockLexicalOnly: DocumentChunkLexicalMatch = {
      id: 'chunk_adr',
      documentId: 'doc_adr',
      documentName: 'adr.md',
      knowledgeBaseId: 'kb1',
      userId: 'u1',
      documentVersion: 1,
      chunkIndex: 0,
      content: 'ADR-0008 定义',
      contentSegmented: 'ADR-0008 定义',
      headingPath: null,
      pageNumber: null,
      tokenCount: 15,
      metadata: {},
      createdAt: new Date(),
      rank: 0.5,
    };

    const result = await hybridRetrieval(
      {
        userId: 'u1',
        knowledgeBaseId: 'kb1',
        query: 'ADR-0008',
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [], // 稠密路 0 命中
        searchLexicalFn: async () => [mockLexicalOnly],
      }
    );

    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunkId).toBe('chunk_adr');
    expect(result.chunks[0].denseRank).toBeNull();
    expect(result.chunks[0].lexicalRank).toBe(1);
    expect(result.chunks[0].score).toBeCloseTo(1 / 61, 8);
  });

  it('4. 默认配置验证：默认配置下不发起任何 Rerank 调用 (零开销)', async () => {
    const mockDenseMatch: DocumentChunkDenseMatch = {
      id: 'chunk_1',
      documentId: 'doc_1',
      documentName: 'architecture.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '切片内容',
      contentSegmented: '切片 内容',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.9,
    };

    const mockRerankProvider = {
      name: 'mock',
      model: 'mock-model',
      rerank: vi.fn(),
    };

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '测试默认不走 Rerank',
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [mockDenseMatch],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
        // 默认不传 enableRerank，由系统默认配置 isRagRerankEnabled() 判定
      }
    );

    expect(mockRerankProvider.rerank).not.toHaveBeenCalled();
    expect(result.isReranked).toBe(false);
    expect(result.stats.rerankDurationMs).toBe(0);
    expect(result.chunks[0].rerankScore).toBeUndefined();
    expect(result.chunks[0].score).toBeCloseTo(1 / 61, 8);
  });

  it('5. 开启 Rerank：二次精排打分重构切片位次并记录用量指标', async () => {
    // 构造两段切片：
    // 切片 A 在 RRF 中由于两路都靠前原本排第一；但在 Rerank 语意精排中切片 B 获得更高相关性
    const chunkA: DocumentChunkDenseMatch = {
      id: 'chunk_a',
      documentId: 'doc_a',
      documentName: 'doc_a.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '初筛较相关的文本内容 A',
      contentSegmented: '初筛 内容 A',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 20,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.9,
    };

    const chunkB: DocumentChunkDenseMatch = {
      id: 'chunk_b',
      documentId: 'doc_b',
      documentName: 'doc_b.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '深层精排绝对匹配的黄金答案文本 B',
      contentSegmented: '深层 匹配 文本 B',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 20,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.85,
    };

    const mockRerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([
        // Rerank 返回下标 1（对应 chunkB）得分最高 0.99，下标 0（对应 chunkA）得分 0.45
        { index: 1, relevanceScore: 0.99 },
        { index: 0, relevanceScore: 0.45 },
      ]),
    };

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '黄金问题',
        enableRerank: true, // 显式开启 Rerank
        topK: 2,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [chunkA, chunkB],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );

    // 验证 Rerank Provider 调用参数
    expect(mockRerankProvider.rerank).toHaveBeenCalledTimes(1);
    expect(mockRerankProvider.rerank).toHaveBeenCalledWith(
      '黄金问题',
      ['初筛较相关的文本内容 A', '深层精排绝对匹配的黄金答案文本 B'],
      2
    );

    // 验证切片重排：chunk_b 逆袭排到第一位
    expect(result.chunks.length).toBe(2);
    expect(result.isReranked).toBe(true);

    const firstChunk = result.chunks[0];
    expect(firstChunk.chunkId).toBe('chunk_b');
    expect(firstChunk.score).toBe(0.99);
    expect(firstChunk.rerankScore).toBe(0.99);
    expect(firstChunk.rrfScore).toBeDefined();

    const secondChunk = result.chunks[1];
    expect(secondChunk.chunkId).toBe('chunk_a');
    expect(secondChunk.score).toBe(0.45);
    expect(secondChunk.rerankScore).toBe(0.45);

    // 耗时指标中包含 rerankDurationMs
    expect(result.stats.rerankDurationMs).toBeDefined();
    expect(result.stats.rerankDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('6. 弹性容灾平滑降级：Rerank 抛出网络超时或 5xx 错误时，平稳降级使用原 RRF 排名，检索不失败', async () => {
    const chunk1: DocumentChunkDenseMatch = {
      id: 'chunk_1',
      documentId: 'doc_1',
      documentName: 'doc_1.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '切片 1',
      contentSegmented: '切片 1',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.95,
    };

    const chunk2: DocumentChunkDenseMatch = {
      id: 'chunk_2',
      documentId: 'doc_2',
      documentName: 'doc_2.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '切片 2',
      contentSegmented: '切片 2',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.85,
    };

    // 模拟 Rerank 发生网络超时或 429 报错
    const mockFailingRerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockRejectedValue(new Error('网络超时：5000ms 超时中断')),
    };

    // 执行检索，必须不抛出异常，平稳完成
    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '测试降级查询',
        enableRerank: true,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [chunk1, chunk2],
        searchLexicalFn: async () => [],
        rerankProvider: mockFailingRerankProvider,
      }
    );

    // 验证平滑降级：isReranked 为 false，顺序保持原 RRF 首位 chunk_1
    expect(result.isReranked).toBe(false);
    expect(result.chunks.length).toBe(2);
    expect(result.chunks[0].chunkId).toBe('chunk_1');
    expect(result.chunks[0].rerankScore).toBeUndefined();
    expect(result.chunks[0].score).toBeCloseTo(1 / 61, 8);
    expect(result.chunks[1].chunkId).toBe('chunk_2');
    expect(result.stats.rerankDurationMs).toBeGreaterThanOrEqual(0);
  });
});

