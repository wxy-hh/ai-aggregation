import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ArtifactCard } from './artifact-card';
import { ArtifactWorkspace } from './artifact-workspace';
import { useChatStore } from '@/stores/chat-store';
import type { Artifact } from '@repo/shared';

describe('ArtifactCard 组件 (ADR-0015)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('正确渲染产物卡片基本信息并支持点击唤醒工作台', () => {
    const art: Artifact = {
      id: 'art-1',
      type: 'markdown',
      title: '行业前沿深度调研',
      content: '# 研报内容',
      status: 'complete',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: null,
      isWorkspaceOpen: false,
    });

    render(<ArtifactCard artifactId="art-1" />);

    expect(screen.getByText('行业前沿深度调研')).toBeInTheDocument();
    expect(screen.getByText('研报文档')).toBeInTheDocument();

    const card = screen.getByTestId('artifact-card');
    fireEvent.click(card);

    expect(useChatStore.getState().activeArtifactId).toBe('art-1');
    expect(useChatStore.getState().isWorkspaceOpen).toBe(true);
  });

  it('流式生成中时展示「生成中」徽标', () => {
    const art: Artifact = {
      id: 'art-streaming',
      type: 'code',
      title: '算法脚本',
      language: 'typescript',
      content: 'function test() {}',
      status: 'streaming',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: null,
      isWorkspaceOpen: false,
    });

    render(<ArtifactCard artifactId="art-streaming" />);
    expect(screen.getByText('生成中')).toBeInTheDocument();
    expect(screen.getByText(/typescript/)).toBeInTheDocument();
  });
});

describe('ArtifactWorkspace 组件 (ADR-0015)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
      writable: true,
      configurable: true,
    });
  });

  it('未开启或无活动产物时不渲染', () => {
    useChatStore.setState({
      artifacts: [],
      activeArtifactId: null,
      isWorkspaceOpen: false,
    });

    const { container } = render(<ArtifactWorkspace />);
    expect(container.firstChild).toBeNull();
  });

  it('展开状态下正确渲染 Markdown 研报与顶部操作栏', () => {
    const art: Artifact = {
      id: 'art-1',
      type: 'markdown',
      title: '多模态AI研报',
      content: '# 结论摘要\n技术跨越式演进。',
      status: 'complete',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: 'art-1',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace />);

    expect(screen.getByTestId('artifact-workspace')).toBeInTheDocument();
    expect(screen.getByText('多模态AI研报')).toBeInTheDocument();
    expect(screen.getByText('结论摘要')).toBeInTheDocument();

    // 复制操作
    const copyBtn = screen.getByLabelText('复制产物内容');
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(art.content);

    // 导出 Markdown 操作
    const exportBtn = screen.getByLabelText('导出 Markdown 文件');
    expect(exportBtn).toBeInTheDocument();

    // 收起工作台
    const closeBtn = screen.getByLabelText('收起工作台');
    fireEvent.click(closeBtn);
    expect(useChatStore.getState().isWorkspaceOpen).toBe(false);
  });

  it('多产物时展示产物选择器并支持下拉切换焦点', () => {
    const arts: Artifact[] = [
      { id: 'art-1', type: 'markdown', title: '分析报告', content: '正文1', status: 'complete' },
      { id: 'art-2', type: 'code', title: '调度器源码', language: 'typescript', content: 'console.log(1)', status: 'complete' },
    ];

    useChatStore.setState({
      artifacts: arts,
      activeArtifactId: 'art-1',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace />);

    const selector = screen.getByTestId('artifact-selector');
    expect(selector).toBeInTheDocument();
    expect(screen.getByText('2 个产物')).toBeInTheDocument();

    // 点击展开下拉菜单并选择第二个
    fireEvent.click(selector);
    const codeItem = screen.getByText('调度器源码');
    fireEvent.click(codeItem);

    expect(useChatStore.getState().activeArtifactId).toBe('art-2');
  });

  it('移动端模式渲染全屏遮罩与 ≥44px 返回按钮', () => {
    const art: Artifact = {
      id: 'art-m',
      type: 'markdown',
      title: '移动端全屏查看',
      content: '移动端阅读体验良好。',
      status: 'complete',
    };

    useChatStore.setState({
      artifacts: [art],
      activeArtifactId: 'art-m',
      isWorkspaceOpen: true,
    });

    render(<ArtifactWorkspace isMobile={true} />);

    expect(screen.getByTestId('mobile-artifact-overlay')).toBeInTheDocument();
    const backBtn = screen.getByLabelText('返回对话');
    expect(backBtn).toBeInTheDocument();

    fireEvent.click(backBtn);
    expect(useChatStore.getState().isWorkspaceOpen).toBe(false);
  });
});

describe('产物未完成态展示 (ADR-0037 / 工单 02)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('卡片：error 态产物展示「未完成」徽标且不展示「生成中」', () => {
    const art: Artifact = {
      id: 'art-err',
      type: 'markdown',
      title: '被中止的研报',
      content: '写了一半',
      status: 'error',
    };
    useChatStore.setState({ artifacts: [art], activeArtifactId: null, isWorkspaceOpen: false });

    render(<ArtifactCard artifactId="art-err" />);
    expect(screen.getByText('未完成')).toBeInTheDocument();
    expect(screen.queryByText('生成中')).not.toBeInTheDocument();
  });

  it('卡片：complete 态产物既不展示「未完成」也不展示「生成中」', () => {
    const art: Artifact = { id: 'art-ok', type: 'markdown', title: '完整研报', content: '正文', status: 'complete' };
    useChatStore.setState({ artifacts: [art], activeArtifactId: null, isWorkspaceOpen: false });

    render(<ArtifactCard artifactId="art-ok" />);
    expect(screen.queryByText('未完成')).not.toBeInTheDocument();
    expect(screen.queryByText('生成中')).not.toBeInTheDocument();
  });

  it('工作台：error 态产物顶栏展示「未完成」，不展示「流式生成中」', () => {
    const art: Artifact = { id: 'art-err', type: 'markdown', title: '被中止的研报', content: '写了一半', status: 'error' };
    useChatStore.setState({ artifacts: [art], activeArtifactId: 'art-err', isWorkspaceOpen: true });

    render(<ArtifactWorkspace />);
    expect(screen.getByTestId('artifact-incomplete-badge')).toHaveTextContent('未完成');
    expect(screen.queryByText('流式生成中')).not.toBeInTheDocument();
  });

  it('工作台：草稿被丢弃时提示「本次修改未完成，已保留上一版」，正文保持上一版', () => {
    const art: Artifact = {
      id: 'art-kept',
      type: 'markdown',
      title: '研报',
      content: '上一版正文',
      status: 'complete',
      notice: 'draft-discarded',
    };
    useChatStore.setState({ artifacts: [art], activeArtifactId: 'art-kept', isWorkspaceOpen: true });

    render(<ArtifactWorkspace />);
    expect(screen.getByTestId('artifact-draft-discarded-notice')).toHaveTextContent(
      '本次修改未完成，已保留上一版'
    );
    expect(screen.getByText('上一版正文')).toBeInTheDocument();
    expect(screen.queryByTestId('artifact-incomplete-badge')).not.toBeInTheDocument();
  });

  it('工作台：无 notice 的完整产物不展示未完成提示', () => {
    const art: Artifact = { id: 'art-ok', type: 'markdown', title: '研报', content: '正文', status: 'complete' };
    useChatStore.setState({ artifacts: [art], activeArtifactId: 'art-ok', isWorkspaceOpen: true });

    render(<ArtifactWorkspace />);
    expect(screen.queryByTestId('artifact-draft-discarded-notice')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-incomplete-badge')).not.toBeInTheDocument();
  });
});

describe('章节补丁失败展示 (ADR-0037 / 工单 03)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('工作台逐条展示未应用的章节标题与可区分的原因，已应用的补丁不列入失败', () => {
    const art: Artifact = {
      id: 'art-patch',
      type: 'markdown',
      title: '研报',
      content: '# 研报\n\n## 第一章\n正文',
      status: 'complete',
      patchReport: [
        { section: '## 第一章', status: 'applied' },
        { section: '## 第九章 不存在', status: 'failed', reason: 'not-found' },
        { section: '## 总结', status: 'failed', reason: 'duplicate' },
        { section: '## 第二章', status: 'failed', reason: 'not-heading-start' },
      ],
    };
    useChatStore.setState({ artifacts: [art], activeArtifactId: 'art-patch', isWorkspaceOpen: true });

    render(<ArtifactWorkspace />);
    const failures = screen.getByTestId('artifact-patch-failures');
    expect(failures).toHaveTextContent('3 处章节修改未应用');
    expect(screen.getAllByTestId('artifact-patch-failure-item')).toHaveLength(3);
    expect(failures).toHaveTextContent('## 第九章 不存在');
    expect(failures).toHaveTextContent('未找到该标题');
    expect(failures).toHaveTextContent('## 总结');
    expect(failures).toHaveTextContent('标题重复，无法唯一定位');
    expect(failures).toHaveTextContent('## 第二章');
    expect(failures).toHaveTextContent('补丁内容未以该标题开头');
    expect(failures).not.toHaveTextContent('## 第一章');
  });

  it('补丁全部成功或没有补丁结果时不展示失败区块', () => {
    const art: Artifact = {
      id: 'art-ok',
      type: 'markdown',
      title: '研报',
      content: '# 研报',
      status: 'complete',
      patchReport: [{ section: '## 第一章', status: 'applied' }],
    };
    useChatStore.setState({ artifacts: [art], activeArtifactId: 'art-ok', isWorkspaceOpen: true });

    render(<ArtifactWorkspace />);
    expect(screen.queryByTestId('artifact-patch-failures')).not.toBeInTheDocument();
  });
});
