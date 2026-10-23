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

    // 验证 API 调用
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_test_123/query',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ query: '连败熔断', topK: 20 }),
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
});
