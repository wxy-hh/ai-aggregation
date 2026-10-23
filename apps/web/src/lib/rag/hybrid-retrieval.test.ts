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

    // 验证来源锚点 (CitationAnchor)
    expect(topChunk.citationAnchor).toEqual({
      documentId: 'doc_1',
      documentName: 'architecture.md',
      documentVersion: 1,
      pageNumber: 1,
      headingPath: '设计方案 > 熔断',
      chunkIndex: 0,
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
});
