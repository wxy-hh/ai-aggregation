import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import * as React from 'react';
import { KnowledgeWorkspace } from './knowledge-workspace';
import * as lifecycleModule from './_lib/use-knowledge-lifecycle';
import type { KnowledgeBaseItem, DocumentItem } from './_lib/knowledge-lifecycle-rules';

// Mock 子组件，使装配测试轻量且专注于页面编排
vi.mock('./_components/retrieval-debugger', () => ({
  RetrievalDebugger: ({ knowledgeBaseId }: { knowledgeBaseId: string }) => (
    <div data-testid="mock-retrieval-debugger">调试台: {knowledgeBaseId}</div>
  ),
}));

vi.mock('./_components/faq-management-panel', () => ({
  FaqManagementPanel: ({ knowledgeBaseId }: { knowledgeBaseId: string }) => (
    <div data-testid="mock-faq-panel">FAQ面板: {knowledgeBaseId}</div>
  ),
}));

vi.mock('./_components/document-preview-drawer', () => ({
  DocumentPreviewDrawer: () => <div data-testid="mock-preview-drawer" />,
}));

vi.mock('./_components/url-import-dialog', () => ({
  UrlImportDialog: () => <div data-testid="mock-url-import-dialog" />,
}));

vi.mock('./_components/document-metadata-dialog', () => ({
  DocumentMetadataDialog: () => <div data-testid="mock-metadata-dialog" />,
}));

describe('KnowledgeWorkspace (TC05 页面级装配测试)', () => {
  const mockKb1: KnowledgeBaseItem = {
    id: 'kb-1',
    name: '知识库 Alpha',
    description: '描述 A',
    status: 'ready',
    documentCount: 5,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockKb2: KnowledgeBaseItem = {
    id: 'kb-2',
    name: '知识库 Beta',
    description: '描述 B',
    status: 'ready',
    documentCount: 2,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockDoc: DocumentItem = {
    id: 'doc-1',
    name: '技术规格说明.docx',
    status: 'ready',
    version: 1,
    chunkCount: 12,
    errorMessage: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('首屏正确渲染标题栏、知识库选择卡片并高亮当前选中项', () => {
    const setSelectedKbId = vi.fn();
    const refreshAll = vi.fn();

    vi.spyOn(lifecycleModule, 'useKnowledgeLifecycle').mockReturnValue({
      knowledgeBases: [mockKb1, mockKb2],
      selectedKbId: 'kb-1',
      selectedKb: mockKb1,
      documents: [mockDoc],
      loading: false,
      docsLoading: false,
      isPolling: false,
      setSelectedKbId,
      refreshAll,
      refreshCurrentDocs: vi.fn(),
      handleFileUploadSuccess: vi.fn(),
      handleUrlImportSuccess: vi.fn(),
      handleMetadataSuccess: vi.fn(),
      handleCreateKbSuccess: vi.fn(),
    });

    render(<KnowledgeWorkspace />);

    expect(screen.getByText('知识库中心')).toBeInTheDocument();
    expect(screen.getByText('知识库 Alpha')).toBeInTheDocument();
    expect(screen.getByText('知识库 Beta')).toBeInTheDocument();
    expect(screen.getByText('5 篇')).toBeInTheDocument();
    expect(screen.getByText('2 篇')).toBeInTheDocument();

    // 点击第二个知识库卡片触发切换
    fireEvent.click(screen.getByText('知识库 Beta'));
    expect(setSelectedKbId).toHaveBeenCalledWith('kb-2');

    // 点击顶部刷新按钮触发 refreshAll
    const refreshBtn = screen.getByRole('button', { name: /刷新/ });
    fireEvent.click(refreshBtn);
    expect(refreshAll).toHaveBeenCalled();
  });

  it('点击「新建知识库」按钮能够打开新建 Dialog', () => {
    vi.spyOn(lifecycleModule, 'useKnowledgeLifecycle').mockReturnValue({
      knowledgeBases: [mockKb1],
      selectedKbId: 'kb-1',
      selectedKb: mockKb1,
      documents: [],
      loading: false,
      docsLoading: false,
      isPolling: false,
      setSelectedKbId: vi.fn(),
      refreshAll: vi.fn(),
      refreshCurrentDocs: vi.fn(),
      handleFileUploadSuccess: vi.fn(),
      handleUrlImportSuccess: vi.fn(),
      handleMetadataSuccess: vi.fn(),
      handleCreateKbSuccess: vi.fn(),
    });

    render(<KnowledgeWorkspace />);

    const newKbBtn = screen.getByRole('button', { name: /新建知识库/ });
    fireEvent.click(newKbBtn);

    expect(screen.getByRole('heading', { name: '新建知识库' })).toBeInTheDocument();
    expect(screen.getByPlaceholderText('知识库名称')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '确认创建' })).toBeInTheDocument();
  });
});
