/**
 * ProfileToolLogsDrawer 调用记录抽屉组件测试（工单 03 / spec §4.4）
 *
 * 验证目标：
 * 1. 抽屉容器必须带有 [data-testid="tool-logs-drawer"]
 * 2. 展示健康概览（调用总数、成功率、平均耗时、最近错误摘要）
 * 3. 倒序展示单次审计明细（方法、状态码徽标、耗时、结果）
 * 4. 0 条记录时友好展示「暂无调用记录」空态
 * 5. 支持关闭抽屉操作
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileToolLogsDrawer } from './profile-tool-logs-drawer';
import type { SanitizedAgentTool } from '@/lib/api/agent-tools';

const mockTool: SanitizedAgentTool = {
  id: 'tool_drawer_test_1',
  userId: 'user_1',
  name: '自动化流水线触发器',
  callName: 'trigger_ci',
  description: '触发外部 CI/CD 构建流水线',
  url: 'https://ci.example.com/build',
  method: 'POST',
  authHeaderName: 'X-Token',
  hasAuthHeaderValue: true,
  params: [],
  enabled: true,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};

const mockFetchStats = vi.fn();
const mockFetchLogs = vi.fn();

vi.mock('@/lib/api/agent-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent-tools')>();
  return {
    ...actual,
    fetchAgentToolStats: (...args: unknown[]) => mockFetchStats(...args),
    fetchAgentToolLogs: (...args: unknown[]) => mockFetchLogs(...args),
  };
});

describe('ProfileToolLogsDrawer 调用记录抽屉', () => {
  const onOpenChange = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('打开抽屉时具备 data-testid="tool-logs-drawer" 且展示健康概览', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 18,
      successRate: 88.9,
      avgDurationMs: 240,
      lastCalledAt: '2026-10-10T15:30:00.000Z',
      lastErrorSummary: '连接超时',
    });
    mockFetchLogs.mockResolvedValueOnce({
      logs: [
        {
          id: 'log_1',
          method: 'POST',
          statusCode: 200,
          durationMs: 220,
          outcome: 'success',
          errorKind: null,
          createdAt: '2026-10-10T15:30:00.000Z',
        },
      ],
      total: 1,
      hasMore: false,
    });

    render(
      <ProfileToolLogsDrawer
        open={true}
        onOpenChange={onOpenChange}
        tool={mockTool}
      />
    );

    const drawer = await screen.findByTestId('tool-logs-drawer');
    expect(drawer).toBeInTheDocument();

    // 标题与调用名
    expect(screen.getByText(/自动化流水线触发器/)).toBeInTheDocument();
    expect(screen.getByText(/wh_trigger_ci/)).toBeInTheDocument();

    // 健康概览指标
    await waitFor(() => {
      expect(screen.getByText(/18/)).toBeInTheDocument();
      expect(screen.getByText(/88.9%/)).toBeInTheDocument();
      expect(screen.getByText(/240ms/)).toBeInTheDocument();
      expect(screen.getByText(/连接超时/)).toBeInTheDocument();
    });

    // 列表项明细
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
    expect(screen.getByText(/220ms/)).toBeInTheDocument();
  });

  it('无调用记录时友好展示「暂无调用记录」空态', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 0,
      successRate: null,
      avgDurationMs: null,
      lastCalledAt: null,
      lastErrorSummary: null,
    });
    mockFetchLogs.mockResolvedValueOnce({
      logs: [],
      total: 0,
      hasMore: false,
    });

    render(
      <ProfileToolLogsDrawer
        open={true}
        onOpenChange={onOpenChange}
        tool={mockTool}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('暂无调用记录')).toBeInTheDocument();
    });
  });

  it('点击关闭按钮触发 onOpenChange(false)', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 0,
      successRate: null,
      avgDurationMs: null,
      lastCalledAt: null,
      lastErrorSummary: null,
    });
    mockFetchLogs.mockResolvedValueOnce({
      logs: [],
      total: 0,
      hasMore: false,
    });

    render(
      <ProfileToolLogsDrawer
        open={true}
        onOpenChange={onOpenChange}
        tool={mockTool}
      />
    );

    const closeBtn = await screen.findByRole('button', { name: /关闭/i });
    fireEvent.click(closeBtn);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
