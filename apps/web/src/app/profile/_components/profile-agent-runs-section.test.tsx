import { describe, it, expect, beforeEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileAgentRunsSection } from './profile-agent-runs-section';
import { useAuthStore } from '@/stores/auth-store';
import * as api from '@/lib/api/agent-runs';

const pushMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: pushMock }),
}));

describe('ProfileAgentRunsSection 组件 (ADR-0015 / 工单 02)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      user: { id: 'u1', username: 'testuser' } as any,
      accessToken: 'valid-token',
      status: 'ready',
    });
  });

  it('展示空态：无记录时展示友好空态引导', async () => {
    vi.spyOn(api, 'fetchAgentRuns').mockResolvedValueOnce({
      runs: [],
      total: 0,
      page: 1,
      limit: 10,
    });

    render(<ProfileAgentRunsSection />);

    await waitFor(() => {
      expect(screen.getByText('暂无智能体运行记录')).toBeInTheDocument();
    });
    expect(screen.getByText('智能体运行记录')).toBeInTheDocument();
  });

  it('正确渲染运行记录卡片与核心指标', async () => {
    const mockRun: api.AgentRunRecord = {
      id: 'run-1',
      userId: 'u1',
      conversationId: 'conv-1',
      messageId: null,
      goalText: '调研 2026 年多模态大模型进展',
      steps: 4,
      toolCalls: [
        {
          id: 'call-1',
          name: 'web_search',
          argsSummary: 'query: 多模态',
          status: 'success',
          summary: '找到 5 条结果',
          durationMs: 450,
        },
      ],
      artifactRefs: [
        {
          id: 'art-1',
          type: 'markdown',
          title: '多模态调研报告',
        },
      ],
      capabilityPack: 'deep-research',
      outcome: 'success',
      quotaCost: 2800,
      durationMs: 14200,
      createdAt: '2026-10-12T10:00:00Z',
    };

    vi.spyOn(api, 'fetchAgentRuns').mockResolvedValueOnce({
      runs: [mockRun],
      total: 1,
      page: 1,
      limit: 10,
    });

    render(<ProfileAgentRunsSection />);

    await waitFor(() => {
      expect(screen.getByText('调研 2026 年多模态大模型进展')).toBeInTheDocument();
    });

    expect(screen.getByText('成功')).toBeInTheDocument();
    expect(screen.getByText('4 步')).toBeInTheDocument();
    expect(screen.getByText('14.2s')).toBeInTheDocument();
    expect(screen.getByText('2,800')).toBeInTheDocument();

    // 点击详情展开弹窗
    const detailBtn = screen.getByRole('button', { name: /详情/ });
    fireEvent.click(detailBtn);

    expect(screen.getByTestId('agent-run-detail-drawer')).toBeInTheDocument();
    expect(screen.getByText('web_search')).toBeInTheDocument();
    expect(screen.getByText('多模态调研报告')).toBeInTheDocument();

    // 验证底部操作栏关闭按钮存在并可点击关闭
    const closeBtn = screen.getByRole('button', { name: '关闭' });
    expect(closeBtn).toBeInTheDocument();

    // 点击重跑
    const rerunBtn = screen.getByRole('button', { name: /以相同目标重跑/ });
    fireEvent.click(rerunBtn);

    expect(pushMock).toHaveBeenCalledWith(
      expect.stringContaining('/chat?new=true&agent=true&goal=%E8%B0%83%E7%A0%94+2026+%E5%B9%B4%E5%A4%9A%E6%A8%A1%E6%80%81%E5%A4%A7%E6%A8%A1%E5%9E%8B%E8%BF%9B%E5%B1%95&pack=deep-research')
    );
  });
});
