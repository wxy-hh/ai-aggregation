/**
 * 个人中心「我的工具」静态入口卡片测试
 *
 * 覆盖的规格行为（docs/features/2026-11-25-tools-workbench-ia-migration/spec.md §4）：
 * 1. 卡片整卡可点击并跳转到工具工作台 /tools；
 * 2. 卡片为纯静态展示——不含任何配置计数徽标，且不发起工具或 MCP 相关接口请求；
 * 3. 卡片标题与说明文案为中文且指向「我的工具」。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { ProfileToolsEntryCard } from './profile-tools-entry-card';

const mockFetchAgentTools = vi.fn();
const mockFetchMcpServers = vi.fn();

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: (...args: unknown[]) => mockFetchAgentTools(...args),
}));

vi.mock('@/lib/api/mcp-servers', () => ({
  fetchMcpServers: (...args: unknown[]) => mockFetchMcpServers(...args),
}));

describe('个人中心「我的工具」静态入口卡片', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('整卡渲染为指向 /tools 的链接，并带中文可访问名', () => {
    render(<ProfileToolsEntryCard />);

    const link = screen.getByRole('link', { name: '前往我的工具工作台' });
    expect(link).toHaveAttribute('href', '/tools');
  });

  it('展示中文标题与说明文案', () => {
    render(<ProfileToolsEntryCard />);

    expect(screen.getByText('我的工具')).toBeInTheDocument();
    expect(
      screen.getByText('管理私有 Webhook 接口与 MCP 服务，扩展智能体可调用的外部能力')
    ).toBeInTheDocument();
  });

  it('纯静态：不展示配置计数徽标，也不发起任何工具或 MCP 接口请求', () => {
    const { container } = render(<ProfileToolsEntryCard />);

    // 不应出现形如「N / M」的工具计数徽标
    expect(container.textContent).not.toMatch(/\d+\s*\/\s*\d+/);
    expect(screen.queryByText(/已配置/)).not.toBeInTheDocument();

    expect(mockFetchAgentTools).not.toHaveBeenCalled();
    expect(mockFetchMcpServers).not.toHaveBeenCalled();
  });
});
