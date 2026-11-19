import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ArtifactWorkspace } from './artifact-workspace';
import { useChatStore } from '@/stores/chat-store';
import type { Artifact } from '@repo/shared';

// 埋点替身：断言事件名与属性，避免真实网络请求
const trackerMock = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/events/tracker', () => ({ trackEvent: trackerMock.trackEvent }));

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

/** 构造带版本链的产物：v1 / v2 / v3，末尾为当前版 */
function makeVersionedArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-ver',
    type: 'markdown',
    title: '多版本研报',
    content: '# 研报\n\n第三版内容',
    status: 'complete',
    versions: [
      { id: 'v1', seq: 1, content: '# 研报\n\n第一版内容', createdAt: 1, source: { kind: 'generated' } },
      { id: 'v2', seq: 2, content: '# 研报\n\n第二版内容', createdAt: 2, source: { kind: 'patch' } },
      { id: 'v3', seq: 3, content: '# 研报\n\n第三版内容', createdAt: 3, source: { kind: 'patch' } },
    ],
    ...overrides,
  };
}

function openWorkspaceWith(art: Artifact, isMobile = false) {
  useChatStore.setState({
    artifacts: [art],
    activeArtifactId: art.id,
    isWorkspaceOpen: true,
    viewingVersions: {},
  });
  return render(<ArtifactWorkspace isMobile={isMobile} />);
}

describe('ArtifactWorkspace 版本切换与回滚 (TC09 / ADR-0037)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  it('[TC09-1] 3 个版本时版本选择器列出 v1、v2、v3 且当前版标注「当前」；选择 v1 后正文显示 v1 内容并标注只读查看历史版本', () => {
    openWorkspaceWith(makeVersionedArtifact());

    fireEvent.click(screen.getByTestId('artifact-version-selector'));
    const listbox = screen.getByRole('listbox', { name: '产物版本' });
    expect(within(listbox).getByTestId('artifact-version-option-1')).toBeInTheDocument();
    expect(within(listbox).getByTestId('artifact-version-option-2')).toBeInTheDocument();
    const current = within(listbox).getByTestId('artifact-version-option-3');
    expect(current).toHaveTextContent('当前');
    expect(within(listbox).getByTestId('artifact-version-option-1')).not.toHaveTextContent('当前');

    fireEvent.click(within(listbox).getByTestId('artifact-version-option-1'));
    expect(screen.getByText('第一版内容')).toBeInTheDocument();
    expect(screen.queryByText('第三版内容')).not.toBeInTheDocument();
    expect(screen.getByTestId('artifact-history-readonly')).toHaveTextContent('只读');
  });

  it('[TC09-4] 点击「回滚到此版本」后产物池追加新末尾版本，工作台切到该新版本并显示「回滚自 v1」标注', () => {
    openWorkspaceWith(makeVersionedArtifact());

    fireEvent.click(screen.getByTestId('artifact-version-selector'));
    fireEvent.click(screen.getByTestId('artifact-version-option-1'));
    fireEvent.click(screen.getByTestId('artifact-rollback-btn'));

    const stored = useChatStore.getState().artifacts[0];
    expect(stored.versions).toHaveLength(4);
    expect(stored.versions?.[3]).toMatchObject({
      seq: 4,
      content: '# 研报\n\n第一版内容',
      source: { kind: 'rollback', fromSeq: 1 },
    });
    expect(stored.content).toBe('# 研报\n\n第一版内容');
    // 查看态清除，工作台展示新当前版并带回滚来源标注
    expect(useChatStore.getState().viewingVersions['art-ver']).toBeUndefined();
    expect(screen.getByTestId('artifact-rollback-source')).toHaveTextContent('回滚自 v1');
    expect(screen.queryByTestId('artifact-history-readonly')).not.toBeInTheDocument();
    // 历史版本没有被删除
    expect(stored.versions?.map((v) => v.seq)).toEqual([1, 2, 3, 4]);
  });

  it('[TC09-5] 仅有 1 个版本时不显示版本选择器、差异入口与回滚入口', () => {
    openWorkspaceWith(
      makeVersionedArtifact({
        versions: [{ id: 'v1', seq: 1, content: '# 研报\n\n第三版内容', createdAt: 1, source: { kind: 'generated' } }],
      })
    );
    expect(screen.queryByTestId('artifact-version-selector')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-rollback-btn')).not.toBeInTheDocument();
    expect(screen.queryByTestId('artifact-diff-btn')).not.toBeInTheDocument();
  });

  it('[TC09-5] 老数据（无版本链字段）同样不显示版本栏', () => {
    const legacy = makeVersionedArtifact();
    delete legacy.versions;
    openWorkspaceWith(legacy);
    expect(screen.queryByTestId('artifact-version-bar')).not.toBeInTheDocument();
  });

  it('[TC09-6] 窄屏渲染下版本选择器、差异入口与回滚按钮存在、可点击，且触点宽高均不小于 44px（min-h-11 / min-w-11）', () => {
    openWorkspaceWith(makeVersionedArtifact(), true);

    const selector = screen.getByTestId('artifact-version-selector');
    expect(selector.className).toMatch(/min-h-11/);
    expect(selector.className).toMatch(/min-w-11/);
    fireEvent.click(selector);
    const option = screen.getByTestId('artifact-version-option-2');
    expect(option.className).toMatch(/min-h-11/);
    fireEvent.click(option);

    expect(screen.getByTestId('artifact-diff-btn').className).toMatch(/min-h-11/);
    expect(screen.getByTestId('artifact-diff-btn').className).toMatch(/min-w-11/);
    const rollback = screen.getByTestId('artifact-rollback-btn');
    expect(rollback.className).toMatch(/min-h-11/);
    expect(rollback.className).toMatch(/min-w-11/);
    expect(screen.getByTestId('artifact-back-to-current').className).toMatch(/min-h-11/);
    expect(screen.getByTestId('artifact-back-to-current').className).toMatch(/min-w-11/);
    fireEvent.click(rollback);
    expect(useChatStore.getState().artifacts[0].versions).toHaveLength(4);
  });

  it('流式生成中的产物查看历史版本时不提供回滚入口', () => {
    openWorkspaceWith(makeVersionedArtifact({ status: 'streaming' }));
    fireEvent.click(screen.getByTestId('artifact-version-selector'));
    fireEvent.click(screen.getByTestId('artifact-version-option-1'));
    expect(screen.queryByTestId('artifact-rollback-btn')).not.toBeInTheDocument();
  });
});

describe('ArtifactWorkspace 差异对照 (TC09 / ADR-0037 §7)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  const diffArtifact = (): Artifact =>
    makeVersionedArtifact({
      content: '# 研报\n\n营收同比增长 15%，利润稳定。\n\n新增结论段。\n',
      versions: [
        { id: 'v1', seq: 1, content: '# 研报\n\n营收同比增长 12%，利润稳定。\n\n旧结论段。\n', createdAt: 1, source: { kind: 'generated' } },
        { id: 'v2', seq: 2, content: '# 研报\n\n营收同比增长 15%，利润稳定。\n\n新增结论段。\n', createdAt: 2, source: { kind: 'patch' } },
      ],
    });

  it('[TC09-2] 点击「查看改动」后展示 v1→v2 的行级差异：新增行、删除行带标记，未改行不带标记', () => {
    openWorkspaceWith(diffArtifact());
    fireEvent.click(screen.getByTestId('artifact-diff-btn'));

    expect(screen.getByTestId('artifact-diff-caption')).toHaveTextContent('对比 v1 → v2');
    const removed = screen.getAllByTestId('diff-line-removed').map((el) => el.textContent);
    const added = screen.getAllByTestId('diff-line-added').map((el) => el.textContent);
    expect(removed.some((t) => t?.includes('旧结论段。'))).toBe(true);
    expect(added.some((t) => t?.includes('新增结论段。'))).toBe(true);
    // 未改行（标题）不带新增/删除标记
    const unchanged = screen.getAllByTestId('diff-line-unchanged').map((el) => el.textContent);
    expect(unchanged.some((t) => t?.includes('# 研报'))).toBe(true);
    expect(removed.some((t) => t?.includes('# 研报'))).toBe(false);
    expect(added.some((t) => t?.includes('# 研报'))).toBe(false);
  });

  it('[TC09-3] 同一行只改少数字符时仅变化字符进入高亮节点，未变化字符不在高亮节点内', () => {
    openWorkspaceWith(diffArtifact());
    fireEvent.click(screen.getByTestId('artifact-diff-btn'));

    const highlights = screen.getAllByTestId('diff-inline-highlight').map((el) => el.textContent);
    expect(highlights).toEqual(expect.arrayContaining(['2', '5']));
    // 高亮节点只含变化字符，不含整句
    for (const text of highlights) {
      expect(text!.length).toBeLessThanOrEqual(2);
      expect(text).not.toContain('利润稳定');
    }
  });

  it('再次点击入口返回正文；查看历史版本时对比的是该版本与其前一版', () => {
    openWorkspaceWith(makeVersionedArtifact());
    fireEvent.click(screen.getByTestId('artifact-diff-btn'));
    expect(screen.getByTestId('artifact-diff-caption')).toHaveTextContent('对比 v2 → v3');

    // 切到 v2 查看：对比 v1 → v2
    fireEvent.click(screen.getByTestId('artifact-version-selector'));
    fireEvent.click(screen.getByTestId('artifact-version-option-2'));
    expect(screen.getByTestId('artifact-diff-caption')).toHaveTextContent('对比 v1 → v2');

    fireEvent.click(screen.getByTestId('artifact-diff-btn'));
    expect(screen.queryByTestId('artifact-diff-panel')).not.toBeInTheDocument();
  });

  it('查看首版时没有前一版可对比，不提供差异入口', () => {
    openWorkspaceWith(makeVersionedArtifact());
    fireEvent.click(screen.getByTestId('artifact-version-selector'));
    fireEvent.click(screen.getByTestId('artifact-version-option-1'));
    expect(screen.queryByTestId('artifact-diff-btn')).not.toBeInTheDocument();
  });
});

const SECTION_DOC = '# 研报\n\n## 第一章\n第一章正文\n\n## 第二章\n第二章旧正文\n\n## 第三章\n第三章正文\n';

function makeSectionArtifact(overrides: Partial<Artifact> = {}): Artifact {
  return {
    id: 'art-sec',
    type: 'markdown',
    title: '分章研报',
    content: SECTION_DOC,
    status: 'complete',
    versions: [{ id: 'v1', seq: 1, content: SECTION_DOC, createdAt: 1, source: { kind: 'generated' } }],
    ...overrides,
  };
}

describe('ArtifactWorkspace 补丁失败提示与重试 (TC10 / ADR-0037)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  const failedArtifact = () =>
    makeSectionArtifact({
      patchReport: [
        { section: '## 第二章', status: 'applied' },
        { section: '## 第五章', status: 'failed', reason: 'not-found' },
      ],
    });

  it('[TC10-1] 补丁失败时展示失败章节标题、原因文案与「让模型重试」按钮，已应用章节不出现在失败列表', () => {
    useChatStore.setState({ artifacts: [failedArtifact()], activeArtifactId: 'art-sec', isWorkspaceOpen: true });
    render(<ArtifactWorkspace onPrefillInput={vi.fn()} />);

    const items = screen.getAllByTestId('artifact-patch-failure-item');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('## 第五章');
    expect(items[0]).toHaveTextContent('未找到该标题');
    expect(screen.getByTestId('artifact-patch-retry-btn')).toHaveTextContent('让模型重试');
  });

  it('[TC10-2] 点击「让模型重试」后把含失败章节标题 `## 第五章` 的文本交给输入框预填，且不发送消息', () => {
    const sendMessage = vi.spyOn(useChatStore.getState(), 'sendMessage');
    const onPrefillInput = vi.fn();
    useChatStore.setState({ artifacts: [failedArtifact()], activeArtifactId: 'art-sec', isWorkspaceOpen: true });
    render(<ArtifactWorkspace onPrefillInput={onPrefillInput} />);

    fireEvent.click(screen.getByTestId('artifact-patch-retry-btn'));

    expect(onPrefillInput).toHaveBeenCalledTimes(1);
    const text = onPrefillInput.mock.calls[0][0] as string;
    expect(text).toContain('## 第五章');
    expect(text).not.toContain('## 第二章');
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('未提供预填回调时不渲染重试按钮；窄屏重试后收起工作台以露出输入框', () => {
    useChatStore.setState({ artifacts: [failedArtifact()], activeArtifactId: 'art-sec', isWorkspaceOpen: true });
    const { unmount } = render(<ArtifactWorkspace />);
    expect(screen.queryByTestId('artifact-patch-retry-btn')).not.toBeInTheDocument();
    unmount();

    render(<ArtifactWorkspace isMobile onPrefillInput={vi.fn()} />);
    const btn = screen.getByTestId('artifact-patch-retry-btn');
    expect(btn.className).toMatch(/min-h-11/);
    fireEvent.click(btn);
    expect(useChatStore.getState().isWorkspaceOpen).toBe(false);
  });
});

describe('ArtifactWorkspace 就地流式预览与改动高亮 (TC10 / ADR-0037 §3)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  const streamingPatch = (draft: string): Artifact =>
    makeSectionArtifact({ status: 'streaming', patchDraft: { section: '## 第二章', content: draft } });

  it('[TC10-3] 流式补丁渲染为章节前/新章节/章节后三块，增量到来时只有中间块变化且带「修改中」标记', () => {
    useChatStore.setState({ artifacts: [streamingPatch('## 第二章\n新')], activeArtifactId: 'art-sec', isWorkspaceOpen: true });
    render(<ArtifactWorkspace />);

    const before = screen.getByTestId('artifact-preview-before');
    const after = screen.getByTestId('artifact-preview-after');
    const middle = screen.getByTestId('artifact-preview-streaming');
    const beforeHtml = before.innerHTML;
    const afterHtml = after.innerHTML;
    const middleHtml = middle.innerHTML;

    expect(before).toHaveTextContent('第一章正文');
    expect(before).not.toHaveTextContent('第二章');
    expect(after).toHaveTextContent('第三章正文');
    expect(after).not.toHaveTextContent('第二章旧正文');
    expect(screen.getByTestId('artifact-preview-streaming-badge')).toHaveTextContent('修改中');

    act(() => {
      useChatStore.setState({ artifacts: [streamingPatch('## 第二章\n新写入的第二章内容')] });
    });

    // 前后块的渲染节点未被替换、内容不变；中间块文本变了
    expect(screen.getByTestId('artifact-preview-before')).toBe(before);
    expect(screen.getByTestId('artifact-preview-after')).toBe(after);
    expect(before.innerHTML).toBe(beforeHtml);
    expect(after.innerHTML).toBe(afterHtml);
    expect(screen.getByTestId('artifact-preview-streaming').innerHTML).not.toBe(middleHtml);
    expect(screen.getByTestId('artifact-preview-streaming')).toHaveTextContent('新写入的第二章内容');
  });

  it('流式补丁的标题抄错（找不到章节）时不丢内容：原文整体作为前块，新内容接在其后', () => {
    useChatStore.setState({
      artifacts: [makeSectionArtifact({ status: 'streaming', patchDraft: { section: '## 第九章', content: '## 第九章\n内容' } })],
      activeArtifactId: 'art-sec',
      isWorkspaceOpen: true,
    });
    render(<ArtifactWorkspace />);
    expect(screen.getByTestId('artifact-preview-before')).toHaveTextContent('第二章旧正文');
    expect(screen.queryByTestId('artifact-preview-after')).not.toBeInTheDocument();
    expect(screen.getByTestId('artifact-preview-streaming')).toHaveTextContent('内容');
  });

  it('[TC10-4] 补丁完成后被改章节带短暂高亮并出现「查看改动」入口；未改章节无高亮，高亮随后自动消失', () => {
    vi.useFakeTimers();
    try {
      const patched = '# 研报\n\n## 第一章\n第一章正文\n\n## 第二章\n第二章新正文\n\n## 第三章\n第三章正文\n';
      useChatStore.setState({ artifacts: [streamingPatch('## 第二章\n第二章新正文\n')], activeArtifactId: 'art-sec', isWorkspaceOpen: true });
      render(<ArtifactWorkspace />);
      expect(screen.queryByTestId('artifact-section-highlight')).not.toBeInTheDocument();

      // 补丁合并完成：产生 v2，patchReport 记录 ## 第二章 已应用
      act(() => {
        useChatStore.setState({
          artifacts: [
            makeSectionArtifact({
              content: patched,
              status: 'complete',
              versions: [
                { id: 'v1', seq: 1, content: SECTION_DOC, createdAt: 1, source: { kind: 'generated' } },
                { id: 'v2', seq: 2, content: patched, createdAt: 2, source: { kind: 'patch' } },
              ],
              patchReport: [{ section: '## 第二章', status: 'applied' }],
            }),
          ],
        });
      });

      const highlights = screen.getAllByTestId('artifact-section-highlight');
      expect(highlights).toHaveLength(1);
      expect(highlights[0]).toHaveTextContent('第二章新正文');
      expect(highlights[0]).not.toHaveTextContent('第一章正文');
      expect(highlights[0]).not.toHaveTextContent('第三章正文');

      // 「查看改动」入口打开差异面板
      fireEvent.click(screen.getByTestId('artifact-diff-btn'));
      expect(screen.getByTestId('artifact-diff-caption')).toHaveTextContent('对比 v1 → v2');
      fireEvent.click(screen.getByTestId('artifact-diff-btn'));

      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.queryByTestId('artifact-section-highlight')).not.toBeInTheDocument();
      expect(screen.getByText('第二章新正文')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('打开已完成的历史产物时不对旧补丁重复高亮', () => {
    useChatStore.setState({
      artifacts: [makeSectionArtifact({ patchReport: [{ section: '## 第二章', status: 'applied' }] })],
      activeArtifactId: 'art-sec',
      isWorkspaceOpen: true,
    });
    render(<ArtifactWorkspace />);
    expect(screen.queryByTestId('artifact-section-highlight')).not.toBeInTheDocument();
  });
});

describe('ArtifactWorkspace 操作埋点 (TC12 / ADR-0037 §8)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
    trackerMock.trackEvent.mockReset();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn() },
      configurable: true,
    });
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
  });

  const secret = makeVersionedArtifact({ title: '绝密季度研报' });

  it('[TC12-3] 复制、导出、打开差异、回滚各触发一次对应事件，上报属性序列化后不含产物标题与正文任一子串', () => {
    openWorkspaceWith(secret);

    fireEvent.click(screen.getByRole('button', { name: '复制产物内容' }));
    fireEvent.click(screen.getByRole('button', { name: '导出 Markdown 文件' }));
    fireEvent.click(screen.getByTestId('artifact-diff-btn'));
    fireEvent.click(screen.getByTestId('artifact-version-selector'));
    fireEvent.click(screen.getByTestId('artifact-version-option-1'));
    fireEvent.click(screen.getByTestId('artifact-rollback-btn'));

    const names = trackerMock.trackEvent.mock.calls.map((c) => c[0]);
    expect(names).toEqual(['artifact.copy', 'artifact.export', 'artifact.diff_open', 'artifact.rollback']);

    const serialized = JSON.stringify(trackerMock.trackEvent.mock.calls);
    expect(serialized).not.toContain('绝密季度研报');
    expect(serialized).not.toContain('第三版内容');
    expect(serialized).not.toContain('第一版内容');
    // 回滚上报的是被回滚到的历史版本序号
    expect(trackerMock.trackEvent.mock.calls[3][1]).toMatchObject({ artifactType: 'markdown', versionSeq: 1 });
    expect(trackerMock.trackEvent.mock.calls[0][1]).toMatchObject({ versionSeq: 3, sizeBucket: 'lt_1k' });
  });

  it('关闭差异面板不重复上报 diff_open', () => {
    openWorkspaceWith(secret);
    fireEvent.click(screen.getByTestId('artifact-diff-btn'));
    fireEvent.click(screen.getByTestId('artifact-diff-btn'));
    expect(trackerMock.trackEvent.mock.calls.map((c) => c[0])).toEqual(['artifact.diff_open']);
  });
});

describe('ArtifactWorkspace 入库版本感知 (TC10 / ADR-0037)', () => {
  beforeEach(() => {
    useChatStore.getState().reset();
  });

  const deposit = (versionId?: string) => ({
    deposited: true,
    knowledgeBaseId: 'kb_1',
    knowledgeBaseName: '研报库',
    documentId: 'doc_1',
    depositedAt: new Date().toISOString(),
    ...(versionId ? { versionId } : {}),
  });

  it('[TC10-5] 入库版本不是当前版时徽标显示「已入库 v1，当前有新版本」，并提供「沉淀最新版」按钮', () => {
    openWorkspaceWith(makeVersionedArtifact({ kbDeposit: deposit('v1') }));
    expect(screen.getByTestId('artifact-deposited-badge')).toHaveTextContent('已入库 v1，当前有新版本');
    expect(screen.getByTestId('deposit-latest-btn')).toHaveTextContent('沉淀最新版');
    // 窄屏（徽标完整文案 hidden sm:inline）仍有可见的「有新版本」短文案
    const shortText = screen.getByText('有新版本');
    expect(shortText.className).toMatch(/sm:hidden/);
    expect(shortText.className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it('[TC10-5] 老数据入库无 versionId 时按「入库于首版」处理', () => {
    openWorkspaceWith(makeVersionedArtifact({ kbDeposit: deposit() }));
    expect(screen.getByTestId('artifact-deposited-badge')).toHaveTextContent('已入库 v1，当前有新版本');
  });

  it('[TC10-5] 入库版本即当前版时显示「已入库」，无「沉淀最新版」', () => {
    openWorkspaceWith(makeVersionedArtifact({ kbDeposit: deposit('v3') }));
    const badge = screen.getByTestId('artifact-deposited-badge');
    expect(badge).toHaveTextContent('已入库');
    expect(badge).not.toHaveTextContent('当前有新版本');
    expect(screen.queryByTestId('deposit-latest-btn')).not.toBeInTheDocument();
  });

  it('[TC10-6] 点击「沉淀最新版」打开另存弹窗', () => {
    openWorkspaceWith(makeVersionedArtifact({ kbDeposit: deposit('v1') }));
    fireEvent.click(screen.getByTestId('deposit-latest-btn'));
    expect(screen.getByTestId('mock-deposit-dialog')).toHaveTextContent('弹窗已打开: 多版本研报');
  });
});
