import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RetrievalDebugger } from './retrieval-debugger';

const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: (...args: any[]) => mockFetchWithAuth(...args),
}));

describe('RetrievalDebugger 检索调试台组件测试', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. 初始渲染：查询输入框、Top 数量选择、测试检索按钮与快捷词', () => {
    render(<RetrievalDebugger knowledgeBaseId="kb_test_123" />);

    // 验证输入框与按钮
    expect(
      screen.getByPlaceholderText(/输入查询测试混合检索/)
    ).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: /测试检索/ });
    expect(submitBtn).toBeInTheDocument();

    // 验证快捷词
    expect(screen.getByRole('button', { name: '连败熔断' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ADR-0008' })).toBeInTheDocument();
  });

  it('2. 点击快捷词或提交检索：调用后端 API 并呈现两路 Top 列表与 RRF 融合明细 (QA-003)', async () => {
    const user = userEvent.setup();

    const mockResponseData = {
      query: '连败熔断',
      preparedLexicalQuery: '连败 熔断',
      topK: 20,
      chunks: [
        {
          chunkId: 'chk_1',
          documentId: 'doc_1',
          documentName: 'adr-architecture.md',
          documentVersion: 1,
          content: '连败熔断触发条件：连续 3 次工具调用失败则自动终止循环并直接收尾。',
          contentSegmented: '连败 熔断 触发 条件',
          score: 0.032522,
          denseRank: 1,
          lexicalRank: 1,
          citationAnchor: {
            documentId: 'doc_1',
            documentName: 'adr-architecture.md',
            documentVersion: 1,
            pageNumber: 1,
            headingPath: '架构决策 > 熔断',
            chunkIndex: 0,
          },
        },
      ],
      denseMatches: [
        {
          id: 'chk_1',
          rank: 1,
          similarity: 0.985,
          documentId: 'doc_1',
          documentName: 'adr-architecture.md',
          documentVersion: 1,
          pageNumber: 1,
          headingPath: '架构决策 > 熔断',
          content: '连败熔断触发条件：连续 3 次工具调用失败则自动终止循环并直接收尾。',
        },
      ],
      lexicalMatches: [
        {
          id: 'chk_1',
          rank: 1,
          rankScore: 0.45,
          documentId: 'doc_1',
          documentName: 'adr-architecture.md',
          documentVersion: 1,
          pageNumber: 1,
          headingPath: '架构决策 > 熔断',
          content: '连败熔断触发条件：连续 3 次工具调用失败则自动终止循环并直接收尾。',
        },
      ],
      durationMs: 38,
      stats: {
        embeddingDurationMs: 12,
        denseDurationMs: 14,
        lexicalDurationMs: 10,
        fusionDurationMs: 2,
        totalDurationMs: 38,
      },
    };

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockResponseData,
      }),
    });

    render(<RetrievalDebugger knowledgeBaseId="kb_test_123" />);

    // 点击快捷词「连败熔断」
    const quickBtn = screen.getByRole('button', { name: '连败熔断' });
    await user.click(quickBtn);

    // 验证 API 调用（ADR-0030：默认开启 Rerank 精排）
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_test_123/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ query: '连败熔断', topK: 20, enableRerank: true }),
        })
      );
    });

    // 验证结果呈现：RRF 融合明细、向量召回 Top20、词法召回 Top20
    await waitFor(() => {
      expect(screen.getByText('RRF 融合明细')).toBeInTheDocument();
      expect(screen.getByText('向量召回 Top20')).toBeInTheDocument();
      expect(screen.getByText('词法召回 Top20')).toBeInTheDocument();
    });

    // 验证来源锚点与文档名可见
    expect(screen.getAllByText('adr-architecture.md').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/连败熔断触发条件/).length).toBeGreaterThanOrEqual(1);

    // 验证耗时面板
    expect(screen.getByText('38ms')).toBeInTheDocument();
  });

  it('3. 后端返回错误时友好展示错误提示', async () => {
    const user = userEvent.setup();

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: '知识库不存在或已被归档',
      }),
    });

    render(<RetrievalDebugger knowledgeBaseId="kb_not_found" />);

    const input = screen.getByPlaceholderText(/输入查询测试混合检索/);
    await user.type(input, '测试查询');

    const submitBtn = screen.getByRole('button', { name: /测试检索/ });
    await user.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('知识库不存在或已被归档')).toBeInTheDocument();
    });
  });

  it('4. 勾选 Rerank 精排后请求携带 enableRerank，并且正确呈现 Rerank 精排耗时与精排分数', async () => {
    const user = userEvent.setup();

    const mockRerankResponse = {
      query: '精排测试',
      preparedLexicalQuery: '精排 测试',
      topK: 20,
      isReranked: true,
      chunks: [
        {
          chunkId: 'chk_rerank_1',
          documentId: 'doc_1',
          documentName: 'adr-architecture.md',
          documentVersion: 1,
          content: '黄金答案文本',
          contentSegmented: '黄金 答案 文本',
          score: 0.9856,
          rerankScore: 0.9856,
          rrfScore: 0.032,
          denseRank: 2,
          lexicalRank: 1,
          citationAnchor: {
            documentId: 'doc_1',
            documentName: 'adr-architecture.md',
            documentVersion: 1,
            pageNumber: 1,
            headingPath: '设计',
            chunkIndex: 0,
          },
        },
      ],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 85,
      stats: {
        embeddingDurationMs: 15,
        denseDurationMs: 10,
        lexicalDurationMs: 8,
        fusionDurationMs: 2,
        rerankDurationMs: 50,
        totalDurationMs: 85,
      },
    };

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockRerankResponse,
      }),
    });

    render(<RetrievalDebugger knowledgeBaseId="kb_test_123" />);

    // ADR-0030: 验证 Rerank 精排复选框默认勾选
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();

    const input = screen.getByPlaceholderText(/输入查询测试混合检索/);
    await user.type(input, '精排测试');

    const submitBtn = screen.getByRole('button', { name: /测试检索/ });
    await user.click(submitBtn);

    // 验证 API 参数包含 enableRerank: true
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_test_123/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ query: '精排测试', topK: 20, enableRerank: true }),
        })
      );
    });

    // 验证界面呈现 Rerank 精排明细与精排耗时
    await waitFor(() => {
      expect(screen.getByText('Rerank 精排明细')).toBeInTheDocument();
      expect(screen.getByText('精排生效')).toBeInTheDocument();
      expect(screen.getByText('Rerank 耗时')).toBeInTheDocument();
      expect(screen.getByText('50ms')).toBeInTheDocument();
      expect(screen.getByText(/精排分 0.9856/)).toBeInTheDocument();
    });
  });

  it('5. 点击检索卡片上的文档名称或全文预览按钮：成功呼出文档全文预览抽屉并带入锚点', async () => {
    const user = userEvent.setup();

    const mockResponseData = {
      query: '连败熔断',
      preparedLexicalQuery: '连败 熔断',
      topK: 20,
      chunks: [
        {
          chunkId: 'chk_1',
          content: '连败熔断触发条件：连续 3 次工具调用失败则自动终止循环。',
          contentSegmented: '连败 熔断 触发 条件',
          score: 0.032,
          denseRank: 1,
          lexicalRank: 1,
          citationAnchor: {
            documentId: 'doc_target_1',
            documentName: '架构规约.md',
            documentVersion: 1,
            pageNumber: 1,
            headingPath: '规约 > 熔断',
            chunkIndex: 2,
          },
        },
      ],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 30,
      stats: {
        embeddingDurationMs: 10,
        denseDurationMs: 10,
        lexicalDurationMs: 8,
        fusionDurationMs: 2,
        totalDurationMs: 30,
      },
    };

    // 第一次调用为 query 检索接口；第二次调用为抽屉内容拉取接口
    mockFetchWithAuth
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: mockResponseData,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            id: 'doc_target_1',
            name: '架构规约.md',
            version: 1,
            chunkCount: 5,
            fileType: 'markdown',
            content: '# 架构规约\n\n## 熔断章节\n\n连败熔断触发条件：连续 3 次工具调用失败则自动终止循环。',
          },
        }),
      });

    render(<RetrievalDebugger knowledgeBaseId="kb_test_123" />);

    // 点击快捷词触发检索
    const quickBtn = screen.getByRole('button', { name: '连败熔断' });
    await user.click(quickBtn);

    // 检索卡片呈现后，点击「全文预览」按钮
    await waitFor(() => {
      expect(screen.getByText('架构规约.md')).toBeInTheDocument();
    });

    const previewBtn = screen.getByRole('button', { name: /全文预览/ });
    await user.click(previewBtn);

    // 验证右侧全文预览抽屉已渲染，且包含文档标题与正文
    await waitFor(() => {
      expect(screen.getByTestId('document-preview-drawer-content')).toBeInTheDocument();
      expect(screen.getByText('熔断章节')).toBeInTheDocument();
    });
  });

  it('6. 降级徽章与低分切片过滤标签展示 (TC05/TC06)', async () => {
    const user = userEvent.setup();

    const mockDegradedResponse = {
      query: '降级与过滤测试',
      preparedLexicalQuery: '降级 过滤',
      topK: 20,
      isReranked: false,
      isDegraded: true,
      filteredLowScoreCount: 3,
      chunks: [
        {
          chunkId: 'chk_deg_1',
          documentId: 'doc_1',
          documentName: 'adr-architecture.md',
          documentVersion: 1,
          content: '降级后的切片文本',
          contentSegmented: '降级 切片',
          score: 0.0163,
          rrfScore: 0.0163,
          denseRank: 1,
          lexicalRank: 1,
          citationAnchor: {
            documentId: 'doc_1',
            documentName: 'adr-architecture.md',
            documentVersion: 1,
            pageNumber: 1,
            headingPath: '设计',
            chunkIndex: 0,
          },
        },
      ],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 45,
      stats: {
        embeddingDurationMs: 10,
        denseDurationMs: 10,
        lexicalDurationMs: 8,
        fusionDurationMs: 2,
        rerankDurationMs: 15,
        totalDurationMs: 45,
      },
    };

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockDegradedResponse,
      }),
    });

    render(<RetrievalDebugger knowledgeBaseId="kb_test_123" />);

    const input = screen.getByPlaceholderText(/输入查询测试混合检索/);
    await user.type(input, '降级与过滤测试');

    const submitBtn = screen.getByRole('button', { name: /测试检索/ });
    await user.click(submitBtn);

    // 验证降级徽章、过滤数量标签与耗时[降级]标记
    await waitFor(() => {
      expect(screen.getByText('Rerank 降级为 RRF')).toBeInTheDocument();
      expect(screen.getByText('已过滤 3 条低相关切片')).toBeInTheDocument();
      expect(screen.getByText('[降级]')).toBeInTheDocument();
    });
  });

  it('7. 前置标签过滤与自动放宽兜底徽章展示 (ADR-0032 / TC05 / TC06)', async () => {
    const user = userEvent.setup();

    const mockRelaxedResponse = {
      query: '报销政策',
      preparedLexicalQuery: '报销 政策',
      topK: 20,
      isReranked: false,
      isFilterRelaxed: true,
      chunks: [
        {
          chunkId: 'chk_rel_1',
          documentId: 'doc_1',
          documentName: '通用制度.md',
          documentVersion: 1,
          content: '全员差旅通用报销制度',
          contentSegmented: '全员 差旅 报销',
          score: 0.02,
          tags: ['通用', '财务'],
          denseRank: 1,
          lexicalRank: 1,
          citationAnchor: {
            documentId: 'doc_1',
            documentName: '通用制度.md',
            documentVersion: 1,
            pageNumber: 1,
            headingPath: null,
            chunkIndex: 0,
          },
        },
      ],
      denseMatches: [],
      lexicalMatches: [],
      durationMs: 35,
      stats: {
        embeddingDurationMs: 10,
        denseDurationMs: 10,
        lexicalDurationMs: 8,
        fusionDurationMs: 2,
        totalDurationMs: 35,
      },
    };

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: mockRelaxedResponse,
      }),
    });

    render(<RetrievalDebugger knowledgeBaseId="kb_test_123" />);

    // 输入查询词
    const queryInput = screen.getByPlaceholderText(/输入查询测试混合检索/);
    await user.type(queryInput, '报销政策');

    // 输入前置标签过滤：财务, 2027
    const tagFilterInput = screen.getByTestId('retrieval-tag-filter-input');
    await user.type(tagFilterInput, '财务, 2027');

    const submitBtn = screen.getByRole('button', { name: /测试检索/ });
    await user.click(submitBtn);

    // 验证 API 参数包含 filter: { tags: ['财务', '2027'] }
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_test_123/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            query: '报销政策',
            topK: 20,
            enableRerank: true,
            filter: { tags: ['财务', '2027'] },
          }),
        })
      );
    });

    // 验证放宽徽章与放宽提示横幅展示
    await waitFor(() => {
      expect(screen.getByTestId('filter-relaxed-badge')).toBeInTheDocument();
      expect(screen.getByText('已自动放宽过滤兜底召回')).toBeInTheDocument();
      expect(screen.getByTestId('relaxed-filter-banner')).toBeInTheDocument();
      expect(screen.getByText(/指定前置标签在库中无匹配切片，系统已自动放宽限制/)).toBeInTheDocument();
    });
  });
});

