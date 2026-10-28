import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactWorkspace } from './artifact-workspace';
import { useChatStore } from '@/stores/chat-store';
import type { Artifact } from '@repo/shared';

// Mock 子组件弹窗以专注测试工作台自身的交互行为
vi.mock('./deposit-artifact-dialog', () => ({
  DepositArtifactDialog: ({ open, artifact }: any) => {
    if (!open) return null;
    return (
      <div data-testid="mock-deposit-dialog">
        <span>弹窗已打开: {artifact?.title}</span>
      </div>
    );
  },
}));

describe('ArtifactWorkspace 组件知识库沉淀增强 (TC07 / ADR-0034)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('断言 1: 未沉淀的 Markdown 产物顶部操作栏渲染「存入知识库」按钮', () => {
    const art: Artifact = {
      id: 'art-md-1',
      type: 'markdown',
      title: '行业前沿深度调研',
      content: '# 研报内容\n\n详细段落...',
      status: 'complete',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: 'art-md-1',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace />);

    const depositBtn = screen.getByTestId('deposit-to-kb-btn');
    expect(depositBtn).toBeInTheDocument();
    expect(screen.getByText('存入知识库')).toBeInTheDocument();
  });

  it('断言 2: 点击「存入知识库」按钮打开沉淀确认弹窗', () => {
    const art: Artifact = {
      id: 'art-md-2',
      type: 'markdown',
      title: '架构设计白皮书',
      content: '# 架构内容',
      status: 'complete',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: 'art-md-2',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace />);

    const depositBtn = screen.getByTestId('deposit-to-kb-btn');
    fireEvent.click(depositBtn);

    expect(screen.getByTestId('mock-deposit-dialog')).toBeInTheDocument();
    expect(screen.getByText('弹窗已打开: 架构设计白皮书')).toBeInTheDocument();
  });

  it('断言 3: 已沉淀产物准确渲染「已入库」绿色徽标', () => {
    const art: Artifact = {
      id: 'art-md-3',
      type: 'markdown',
      title: '已归档政策',
      content: '# 政策内容',
      status: 'complete',
      kbDeposit: {
        deposited: true,
        knowledgeBaseId: 'kb_fin',
        knowledgeBaseName: '财务规章库',
        documentId: 'doc_99',
        depositedAt: new Date().toISOString(),
      },
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: 'art-md-3',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace />);

    const badge = screen.getByTestId('artifact-deposited-badge');
    expect(badge).toBeInTheDocument();
    expect(screen.getByText('已入库')).toBeInTheDocument();
    expect(screen.queryByTestId('deposit-to-kb-btn')).not.toBeInTheDocument();
  });

  it('断言 4: 图片类生成产物不渲染知识库沉淀按钮', () => {
    const art: Artifact = {
      id: 'art-img-1',
      type: 'image',
      title: '生成图表',
      content: 'https://example.com/test.png',
      status: 'complete',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: 'art-img-1',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace />);

    expect(screen.queryByTestId('deposit-to-kb-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-deposited-badge')).not.toBeInTheDocument();
  });
});
