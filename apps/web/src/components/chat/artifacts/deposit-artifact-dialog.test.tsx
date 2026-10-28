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
});
