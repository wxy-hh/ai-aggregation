/**
 * astrology-interpretation-notice.test.tsx —— 文案区「解读暂不可用」卡
 *
 * 锁定的外部行为：
 * - 额度不足：统一给查看额度入口，并说明星盘事实照常可看；
 * - 记录里没存解读：照实说「这份记录只保存了星盘」，不写「解读正在接入中」这种与事实不符的话；
 * - 未取得结论：如实说没拿到结论，不写「整理中」这类会让用户干等的话；
 * - 解读未完成（超时/校验不过）：说明可重试，并给出「重试解读」入口（重试只补解读）；
 * - 各口径都明确告知星盘事实可用、可照常查看与点选。
 */

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AstrologyInterpretationNotice } from './astrology-interpretation-notice';
import { useAuthStore } from '@/stores/auth-store';

describe('AstrologyInterpretationNotice', () => {
  afterEach(() => {
    useAuthStore.setState({ user: null });
  });

  it('额度不足：给查看额度引导，并说明星盘事实照常可看', () => {
    render(<AstrologyInterpretationNotice reason="quota" />);

    expect(screen.getByText('AI 解读需要额度')).toBeInTheDocument();
    expect(screen.getByText(/星盘已经按真实星历算好了/)).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /查看我的额度/ });
    expect(link).toHaveAttribute('href', '/profile');
  });

  it('记录里没存解读：照实说明缺的是这份记录的解读，不给额度入口', () => {
    render(<AstrologyInterpretationNotice reason="not-wired" onRetry={() => {}} />);

    expect(screen.getByText('这份记录只保存了星盘')).toBeInTheDocument();
    expect(screen.getByText(/当时的 AI 解读没有随记录一起保存/)).toBeInTheDocument();
    expect(screen.queryByText(/正在接入中/)).toBeNull();
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('button', { name: /重试解读/ })).toBeInTheDocument();
  });

  it('未取得结论 / 未发起：不写「整理中」，如实说明可重新测算', () => {
    const { unmount } = render(<AstrologyInterpretationNotice reason="unknown" />);
    expect(screen.getByText('解读暂时不可用')).toBeInTheDocument();
    expect(screen.getByText(/没有取到解读结论/)).toBeInTheDocument();
    unmount();

    render(<AstrologyInterpretationNotice reason={null} />);
    expect(screen.queryByText(/整理中/)).toBeNull();
    expect(screen.getByRole('heading', { name: '这份记录只保存了星盘' })).toBeInTheDocument();
  });

  it('解读未完成：如实说明可重试，重试按钮回调生效', () => {
    const onRetry = vi.fn();
    render(<AstrologyInterpretationNotice reason="model" onRetry={onRetry} />);

    expect(screen.getByText('AI 解读没有完成')).toBeInTheDocument();
    expect(screen.getByText(/超时或没有通过校验/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /重试解读/ }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('额度不足同样给重试入口（额度恢复后不必重算星盘）', () => {
    const onRetry = vi.fn();
    render(<AstrologyInterpretationNotice reason="quota" onRetry={onRetry} />);

    expect(screen.getByRole('button', { name: /重试解读/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /查看我的额度/ })).toHaveAttribute('href', '/profile');
  });

  it('未提供重试回调时不渲染重试入口（历史恢复的旧结果无从重跑）', () => {
    render(<AstrologyInterpretationNotice reason={null} />);
    expect(screen.queryByRole('button', { name: /重试解读/ })).toBeNull();
  });
});
