import { describe, expect, it, vi } from 'vitest';
import { hybridRetrieval, type RetrievedChunk } from './hybrid-retrieval';
import type {
  DocumentChunkDenseMatch,
  DocumentChunkLexicalMatch,
} from '@repo/db';
import { logger } from '@repo/logger';

describe('RAG 混合检索深模块 (hybrid-retrieval) 单元测试', () => {
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

  it('3.1 外部向量服务故障降级：embedQueryFn 抛错时自动降级为纯词法检索', async () => {
    const mockLexicalChunk: DocumentChunkLexicalMatch = {
      id: 'chunk_lexical_fallback',
      documentId: 'doc_fallback',
      documentName: 'faq.md',
      knowledgeBaseId: 'kb1',
      userId: 'u1',
      documentVersion: 1,
      chunkIndex: 0,
      content: '常见问题解答文本',
      contentSegmented: '常见 问题 解答 文本',
      headingPath: null,
      pageNumber: null,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      rank: 0.8,
    };

    // 模拟 embedQueryFn 抛出外部服务网络故障异常
    const result = await hybridRetrieval(
      {
        userId: 'u1',
        knowledgeBaseId: 'kb1',
        query: '常见问题',
      },
      {
        embedQueryFn: async () => {
          throw new Error('503 Service Unavailable: 火山方舟 Embedding 模型超载');
        },
        searchDenseFn: async () => [],
        searchLexicalFn: async () => [mockLexicalChunk],
      }
    );

    // 验证平滑降级：稠密路跳过，词法路切片安全返回
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunkId).toBe('chunk_lexical_fallback');
    expect(result.chunks[0].denseRank).toBeNull();
    expect(result.chunks[0].lexicalRank).toBe(1);
    expect(result.stats.embeddingDurationMs).toBeGreaterThanOrEqual(0);
    expect(result.stats.denseDurationMs).toBe(0);
  });

  it('4. 关闭 Rerank 配置验证：显式关闭时不发起任何 Rerank 调用 (零开销)', async () => {
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
        query: '测试不走 Rerank',
        enableRerank: false, // 显式关闭
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [mockDenseMatch],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );

    expect(mockRerankProvider.rerank).not.toHaveBeenCalled();
    expect(result.isReranked).toBe(false);
    expect(result.isDegraded).toBe(false);
    expect(result.stats.rerankDurationMs).toBe(0);
    expect(result.chunks[0].rerankScore).toBeUndefined();
    expect(result.chunks[0].score).toBeCloseTo(1 / 61, 8);
  });

  it('4.2 默认配置验证：未传 enableRerank 且无关闭环境变量时默认启用 Rerank (ADR-0030)', async () => {
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
      rerank: vi.fn().mockResolvedValue([{ index: 0, relevanceScore: 0.88 }]),
    };

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '测试默认走 Rerank',
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [mockDenseMatch],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );

    expect(mockRerankProvider.rerank).toHaveBeenCalledTimes(1);
    expect(result.isReranked).toBe(true);
    expect(result.chunks[0].rerankScore).toBe(0.88);
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

    // 验证平滑降级：isReranked 为 false，isDegraded 为 true，顺序保持原 RRF 首位 chunk_1
    expect(result.isReranked).toBe(false);
    expect(result.isDegraded).toBe(true);
    expect(result.chunks.length).toBe(2);
    expect(result.chunks[0].chunkId).toBe('chunk_1');
    expect(result.chunks[0].rerankScore).toBeUndefined();
    expect(result.chunks[0].score).toBeCloseTo(1 / 61, 8);
    expect(result.chunks[1].chunkId).toBe('chunk_2');
    expect(result.stats.rerankDurationMs).toBeGreaterThanOrEqual(0);
  });

  it('7. 低分切片过滤与全员低分兜底 (TC03.2)', async () => {
    const chunkHigh: DocumentChunkDenseMatch = {
      id: 'chunk_high',
      documentId: 'doc_1',
      documentName: 'doc.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '高相关切片',
      contentSegmented: '高相关',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.9,
    };

    const chunkLow: DocumentChunkDenseMatch = {
      id: 'chunk_low',
      documentId: 'doc_2',
      documentName: 'doc.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 1,
      content: '低相关长尾切片',
      contentSegmented: '低相关',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.3,
    };

    // 场景 A：部分切片高于 0.20，部分切片低于 0.20
    const mockRerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([
        { index: 0, relevanceScore: 0.85 },
        { index: 1, relevanceScore: 0.08 }, // 低于 minRelevanceScore = 0.20
      ]),
    };

    const resultPartial = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '过滤测试',
        enableRerank: true,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [chunkHigh, chunkLow],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );

    expect(resultPartial.chunks.length).toBe(1);
    expect(resultPartial.chunks[0].chunkId).toBe('chunk_high');
    expect(resultPartial.filteredLowScoreCount).toBe(1);

    // 场景 B：全员低分 (< 0.20)，返回空数组且 isReranked = true
    const mockAllLowProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([
        { index: 0, relevanceScore: 0.12 },
        { index: 1, relevanceScore: 0.05 },
      ]),
    };

    const resultAllLow = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '全员无关查询',
        enableRerank: true,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [chunkHigh, chunkLow],
        searchLexicalFn: async () => [],
        rerankProvider: mockAllLowProvider,
      }
    );

    expect(resultAllLow.chunks.length).toBe(0);
    expect(resultAllLow.isReranked).toBe(true);
    expect(resultAllLow.filteredLowScoreCount).toBe(2);
  });

  it('8. 候选池规模硬上限截断：超过 maxCandidates(30) 时自动截断 (TC03.1)', async () => {
    // 构造 35 个切片
    const manyChunks: DocumentChunkDenseMatch[] = Array.from({ length: 35 }, (_, idx) => ({
      id: `chunk_${idx}`,
      documentId: `doc_${idx}`,
      documentName: `doc_${idx}.md`,
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: idx,
      content: `切片内容 ${idx}`,
      contentSegmented: `切片 ${idx}`,
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.9 - idx * 0.01,
    }));

    const mockRerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockImplementation((_query, docs) =>
        docs.map((_: string, idx: number) => ({ index: idx, relevanceScore: 0.9 - idx * 0.01 }))
      ),
    };

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '截断测试',
        enableRerank: true,
        topK: 5,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => manyChunks,
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );

    // 验证调用 rerank 时候选切片数被硬截断至 30 条 (maxCandidates)
    expect(mockRerankProvider.rerank).toHaveBeenCalledTimes(1);
    const sentDocs = mockRerankProvider.rerank.mock.calls[0][1];
    expect(sentDocs.length).toBe(30);
    expect(result.chunks.length).toBe(5);
  });

  it('9. 前置元数据过滤透传与正常召回 (TC05 / ADR-0032)', async () => {
    const mockChunk: DocumentChunkDenseMatch = {
      id: 'chunk_filtered',
      documentId: 'doc_1',
      documentName: '2026-finance.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '2026 年度财务报销规范',
      contentSegmented: '2026 年度 财务 报销 规范',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 15,
      metadata: { tags: ['财务', '2026'], department: 'finance' },
      createdAt: new Date(),
      similarity: 0.92,
    };

    const searchDenseMock = vi.fn().mockResolvedValue([mockChunk]);
    const searchLexicalMock = vi.fn().mockResolvedValue([]);

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '报销政策',
        enableRerank: false,
        filter: { tags: ['财务'], year: 2026 },
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: searchDenseMock,
        searchLexicalFn: searchLexicalMock,
      }
    );

    // 验证黑盒结果契约：正确返回过滤召回切片与应用过滤器元数据
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunkId).toBe('chunk_filtered');
    expect(result.isFilterRelaxed).toBe(false);
    expect(result.appliedFilter).toEqual({ tags: ['财务'], year: 2026 });
  });

  it('10. 过滤条件 0 命中时自动触发 Relaxed Fallback 全库保底召回 (TC05 / ADR-0032)', async () => {
    const mockFallbackChunk: DocumentChunkDenseMatch = {
      id: 'chunk_fallback',
      documentId: 'doc_old',
      documentName: 'general-guide.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '通用企业制度指南',
      contentSegmented: '通用 企业 制度 指南',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 12,
      metadata: { tags: ['通用'] },
      createdAt: new Date(),
      similarity: 0.85,
    };

    // 第一次调用（带 filter）返回空；第二次调用（无 filter，放宽兜底）返回保底切片
    const searchDenseMock = vi
      .fn()
      .mockResolvedValueOnce([]) // 带 filter：0 命中
      .mockResolvedValueOnce([mockFallbackChunk]); // 放宽兜底：命中保底切片

    const searchLexicalMock = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '报销政策',
        enableRerank: false,
        filter: { tags: ['不存在的标签999'] },
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: searchDenseMock,
        searchLexicalFn: searchLexicalMock,
      }
    );

    // 验证调用了两次 searchDense，第一次带 filter，第二次无 filter
    expect(searchDenseMock).toHaveBeenCalledTimes(2);
    expect(searchDenseMock.mock.calls[0][0].filter).toEqual({ tags: ['不存在的标签999'] });
    expect(searchDenseMock.mock.calls[1][0].filter).toBeUndefined();

    // 验证返回结果标记了 isFilterRelaxed = true，并成功召回保底切片
    expect(result.isFilterRelaxed).toBe(true);
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].chunkId).toBe('chunk_fallback');
    expect(result.appliedFilter).toEqual({ tags: ['不存在的标签999'] });
  });

  it('11. headingPath 章节前缀过滤透传 (TC05-1 / ADR-0036)', async () => {
    const mockChunk: DocumentChunkDenseMatch = {
      id: 'chunk_section',
      documentId: 'doc_arch',
      documentName: 'architecture.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 3,
      content: '权限子系统架构',
      contentSegmented: '权限 子系统 架构',
      headingPath: '3. 系统架构 > 3.2 权限控制',
      pageNumber: 1,
      tokenCount: 15,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.95,
    };

    const searchDenseMock = vi.fn().mockResolvedValue([mockChunk]);
    const searchLexicalMock = vi.fn().mockResolvedValue([]);

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '权限模型',
        enableRerank: false,
        headingPath: '3. 系统架构 > 3.2 权限控制',
        documentId: 'doc_arch',
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: searchDenseMock,
        searchLexicalFn: searchLexicalMock,
      }
    );

    expect(searchDenseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headingPath: '3. 系统架构 > 3.2 权限控制',
        documentId: 'doc_arch',
      })
    );
    expect(result.chunks.length).toBe(1);
    expect(result.chunks[0].citationAnchor.headingPath).toBe('3. 系统架构 > 3.2 权限控制');
  });

  it('12. 章节顺序通读模式与空 Query 切片连续返回 (TC05-2 / ADR-0036)', async () => {
    const mockSequentialChunks = [
      {
        id: 'chunk_seq_1',
        documentId: 'doc_arch',
        documentName: 'architecture.md',
        knowledgeBaseId: 'kb_123',
        userId: 'user_123',
        documentVersion: 1,
        chunkIndex: 0,
        content: '第一小节：背景介绍',
        contentSegmented: '第一 小节 背景 介绍',
        headingPath: '1. 概述',
        pageNumber: 1,
        tokenCount: 20,
        metadata: {},
        createdAt: new Date(),
      },
      {
        id: 'chunk_seq_2',
        documentId: 'doc_arch',
        documentName: 'architecture.md',
        knowledgeBaseId: 'kb_123',
        userId: 'user_123',
        documentVersion: 1,
        chunkIndex: 1,
        content: '第二小节：核心目标',
        contentSegmented: '第二 小节 核心 目标',
        headingPath: '1. 概述',
        pageNumber: 1,
        tokenCount: 25,
        metadata: {},
        createdAt: new Date(),
      },
    ];

    const sequentialMock = vi.fn().mockResolvedValue(mockSequentialChunks);

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '', // 空 query 触发章节顺序通读
        headingPath: '1. 概述',
        documentId: 'doc_arch',
        topK: 10,
      },
      {
        getSequentialChunksFn: sequentialMock,
      }
    );

    // 验证调用了序贯提取函数，且按 chunk_index ASC 连续返回
    expect(sequentialMock).toHaveBeenCalledWith(
      expect.objectContaining({
        headingPath: '1. 概述',
        documentId: 'doc_arch',
        limit: 10,
      })
    );
    expect(result.chunks.length).toBe(2);
    expect(result.chunks[0].chunkId).toBe('chunk_seq_1');
    expect(result.chunks[0].content).toContain('第一小节');
    expect(result.chunks[1].chunkId).toBe('chunk_seq_2');
    expect(result.chunks[1].content).toContain('第二小节');
  });

  it('13. TC05: 响应切片及两路召回明细完成展示契约投影（剔除底层私有字段并提供 rankScore）', async () => {
    const rawDenseChunk: DocumentChunkDenseMatch = {
      id: 'chunk_contract_dense',
      documentId: 'doc_c1',
      documentName: 'contract.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_private_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '展示契约稠密切片正文',
      contentSegmented: '展示 契约 稠密 切片 正文',
      headingPath: '契约章节',
      pageNumber: 1,
      tokenCount: 15,
      metadata: { secretField: 'forbidden' } as any,
      createdAt: new Date(),
      similarity: 0.9123,
    };

    const rawLexicalChunk: DocumentChunkLexicalMatch = {
      id: 'chunk_contract_lexical',
      documentId: 'doc_c2',
      documentName: 'contract_lex.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_private_456',
      documentVersion: 1,
      chunkIndex: 1,
      content: '展示契约词法切片正文',
      contentSegmented: '展示 契约 词法 切片 正文',
      headingPath: '词法章节',
      pageNumber: 2,
      tokenCount: 18,
      metadata: { privateTag: 'hidden' } as any,
      createdAt: new Date(),
      rank: 0.3842, // ts_rank_cd 原始得分
    };

    const result = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '契约投影测试',
        topK: 2,
        enableRerank: false,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [rawDenseChunk],
        searchLexicalFn: async () => [rawLexicalChunk],
      }
    );

    // 1. TC05-1 验证：最终切片列表中剔除 userId, metadata 与 tags
    expect(result.chunks.length).toBe(2);
    for (const chunk of result.chunks) {
      expect((chunk as any).userId).toBeUndefined();
      expect((chunk as any).metadata).toBeUndefined();
      expect((chunk as any).tags).toBeUndefined();
      expect(chunk.chunkId).toBeDefined();
      expect(chunk.documentId).toBeDefined();
      expect(chunk.documentName).toBeDefined();
      expect(chunk.documentVersion).toBeDefined();
      expect(chunk.content).toBeDefined();
      expect(chunk.citationAnchor).toBeDefined();
    }

    // 2. TC05-2 验证：词法明细同时提供 rank (名次 1) 与 rankScore (0.3842)
    expect(result.lexicalMatches.length).toBe(1);
    const lexicalMatch = result.lexicalMatches[0];
    expect(lexicalMatch.rank).toBe(1);
    expect(lexicalMatch.rankScore).toBe(0.3842);
    expect((lexicalMatch as any).userId).toBeUndefined();
    expect((lexicalMatch as any).metadata).toBeUndefined();

    // 稠密路明细验证
    expect(result.denseMatches.length).toBe(1);
    const denseMatch = result.denseMatches[0];
    expect(denseMatch.rank).toBe(1);
    expect(denseMatch.similarity).toBe(0.9123);
    expect((denseMatch as any).userId).toBeUndefined();
    expect((denseMatch as any).metadata).toBeUndefined();
  });

  it('14. TC06-2: 显式 enableRerank 优先（false 跳过精排）与环境变量 RAG_RERANK_ENABLED 回退', async () => {
    const chunkA: DocumentChunkDenseMatch = {
      id: 'chunk_a',
      documentId: 'doc_a',
      documentName: 'doc_a.md',
      knowledgeBaseId: 'kb_123',
      userId: 'user_123',
      documentVersion: 1,
      chunkIndex: 0,
      content: '切片 A',
      contentSegmented: '切片 A',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity: 0.9,
    };

    const mockRerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([{ index: 0, relevanceScore: 0.99 }]),
    };

    // 1. 显式 enableRerank: false 优先：即使环境变量为 true 也不调用精排
    vi.stubEnv('RAG_RERANK_ENABLED', 'true');
    const resultExplicitFalse = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '显式关闭测试',
        enableRerank: false,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [chunkA],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );
    expect(mockRerankProvider.rerank).not.toHaveBeenCalled();
    expect(resultExplicitFalse.isReranked).toBe(false);

    // 2. 未传 enableRerank 时回退到环境变量
    vi.stubEnv('RAG_RERANK_ENABLED', 'false');
    const resultEnvFallback = await hybridRetrieval(
      {
        userId: 'user_123',
        knowledgeBaseId: 'kb_123',
        query: '环境回退测试',
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [chunkA],
        searchLexicalFn: async () => [],
        rerankProvider: mockRerankProvider,
      }
    );
    expect(mockRerankProvider.rerank).not.toHaveBeenCalled();
    expect(resultEnvFallback.isReranked).toBe(false);
  });
});

describe('TC06 词法路降级与空查询', () => {
  const vector = new Array(1024).fill(0.1);

  function makeDenseChunk(id: string, similarity = 0.9): DocumentChunkDenseMatch {
    return {
      id,
      documentId: 'doc_1',
      documentName: 'architecture.md',
      knowledgeBaseId: 'kb1',
      userId: 'u1',
      documentVersion: 1,
      chunkIndex: 0,
      content: '连败熔断机制说明',
      contentSegmented: '连败 熔断 机制 说明',
      headingPath: null,
      pageNumber: 1,
      tokenCount: 10,
      metadata: {},
      createdAt: new Date(),
      similarity,
    };
  }

  it('TC06-1 正常查询时词法检索入口收到 segmentForQuery 的输出', async () => {
    const searchLexicalFn = vi.fn().mockResolvedValue([]);
    const segmentQueryFn = vi.fn(() => '连败 熔断');

    await hybridRetrieval(
      { userId: 'u1', knowledgeBaseId: 'kb1', query: '连败熔断', enableRerank: false },
      {
        embedQueryFn: async () => vector,
        segmentQueryFn,
        searchDenseFn: async () => [makeDenseChunk('chunk_dense')],
        searchLexicalFn,
      }
    );

    expect(segmentQueryFn).toHaveBeenCalledWith('连败熔断');
    expect(searchLexicalFn).toHaveBeenCalledWith(
      expect.objectContaining({ query: '连败 熔断' })
    );
  });

  it('TC06-2/3/4 分词不可用时跳过词法并返回稠密结果', async () => {
    const searchLexicalFn = vi.fn();

    const result = await hybridRetrieval(
      { userId: 'u1', knowledgeBaseId: 'kb1', query: '连败熔断', enableRerank: false },
      {
        embedQueryFn: async () => vector,
        segmentQueryFn: () => null,
        searchDenseFn: async () => [makeDenseChunk('chunk_dense')],
        searchLexicalFn,
      }
    );

    expect(searchLexicalFn).toHaveBeenCalledTimes(0);
    expect(result.chunks.map((chunk) => chunk.chunkId)).toEqual(['chunk_dense']);
  });

  it('TC06-5 降级告警包含 knowledgeBaseId 且不包含查询原文', async () => {
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const uniqueQuery = 'UNIQUE_C9_QUERY_TOKEN_777';

    try {
      await hybridRetrieval(
        { userId: 'u1', knowledgeBaseId: 'kb1', query: uniqueQuery, enableRerank: false },
        {
          embedQueryFn: async () => vector,
          segmentQueryFn: () => null,
          searchDenseFn: async () => [],
          searchLexicalFn: async () => [],
        }
      );

      const degradedCall = warnSpy.mock.calls.find(([message]) =>
        String(message).includes('分词不可用')
      );
      expect(degradedCall?.[1]).toEqual(
        expect.objectContaining({
          feature: 'rag-lexical-degraded',
          knowledgeBaseId: 'kb1',
        })
      );
      expect(JSON.stringify(warnSpy.mock.calls)).not.toContain(uniqueQuery);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('TC06-6/7 空查询在入口校验阶段拒绝且两路检索均不调用', async () => {
    const searchDenseFn = vi.fn();
    const searchLexicalFn = vi.fn();

    await expect(
      hybridRetrieval(
        { userId: 'u1', knowledgeBaseId: 'kb1', query: '   ' },
        { searchDenseFn, searchLexicalFn }
      )
    ).rejects.toThrow(/不能为空/);

    expect(searchDenseFn).toHaveBeenCalledTimes(0);
    expect(searchLexicalFn).toHaveBeenCalledTimes(0);
  });

  it('TC06-8 向量化与分词同时不可用时返回空 chunks 且不抛出', async () => {
    const result = await hybridRetrieval(
      { userId: 'u1', knowledgeBaseId: 'kb1', query: '连败熔断', enableRerank: false },
      {
        embedQueryFn: async () => {
          throw new Error('embedding unavailable');
        },
        segmentQueryFn: () => null,
        searchDenseFn: async () => [],
        searchLexicalFn: async () => [],
      }
    );

    expect(result.chunks).toEqual([]);
  });
});
