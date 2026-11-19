/**
 * ProfileToolDrawer 工具设置表单测试：「调用前需要我确认」开关（AGENT-HITL-ACTION / ADR-0041，qa-plan TC11）
 *
 * 1. 抽屉含「调用前需要我确认」开关；
 * 2. 新建工具选择 POST 时开关默认打开；
 * 3. 新建工具选择 GET 时开关默认关闭；
 * 4. 用户手动关闭开关后提交，提交载荷中的审批字段为 false。
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProfileToolDrawer } from './profile-tool-drawer';
import type { SanitizedAgentTool } from '@/lib/api/agent-tools';

const mockCreateAgentTool = vi.fn();
const mockUpdateAgentTool = vi.fn();

vi.mock('@/lib/api/agent-tools', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/agent-tools')>();
  return {
    ...actual,
    createAgentTool: (...args: unknown[]) => mockCreateAgentTool(...args),
    updateAgentTool: (...args: unknown[]) => mockUpdateAgentTool(...args),
  };
});
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const SWITCH_NAME = '调用前需要我确认';

function renderDrawer(tool?: SanitizedAgentTool) {
  return render(
    <ProfileToolDrawer open onOpenChange={vi.fn()} tool={tool ?? null} onSaved={vi.fn()} />
  );
}

describe('ProfileToolDrawer：调用前需要我确认开关 (TC11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. 抽屉含「调用前需要我确认」开关 (TC11-1)', () => {
    renderDrawer();

    expect(screen.getByRole('switch', { name: SWITCH_NAME })).toBeInTheDocument();
    expect(screen.getByText(/确认前不会向外发送请求/)).toBeInTheDocument();
  });

  it('2. 新建工具选择 POST 时开关默认打开 (TC11-2)', () => {
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'POST' }));

    expect(screen.getByRole('switch', { name: SWITCH_NAME })).toBeChecked();
  });

  it('3. 新建工具选择 GET 时开关默认关闭 (TC11-3)', () => {
    renderDrawer();

    fireEvent.click(screen.getByRole('button', { name: 'GET' }));

    expect(screen.getByRole('switch', { name: SWITCH_NAME })).not.toBeChecked();
  });

  it('4. 用户手动关闭开关后提交，载荷中的 requiresApproval 为 false (TC11-4)', async () => {
    mockCreateAgentTool.mockResolvedValueOnce({ id: 'tool-new' });
    renderDrawer();

    fireEvent.change(screen.getByPlaceholderText('例如：城市天气查询'), { target: { value: '通知群聊' } });
    fireEvent.change(screen.getByPlaceholderText('例如：query_weather'), { target: { value: 'notify_group' } });
    fireEvent.change(screen.getByPlaceholderText(/告诉模型什么时候该用这个工具/), {
      target: { value: '需要把结果通知到群里时调用' },
    });
    fireEvent.change(screen.getByPlaceholderText('https://api.example.com/webhook'), {
      target: { value: 'https://hooks.example.com/notify' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'POST' }));
    const toggle = screen.getByRole('switch', { name: SWITCH_NAME });
    expect(toggle).toBeChecked();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: '保存工具' }));

    await waitFor(() => expect(mockCreateAgentTool).toHaveBeenCalledTimes(1));
    expect(mockCreateAgentTool.mock.calls[0][0]).toMatchObject({
      method: 'POST',
      requiresApproval: false,
    });
  });
});
