import React from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from './page';

// 模拟 adminApi 方法
const mockListUsers = vi.fn();
const mockDeleteUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockCreateUser = vi.fn();

vi.mock('@/lib/api/admin-api', () => ({
  adminApi: {
    listUsers: (...args: unknown[]) => mockListUsers(...args),
    deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
    updateUser: (...args: unknown[]) => mockUpdateUser(...args),
    createUser: (...args: unknown[]) => mockCreateUser(...args),
  },
}));

// 模拟 sonner
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock('@/components/layout/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// 模拟 useAuth hook，返回管理员权限
vi.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    isAdmin: true,
    isLoading: false,
    isAuthenticated: true,
  }),
}));

// 模拟 useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
  }),
}));

const MOCK_USERS = [
  {
    id: 'USR-1029',
    username: 'zhangwei',
    email: 'zhangwei@luminal.ai',
    name: '张伟',
    avatar: null,
    role: 'user',
    status: 'active',
    tokens: 12500,
    createdAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'USR-2281',
    username: 'lina',
    email: 'lina@luminal.ai',
    name: '李娜',
    avatar: null,
    role: 'admin',
    status: 'active',
    tokens: 89000,
    createdAt: '2025-01-02T00:00:00Z',
  },
  {
    id: 'USR-4412',
    username: 'wangqiang',
    email: 'wangqiang@luminal.ai',
    name: '王强',
    avatar: null,
    role: 'user',
    status: 'disabled',
    tokens: 0,
    createdAt: '2025-01-03T00:00:00Z',
  },
  {
    id: 'USR-9901',
    username: 'chenxiaoming',
    email: 'chenxiaoming@luminal.ai',
    name: '陈小明',
    avatar: null,
    role: 'user',
    status: 'disabled',
    tokens: 0,
    createdAt: '2025-01-04T00:00:00Z',
  },
];

describe('AdminUsersPage', () => {
  beforeEach(() => {
    mockListUsers.mockResolvedValue({
      success: true,
      data: {
        users: MOCK_USERS,
        meta: { total: 4, page: 1, limit: 10 },
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('渲染系统用户管理页的核心内容', async () => {
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByText('系统用户管理')).toBeInTheDocument();
      expect(
        screen.getByText(
          '超级管理员专属控制台：全局用户权限审核、算力额度分配与账户状态监控。'
        )
      ).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '新增用户' })).toBeInTheDocument();
      expect(screen.getAllByText('张伟').length).toBeGreaterThan(0);
      expect(screen.getAllByText('李娜').length).toBeGreaterThan(0);
    });
  });

  it('调用 API 获取用户列表并展示摘要卡片', async () => {
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledWith({
        search: undefined,
        page: 1,
        limit: 10,
      });
    });

    await waitFor(() => {
      // 总用户数为 4
      expect(screen.getByText('4')).toBeInTheDocument();
    });
  });

  it('点击更新后打开编辑弹框，并允许关闭', async () => {
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText('张伟').length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getAllByRole('button', { name: '更新' })[0]);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '取消' }));

    await waitFor(() => {
      expect(screen.queryByText('编辑用户权限与额度')).not.toBeInTheDocument();
    });
  });

  it('支持通过搜索框筛选用户列表并调用 API', async () => {
    mockListUsers.mockResolvedValue({
      success: true,
      data: {
        users: [MOCK_USERS[1]], // 只返回李娜
        meta: { total: 1, page: 1, limit: 10 },
      },
    });

    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '搜索用户' })).toBeInTheDocument();
    });

    const searchInput = screen.getByRole('textbox', { name: '搜索用户' });
    fireEvent.change(searchInput, { target: { value: '李娜' } });

    await waitFor(() => {
      expect(mockListUsers).toHaveBeenCalledWith(
        expect.objectContaining({ search: '李娜' })
      );
    });
  });

  it('点击新增用户按钮打开创建对话框', async () => {
    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '新增用户' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '新增用户' }));

    await waitFor(() => {
      // 弹框标题和按钮都包含"新增用户"，使用 getAllByText 断言存在弹框
      expect(screen.getAllByText('新增用户').length).toBeGreaterThanOrEqual(2);
    });
  });

  it('点击删除触发确认并调用 delete API', async () => {
    window.confirm = vi.fn(() => true);
    mockDeleteUser.mockResolvedValue({ success: true });

    render(<AdminUsersPage />);

    await waitFor(() => {
      expect(screen.getAllByText('张伟').length).toBeGreaterThan(0);
    });

    const deleteButtons = screen.getAllByText('删除');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(mockDeleteUser).toHaveBeenCalledWith('USR-1029');
    });
  });
});
