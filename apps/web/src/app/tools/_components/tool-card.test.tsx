/**
 * ToolCard 单元与交互测试（工单 03）
 *
 * 验证目标：
 * 1. 0 次调用时展示「暂无调用数据」空态占位
 * 2. 有调用时展示紧凑指标徽标（总调次、成功率、平均耗时）
 * 3. 有失败时展示最近失败原因中文标签
 * 4. 提供「调用记录」按钮并能响应点击事件
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToolCard } from './tool-card';
import type { SanitizedAgentTool, AgentToolStats } from '@/lib/api/agent-tools';

const mockTool: SanitizedAgentTool = {
  id: 'tool_card_test_1',
  userId: 'user_1',
  name: '高德天气查询',
  callName: 'gaode_weather',
  description: '查询城市的实时天气',
  url: 'https://api.example.com/weather',
  method: 'POST',
  authHeaderName: null,
  hasAuthHeaderValue: false,
  params: [],
  enabled: true,
  requiresApproval: true,
  createdAt: '2026-10-10T10:00:00.000Z',
  updatedAt: '2026-10-10T10:00:00.000Z',
};

const mockFetchStats = vi.fn();

vi.mock('@/lib/api/agent-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent-tools')>();
  return {
    ...actual,
    fetchAgentToolStats: (...args: unknown[]) => mockFetchStats(...args),
  };
});

describe('ToolCard 观测回流指标展示', () => {
  const onEdit = vi.fn();
  const onDelete = vi.fn();
  const onToggleEnabled = vi.fn().mockResolvedValue(undefined);
  const onViewLogs = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('未调用的工具（0次调用）展示「暂无调用数据」空态', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 0,
      successRate: null,
      avgDurationMs: null,
      lastCalledAt: null,
      lastErrorSummary: null,
    } satisfies AgentToolStats);

    render(
      <ToolCard
        tool={mockTool}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        onViewLogs={onViewLogs}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/暂无调用数据/)).toBeInTheDocument();
    });
  });

  it('已调用的工具展示总调次、成功率与平均耗时徽标', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 42,
      successRate: 95.2,
      avgDurationMs: 168,
      lastCalledAt: '2026-10-10T12:00:00.000Z',
      lastErrorSummary: null,
    } satisfies AgentToolStats);

    render(
      <ToolCard
        tool={mockTool}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        onViewLogs={onViewLogs}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/42/)).toBeInTheDocument();
      expect(screen.getByText(/95.2%/)).toBeInTheDocument();
      expect(screen.getByText(/168ms/)).toBeInTheDocument();
    });
  });

  it('存在失败记录时展示最近失败中文原因', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 10,
      successRate: 80,
      avgDurationMs: 210,
      lastCalledAt: '2026-10-10T12:00:00.000Z',
      lastErrorSummary: '连接超时',
    } satisfies AgentToolStats);

    render(
      <ToolCard
        tool={mockTool}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        onViewLogs={onViewLogs}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/连接超时/)).toBeInTheDocument();
    });
  });

  it('点击「调用记录」按钮触发 onViewLogs 回调', async () => {
    mockFetchStats.mockResolvedValueOnce({
      totalCalls: 5,
      successRate: 100,
      avgDurationMs: 90,
      lastCalledAt: '2026-10-10T12:00:00.000Z',
      lastErrorSummary: null,
    });

    render(
      <ToolCard
        tool={mockTool}
        onEdit={onEdit}
        onDelete={onDelete}
        onToggleEnabled={onToggleEnabled}
        onViewLogs={onViewLogs}
      />
    );

    const logsBtn = await screen.findByRole('button', { name: /调用记录/ });
    expect(logsBtn).toBeInTheDocument();
    fireEvent.click(logsBtn);
    expect(onViewLogs).toHaveBeenCalledWith(mockTool);
  });
});
