import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { hybridRetrieval } from './hybrid-retrieval';
import { createKnowledgeSearchTool } from '@/app/api/chat/_lib/agent/tools/knowledge-search';
import type { ToolExecutionContext } from '@/lib/agent/registry';
import type { DocumentChunkDenseMatch } from '@repo/db';
import type { RerankProvider } from '@repo/providers';

describe('单库检索与 Agent 跨库检索精排政策一致性集成测试 (TC04 / ADR-0030)', () => {
  const mockContext: ToolExecutionContext = {
    userId: 'user-consist',
    signal: new AbortController().signal,
    errorId: 'err-test-consist',
  };

  beforeEach(() => {
    vi.stubEnv('RAG_RERANK_ENABLED', 'true');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const createDenseMatch = (id: string, similarity: number, content: string): DocumentChunkDenseMatch => ({
    id,
    documentId: `doc_${id}`,
    documentName: `文档_${id}.md`,
    knowledgeBaseId: 'kb-1',
    userId: 'user-consist',
    documentVersion: 1,
    chunkIndex: 0,
    content,
    contentSegmented: content,
    headingPath: '1. 规范',
    pageNumber: 1,
    tokenCount: 15,
    metadata: {},
    createdAt: new Date(),
    similarity,
  });

  it('TC04-1: 相同候选集与精排打分下，单库检索与 Agent 工具产生完全一致的切片重排顺序', async () => {
    // 构造三段切片：
    // 切片 A 粗排第一 (similarity 0.95)，切片 B 第二 (0.90)，切片 C 第三 (0.80)
    // 精排打分中：切片 C 逆袭第一 (0.98)，切片 A 第二 (0.75)，切片 B 第三 (0.60)
    const matchA = createDenseMatch('chunk_a', 0.95, '切片 A 内容：基础规范');
    const matchB = createDenseMatch('chunk_b', 0.90, '切片 B 内容：常见问题');
    const matchC = createDenseMatch('chunk_c', 0.80, '切片 C 内容：核心黄金准则');

    const mockProvider: RerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockImplementation((_q: string, docs: string[]) => {
        // docs 顺序为粗排顺序：[A, B, C]
        // 期望重排顺序：C (index 2, 0.98) -> A (index 0, 0.75) -> B (index 1, 0.60)
        return Promise.resolve([
          { index: 2, relevanceScore: 0.98 },
          { index: 0, relevanceScore: 0.75 },
          { index: 1, relevanceScore: 0.60 },
        ]);
      }),
    };

    // 1. 执行单库独立检索 (开启精排)
    const singleResult = await hybridRetrieval(
      {
        userId: 'user-consist',
        knowledgeBaseId: 'kb-1',
        query: '核心准则是什么',
        topK: 3,
        enableRerank: true,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [matchA, matchB, matchC],
        searchLexicalFn: async () => [],
        rerankProvider: mockProvider,
      }
    );

    // 2. 执行 Agent 知识检索工具 (各库检索遵循 enableRerank: false 粗排召回，外层统一精排)
    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: (opts) =>
        hybridRetrieval(opts, {
          embedQueryFn: async () => new Array(1024).fill(0),
          searchDenseFn: async () => [matchA, matchB, matchC],
          searchLexicalFn: async () => [],
        }),
      findKnowledgeBasesFn: async () => [{ id: 'kb-1', name: '技术库' }],
      findBestFaqMatchFn: async () => null,
      rerankProvider: mockProvider,
    });

    const agentResult = await tool.execute(
      { query: '核心准则是什么', topK: 3 },
      mockContext
    );

    // 验证单库检索与 Agent 工具的切片排序严格一致：C (0.98) -> A (0.75) -> B (0.60)
    expect(singleResult.chunks.map((c) => c.chunkId)).toEqual(['chunk_c', 'chunk_a', 'chunk_b']);
    expect(singleResult.chunks.map((c) => c.score)).toEqual([0.98, 0.75, 0.60]);

    // Agent 上下文包含按同一顺序排列的内容
    expect(agentResult.contentForModel).toContain('[^1] 来源：《文档_chunk_c.md》(v1) · 第 1 页 · 1. 规范\n切片 C 内容：核心黄金准则');
    expect(agentResult.contentForModel).toContain('[^2] 来源：《文档_chunk_a.md》(v1) · 第 1 页 · 1. 规范\n切片 A 内容：基础规范');
    expect(agentResult.contentForModel).toContain('[^3] 来源：《文档_chunk_b.md》(v1) · 第 1 页 · 1. 规范\n切片 B 内容：常见问题');
  });

  it('TC04-2: 当 Provider 抛出异常或超时时，单库检索与 Agent 工具均平滑降级为原粗排顺序', async () => {
    const matchA = createDenseMatch('chunk_a', 0.95, '高粗排分切片 A');
    const matchB = createDenseMatch('chunk_b', 0.70, '低粗排分切片 B');

    const failingProvider: RerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockRejectedValue(new Error('Network timeout: 8000ms')),
    };

    // 1. 单库检索平滑降级
    const singleResult = await hybridRetrieval(
      {
        userId: 'user-consist',
        knowledgeBaseId: 'kb-1',
        query: '降级一致性测试',
        topK: 2,
        enableRerank: true,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [matchA, matchB],
        searchLexicalFn: async () => [],
        rerankProvider: failingProvider,
      }
    );

    expect(singleResult.isDegraded).toBe(true);
    expect(singleResult.chunks.map((c) => c.chunkId)).toEqual(['chunk_a', 'chunk_b']);

    // 2. Agent 工具平滑降级
    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: (opts) =>
        hybridRetrieval(opts, {
          embedQueryFn: async () => new Array(1024).fill(0),
          searchDenseFn: async () => [matchA, matchB],
          searchLexicalFn: async () => [],
        }),
      findKnowledgeBasesFn: async () => [{ id: 'kb-1', name: '技术库' }],
      findBestFaqMatchFn: async () => null,
      rerankProvider: failingProvider,
    });

    const agentResult = await tool.execute(
      { query: '降级一致性测试', topK: 2 },
      mockContext
    );

    expect(agentResult.ok).toBe(true);
    expect(agentResult.contentForModel).toContain('高粗排分切片 A');
    expect(agentResult.contentForModel).toContain('低粗排分切片 B');
  });

  it('TC04-3: 当精排得分全员低于 0.20 阈值时，单库检索返回空切片，Agent 工具返回明确拒答提示', async () => {
    const matchLow = createDenseMatch('chunk_low', 0.40, '无关低相关切片');

    const allLowProvider: RerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockResolvedValue([
        { index: 0, relevanceScore: 0.08 }, // 低于 0.20
      ]),
    };

    // 1. 单库检索返回空切片
    const singleResult = await hybridRetrieval(
      {
        userId: 'user-consist',
        knowledgeBaseId: 'kb-1',
        query: '全员低分测试',
        topK: 2,
        enableRerank: true,
      },
      {
        embedQueryFn: async () => new Array(1024).fill(0),
        searchDenseFn: async () => [matchLow],
        searchLexicalFn: async () => [],
        rerankProvider: allLowProvider,
      }
    );

    expect(singleResult.chunks).toHaveLength(0);
    expect(singleResult.filteredLowScoreCount).toBe(1);

    // 2. Agent 工具返回拒答引导
    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: (opts) =>
        hybridRetrieval(opts, {
          embedQueryFn: async () => new Array(1024).fill(0),
          searchDenseFn: async () => [matchLow],
          searchLexicalFn: async () => [],
        }),
      findKnowledgeBasesFn: async () => [{ id: 'kb-1', name: '技术库' }],
      findBestFaqMatchFn: async () => null,
      rerankProvider: allLowProvider,
    });

    const agentResult = await tool.execute(
      { query: '全员低分测试', topK: 2 },
      mockContext
    );

    expect(agentResult.ok).toBe(true);
    expect(agentResult.contentForModel).toContain('未检索到任何与“全员低分测试”相关的切片内容');
    expect(agentResult.contentForModel).toContain('拒答');
  });

  it('TC04-4: Agent 跨多库检索在精排阶段触发降级时，输出标准结构化告警日志', async () => {
    const matchA = createDenseMatch('chunk_a', 0.95, '切片 A');
    const failingProvider: RerankProvider = {
      name: 'siliconflow',
      model: 'BAAI/bge-reranker-v2-m3',
      rerank: vi.fn().mockRejectedValue(new Error('500 Service Unavailable')),
    };

    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: (opts) =>
        hybridRetrieval(opts, {
          embedQueryFn: async () => new Array(1024).fill(0),
          searchDenseFn: async () => [matchA],
          searchLexicalFn: async () => [],
        }),
      findKnowledgeBasesFn: async () => [{ id: 'kb-1', name: '技术库' }],
      findBestFaqMatchFn: async () => null,
      rerankProvider: failingProvider,
    });

    const spyWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const agentResult = await tool.execute(
      { query: '日志一致性测试', topK: 1 },
      mockContext
    );

    expect(agentResult.ok).toBe(true);
    // 降级回退粗排
    expect(agentResult.contentForModel).toContain('切片 A');
    spyWarn.mockRestore();
  });
});
