import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ProfilePage from './page';

const mockLogout = vi.fn();
const mockFetch = vi.fn();

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: {
        id: '8492015',
        name: '张无忌',
        email: 'wuji.zhang@luminal.app',
        avatar: null,
      },
      accessToken: 'test-token',
      logout: mockLogout,
    }),
}));

describe('ProfilePage', () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          period: '2026-05',
          totalTokens: 1234,
          totalTaskCount: 6,
          features: [
            {
              feature: 'chat',
              label: '智能对话',
              totalTokens: 1234,
              taskCount: 3,
              percent: 100,
              hasTokenData: true,
              sourceKind: 'tokens',
            },
          ],
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('渲染个人中心的核心内容', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('个人设置')).toBeInTheDocument();
      expect(screen.getByText('基本信息')).toBeInTheDocument();
      expect(screen.getByText('资源消耗')).toBeInTheDocument();
      expect(screen.getByText('危险区域')).toBeInTheDocument();
      expect(screen.getByText('张无忌')).toBeInTheDocument();
    });
  });

  it('点击编辑资料后打开弹框，并允许关闭', async () => {
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: '编辑资料' }));

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('编辑个人资料')).toBeInTheDocument();
      expect(screen.getByDisplayValue('张无忌')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Wuji_Design')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByText('编辑个人资料')).not.toBeInTheDocument();
    });
  });

  it('点击申请注销账户后打开确认弹框，不执行真实注销', async () => {
    render(<ProfilePage />);

    fireEvent.click(screen.getByRole('button', { name: '申请注销账户' }));

    await waitFor(() => {
      expect(screen.getByText('注销账户确认')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '确认注销' })).toBeInTheDocument();
    });

    expect(mockLogout).not.toHaveBeenCalled();
  });

  it('资源卡片支持展开查看 token 和调用次数明细', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '展开明细' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '展开明细' }));

    await waitFor(() => {
      expect(screen.getByText('统计方式')).toBeInTheDocument();
      expect(screen.getByText('Token 消耗')).toBeInTheDocument();
      expect(screen.getByText('调用次数')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '收起明细' })).toBeInTheDocument();
    });
  });
});
