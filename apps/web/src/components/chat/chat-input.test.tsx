/**
 * chat-input.test.tsx —— 单聊输入区主操作按钮（发送/停止）状态机 + agent 模式开关测试
 *
 * 锁定的外部行为（验收附带发现 #1：单聊无停止按钮，stop 为死代码）：
 * 1. isLoading 时主按钮切换为「停止生成」：可点击、点击触发 store.stop()、不触发 onSend；
 * 2. 非 loading 且有输入时主按钮为「发送」：点击触发 onSend（既有行为回归锁）。
 *
 * agent 模式开关（spec §8 / D7「输入区显式开关」）：
 * 3. 默认关闭：未开启时无任何提示条，开关可点开；
 * 4. 开启后：aria-pressed 为 true，并出现「已切换至豆包 Seed」的局部提示；
 * 5. agent 期间服务端强制走豆包，故此时即使头部选的是讯飞，附件入口也应可用。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';

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

describe('ChatInput agent 模式开关', () => {
  beforeEach(async () => {
    // settings-store 的 persist 首次导入时会 rehydrate，并在下一个 tick 里执行 _initializeTheme；
    // 这个异步 set 落在渲染之外会触发 React 的 act 警告。先把挂起的定时任务冲干净再渲染。
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      useChatStore.setState({ provider: 'xunfei', attachment: null, isLoading: false });
      useSettingsStore.setState({ agentModeEnabled: false });
    });
  });

  afterEach(() => {
    // 先卸载组件再重置 store：反过来会让仍挂载中的组件收到订阅更新，触发 act 警告
    cleanup();
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  it('默认关闭：开关可点开且无提示条', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const toggle = screen.getByRole('button', { name: '开启 Agent 工具调用' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('agent-mode-notice')).not.toBeInTheDocument();
  });

  it('点击开启后：aria-pressed 为 true 并出现生效模型与额度提示', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);
    const toggle = screen.getByRole('button', { name: '关闭 Agent 工具调用' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('agent-mode-notice')).toHaveTextContent('已切换至豆包 Seed');
  });

  it('agent 开启时头部选讯飞也不禁用附件入口（生效模型由服务端强制为豆包）', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      useSettingsStore.setState({ agentModeEnabled: true });
    });

    expect(screen.getByRole('button', { name: '添加附件' })).not.toBeDisabled();
  });
});
