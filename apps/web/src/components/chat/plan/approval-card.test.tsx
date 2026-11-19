import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
