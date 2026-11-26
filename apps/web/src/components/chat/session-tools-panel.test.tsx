import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SessionToolsPanel, getAvailableToolsList } from './session-tools-panel';
import { useChatStore } from '@/stores/chat-store';
import { fetchAgentTools, type SanitizedAgentTool } from '@/lib/api/agent-tools';
import { fetchEnabledMcpTools, type EnabledMcpToolItem } from '@/lib/api/mcp-servers';

vi.mock('@/lib/api/agent-tools', () => ({
  fetchAgentTools: vi.fn(),
}));

vi.mock('@/lib/api/mcp-servers', () => ({
  fetchEnabledMcpTools: vi.fn(),
}));

const mockedFetchAgentTools = vi.mocked(fetchAgentTools);
const mockedFetchEnabledMcpTools = vi.mocked(fetchEnabledMcpTools);

function makeMcpTool(overrides: Partial<EnabledMcpToolItem> = {}): EnabledMcpToolItem {
  return {
    serverId: 'srv_1',
    serverName: '受控测试服务',
    toolName: 'read_value',
    description: '读取一个受控值',
    modelToolName: 'mcp_srv_1_read_value',
    allowAutoExecute: true,
    ...overrides,
  };
}

function makeUserTool(overrides: Partial<SanitizedAgentTool> = {}): SanitizedAgentTool {
  return {
    id: 'tool-webhook-1',
    userId: 'u1',
    name: '飞书通知',
    callName: 'feishu_notify',
    description: '发送群机器人通知',
    url: 'https://open.feishu.cn/webhook',
    method: 'POST',
    hasAuthHeaderValue: false,
    authHeaderName: null,
    params: [{ name: 'text', type: 'string', required: true, description: '通知正文' }],
    enabled: true,
    requiresApproval: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('SessionToolsPanel 可用工具面板与会话级启停 (ADR-0014 / 工单 02)', () => {
  beforeEach(() => {
    mockedFetchAgentTools.mockReset();
    mockedFetchEnabledMcpTools.mockReset();
    mockedFetchEnabledMcpTools.mockResolvedValue([]);
    useChatStore.setState({
      activeConversationId: 'test-conv-1',
      activeCapabilityPackKey: null,
      toolOverrides: {},
    });
  });

  describe('工具白名单与可用状态计算 (getAvailableToolsList)', () => {
    it('通用 Agent 模式：列出全量 3 个平台内置工具，默认全开', () => {
      const { builtinTools, enabledCount } = getAvailableToolsList({
        capabilityPackKey: null,
        toolOverrides: {},
        userTools: [],
      });

      expect(builtinTools).toHaveLength(3);
      expect(builtinTools.map((t) => t.key)).toEqual([
        'web_search',
        'web_fetch',
        'image_generate',
      ]);
      expect(builtinTools.every((t) => t.enabled)).toBe(true);
      expect(enabledCount).toBe(3);
    });

    it('deep-research 深度调研包：严格白名单仅保留 web_search 和 web_fetch，剔除 image_generate', () => {
      const { builtinTools, enabledCount } = getAvailableToolsList({
        capabilityPackKey: 'deep-research',
        toolOverrides: {},
        userTools: [],
      });

      expect(builtinTools).toHaveLength(2);
      expect(builtinTools.map((t) => t.key)).toEqual(['web_search', 'web_fetch']);
      expect(enabledCount).toBe(2);
    });

    it('visual-report 图文报告包：严格白名单仅保留 image_generate 和 web_search', () => {
      const { builtinTools, enabledCount } = getAvailableToolsList({
        capabilityPackKey: 'visual-report',
        toolOverrides: {},
        userTools: [],
      });

      expect(builtinTools).toHaveLength(2);
      expect(builtinTools.map((t) => t.key)).toEqual(['image_generate', 'web_search']);
      expect(enabledCount).toBe(2);
    });

    it('toolOverrides 覆盖生效：当某工具被标记 false 时其 enabled 为 false，计数相应减 1', () => {
      const { builtinTools, enabledCount } = getAvailableToolsList({
        capabilityPackKey: null,
        toolOverrides: { image_generate: false },
        userTools: [],
      });

      const imgTool = builtinTools.find((t) => t.key === 'image_generate');
      expect(imgTool?.enabled).toBe(false);
      expect(enabledCount).toBe(2);
    });

    it('用户自定义 Webhook 工具作为插槽保留并支持启停', () => {
      const webhook1 = makeUserTool({ id: 'wh-1', callName: 'feishu', name: '飞书机器人' });
      const webhook2 = makeUserTool({ id: 'wh-2', callName: 'dingtalk', name: '钉钉机器人' });

      const { userTools, enabledCount } = getAvailableToolsList({
        capabilityPackKey: 'deep-research',
        toolOverrides: { dingtalk: false },
        userTools: [webhook1, webhook2],
      });

      expect(userTools).toHaveLength(2);
      expect(userTools[0].enabled).toBe(true);
      expect(userTools[1].enabled).toBe(false);
      // 内置 2 + 自定义 1 开启 = 3
      expect(enabledCount).toBe(3);
    });

    it('个人远程 MCP 工具保留在任意能力包中，支持仅收窄覆盖且不可启用未入白名单工具', () => {
      const mcpRead = makeMcpTool({ toolName: 'read_value', modelToolName: 'mcp_srv_1_read_value' });
      const mcpWrite = makeMcpTool({
        toolName: 'write_value',
        modelToolName: 'mcp_srv_1_write_value',
        allowAutoExecute: false,
      });

      const result = (getAvailableToolsList as unknown as (opts: Record<string, unknown>) => {
        builtinTools: Array<{ key: string; enabled: boolean }>;
        mcpTools?: Array<{ key: string; serverName?: string; enabled: boolean }>;
        enabledCount: number;
      })({
        capabilityPackKey: 'deep-research',
        toolOverrides: {
          mcp_srv_1_write_value: false,
          mcp_srv_1_not_whitelisted: true,
        },
        userTools: [],
        mcpTools: [mcpRead, mcpWrite],
      });

      expect(result.builtinTools).toHaveLength(2);
      expect(result.mcpTools).toHaveLength(2);
      expect(result.mcpTools?.map((t) => t.key)).not.toContain('mcp_srv_1_not_whitelisted');
      expect(result.mcpTools?.[0].enabled).toBe(true);
      expect(result.mcpTools?.[0].serverName).toBe('受控测试服务');
      expect(result.mcpTools?.[1].enabled).toBe(false);
      // 内置 2 + MCP 1 启用 = 3
      expect(result.enabledCount).toBe(3);
    });
  });

  describe('面板组件渲染与分端交互', () => {
    it('桌面端 Popover 触发器与面板渲染：展示可用工具徽标与工具清单', async () => {
      mockedFetchAgentTools.mockResolvedValueOnce([]);

      render(<SessionToolsPanel isMobile={false} />);

      // 触发按钮存在且具有指定 testid
      const trigger = screen.getByTestId('session-tools-trigger');
      expect(trigger).toBeInTheDocument();
      // 触控热区严格保持 ≥44px（min-h / min-w 或 h-9 w-9 + after 伪元素补足）
      expect(trigger.className).toMatch(/min-h-\[44px\]|after:-inset/);

      // 点击打开 Popover
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('当前会话可用工具')).toBeInTheDocument();
      });

      // 默认通用模式：列出 3 个内置工具
      expect(screen.getByText('联网搜索')).toBeInTheDocument();
      expect(screen.getByText('网页深度阅读')).toBeInTheDocument();
      expect(screen.getByText('AI 图像生成')).toBeInTheDocument();
    });

    it('点击 Switch 能够切换工具的临时启停并同步到 chatStore', async () => {
      mockedFetchAgentTools.mockResolvedValueOnce([]);

      render(<SessionToolsPanel isMobile={false} />);
      const trigger = screen.getByTestId('session-tools-trigger');
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByText('AI 图像生成')).toBeInTheDocument();
      });

      // 找到生图工具的 switch
      const switchEl = screen.getByTestId('tool-switch-image_generate');
      expect(switchEl).toBeInTheDocument();
      expect(switchEl).toHaveAttribute('data-state', 'checked');

      // 点击关闭生图
      fireEvent.click(switchEl);

      expect(useChatStore.getState().toolOverrides).toEqual({
        image_generate: false,
      });
    });

    it('在深度调研能力包下，内置工具仅展示白名单项', async () => {
      useChatStore.setState({ activeCapabilityPackKey: 'deep-research' });
      mockedFetchAgentTools.mockResolvedValueOnce([]);

      render(<SessionToolsPanel isMobile={false} />);
      fireEvent.click(screen.getByTestId('session-tools-trigger'));

      await waitFor(() => {
        expect(screen.getByText('联网搜索')).toBeInTheDocument();
      });

      expect(screen.getByText('网页深度阅读')).toBeInTheDocument();
      // deep-research 严禁出图，绝对不应渲染生图项
      expect(screen.queryByText('AI 图像生成')).not.toBeInTheDocument();
      expect(screen.getByText(/已受「深度调研」白名单限定/)).toBeInTheDocument();
    });

    it('移动端模式：升起底部抽屉 Drawer 并支持关闭', async () => {
      mockedFetchAgentTools.mockResolvedValueOnce([]);

      render(<SessionToolsPanel isMobile={true} />);
      const trigger = screen.getByTestId('session-tools-trigger');
      fireEvent.click(trigger);

      await waitFor(() => {
        expect(screen.getByTestId('session-tools-drawer')).toBeInTheDocument();
      });

      const drawer = screen.getByTestId('session-tools-drawer');
      // 移动端底部抽屉样式特征：rounded-t 或底部固定
      expect(drawer.className).toMatch(/rounded-t|bottom-0/);

      // 包含关闭按钮
      const closeBtn = screen.getByTestId('session-tools-close');
      fireEvent.click(closeBtn);

      await waitFor(() => {
        expect(screen.queryByTestId('session-tools-drawer')).not.toBeInTheDocument();
      });
    });

    it('面板展示「MCP 工具」分组、Server 名称、不可信提示，且支持单会话收窄与新会话恢复', async () => {
      mockedFetchAgentTools.mockResolvedValueOnce([]);
      mockedFetchEnabledMcpTools.mockResolvedValueOnce([
        makeMcpTool({ toolName: 'read_value', modelToolName: 'mcp_srv_1_read_value' }),
      ]);

      render(<SessionToolsPanel isMobile={false} />);
      fireEvent.click(screen.getByTestId('session-tools-trigger'));

      await waitFor(() => {
        expect(screen.getByText('MCP 工具')).toBeInTheDocument();
      });

      expect(screen.getByText('受控测试服务')).toBeInTheDocument();
      expect(screen.getByText('read_value')).toBeInTheDocument();
      expect(screen.queryByText('unlisted_dangerous_tool')).not.toBeInTheDocument();

      const trustHint = screen.getByTestId('mcp-trust-hint');
      expect(trustHint.textContent).toContain('不可信');
      expect(trustHint.textContent).not.toMatch(/已免疫|完全消除/);

      const trigger = screen.getByTestId('session-tools-trigger');
      // 3 内置 + 1 MCP = 4
      expect(trigger.textContent).toContain('4');

      const mcpSwitch = screen.getByTestId('tool-switch-mcp_srv_1_read_value');
      fireEvent.click(mcpSwitch);

      expect(useChatStore.getState().toolOverrides).toEqual({ mcp_srv_1_read_value: false });
      expect(trigger.textContent).toContain('3');

      // 模拟新建会话清空 toolOverrides，计数恢复全局白名单数量
      useChatStore.getState().setToolOverrides({});
      await waitFor(() => {
        expect(trigger.textContent).toContain('4');
      });
    });

    it('工具与 MCP 管理入口指向工具工作台对应分区锚点', async () => {
      mockedFetchAgentTools.mockResolvedValueOnce([
        makeUserTool({ id: 'tool-webhook-1', name: '飞书通知' }),
      ]);
      mockedFetchEnabledMcpTools.mockResolvedValueOnce([
        makeMcpTool({ toolName: 'read_value', modelToolName: 'mcp_srv_1_read_value' }),
      ]);

      render(<SessionToolsPanel isMobile={false} />);
      fireEvent.click(screen.getByTestId('session-tools-trigger'));

      await waitFor(() => {
        expect(screen.getByText('MCP 工具')).toBeInTheDocument();
      });

      expect(screen.getByText('管理工具').closest('a')).toHaveAttribute('href', '/tools#webhook');
      expect(screen.getByText('管理 MCP').closest('a')).toHaveAttribute('href', '/tools#mcp');
    });

    it('无工具配置时空态引导指向工具工作台对应分区，文案不再指向个人中心', async () => {
      mockedFetchAgentTools.mockResolvedValueOnce([]);
      mockedFetchEnabledMcpTools.mockResolvedValueOnce([]);

      render(<SessionToolsPanel isMobile={false} />);
      fireEvent.click(screen.getByTestId('session-tools-trigger'));

      await waitFor(() => {
        expect(screen.getByText('暂无配置 Webhook 工具')).toBeInTheDocument();
      });

      expect(screen.getByText('前往我的工具添加').closest('a')).toHaveAttribute('href', '/tools#webhook');
      expect(screen.getByText('前往我的工具配置').closest('a')).toHaveAttribute('href', '/tools#mcp');

      expect(screen.queryByText('前往个人中心添加')).not.toBeInTheDocument();
      expect(screen.queryByText('前往个人中心配置')).not.toBeInTheDocument();
    });
  });
});
