import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { AgentRunHistoryView } from './agent-run-history-view';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockFetchAgentRuns = vi.fn();
const mockDeleteAgentRun = vi.fn();

vi.mock('@/lib/api/agent-runs', () => ({
  fetchAgentRuns: (...args: any[]) => mockFetchAgentRuns(...args),
  deleteAgentRun: (...args: any[]) => mockDeleteAgentRun(...args),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: any) =>
    selector({
      accessToken: 'mock_token',
      status: 'ready',
      user: { id: 'u_1', username: 'testuser' },
    }),
}));

const sampleRuns = [
  {
    id: 'run_1',
    userId: 'u_1',
    conversationId: null,
    messageId: null,
    goalText: '请针对国产 ai coding plan 进行深度调研',
    steps: 5,
    toolCalls: [
      {
        id: 't_1',
        name: 'web_search',
        argsSummary: 'ai coding plan',
        status: 'success',
        summary: '找到 5 条线索',
        durationMs: 820,
      },
    ],
    artifactRefs: [
      {
        id: 'art_1',
        type: 'markdown',
        title: '调研报告',
      },
    ],
    capabilityPack: 'deep-research',
    outcome: 'success',
    quotaCost: 24995,
    durationMs: 82600,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'run_2',
    userId: 'u_1',
    conversationId: null,
    messageId: null,
    goalText: '简短检索智谱 GLM',
    steps: 2,
    toolCalls: [],
    artifactRefs: [],
    capabilityPack: null,
    outcome: 'failed',
    quotaCost: 893,
    durationMs: 12000,
    createdAt: new Date().toISOString(),
  },
];

describe('AgentRunHistoryView (工单 02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('成功拉取并渲染任务列表与统计信息', async () => {
    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: sampleRuns,
      total: 14,
      page: 1,
      limit: 8,
    });

    render(<AgentRunHistoryView />);

    expect(screen.getByText('加载智能体运行记录中...')).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('共 14 次任务')).toBeInTheDocument();
    });

    expect(screen.getByText('请针对国产 ai coding plan 进行深度调研')).toBeInTheDocument();
    expect(screen.getByText('简短检索智谱 GLM')).toBeInTheDocument();
    expect(screen.getByText('24,995')).toBeInTheDocument();
  });

  it('点击状态胶囊正确触发按状态过滤并重置第 1 页', async () => {
    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: sampleRuns,
      total: 14,
      page: 1,
      limit: 8,
    });

    render(<AgentRunHistoryView />);

    await waitFor(() => {
      expect(screen.getByText('共 14 次任务')).toBeInTheDocument();
    });

    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: [sampleRuns[0]],
      total: 1,
      page: 1,
      limit: 8,
    });

    // 点击「成功」过滤胶囊
    const successFilterBtn = screen.getByRole('button', { name: '成功' });
    fireEvent.click(successFilterBtn);

    await waitFor(() => {
      expect(mockFetchAgentRuns).toHaveBeenCalledWith({
        page: 1,
        limit: 8,
        outcome: 'success',
      });
    });
  });

  it('点击分页「下一页」正确翻页', async () => {
    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: sampleRuns,
      total: 14,
      page: 1,
      limit: 8,
    });

    render(<AgentRunHistoryView />);

    await waitFor(() => {
      expect(screen.getByText('共 14 次任务')).toBeInTheDocument();
    });

    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: [sampleRuns[1]],
      total: 14,
      page: 2,
      limit: 8,
    });

    const nextPageBtn = screen.getByRole('button', { name: '下一页' });
    fireEvent.click(nextPageBtn);

    await waitFor(() => {
      expect(mockFetchAgentRuns).toHaveBeenCalledWith({
        page: 2,
        limit: 8,
        outcome: undefined,
      });
    });
  });

  it('数据为空时展示空状态提示', async () => {
    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: [],
      total: 0,
      page: 1,
      limit: 8,
    });

    render(<AgentRunHistoryView />);

    await waitFor(() => {
      expect(screen.getByText('暂无符合条件的智能体记录')).toBeInTheDocument();
    });
  });

  it('点击删除按钮弹出二次确认框，确认后调用 deleteAgentRun', async () => {
    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: sampleRuns,
      total: 14,
      page: 1,
      limit: 8,
    });

    render(<AgentRunHistoryView />);

    await waitFor(() => {
      expect(screen.getByText('共 14 次任务')).toBeInTheDocument();
    });

    // 点击第一张卡片的删除按钮
    const deleteButtons = screen.getAllByRole('button', { name: '删除运行记录' });
    fireEvent.click(deleteButtons[0]);

    // 弹出确认对话框
    expect(screen.getByText('确定要删除这条智能体运行记录吗？该记录的步骤审计与配额扣减凭据将被永久清除，且不可恢复。')).toBeInTheDocument();

    mockDeleteAgentRun.mockResolvedValueOnce({ id: 'run_1' });
    mockFetchAgentRuns.mockResolvedValueOnce({
      runs: [sampleRuns[1]],
      total: 13,
      page: 1,
      limit: 8,
    });

    const confirmBtn = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeleteAgentRun).toHaveBeenCalledWith('run_1');
    });
  });
});
