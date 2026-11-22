import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, vi } from 'vitest';
import { ModeSegmentedControl } from '../chat-workspace';

describe('ModeSegmentedControl 对话模式分段控制器 (单聊 / 并行对比)', () => {
  it('单聊模式：单聊项高亮且为选中态，并行对比为未选中态，文字非空可见', () => {
    const onChange = vi.fn();
    render(<ModeSegmentedControl mode="single" onChange={onChange} id="test-ctrl" />);

    const tablist = screen.getByRole('tablist', { name: '对话模式切换' });
    expect(tablist).toBeInTheDocument();

    const singleTab = screen.getByRole('tab', { name: '单聊' });
    const compareTab = screen.getByRole('tab', { name: '并行对比' });

    expect(singleTab).toHaveAttribute('aria-selected', 'true');
    expect(compareTab).toHaveAttribute('aria-selected', 'false');

    // 严防空白按钮：两个按钮必须具有可见的完整中文标签
    expect(singleTab.textContent?.trim()).toBe('单聊');
    expect(compareTab.textContent?.trim()).toBe('并行对比');

    // 检查高亮文本类名与非高亮文本类名
    expect(singleTab.className).toContain('text-white');
    expect(compareTab.className).toContain('text-slate-500');
  });

  it('并行对比模式：并行对比项高亮且为选中态，单聊为未选中态，文字非空可见', () => {
    const onChange = vi.fn();
    render(<ModeSegmentedControl mode="compare" onChange={onChange} id="test-ctrl" />);

    const singleTab = screen.getByRole('tab', { name: '单聊' });
    const compareTab = screen.getByRole('tab', { name: '并行对比' });

    expect(singleTab).toHaveAttribute('aria-selected', 'false');
    expect(compareTab).toHaveAttribute('aria-selected', 'true');

    expect(singleTab.textContent?.trim()).toBe('单聊');
    expect(compareTab.textContent?.trim()).toBe('并行对比');

    expect(singleTab.className).toContain('text-slate-500');
    expect(compareTab.className).toContain('text-white');
  });

  it('点击未选中按钮触发 onChange 回调', () => {
    const onChange = vi.fn();
    render(<ModeSegmentedControl mode="single" onChange={onChange} id="test-ctrl" />);

    const compareTab = screen.getByRole('tab', { name: '并行对比' });
    fireEvent.click(compareTab);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('compare');
  });

  it('物理滑动高亮胶囊常驻 DOM（aria-hidden 且不随条件渲染丢失）', () => {
    const { container, rerender } = render(
      <ModeSegmentedControl mode="single" onChange={vi.fn()} id="test-ctrl" />
    );

    const indicator = container.querySelector('[aria-hidden="true"]');
    expect(indicator).toBeInTheDocument();
    expect(indicator?.className).toContain('bg-blue-600');
    expect(indicator?.className).toContain('left-0.5');

    // 切换为对比模式
    rerender(<ModeSegmentedControl mode="compare" onChange={vi.fn()} id="test-ctrl" />);
    const indicatorAfter = container.querySelector('[aria-hidden="true"]');
    expect(indicatorAfter).toBeInTheDocument();
    expect(indicatorAfter?.className).toContain('left-[calc(50%+1px)]');
  });
});
