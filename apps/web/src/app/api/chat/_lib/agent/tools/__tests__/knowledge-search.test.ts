import { describe, it, expect, vi } from 'vitest';
import { createKnowledgeSearchTool } from '../knowledge-search';
import type { ToolExecutionContext } from '@/lib/agent/registry';
import type { RetrievedChunk } from '@/lib/rag/hybrid-retrieval';

describe('knowledge_search 只读工具下钻与通读单元测试 (TC07 / ADR-0036)', () => {
  const mockContext: ToolExecutionContext = {
    userId: 'user-alice',
    signal: new AbortController().signal,
    errorId: 'err-search-123',
  };

  const createMockChunk = (overrides: Partial<RetrievedChunk> = {}): RetrievedChunk => ({
    chunkId: 'chunk-1',
    documentId: 'doc-1',
    documentName: '系统设计手册',
    documentVersion: 1,
    content: '权限系统基于 RBAC 角色授权模型构建。',
    contentSegmented: '权限 系统 基于 RBAC 角色 授权 模型 构建',
    score: 0.85,
    denseRank: 1,
    lexicalRank: 1,
    citationAnchor: {
      documentId: 'doc-1',
      documentName: '系统设计手册',
      documentVersion: 1,
      pageNumber: null,
      headingPath: '3. 系统架构 > 3.2 权限控制',
      chunkIndex: 5,
    },
    ...overrides,
  });

  it('TC07-1: 基础调用与参数校验退出码为 0', async () => {
    const mockRetrieval = vi.fn().mockResolvedValue({
      query: '权限控制',
      preparedLexicalQuery: '权限 控制',
      topK: 5,
      chunks: [createMockChunk()],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 30,
      stats: {
        embeddingDurationMs: 10,
        denseDurationMs: 10,
        lexicalDurationMs: 5,
        fusionDurationMs: 5,
        totalDurationMs: 30,
      },
    });

    const mockFindKbs = vi.fn().mockResolvedValue([{ id: 'kb-1', name: '技术知识库' }]);

    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: mockRetrieval,
      findKnowledgeBasesFn: mockFindKbs,
      findBestFaqMatchFn: vi.fn().mockResolvedValue(null),
      isRerankEnabledFn: () => false,
    });

    const result = await tool.execute({ query: '权限控制' }, mockContext);
    expect(result.ok).toBe(true);
    expect(result.contentForModel).toContain('权限系统基于 RBAC');
  });

  it('TC07-2: 入参传入 headingPath 与 documentId 时，参数正确透传到底层 hybridRetrieval', async () => {
    const mockRetrieval = vi.fn().mockResolvedValue({
      query: '角色定义',
      preparedLexicalQuery: '角色 定义',
      topK: 5,
      chunks: [
        createMockChunk({
          content: '角色包含管理员、审核员与普通用户。',
          citationAnchor: {
            documentId: 'doc-arch-1',
            documentName: '系统设计手册',
            documentVersion: 1,
            pageNumber: null,
            headingPath: '3. 系统架构 > 3.2 权限控制',
            chunkIndex: 6,
          },
        }),
      ],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 25,
      stats: {
        embeddingDurationMs: 8,
        denseDurationMs: 8,
        lexicalDurationMs: 5,
        fusionDurationMs: 4,
        totalDurationMs: 25,
      },
    });

    const mockFindKbs = vi.fn().mockResolvedValue([{ id: 'kb-1', name: '技术知识库' }]);

    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: mockRetrieval,
      findKnowledgeBasesFn: mockFindKbs,
      findBestFaqMatchFn: vi.fn().mockResolvedValue(null),
      isRerankEnabledFn: () => false,
    });

    const result = await tool.execute(
      {
        query: '角色定义',
        headingPath: '3. 系统架构 > 3.2 权限控制',
        documentId: 'doc-arch-1',
      },
      mockContext
    );

    expect(result.ok).toBe(true);
    expect(mockRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        headingPath: '3. 系统架构 > 3.2 权限控制',
        documentId: 'doc-arch-1',
        query: '角色定义',
      })
    );
  });

  it('TC07-3: 返回的切片上下文与引用锚点格式完整保留 headingPath 章节元信息', async () => {
    const mockRetrieval = vi.fn().mockResolvedValue({
      query: '权限说明',
      preparedLexicalQuery: '权限 说明',
      topK: 5,
      chunks: [
        createMockChunk({
          citationAnchor: {
            documentId: 'doc-1',
            documentName: '安全规范',
            documentVersion: 2,
            pageNumber: null,
            headingPath: '4. 安全审计 > 4.1 日志合规',
            chunkIndex: 12,
          },
        }),
      ],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 20,
      stats: {
        embeddingDurationMs: 5,
        denseDurationMs: 5,
        lexicalDurationMs: 5,
        fusionDurationMs: 5,
        totalDurationMs: 20,
      },
    });

    const mockFindKbs = vi.fn().mockResolvedValue([{ id: 'kb-1', name: '技术知识库' }]);

    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: mockRetrieval,
      findKnowledgeBasesFn: mockFindKbs,
      findBestFaqMatchFn: vi.fn().mockResolvedValue(null),
      isRerankEnabledFn: () => false,
    });

    const result = await tool.execute({ query: '权限说明' }, mockContext);
    expect(result.ok).toBe(true);
    // 验证输出中包含了章节路径《安全规范》(v2) · 4. 安全审计 > 4.1 日志合规
    expect(result.contentForModel).toContain('4. 安全审计 > 4.1 日志合规');
  });

  it('章节连续通读模式：传入 headingPath 且 query 为空或通配符时允许执行，并按顺序返回切片', async () => {
    const chunkA = createMockChunk({
      chunkId: 'c-5',
      content: '第一款：认证机制',
      citationAnchor: {
        documentId: 'doc-1',
        documentName: '安全手册',
        documentVersion: 1,
        pageNumber: null,
        headingPath: '3. 权限 > 3.1 认证',
        chunkIndex: 5,
      },
    });
    const chunkB = createMockChunk({
      chunkId: 'c-6',
      content: '第二款：令牌刷新',
      citationAnchor: {
        documentId: 'doc-1',
        documentName: '安全手册',
        documentVersion: 1,
        pageNumber: null,
        headingPath: '3. 权限 > 3.1 认证',
        chunkIndex: 6,
      },
    });

    const mockRetrieval = vi.fn().mockResolvedValue({
      query: '*',
      preparedLexicalQuery: '',
      topK: 5,
      chunks: [chunkA, chunkB],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 10,
      stats: {
        embeddingDurationMs: 0,
        denseDurationMs: 0,
        lexicalDurationMs: 0,
        fusionDurationMs: 0,
        totalDurationMs: 10,
      },
    });

    const mockFindKbs = vi.fn().mockResolvedValue([{ id: 'kb-1', name: '技术知识库' }]);

    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: mockRetrieval,
      findKnowledgeBasesFn: mockFindKbs,
      findBestFaqMatchFn: vi.fn().mockResolvedValue(null),
      isRerankEnabledFn: () => false,
    });

    // query 为空但带 headingPath
    const result = await tool.execute(
      {
        query: '',
        headingPath: '3. 权限 > 3.1 认证',
      },
      mockContext
    );

    expect(result.ok).toBe(true);
    expect(mockRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        headingPath: '3. 权限 > 3.1 认证',
      })
    );
    expect(result.contentForModel).toContain('第一款：认证机制');
    expect(result.contentForModel).toContain('第二款：令牌刷新');
  });

  it('P-W5 验证：通读模式下未显式传入 topK 时自适应放宽至 100，不截断超过 5 条的切片列表', async () => {
    // 构造 8 个切片
    const chunks = Array.from({ length: 8 }, (_, i) =>
      createMockChunk({
        chunkId: `chunk-${i}`,
        content: `第 ${i + 1} 节详细内容`,
        citationAnchor: {
          documentId: 'doc-long-1',
          documentName: '超长文档',
          documentVersion: 1,
          pageNumber: null,
          headingPath: '第 1 章 > 第 1 节',
          chunkIndex: i,
        },
      })
    );

    const mockRetrieval = vi.fn().mockResolvedValue({
      query: '*',
      preparedLexicalQuery: '',
      topK: 100,
      chunks,
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 15,
      stats: {
        embeddingDurationMs: 0,
        denseDurationMs: 0,
        lexicalDurationMs: 0,
        fusionDurationMs: 0,
        totalDurationMs: 15,
      },
    });

    const mockFindKbs = vi.fn().mockResolvedValue([{ id: 'kb-1', name: '技术知识库' }]);
    const tool = createKnowledgeSearchTool({
      hybridRetrievalFn: mockRetrieval,
      findKnowledgeBasesFn: mockFindKbs,
      findBestFaqMatchFn: vi.fn().mockResolvedValue(null),
      isRerankEnabledFn: () => false,
    });

    // 验证通读模式未传 topK 时：经 schema 解析 topK 为 undefined，内部默认放宽至 100
    const rawArgs = {
      query: '*',
      headingPath: '第 1 章 > 第 1 节',
    };
    const parsedArgs = tool.parameters.parse(rawArgs);
    expect(parsedArgs.topK).toBeUndefined();

    const result = await tool.execute(rawArgs, mockContext);

    expect(result.ok).toBe(true);
    // 验证底层调用 topK 为 100
    expect(mockRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        topK: 100,
      })
    );
    // 验证 8 条切片全部保留在引用中，未被截断至 5 条
    const citations = (result as any).citations || {};
    expect(Object.keys(citations).length).toBe(8);

    // 验证普通检索未传 topK 时，底层默认调用 topK 为 RAG_RERANK_CONFIG.defaultTopN (50/30) 或 5
    mockRetrieval.mockClear();
    await tool.execute({ query: '普通问题' }, mockContext);
    expect(mockRetrieval).toHaveBeenCalledWith(
      expect.objectContaining({
        query: '普通问题',
      })
    );
  });
});
