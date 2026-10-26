import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { DocumentPreviewDrawer } from './document-preview-drawer';

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

describe('DocumentPreviewDrawer 组件', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('open=false 时不渲染抽屉正文', () => {
    render(
      <DocumentPreviewDrawer
        open={false}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_1"
        documentName="测试文档.md"
        documentVersion={1}
      />
    );

    expect(screen.queryByTestId('document-preview-drawer-content')).not.toBeInTheDocument();
  });

  it('open=true 时展示加载状态，随后渲染文档标题与 Markdown 正文', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_1',
          name: '测试文档.md',
          version: 1,
          chunkCount: 8,
          fileType: 'markdown',
          content: '# 知识库设计\n\n这是用于测试文档预览的正文内容。',
        },
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_1"
        documentName="测试文档.md"
        documentVersion={1}
      />
    );

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

  it('PDF 文档展示结构化文本和“查看原版”按钮', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_pdf',
          name: '产品白皮书.pdf',
          version: 2,
          chunkCount: 3,
          fileType: 'pdf',
          content: '第一章 架构设计\n\n这是 PDF 结构化提取内容。',
          originalUrl: 'https://storage.example.com/test.pdf',
        },
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_pdf"
        documentName="产品白皮书.pdf"
        documentVersion={2}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('产品白皮书.pdf')).toBeInTheDocument();
      const openPdfBtn = screen.getByText('查看原版 PDF');
      expect(openPdfBtn).toBeInTheDocument();
      expect(openPdfBtn.closest('a')).toHaveAttribute('href', 'https://storage.example.com/test.pdf');
    });
  });

  it('点击关闭按钮触发 onOpenChange(false)', async () => {
    const onOpenChange = vi.fn();
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_1',
          name: '测试文档.md',
          version: 1,
          chunkCount: 1,
          fileType: 'markdown',
          content: '简单的文档内容',
        },
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={onOpenChange}
        knowledgeBaseId="kb_1"
        documentId="doc_1"
        documentName="测试文档.md"
        documentVersion={1}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('测试文档.md')).toBeInTheDocument();
    });

    const closeBtn = screen.getByLabelText('关闭预览');
    fireEvent.click(closeBtn);

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('加载失败时展示中文错误提示与重试按钮', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: '文档已被删除或无权访问',
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_err"
        documentName="错误文档.md"
        documentVersion={1}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('文档已被删除或无权访问')).toBeInTheDocument();
      expect(screen.getByText('重新加载')).toBeInTheDocument();
    });
  });

  it('多切片命中时展示 ChunkNavigator，点击“下一个/上一个”触发 onSelectAnchor', async () => {
    const onSelectAnchor = vi.fn();
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_1',
          name: '多切片文档.md',
          version: 1,
          chunkCount: 10,
          fileType: 'markdown',
          content: '# 第一章\n\n正文 1\n\n# 第二章\n\n正文 2',
        },
      }),
    });

    const mockAnchors = [
      { chunkIndex: 0, headingPath: '第一章' },
      { chunkIndex: 3, headingPath: '第二章' },
    ];

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_1"
        documentName="多切片文档.md"
        documentVersion={1}
        focusedAnchor={mockAnchors[0]}
        allMatchedAnchors={mockAnchors}
        onSelectAnchor={onSelectAnchor}
      />
    );

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

  it('Markdown 文档切片按分块渲染，命中切片挂载 data-chunk-index 与焦点高亮样式 (Spec 契约)', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_md',
          name: '规格文档.md',
          version: 1,
          chunkCount: 2,
          fileType: 'markdown',
          status: 'ready',
          content: '全量内容（兜底）',
          chunks: [
            {
              chunkIndex: 0,
              content: '切片 0 的 Markdown 文本内容',
              headingPath: '第一节',
              pageNumber: null,
            },
            {
              chunkIndex: 1,
              content: '切片 1 的 Markdown 命中重点内容',
              headingPath: '第二节 重点',
              pageNumber: null,
            },
          ],
        },
      }),
    });

    const { container } = render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_md"
        documentName="规格文档.md"
        documentVersion={1}
        focusedAnchor={{ chunkIndex: 1, headingPath: '第二节 重点' }}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('规格文档.md')).toBeInTheDocument();
    });

    // 验证每个切片节点均携带 data-chunk-index 属性（Portal 挂载在 document.body 上）
    const chunk0 = document.querySelector('[data-chunk-index="0"]');
    const chunk1 = document.querySelector('[data-chunk-index="1"]');

    expect(chunk0).toBeInTheDocument();
    expect(chunk1).toBeInTheDocument();

    // 验证未命中的切片 0 为常规边框
    expect(chunk0).toHaveClass('border-border/50');
    expect(chunk0).not.toHaveClass('border-primary');

    // 验证命中的切片 1 获得焦点高亮样式 (border-primary, bg-primary/10)
    expect(chunk1).toHaveClass('border-primary');
    expect(chunk1).toHaveClass('bg-primary/10');
  });

  it('文档处于索引中（processing）状态时展示专属状态提示面板 (US-12)', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_proc',
          name: '待处理文件.md',
          version: 1,
          chunkCount: 0,
          status: 'processing',
          fileType: 'markdown',
          content: '',
          chunks: [],
        },
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_proc"
        documentName="待处理文件.md"
        initialStatus="processing"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('文档正在切片索引中')).toBeInTheDocument();
      expect(screen.getByText(/该文档正在后台进行智能切片与向量化构建/)).toBeInTheDocument();
      expect(screen.getByText('索引中')).toBeInTheDocument();
    });
  });

  it('文档处于失败（failed）状态时展示结构化失败原因面板 (US-12)', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_failed',
          name: '损坏文件.pdf',
          version: 1,
          chunkCount: 0,
          status: 'failed',
          errorMessage: 'PDF 文件损坏或包含不支持的加密算法',
          fileType: 'pdf',
          content: '',
          chunks: [],
        },
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_failed"
        documentName="损坏文件.pdf"
        initialStatus="failed"
        initialErrorMessage="PDF 文件损坏或包含不支持的加密算法"
      />
    );

    await waitFor(() => {
      expect(screen.getByText('文档解析或切片失败')).toBeInTheDocument();
      expect(screen.getByText('PDF 文件损坏或包含不支持的加密算法')).toBeInTheDocument();
      expect(screen.getByText('失败')).toBeInTheDocument();
    });
  });

  it('接口 404 且提供 fallbackSnippet 时优雅降级渲染切片快照 (TC07 / ADR-0025)', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: false,
      json: async () => ({
        success: false,
        error: '文档已被删除或无权访问',
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_deleted"
        documentName="已删除文档.md"
        fallbackSnippet="这是当时问答时保存的切片快照正文内容。"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('citation-snapshot-fallback')).toBeInTheDocument();
      expect(screen.getByText('源文档已被删除或更新')).toBeInTheDocument();
      expect(screen.getByText(/这是当时问答时保存的切片快照正文内容/)).toBeInTheDocument();
    });
  });

  it('modal=false 时隐藏全局遮罩实现非模态边看边聊 (TC02 / ADR-0025)', async () => {
    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          id: 'doc_1',
          name: '测试文档.md',
          version: 1,
          content: '正文',
        },
      }),
    });

    render(
      <DocumentPreviewDrawer
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_1"
        documentId="doc_1"
        modal={false}
      />
    );

    await waitFor(() => {
      const content = screen.getByTestId('document-preview-drawer-content');
      expect(content).toBeInTheDocument();
      // 在 modal=false 时 DialogOverlay 应被隐藏
      const overlay = document.querySelector('.bg-black\\/40');
      expect(overlay).toBeNull();
    });
  });
});
