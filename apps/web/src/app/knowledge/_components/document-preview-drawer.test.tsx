import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import type { DocumentPreviewData } from '@/lib/rag/document-preview-contract';
import { DocumentPreviewDrawer, type DocumentPreviewDrawerProps } from './document-preview-drawer';

// Mock fetchWithAuth
const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: (...args: any[]) => mockFetchWithAuth(...args),
}));

// Mock CodeBlock
vi.mock('@/components/chat/code-block', () => ({
  CodeBlock: ({ language, children }: any) => (
    <pre data-testid="mock-code-block" data-language={language}>
      {children}
    </pre>
  ),
}));

/** 构造最终 DTO；默认是一篇 ready Markdown */
function createPreviewData(overrides: Partial<DocumentPreviewData> = {}): DocumentPreviewData {
  return {
    id: 'doc_1',
    name: '测试文档.md',
    version: 1,
    chunkCount: 2,
    status: 'ready',
    errorMessage: null,
    sourceFormat: 'md',
    renderMode: 'markdown',
    content: '',
    chunks: [],
    originalUrl: null,
    sourceType: 'file',
    sourceUrl: null,
    ...overrides,
  };
}

function mockPreviewSuccess(data: DocumentPreviewData) {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ success: true, data }),
  });
}

function mockPreviewFailure(error: string) {
  mockFetchWithAuth.mockResolvedValueOnce({
    ok: false,
    json: async () => ({ success: false, error }),
  });
}

function renderDrawer(props: Partial<DocumentPreviewDrawerProps> = {}) {
  return render(
    <DocumentPreviewDrawer
      open={true}
      onOpenChange={vi.fn()}
      knowledgeBaseId="kb_1"
      documentId="doc_1"
      {...props}
    />
  );
}

describe('DocumentPreviewDrawer 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false 时不渲染抽屉正文', () => {
    renderDrawer({ open: false, documentName: '测试文档.md', documentVersion: 1 });

    expect(screen.queryByTestId('document-preview-drawer-content')).not.toBeInTheDocument();
  });

  it('open=true 时展示加载状态，随后渲染文档标题与 Markdown 正文', async () => {
    mockPreviewSuccess(
      createPreviewData({
        name: '测试文档.md',
        chunkCount: 8,
        content: '# 知识库设计\n\n这是用于测试文档预览的正文内容。',
      })
    );

    renderDrawer({ documentName: '测试文档.md', documentVersion: 1 });

    // 验证调用了正确的获取接口
    expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/knowledge-bases/kb_1/documents/doc_1/content');

    // 验证标题与元信息最终呈现
    await waitFor(() => {
      expect(screen.getByText('测试文档.md')).toBeInTheDocument();
      expect(screen.getByText(/v1/)).toBeInTheDocument();
      expect(screen.getByText(/8.*切片/)).toBeInTheDocument();
      expect(screen.getByText('知识库设计')).toBeInTheDocument();
    });
  });

  it('TC09-1 DOCX 徽标与源资产下载语义', async () => {
    const originalUrl = 'https://storage.example.com/failed.docx?token=abc';
    const externalUrl = 'https://example.com/quarterly-report';
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_failed',
        name: '损坏文档.docx',
        chunkCount: null,
        status: 'failed',
        errorMessage: 'DOCX 文件结构损坏，无法完成解析',
        sourceFormat: 'docx',
        renderMode: undefined,
        content: '',
        chunks: [],
        originalUrl,
        sourceUrl: externalUrl,
      })
    );

    renderDrawer({
      documentId: 'doc_failed',
      documentName: '损坏文档.docx',
      initialStatus: 'failed',
      initialErrorMessage: 'DOCX 文件结构损坏，无法完成解析',
    });

    await waitFor(() => {
      expect(screen.getByText('文档解析或切片失败')).toBeInTheDocument();
      expect(screen.getByText('DOCX 文件结构损坏，无法完成解析')).toBeInTheDocument();
      expect(screen.getByTestId('document-format-badge')).toHaveTextContent('Word');
      expect(screen.queryByText('Markdown')).not.toBeInTheDocument();
      expect(screen.queryByText(/个切片/)).not.toBeInTheDocument();

      const downloadLink = screen.getByTestId('document-download-link');
      expect(downloadLink).toHaveAttribute('href', originalUrl);
      expect(downloadLink).not.toHaveAttribute('href', externalUrl);
      expect(downloadLink).toHaveTextContent('下载原文件');
      expect(downloadLink).toHaveClass('min-h-[44px]');
      expect(downloadLink).toHaveClass('min-w-[44px]');
    });
  });

  it('TC09-2 renderMode 驱动 PDF 切片与原版入口', async () => {
    const originalUrl = 'https://storage.example.com/test.pdf';
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_pdf',
        name: '产品白皮书.pdf',
        version: 2,
        chunkCount: 1,
        sourceFormat: 'pdf',
        renderMode: 'pdf-chunks',
        content: '连续全文不应作为 PDF 主视图',
        chunks: [
          {
            chunkIndex: 0,
            content: '第一页提取文本',
            headingPath: '第一章 架构设计',
            pageNumber: 1,
          },
        ],
        originalUrl,
      })
    );

    renderDrawer({
      documentId: 'doc_pdf',
      documentName: '产品白皮书.pdf',
      documentVersion: 2,
    });

    await waitFor(() => {
      expect(screen.getByText('产品白皮书.pdf')).toBeInTheDocument();
      expect(screen.getByText('第一页提取文本')).toBeInTheDocument();
      expect(screen.getByText('P1')).toBeInTheDocument();
      expect(screen.queryByText('连续全文不应作为 PDF 主视图')).not.toBeInTheDocument();

      const openPdfBtn = screen.getByText('查看原版 PDF');
      expect(openPdfBtn.closest('a')).toHaveAttribute('href', originalUrl);
    });
  });

  it('TC09-3 chunks 优先并高亮 focusedAnchor', async () => {
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_md',
        name: '规格文档.md',
        chunkCount: 2,
        sourceFormat: 'md',
        renderMode: 'markdown',
        content: '完整连续全文不应作为主视图',
        chunks: [
          {
            chunkIndex: 0,
            content: '切片 0 的 Markdown 文本内容',
            headingPath: '第一节',
            pageNumber: null,
          },
          {
            chunkIndex: 1,
            content: '切片 1 的命中切片正文内容',
            headingPath: '第二节 重点',
            pageNumber: null,
          },
        ],
      })
    );

    renderDrawer({
      documentId: 'doc_md',
      documentName: '规格文档.md',
      documentVersion: 1,
      focusedAnchor: { chunkIndex: 1, headingPath: '第二节 重点' },
    });

    await waitFor(() => {
      expect(screen.getByText('规格文档.md')).toBeInTheDocument();
      expect(screen.getByText('切片 1 的命中切片正文内容')).toBeInTheDocument();
      expect(screen.queryByText('完整连续全文不应作为主视图')).not.toBeInTheDocument();
    });

    // Portal 挂载在 document.body 上，按切片索引断言高亮
    const chunk0 = document.querySelector('[data-chunk-index="0"]');
    const chunk1 = document.querySelector('[data-chunk-index="1"]');

    expect(chunk0).toBeInTheDocument();
    expect(chunk1).toBeInTheDocument();
    expect(chunk0).toHaveClass('border-border/50');
    expect(chunk0).not.toHaveClass('border-primary');
    expect(chunk1).toHaveClass('border-primary');
    expect(chunk1).toHaveClass('bg-primary/10');
  });

  it('TC09-4 null 切片计数不显零或旧值', async () => {
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_no_count',
        name: '无计数文档.md',
        chunkCount: null,
        status: 'ready',
        sourceFormat: 'md',
        renderMode: 'markdown',
        content: '正文可用但计数不适用。',
        chunks: [],
      })
    );

    renderDrawer({ documentId: 'doc_no_count', documentName: '无计数文档.md' });

    await waitFor(() => {
      expect(screen.getByText('无计数文档.md')).toBeInTheDocument();
      expect(screen.getByText('正文可用但计数不适用。')).toBeInTheDocument();
      expect(screen.queryByText(/个切片/)).not.toBeInTheDocument();
      expect(screen.queryByText('0 个切片')).not.toBeInTheDocument();
      expect(screen.queryByText('12 个切片')).not.toBeInTheDocument();
    });
  });

  it('TC09-5 外部原文与源资产下载链接不互换', async () => {
    const sourceUrl = 'https://mp.weixin.qq.com/s/article_target_123';
    const originalUrl = 'https://storage.example.com/url-abc/content.md?token=snapshot';
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_url',
        name: '微信架构深度实战.md',
        sourceType: 'url',
        sourceFormat: 'md',
        renderMode: 'markdown',
        content: '# 微信架构深度实战\n\n正文内容...',
        originalUrl,
        sourceUrl,
      })
    );

    renderDrawer({
      documentId: 'doc_url',
      documentName: '微信架构深度实战.md',
      sourceUrl,
    });

    await waitFor(() => {
      expect(screen.getByText('微信架构深度实战.md')).toBeInTheDocument();

      const sourceLink = screen.getByTestId('document-source-link');
      expect(sourceLink).toHaveAttribute('href', sourceUrl);
      expect(sourceLink).toHaveAttribute('target', '_blank');
      expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');
      expect(sourceLink).toHaveTextContent('跳转原文');

      const downloadLink = screen.getByTestId('document-download-link');
      expect(downloadLink).toHaveAttribute('href', originalUrl);
      expect(downloadLink).toHaveTextContent('下载原文件');

      expect(sourceLink).not.toHaveAttribute('href', originalUrl);
      expect(downloadLink).not.toHaveAttribute('href', sourceUrl);
    });
  });

  it('TC09-6 请求失败显示聊天历史快照', async () => {
    mockPreviewFailure('文档已被删除或无权访问');

    renderDrawer({
      documentId: 'doc_deleted',
      documentName: '已删除文档.md',
      fallbackSnippet: '这是当时问答时保存的切片快照正文内容。',
    });

    await waitFor(() => {
      expect(screen.getByTestId('citation-snapshot-fallback')).toBeInTheDocument();
      expect(screen.getByText('源文档已被删除或更新')).toBeInTheDocument();
      expect(screen.getByText(/这是当时问答时保存的切片快照正文内容/)).toBeInTheDocument();
    });
  });

  it('TC09-7 知识库请求失败显示错误与重新加载', async () => {
    mockPreviewFailure('文档已被删除或无权访问');

    renderDrawer({
      documentId: 'doc_err',
      documentName: '错误文档.md',
      documentVersion: 1,
    });

    await waitFor(() => {
      expect(screen.getByText('文档已被删除或无权访问')).toBeInTheDocument();
      expect(screen.getByText('重新加载')).toBeInTheDocument();
      expect(screen.queryByTestId('citation-snapshot-fallback')).not.toBeInTheDocument();
    });
  });

  it('TC10-1 DOCX 归一化披露', async () => {
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_docx',
        name: '季度报告.docx',
        sourceFormat: 'docx',
        renderMode: 'markdown',
        content: '# 季度报告\n\n归一化正文。',
      })
    );

    renderDrawer({ documentId: 'doc_docx', documentName: '季度报告.docx' });

    const notice = await screen.findByTestId('document-normalized-notice');
    expect(notice).toHaveTextContent('图片与原始版式可能未保留');
    expect(notice).toHaveTextContent('完整事实');
    expect(notice).toHaveTextContent('原件');
  });

  it('TC10-2 表格归一化披露决策表', async () => {
    const cases = [
      { id: 'doc_xlsx', name: '经营报表.xlsx', sourceFormat: 'xlsx' as const },
      { id: 'doc_csv', name: '明细.csv', sourceFormat: 'csv' as const },
    ];

    for (const testCase of cases) {
      mockPreviewSuccess(
        createPreviewData({
          id: testCase.id,
          name: testCase.name,
          sourceFormat: testCase.sourceFormat,
          renderMode: 'markdown',
          content: '# 表格正文\n\n归一化内容。',
        })
      );

      const { unmount } = renderDrawer({
        documentId: testCase.id,
        documentName: testCase.name,
      });

      const notice = await screen.findByTestId('document-normalized-notice');
      expect(notice).toHaveTextContent('可能未展示全部工作表、行或列');
      expect(notice).toHaveTextContent('完整事实');
      expect(notice).toHaveTextContent('原件');
      // 披露不虚构精确行列数
      expect(notice.textContent).not.toMatch(/\d/);

      unmount();
    }
  });

  it('TC10-3 其他格式与非 ready 不显示披露', async () => {
    const cases: Array<Partial<DocumentPreviewData>> = [
      {
        id: 'doc_md',
        name: '规范.md',
        sourceFormat: 'md',
        sourceType: 'file',
        renderMode: 'markdown',
      },
      {
        id: 'doc_txt',
        name: '说明.txt',
        sourceFormat: 'txt',
        sourceType: 'file',
        renderMode: 'markdown',
      },
      {
        id: 'doc_pdf',
        name: '白皮书.pdf',
        sourceFormat: 'pdf',
        sourceType: 'file',
        renderMode: 'pdf-chunks',
        content: '',
        chunks: [
          { chunkIndex: 0, content: 'PDF 提取正文', headingPath: null, pageNumber: 1 },
        ],
      },
      {
        id: 'doc_url',
        name: '网页文章.md',
        sourceFormat: 'md',
        sourceType: 'url',
        renderMode: 'markdown',
        sourceUrl: 'https://example.com/article',
      },
      {
        id: 'doc_artifact',
        name: '对话产物.md',
        sourceFormat: 'md',
        sourceType: 'chat_artifact',
        renderMode: 'markdown',
        originalUrl: 'https://storage.example.com/artifact/content.md',
      },
      {
        id: 'doc_docx_pending',
        name: '索引中.docx',
        sourceFormat: 'docx',
        sourceType: 'file',
        status: 'pending',
        renderMode: undefined,
        content: '',
        chunks: [],
      },
      {
        id: 'doc_xlsx_failed',
        name: '失败.xlsx',
        sourceFormat: 'xlsx',
        sourceType: 'file',
        status: 'failed',
        errorMessage: '表格解析失败',
        renderMode: undefined,
        content: '',
        chunks: [],
      },
      {
        id: 'doc_csv_processing',
        name: '处理中.csv',
        sourceFormat: 'csv',
        sourceType: 'file',
        status: 'processing',
        renderMode: undefined,
        content: '',
        chunks: [],
      },
    ];

    for (const testCase of cases) {
      mockPreviewSuccess(createPreviewData(testCase));

      const { unmount } = renderDrawer({
        documentId: testCase.id,
        documentName: testCase.name,
      });

      await screen.findByText(testCase.name!);
      expect(screen.queryByTestId('document-normalized-notice')).not.toBeInTheDocument();

      unmount();
    }
  });

  it('点击关闭按钮触发 onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    mockPreviewSuccess(
      createPreviewData({
        name: '测试文档.md',
        chunkCount: 1,
        content: '简单的文档内容',
      })
    );

    renderDrawer({ onOpenChange, documentName: '测试文档.md', documentVersion: 1 });

    await waitFor(() => {
      expect(screen.getByText('测试文档.md')).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText('关闭预览');
    fireEvent.click(closeBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('多切片命中时展示 ChunkNavigator，点击“下一个/上一个”触发 onSelectAnchor', async () => {
    const onSelectAnchor = vi.fn();
    mockPreviewSuccess(
      createPreviewData({
        name: '多切片文档.md',
        chunkCount: 10,
        content: '# 第一章\n\n正文 1\n\n# 第二章\n\n正文 2',
      })
    );

    const mockAnchors = [
      { chunkIndex: 0, headingPath: '第一章' },
      { chunkIndex: 3, headingPath: '第二章' },
    ];

    renderDrawer({
      documentName: '多切片文档.md',
      documentVersion: 1,
      focusedAnchor: mockAnchors[0],
      allMatchedAnchors: mockAnchors,
      onSelectAnchor,
    });

    // 验证导航控制器呈现
    await waitFor(() => {
      expect(screen.getByText(/命中切片 1 \/ 2/)).toBeInTheDocument();
      expect(screen.getByText('(第一章)')).toBeInTheDocument();
    });

    // 点击“下一个”按钮
    const nextBtn = screen.getByRole('button', { name: /下一个/ });
    expect(nextBtn).toHaveClass('min-h-[44px]');
    fireEvent.click(nextBtn);

    expect(onSelectAnchor).toHaveBeenCalledWith(mockAnchors[1]);
  });

  it('文档处于索引中（processing）状态时展示专属状态提示面板 (US-12)', async () => {
    mockPreviewSuccess(
      createPreviewData({
        id: 'doc_proc',
        name: '待处理文件.md',
        chunkCount: null,
        status: 'processing',
        sourceFormat: 'md',
        renderMode: undefined,
        content: '',
        chunks: [],
      })
    );

    renderDrawer({
      documentId: 'doc_proc',
      documentName: '待处理文件.md',
      initialStatus: 'processing',
    });

    await waitFor(() => {
      expect(screen.getByText('文档正在切片索引中')).toBeInTheDocument();
      expect(screen.getByText(/该文档正在后台进行智能切片与向量化构建/)).toBeInTheDocument();
      expect(screen.getByText('索引中')).toBeInTheDocument();
      expect(screen.queryByText(/个切片/)).not.toBeInTheDocument();
      expect(screen.queryByTestId('document-normalized-notice')).not.toBeInTheDocument();
    });
  });

  it('modal=false 时隐藏全局遮罩实现非模态边看边聊 (TC02 / ADR-0025)', async () => {
    mockPreviewSuccess(createPreviewData({ content: '正文' }));

    renderDrawer({ modal: false });

    await waitFor(() => {
      const content = screen.getByTestId('document-preview-drawer-content');
      expect(content).toBeInTheDocument();
      // 在 modal=false 时 DialogOverlay 应被隐藏
      const overlay = document.querySelector('.bg-black\\/40');
      expect(overlay).toBeNull();
    });
  });
});
