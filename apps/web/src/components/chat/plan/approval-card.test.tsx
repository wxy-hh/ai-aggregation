import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ApprovalCard } from './approval-card';
import type { MessageApproval } from '@/lib/agent/approval-display';

const baseApproval: MessageApproval = {
  callId: 'call-1',
  toolName: 'wh_notify',
  host: 'hooks.example.com',
  params: { message: '发布完成', count: 2, urgent: true },
  token: 'signed-token-abc',
  expiresAt: Date.now() + 10 * 60 * 1000,
  status: 'pending',
};

describe('ApprovalCard 展示与交互 (TC07)', () => {
  const onConfirm = vi.fn();
  const onReject = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. 待确认态展示工具名、目标域名与每个参数的名称和值 (TC07-1)', () => {
    render(<ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />);

    expect(screen.getByText('wh_notify')).toBeInTheDocument();
    expect(screen.getByText('hooks.example.com')).toBeInTheDocument();
    expect(screen.getByText('message')).toBeInTheDocument();
    expect(screen.getByText('发布完成')).toBeInTheDocument();
    expect(screen.getByText('count')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('urgent')).toBeInTheDocument();
    expect(screen.getByText('true')).toBeInTheDocument();
  });

  it('2. 点击「确认执行」调用 onConfirm 1 次且入参含调用 ID (TC07-2)', () => {
    render(<ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />);

    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith('call-1');
  });

  it('3. 快速连点「确认执行」两次只触发 1 次，按钮随即禁用 (TC07-3)', () => {
    render(<ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />);

    const button = screen.getByRole('button', { name: '确认执行' });
    fireEvent.click(button);
    fireEvent.click(button);

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: '确认执行' })).toBeDisabled();
  });

  it('4. 点击「拒绝」调用 onReject 1 次且 onConfirm 为 0 次 (TC07-4)', () => {
    render(<ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />);

    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));

    expect(onReject).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledWith('call-1');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('5. 已拒绝态展示「已拒绝」且不渲染确认与拒绝按钮 (TC07-5)', () => {
    render(
      <ApprovalCard
        approval={{ ...baseApproval, status: 'rejected' }}
        onConfirm={onConfirm}
        onReject={onReject}
      />
    );

    expect(screen.getByText('已拒绝')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument();
  });

  it('6. 已失效态展示「已失效」与重新提出需求的提示，不渲染按钮 (TC07-6)', () => {
    render(
      <ApprovalCard
        approval={{ ...baseApproval, status: 'expired' }}
        onConfirm={onConfirm}
        onReject={onReject}
      />
    );

    expect(screen.getByText('已失效')).toBeInTheDocument();
    expect(screen.getByText(/重新提出需求/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '拒绝' })).not.toBeInTheDocument();
  });

  it('7. 过期时间已过的待确认卡片渲染为已失效态 (TC07-7)', () => {
    render(
      <ApprovalCard
        approval={{ ...baseApproval, status: 'pending', expiresAt: Date.now() - 1000 }}
        onConfirm={onConfirm}
        onReject={onReject}
      />
    );

    expect(screen.getByText('已失效')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
  });

  it('8. 确认后状态回退为待确认，按钮解除禁用并可再次确认 (TC07-8)', () => {
    const { rerender } = render(
      <ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />
    );
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    rerender(
      <ApprovalCard
        approval={{ ...baseApproval, status: 'confirmed' }}
        onConfirm={onConfirm}
        onReject={onReject}
      />
    );
    rerender(<ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />);

    const button = screen.getByRole('button', { name: '确认执行' });
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('9. 确认请求未发出（返回 skipped）时按钮解除禁用，可再次确认 (TC07-9)', async () => {
    onConfirm.mockReturnValueOnce('skipped');
    render(<ApprovalCard approval={baseApproval} onConfirm={onConfirm} onReject={onReject} />);

    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));

    await waitFor(() => expect(screen.getByRole('button', { name: '确认执行' })).not.toBeDisabled());
    fireEvent.click(screen.getByRole('button', { name: '确认执行' }));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });
});

describe('ApprovalCard MCP 标识、倒计时与窄屏热区（工单 05 / TC03）', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('携带 serverName 时展示 [MCP: Server] 徽标，渲染 10 分钟倒数计时并在到期后转已失效', () => {
    vi.useFakeTimers();
    const fixedNow = 1_700_000_000_000;
    vi.setSystemTime(fixedNow);

    const mcpApproval = {
      ...baseApproval,
      toolName: 'mcp_srv_1_write_value',
      serverName: '受控测试服务',
      host: 'mcp.example.com',
      expiresAt: fixedNow + 10 * 60 * 1000,
    } as MessageApproval & { serverName?: string };

    render(<ApprovalCard approval={mcpApproval} onConfirm={vi.fn()} onReject={vi.fn()} />);

    const card = screen.getByTestId('approval-card');
    expect(card.textContent).toContain('[MCP: 受控测试服务]');
    expect(screen.getByTestId('approval-countdown').textContent).toContain('10:00');

    // 推进 1 秒：倒计时减少
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId('approval-countdown').textContent).toContain('09:59');

    // 确认/拒绝按钮保持至少 44x44 热区类
    const rejectBtn = screen.getByTestId('approval-reject');
    const confirmBtn = screen.getByTestId('approval-confirm');
    expect(rejectBtn.className).toContain('min-h-[44px]');
    expect(rejectBtn.className).toContain('min-w-[44px]');
    expect(confirmBtn.className).toContain('min-h-[44px]');
    expect(confirmBtn.className).toContain('min-w-[44px]');

    // 推进超过 10 分钟：卡片转已失效
    act(() => {
      vi.advanceTimersByTime(10 * 60 * 1000 + 1000);
    });
    expect(card).toHaveAttribute('data-status', 'expired');
    expect(screen.getByText('已失效')).toBeInTheDocument();
  });

  it('MCP 审批参数规范化序列化超过 8,000 字符时渲染中文超限提示且不渲染「确认执行」按钮（TC10-5）', () => {
    const oversizedApproval = {
      ...baseApproval,
      toolName: 'mcp_srv_1_write_value',
      serverName: '受控测试服务',
      host: 'mcp.example.com',
      // {"v":"..."} 为 8 字符，总数 8,001
      params: { v: 'a'.repeat(8001 - 8) },
    } as MessageApproval & { serverName?: string };

    render(<ApprovalCard approval={oversizedApproval} onConfirm={vi.fn()} onReject={vi.fn()} />);

    const hint = screen.getByTestId('approval-param-limit-error');
    expect(hint.textContent).toContain('8,000');
    expect(screen.queryByRole('button', { name: '确认执行' })).not.toBeInTheDocument();
  });
});
