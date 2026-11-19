import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DocumentMetadataDialog } from './document-metadata-dialog';
import type { DocumentItem } from '../knowledge-workspace';

const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: (...args: any[]) => mockFetchWithAuth(...args),
}));

describe('DocumentMetadataDialog 文档多维标签编辑弹窗测试 (ADR-0032)', () => {
  const mockDoc: DocumentItem = {
    id: 'doc_123',
    name: '2026年财务报销规约.pdf',
    status: 'ready',
    version: 1,
    chunkCount: 12,
    errorMessage: null,
    tags: ['财务', '2026'],
    createdAt: '2026-10-28T00:00:00.000Z',
    updatedAt: '2026-10-28T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('1. 弹窗打开并正确回显现有标签', () => {
    render(
      <DocumentMetadataDialog
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_123"
        document={mockDoc}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByText('编辑文档分类标签')).toBeInTheDocument();
    expect(screen.getByText(/2026年财务报销规约.pdf/)).toBeInTheDocument();

    // 验证回显的现有标签
    expect(screen.getByTestId('metadata-tag-badge-财务')).toBeInTheDocument();
    expect(screen.getByTestId('metadata-tag-badge-2026')).toBeInTheDocument();
    expect(screen.getByText('已选标签（2 个）：')).toBeInTheDocument();
  });

  it('2. 添加标签：支持按回车键或点击添加按钮，并拦截重复标签', async () => {
    const user = userEvent.setup();

    render(
      <DocumentMetadataDialog
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_123"
        document={mockDoc}
        onSuccess={vi.fn()}
      />
    );

    const input = screen.getByTestId('metadata-tag-input');
    const addBtn = screen.getByTestId('metadata-add-tag-button');

    // 尝试添加已有的「财务」标签
    await user.type(input, '财务{enter}');
    expect(screen.getByText('标签“财务”已存在')).toBeInTheDocument();

    // 添加新标签「差旅」
    await user.clear(input);
    await user.type(input, '差旅');
    await user.click(addBtn);

    expect(screen.queryByText('标签“财务”已存在')).not.toBeInTheDocument();
    expect(screen.getByTestId('metadata-tag-badge-差旅')).toBeInTheDocument();
    expect(screen.getByText('已选标签（3 个）：')).toBeInTheDocument();
  });

  it('3. 移除标签：点击叉号成功移除对应标签', async () => {
    const user = userEvent.setup();

    render(
      <DocumentMetadataDialog
        open={true}
        onOpenChange={vi.fn()}
        knowledgeBaseId="kb_123"
        document={mockDoc}
        onSuccess={vi.fn()}
      />
    );

    expect(screen.getByTestId('metadata-tag-badge-2026')).toBeInTheDocument();

    const removeBtn = screen.getByTestId('remove-tag-2026');
    await user.click(removeBtn);

    expect(screen.queryByTestId('metadata-tag-badge-2026')).not.toBeInTheDocument();
    expect(screen.getByText('已选标签（1 个）：')).toBeInTheDocument();
  });

  it('4. 保存修改：调用 PATCH 接口并在成功后触发 onSuccess 回调与关闭', async () => {
    const user = userEvent.setup();
    const handleSuccess = vi.fn();
    const handleOpenChange = vi.fn();

    mockFetchWithAuth.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          documentId: 'doc_123',
          updatedChunkCount: 12,
          tags: ['财务', '发票'],
        },
      }),
    });

    render(
      <DocumentMetadataDialog
        open={true}
        onOpenChange={handleOpenChange}
        knowledgeBaseId="kb_123"
        document={mockDoc}
        onSuccess={handleSuccess}
      />
    );

    // 移除 2026 标签，新增 发票 标签
    await user.click(screen.getByTestId('remove-tag-2026'));
    const input = screen.getByTestId('metadata-tag-input');
    await user.type(input, '发票{enter}');

    // 点击保存
    const saveBtn = screen.getByTestId('metadata-save-button');
    await user.click(saveBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_123/documents/doc_123',
        expect.objectContaining({
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tags: ['财务', '发票'],
            metadata: {},
          }),
        })
      );
    });

    await waitFor(() => {
      expect(handleSuccess).toHaveBeenCalledWith({
        id: 'doc_123',
        tags: ['财务', '发票'],
      });
      expect(handleOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
