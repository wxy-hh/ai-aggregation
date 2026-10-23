/**
 * ConversationMemoryCard 组件交互与隐私门禁测试 (工单 09 / QA-005 / QA-006)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { ConversationMemoryCard } from './conversation-memory-card';

const mockUpdateProfile = vi.fn();
const mockFetchUser = vi.fn();

let mockUser: any = {
  id: 'user-test-1',
  username: 'test_user',
  memorySearchEnabled: false,
};

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector: (state: any) => any) => {
    return selector({
      user: mockUser,
      fetchUser: mockFetchUser,
    });
  },
}));

vi.mock('@/lib/api/profile', () => ({
  updateProfile: (...args: any[]) => mockUpdateProfile(...args),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('ConversationMemoryCard 设置卡片与隐私确认弹窗', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = {
      id: 'user-test-1',
      username: 'test_user',
      memorySearchEnabled: false,
    };
  });

  it('新用户首次进入：开关默认关闭 (aria-checked="false")，显示默认未开启 (QA-005 前置)', () => {
    render(<ConversationMemoryCard />);

    const toggle = screen.getByRole('switch', { name: '会话记忆检索' });
    expect(toggle).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('默认未开启')).toBeInTheDocument();
    expect(
      screen.getByText(/开启后历史会话将建立加密向量索引用于检索；关闭后将彻底删除已索引的记忆切片/)
    ).toBeInTheDocument();
  });

  it('点击开启：调用 updateProfile 开启记忆检索 (QA-005)', async () => {
    mockUpdateProfile.mockResolvedValue({
      user: { ...mockUser, memorySearchEnabled: true },
    });

    render(<ConversationMemoryCard />);

    const toggle = screen.getByRole('switch', { name: '会话记忆检索' });
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ memorySearchEnabled: true });
      expect(mockFetchUser).toHaveBeenCalled();
    });
  });

  it('已开启状态下点击关闭：弹出二次确认弹窗并需确认才执行物理删除 (QA-006)', async () => {
    mockUser.memorySearchEnabled = true;
    mockUpdateProfile.mockResolvedValue({
      user: { ...mockUser, memorySearchEnabled: false },
    });

    render(<ConversationMemoryCard />);

    const toggle = screen.getByRole('switch', { name: '会话记忆检索' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('已开启记忆增强')).toBeInTheDocument();

    // 点击开关触发关闭
    fireEvent.click(toggle);

    // 确认弹窗出现，包含关闭后删除切片的警告提示
    await waitFor(() => {
      expect(screen.getByText('关闭会话记忆检索确认')).toBeInTheDocument();
      expect(screen.getAllByText(/关闭后将彻底删除已索引的记忆切片/).length).toBeGreaterThanOrEqual(2);
    });

    // 此时尚未调用 updateProfile
    expect(mockUpdateProfile).not.toHaveBeenCalled();

    // 点击确认关闭并删除按钮
    const confirmBtn = screen.getByRole('button', { name: '确认关闭并删除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockUpdateProfile).toHaveBeenCalledWith({ memorySearchEnabled: false });
      expect(mockFetchUser).toHaveBeenCalled();
    });
  });
});
