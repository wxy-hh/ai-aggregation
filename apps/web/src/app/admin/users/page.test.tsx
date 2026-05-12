import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './page';

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

describe('AdminUsersPage', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('渲染系统用户管理页的核心内容', async () => {
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('系统用户管理')).toBeInTheDocument();
      expect(screen.getByText('超级管理员专属控制台：全局用户权限审核、算力额度分配与账户状态监控。')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '新增用户' })).toBeInTheDocument();
      expect(screen.getAllByText('张伟').length).toBeGreaterThan(0);
      expect(screen.getAllByText('李娜').length).toBeGreaterThan(0);
    });
  });

  it('点击更新后打开静态编辑弹框，并允许关闭', async () => {
    render(<AdminUsersPage />);

    fireEvent.click(screen.getAllByRole('button', { name: '更新' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('编辑用户权限与额度')).toBeInTheDocument();
      expect(screen.getByText('zhangwei@luminal.ai')).toBeInTheDocument();
      expect(screen.getByText('保存修改')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByText('编辑用户权限与额度')).not.toBeInTheDocument();
    });
  });
}
