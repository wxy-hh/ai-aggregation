/**
 * chat-input.test.tsx —— 单聊输入区主操作按钮（发送/停止）状态机测试
 *
 * 锁定的外部行为（验收附带发现 #1：单聊无停止按钮，stop 为死代码）：
 * 1. isLoading 时主按钮切换为「停止生成」：可点击、点击触发 store.stop()、不触发 onSend；
 * 2. 非 loading 且有输入时主按钮为「发送」：点击触发 onSend（既有行为回归锁）。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/stores/chat-store';

describe('ChatInput 主操作按钮（发送/停止切换）', () => {
  // 用 spy 拦截 store.stop（不覆盖实现，避免跨用例污染 store 方法）
  let stopSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useChatStore.setState({
      provider: 'xunfei',
      attachment: null,
      isLoading: false,
    });
    stopSpy = vi.spyOn(useChatStore.getState(), 'stop');
  });

  afterEach(() => {
    stopSpy.mockRestore();
    cleanup();
  });

  it('isLoading 时按钮为「停止生成」且可点击：点击触发 stop，不触发 onSend', () => {
    useChatStore.setState({ isLoading: true });
    const onSend = vi.fn();

    render(<ChatInput onSend={onSend} isLoading />);

    const btn = screen.getByRole('button', { name: '停止生成' });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('isLoading 时即使输入框为空，停止按钮也可点击（不受发送禁用条件影响）', () => {
    useChatStore.setState({ isLoading: true, input: '' });
    const onSend = vi.fn();

    render(<ChatInput onSend={onSend} isLoading />);

    const btn = screen.getByRole('button', { name: '停止生成' });
    expect(btn).not.toBeDisabled();
  });

  it('非 loading 且有输入时按钮为「发送」：点击触发 onSend（回归锁）', () => {
    useChatStore.setState({ isLoading: false });
    const onSend = vi.fn();

    render(<ChatInput onSend={onSend} isLoading={false} />);

    // 输入内容后按钮可用
    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '你好' } });

    const btn = screen.getByRole('button', { name: '发送' });
    expect(btn).not.toBeDisabled();

    fireEvent.click(btn);
    expect(onSend).toHaveBeenCalledWith('你好');
    expect(stopSpy).not.toHaveBeenCalled();
  });
});
