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
    fireEvent.click(nextBtn);

    expect(onSelectAnchor).toHaveBeenCalledWith(mockAnchors[1]);
  });
});
