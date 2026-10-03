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
 * 5. agent 模式下附件入口隐藏（编排器不支持附件输入，消除「能选图、传不进去」，
 * agent 自定义工具感知状态条（三期工单 05 / spec §4.6）：
 * 6. 开关打开时懒加载工具列表，展示已启用数量与「去管理」；
 * 7. N=0 时展示「可添加我的工具，让 Agent 调用你的服务」引导文案；
 * 8. 401 未登录或请求异常时静默降级不渲染状态条；
 * 9. 状态条整行可点击跳转至 /profile；
 * 10. 开关关掉再开会重新拉取最新工具状态。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react';
import { ChatInput } from './chat-input';
import { useChatStore } from '@/stores/chat-store';
import { useSettingsStore } from '@/stores/settings-store';
import { fetchAgentTools } from '@/lib/api/agent-tools';

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: vi.fn(),
}));

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
    vi.mocked(fetchAgentTools).mockReset();
    vi.mocked(fetchAgentTools).mockResolvedValue([]);
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

  it('点击开启后：aria-pressed 为 true 并出现生效模型与额度提示', async () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);
    const toggle = screen.getByRole('button', { name: '关闭 Agent 工具调用' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('agent-mode-notice')).toHaveTextContent('已切换至豆包 Seed');

    // 冲刷异步微任务，避免跨用例 act 警告
    await act(async () => {
      await Promise.resolve();
    });
  });

  it('agent 开启时附件入口隐藏（即使头部选豆包也不显示），非 agent 豆包模式照常', async () => {
    useChatStore.setState({ provider: 'doubao' });
    const { unmount } = render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    // 非 agent 的豆包模式：附件入口照常可用（回归锁）
    expect(screen.getByRole('button', { name: '添加附件' })).not.toBeDisabled();

    // 开启 agent：可用入口与置灰回退都不渲染（彻底隐藏，而非显示不可用的置灰钮）
    act(() => {
      useSettingsStore.setState({ agentModeEnabled: true });
    });
    expect(screen.queryByRole('button', { name: '添加附件' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: '当前模型不支持附件' })
    ).not.toBeInTheDocument();

    // 冲刷异步微任务
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
  });
});

describe('ChatInput agent 自定义工具感知状态条', () => {
  // 模拟工具定义数据辅助函数
  const createMockTool = (id: string, name: string, enabled: boolean) => ({
    id,
    userId: 'user-test',
    name,
    callName: `call_${id}`,
    description: `描述_${name}`,
    url: 'https://api.example.com/webhook',
    method: 'POST' as const,
    authHeaderName: null,
    hasAuthHeaderValue: false,
    params: [],
    enabled,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  beforeEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      useChatStore.setState({ provider: 'xunfei', attachment: null, isLoading: false });
      useSettingsStore.setState({ agentModeEnabled: false });
    });
    vi.mocked(fetchAgentTools).mockReset();
    vi.mocked(fetchAgentTools).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  it('开关开启时加载并展示已启用的工具数量（未启用的不计入）', async () => {
    vi.mocked(fetchAgentTools).mockResolvedValue([
      createMockTool('1', '查询天气', true),
      createMockTool('2', '查询股票', true),
      createMockTool('3', '已废弃工具', false),
    ]);

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    const statusLine = await screen.findByTestId('agent-tools-status');
    expect(statusLine).toBeInTheDocument();
    expect(statusLine).toHaveTextContent('已加载 2 个我的工具 · 去管理');
    expect(fetchAgentTools).toHaveBeenCalledTimes(1);
  });

  it('工具数量为 0 时展示引导文案「可添加我的工具，让 Agent 调用你的服务」', async () => {
    vi.mocked(fetchAgentTools).mockResolvedValue([
      createMockTool('1', '停用工具A', false),
    ]);

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    const statusLine = await screen.findByTestId('agent-tools-status');
    expect(statusLine).toBeInTheDocument();
    expect(statusLine).toHaveTextContent('可添加我的工具，让 Agent 调用你的服务');
  });

  it('接口返回 401 或请求异常时静默降级，不渲染状态条且不影响对话输入', async () => {
    vi.mocked(fetchAgentTools).mockRejectedValue(new Error('401 Unauthorized'));

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    // 确认 Agent 模式基础提示正常展示
    expect(await screen.findByTestId('agent-mode-notice')).toHaveTextContent('已切换至豆包 Seed');

    // 状态条不应被渲染
    await waitFor(() => {
      expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();
    });
  });

  it('状态条渲染为指向 /profile 的链接，且支持点击', async () => {
    vi.mocked(fetchAgentTools).mockResolvedValue([
      createMockTool('1', '发送通知', true),
    ]);

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    const statusLine = await screen.findByTestId('agent-tools-status');
    expect(statusLine).toHaveAttribute('href', '/profile');

    // 验证点击不会抛错
    fireEvent.click(statusLine);
  });

  it('开关关掉再开启会重新懒加载最新数据（改配置后回来能刷新）', async () => {
    // 第一次开启：只有 1 个工具
    vi.mocked(fetchAgentTools).mockResolvedValueOnce([
      createMockTool('1', '初始工具', true),
    ]);

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    // 开启
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    expect(await screen.findByText(/已加载 1 个我的工具/)).toBeInTheDocument();
    expect(fetchAgentTools).toHaveBeenCalledTimes(1);

    // 关闭开关
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '关闭 Agent 工具调用' }));
    });

    // 状态条消失
    expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();

    // 配置发生变更：变为 3 个启用工具
    vi.mocked(fetchAgentTools).mockResolvedValueOnce([
      createMockTool('1', '初始工具', true),
      createMockTool('2', '新工具A', true),
      createMockTool('3', '新工具B', true),
    ]);

    // 再次开启
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    expect(await screen.findByText(/已加载 3 个我的工具/)).toBeInTheDocument();
    expect(fetchAgentTools).toHaveBeenCalledTimes(2);
  });

  it('开关保持关闭时不会发起工具请求', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    expect(fetchAgentTools).not.toHaveBeenCalled();
    expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();
  });
});
