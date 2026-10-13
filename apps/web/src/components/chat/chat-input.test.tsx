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
import { trackEvent } from '@/lib/events/tracker';

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: vi.fn(),
}));

vi.mock('@/lib/events/tracker', () => ({
  trackEvent: vi.fn(),
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

describe('ChatInput agent 工具状态收敛与会话工具面板', () => {
  beforeEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      useChatStore.setState({
        provider: 'doubao',
        attachment: null,
        isLoading: false,
        activeConversationId: 'conv-1',
        activeCapabilityPackKey: null,
        toolOverrides: {},
      });
      useSettingsStore.setState({ agentModeEnabled: false });
    });
    vi.mocked(fetchAgentTools).mockReset();
    vi.mocked(fetchAgentTools).mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  it('开关开启时加载用户工具并注入底部工具面板，顶栏不再渲染重复的状态链接', async () => {
    vi.mocked(fetchAgentTools).mockResolvedValue([
      createMockTool('1', '查询天气', true),
      createMockTool('2', '查询股票', true),
      createMockTool('3', '已废弃工具', false),
    ]);

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    // 顶栏不再渲染旧的重复状态条
    expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();

    // 底部可用工具面板角标展示总可用工具数（3 个内置 + 2 个启用的自定义 = 5）
    const countBadge = await screen.findByTestId('session-tools-count');
    expect(countBadge).toHaveTextContent('5');
    expect(fetchAgentTools).toHaveBeenCalledTimes(1);
  });

  it('无自定义工具时底部面板正常展示内置工具数量（3），顶栏无冗余跳转', async () => {
    vi.mocked(fetchAgentTools).mockResolvedValue([
      createMockTool('1', '停用工具A', false),
    ]);

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();
    const countBadge = await screen.findByTestId('session-tools-count');
    expect(countBadge).toHaveTextContent('3');
  });

  it('接口返回 401 或请求异常时静默降级，不影响对话输入与基础 Agent 提示', async () => {
    vi.mocked(fetchAgentTools).mockRejectedValue(new Error('401 Unauthorized'));

    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '开启 Agent 工具调用' }));
    });

    // 确认 Agent 模式基础提示正常展示
    expect(await screen.findByTestId('agent-mode-notice')).toHaveTextContent('已切换至豆包 Seed');
    expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();

    // 底部仍兜底展示 3 个内置工具
    const countBadge = await screen.findByTestId('session-tools-count');
    expect(countBadge).toHaveTextContent('3');
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

    expect(await screen.findByTestId('session-tools-count')).toHaveTextContent('4');
    expect(fetchAgentTools).toHaveBeenCalledTimes(1);

    // 关闭开关
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '关闭 Agent 工具调用' }));
    });

    // 底部工具入口随之隐藏
    expect(screen.queryByTestId('session-tools-trigger')).not.toBeInTheDocument();

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

    expect(await screen.findByTestId('session-tools-count')).toHaveTextContent('6');
    expect(fetchAgentTools).toHaveBeenCalledTimes(2);
  });

  it('开关保持关闭时不会发起工具请求', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    expect(fetchAgentTools).not.toHaveBeenCalled();
    expect(screen.queryByTestId('agent-tools-status')).not.toBeInTheDocument();
    expect(screen.queryByTestId('session-tools-trigger')).not.toBeInTheDocument();
  });
});
});

describe('ChatInput 智能意图升级芯片（ADR-0012 / 工单 04）', () => {
  beforeEach(async () => {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
      useChatStore.setState({
        provider: 'xunfei',
        attachment: null,
        isLoading: false,
        activeConversationId: 'conv-1',
      });
      useSettingsStore.setState({ agentModeEnabled: false });
    });
    vi.mocked(trackEvent).mockClear();
  });

  afterEach(() => {
    cleanup();
    useSettingsStore.setState({ agentModeEnabled: false });
  });

  it('出现条件：普通对话草稿命中关键词（>=4字符）且未开启 agentMode 时浮出芯片', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '帮我查下最新的股票行情' } });

    const chip = screen.getByTestId('agent-intent-chip');
    expect(chip).toBeInTheDocument();
    expect(chip).toHaveTextContent('联网查一下？');
  });

  it('出现条件：字符数 < 4 字符时不出现芯片', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '最新' } });

    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();
  });

  it('出现条件：agentMode 已开启时绝不出现芯片', async () => {
    await act(async () => {
      useSettingsStore.setState({ agentModeEnabled: true });
    });
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    await act(async () => {
      fireEvent.change(textarea, { target: { value: '帮我查下最新的股票行情' } });
    });

    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();
  });

  it('双通道触发：paste URL 事件即时检测唤出芯片', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.paste(textarea, {
      clipboardData: {
        getData: (format: string) => (format === 'text' ? 'https://example.com/article' : ''),
      },
    });

    const chip = screen.getByTestId('agent-intent-chip');
    expect(chip).toBeInTheDocument();
  });

  it('点击语义：点击芯片开启 agentMode 并以当前草稿全文触发既有 onSend', async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气' } });

    const chip = screen.getByTestId('agent-intent-chip');
    await act(async () => {
      fireEvent.click(chip);
    });

    // 状态更新为开启
    expect(useSettingsStore.getState().agentModeEnabled).toBe(true);
    // 以当前全文发送
    expect(onSend).toHaveBeenCalledWith('请帮我查一下上海明天的天气');
  });

  it('五类消失：点击芯片后芯片消失', async () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气' } });

    const chip = screen.getByTestId('agent-intent-chip');
    await act(async () => {
      fireEvent.click(chip);
    });

    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();
  });

  it('五类消失：普通发送消息后芯片消失', () => {
    const onSend = vi.fn();
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气' } });

    const sendBtn = screen.getByRole('button', { name: '发送' });
    fireEvent.click(sendBtn);

    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();
  });

  it('五类消失：清空输入框后芯片消失', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气' } });
    expect(screen.getByTestId('agent-intent-chip')).toBeInTheDocument();

    fireEvent.change(textarea, { target: { value: '' } });
    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();
  });

  it('五类消失与草稿级 dismiss：点 X 仅针对本条草稿 dismiss，继续编辑不再出现，清空后输入新草稿可再次出现', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气' } });

    const closeBtn = screen.getByLabelText('关闭联网查询提示');
    fireEvent.click(closeBtn);

    // 芯片消失
    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();

    // 在同一草稿继续追加编辑，依然保持 dismiss 不再出现
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气和空气质量' } });
    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();

    // 清空草稿后，再输入下一条满足条件的草稿，芯片正常重新出现
    fireEvent.change(textarea, { target: { value: '' } });
    fireEvent.change(textarea, { target: { value: '最新汇率是多少钱' } });
    expect(screen.getByTestId('agent-intent-chip')).toBeInTheDocument();
  });

  it('五类消失：切换会话时芯片消失', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '请帮我查一下上海明天的天气' } });
    expect(screen.getByTestId('agent-intent-chip')).toBeInTheDocument();

    act(() => {
      useChatStore.setState({ activeConversationId: 'conv-2' });
    });

    expect(screen.queryByTestId('agent-intent-chip')).not.toBeInTheDocument();
  });

  it('三动作埋点：曝光（去抖只报一次）、点击与 dismiss 正常上报且绝不包含原文', () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '帮我查一下最新的天气' } });

    // 曝光事件上报
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith('agent_intent_chip.impression', {
      signal: 'keyword',
      keyword: '帮我查',
    });

    // 持续输入相同信号的草稿：去抖保证不再重复曝光
    fireEvent.change(textarea, { target: { value: '帮我查一下最新的天气预报详情' } });
    expect(trackEvent).toHaveBeenCalledTimes(1);

    // 点击 dismiss
    const closeBtn = screen.getByLabelText('关闭联网查询提示');
    fireEvent.click(closeBtn);

    expect(trackEvent).toHaveBeenCalledTimes(2);
    expect(trackEvent).toHaveBeenCalledWith('agent_intent_chip.dismiss', {
      signal: 'keyword',
      keyword: '帮我查',
    });
  });

  it('三动作埋点：URL 命中上报时不带 keyword 字段', async () => {
    render(<ChatInput onSend={vi.fn()} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…');
    fireEvent.change(textarea, { target: { value: '看这个 https://example.com/test' } });

    expect(trackEvent).toHaveBeenCalledWith('agent_intent_chip.impression', {
      signal: 'url',
    });

    const chip = screen.getByTestId('agent-intent-chip');
    await act(async () => {
      fireEvent.click(chip);
    });

    expect(trackEvent).toHaveBeenCalledWith('agent_intent_chip.click', {
      signal: 'url',
    });
  });

  it('余额与错误兜底：发送失败后草稿必须保留在输入框中（不丢失）', async () => {
    const onSend = vi.fn().mockResolvedValue(false); // 模拟发送失败
    render(<ChatInput onSend={onSend} isLoading={false} />);

    const textarea = screen.getByPlaceholderText('输入消息…') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '帮我查一下今天的天气' } });

    const sendBtn = screen.getByRole('button', { name: '发送' });
    await act(async () => {
      fireEvent.click(sendBtn);
    });

    // 发送失败后草稿恢复保留在输入框
    expect(textarea.value).toBe('帮我查一下今天的天气');
  });

  describe('ChatInput 场景能力包徽标 (ADR-0014 / 工单 01)', () => {
    it('开启 Agent 模式且选择了 deep-research 能力包时，展示深度调研能力包徽标与 8 步上限提示', () => {
      useSettingsStore.setState({ agentModeEnabled: true });
      useChatStore.setState({ activeCapabilityPackKey: 'deep-research' });

      render(<ChatInput onSend={vi.fn()} isLoading={false} />);

      const badge = screen.getByTestId('capability-pack-badge');
      expect(badge).toBeInTheDocument();
      expect(badge).toHaveTextContent('深度调研');
      expect(badge).toHaveTextContent('8 步');
    });

    it('点击徽标上的取消按钮，清除能力包选择', () => {
      useSettingsStore.setState({ agentModeEnabled: true });
      useChatStore.setState({ activeCapabilityPackKey: 'deep-research' });

      render(<ChatInput onSend={vi.fn()} isLoading={false} />);

      const closeBtn = screen.getByLabelText('取消选择能力包');
      fireEvent.click(closeBtn);

      expect(useChatStore.getState().activeCapabilityPackKey).toBeNull();
    });

    it('外部草稿传入时，自动填充输入框并调用 focus 聚焦', () => {
      const onConsumed = vi.fn();
      render(
        <ChatInput
          onSend={vi.fn()}
          isLoading={false}
          externalDraft={{ id: 'draft-1', text: '调研报告模板内容' }}
          onExternalDraftConsumed={onConsumed}
        />
      );

      const textarea = screen.getByPlaceholderText('输入消息…') as HTMLTextAreaElement;
      expect(textarea.value).toBe('调研报告模板内容');
      expect(onConsumed).toHaveBeenCalledWith('draft-1');
    });
  });

  describe('ChatInput 可用工具面板入口 (ADR-0014 / 工单 02)', () => {
    beforeEach(() => {
      vi.mocked(fetchAgentTools).mockResolvedValue([]);
    });

    it('Agent 模式开启时，渲染可用工具触发入口并显示可用数量角标', () => {
      useSettingsStore.setState({ agentModeEnabled: true });
      useChatStore.setState({ activeCapabilityPackKey: null, toolOverrides: {} });

      render(<ChatInput onSend={vi.fn()} isLoading={false} />);

      const trigger = screen.getByTestId('session-tools-trigger');
      expect(trigger).toBeInTheDocument();
      const countBadge = screen.getByTestId('session-tools-count');
      expect(countBadge).toBeInTheDocument();
      // 默认通用模式 3 个内置工具
      expect(countBadge).toHaveTextContent('3');
    });

    it('Agent 模式关闭时，不渲染可用工具触发入口', () => {
      useSettingsStore.setState({ agentModeEnabled: false });

      render(<ChatInput onSend={vi.fn()} isLoading={false} />);

      expect(screen.queryByTestId('session-tools-trigger')).not.toBeInTheDocument();
    });
  });
});
