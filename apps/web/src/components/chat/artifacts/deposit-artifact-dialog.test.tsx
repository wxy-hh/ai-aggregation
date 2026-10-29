import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DepositArtifactDialog } from './deposit-artifact-dialog';
import { useChatStore } from '@/stores/chat-store';
import type { Artifact } from '@repo/shared';

const mockFetchWithAuth = vi.fn();
vi.mock('@/lib/api/client', () => ({
  fetchWithAuth: (...args: any[]) => mockFetchWithAuth(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('DepositArtifactDialog 组件交互 (TC07 / ADR-0034)', () => {
  const sampleArtifact: Artifact = {
    id: 'art_100',
    type: 'markdown',
    title: '深度对比分析表',
    content: '# 对比\n\n- 方案A\n- 方案B',
    status: 'complete',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().reset();
    useChatStore.setState({
      artifacts: [sampleArtifact],
      activeArtifactId: sampleArtifact.id,
      isWorkspaceOpen: true,
    });

    mockFetchWithAuth.mockImplementation(async (url: string) => {
      if (url === '/api/knowledge-bases') {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: [
              { id: 'kb_1', name: '技术知识库' },
              { id: 'kb_2', name: '行业研报库' },
            ],
          }),
        };
      }
      if (url.includes('/documents/artifact')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { id: 'doc_new_1', name: '深度对比分析表' },
          }),
        };
      }
      return { ok: false, json: async () => ({ success: false }) };
    });
  });

  it('断言 1: 打开弹窗自动拉取知识库列表并回显标题', async () => {
    const onOpenChange = vi.fn();
    render(
      <DepositArtifactDialog
        open={true}
        onOpenChange={onOpenChange}
        artifact={sampleArtifact}
      />
    );

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith('/api/knowledge-bases');
    });

    expect(screen.getByText('沉淀至知识库')).toBeInTheDocument();
    const titleInput = screen.getByTestId('artifact-title-input');
    expect(titleInput).toHaveValue('深度对比分析表');
    expect(screen.getByText('技术知识库')).toBeInTheDocument();
  });

  it('断言 2: 支持通过回车添加多维标签 Badge 并支持移除', async () => {
    render(
      <DepositArtifactDialog
        open={true}
        onOpenChange={vi.fn()}
        artifact={sampleArtifact}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('artifact-tag-input')).toBeInTheDocument();
    });

    const tagInput = screen.getByTestId('artifact-tag-input');
    fireEvent.change(tagInput, { target: { value: '竞品调研' } });
    fireEvent.keyDown(tagInput, { key: 'Enter', code: 'Enter' });

    expect(screen.getByText('竞品调研')).toBeInTheDocument();

    // 移除标签
    const removeBtn = screen.getByRole('button', { name: '移除标签 竞品调研' });
    fireEvent.click(removeBtn);

    expect(screen.queryByText('竞品调研')).not.toBeInTheDocument();
  });

  it('断言 3: 选择知识库并点击确认后提交沉淀请求并标记 Store 已入库', async () => {
    const onOpenChange = vi.fn();
    render(
      <DepositArtifactDialog
        open={true}
        onOpenChange={onOpenChange}
        artifact={sampleArtifact}
        sessionId="sess_test_1"
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('confirm-deposit-btn')).toBeInTheDocument();
    });

    const confirmBtn = screen.getByTestId('confirm-deposit-btn');
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_1/documents/artifact',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"title":"深度对比分析表"'),
        })
      );
    });

    // 验证 Store 中的产物已被标记为已入库
    const storedArt = useChatStore.getState().artifacts.find((a) => a.id === sampleArtifact.id);
    expect(storedArt?.kbDeposit?.deposited).toBe(true);
    expect(storedArt?.kbDeposit?.documentId).toBe('doc_new_1');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it('[TC10-6] 入库版本落后于当前版：提示当前已有新版本，提交内容为当前版并把入库版本绑定到当前版', async () => {
    const stale: Artifact = {
      id: 'art_200',
      type: 'markdown',
      title: '多版本研报',
      content: '# 研报\n\n第二版内容',
      status: 'complete',
      versions: [
        { id: 'v1', seq: 1, content: '# 研报\n\n第一版内容', createdAt: 1, source: { kind: 'generated' } },
        { id: 'v2', seq: 2, content: '# 研报\n\n第二版内容', createdAt: 2, source: { kind: 'patch' } },
      ],
      kbDeposit: {
        deposited: true,
        knowledgeBaseId: 'kb_1',
        knowledgeBaseName: '技术知识库',
        documentId: 'doc_old',
        depositedAt: new Date().toISOString(),
        versionId: 'v1',
      },
    };
    useChatStore.setState({ artifacts: [stale], activeArtifactId: stale.id, isWorkspaceOpen: true });

    render(<DepositArtifactDialog open={true} onOpenChange={vi.fn()} artifact={stale} />);

    await waitFor(() => {
      expect(screen.getByTestId('already-deposited-hint')).toHaveTextContent('入库于 v1，当前已有新版本 v2');
    });
    expect(screen.getByTestId('confirm-deposit-btn')).toHaveTextContent('确认另存新文档');

    fireEvent.click(screen.getByTestId('confirm-deposit-btn'));
    await waitFor(() => {
      expect(mockFetchWithAuth).toHaveBeenCalledWith(
        '/api/knowledge-bases/kb_1/documents/artifact',
        expect.objectContaining({ method: 'POST' })
      );
    });
    const call = mockFetchWithAuth.mock.calls.find((c) => String(c[0]).includes('/documents/artifact'))!;
    const body = JSON.parse(call[1].body as string);
    expect(body.content).toBe('# 研报\n\n第二版内容');
    expect(body.content).not.toContain('第一版');

    await waitFor(() => {
      const stored = useChatStore.getState().artifacts.find((a) => a.id === 'art_200');
      expect(stored?.kbDeposit?.versionId).toBe('v2');
      expect(stored?.kbDeposit?.documentId).toBe('doc_new_1');
    });
  });

  it('首次入库时记录入库版本；老数据无版本链时记为 v1', async () => {
    render(<DepositArtifactDialog open={true} onOpenChange={vi.fn()} artifact={sampleArtifact} />);
    await waitFor(() => expect(screen.getByTestId('confirm-deposit-btn')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('confirm-deposit-btn'));
    await waitFor(() => {
      const stored = useChatStore.getState().artifacts.find((a) => a.id === sampleArtifact.id);
      expect(stored?.kbDeposit?.versionId).toBe('v1');
    });
  });
});
