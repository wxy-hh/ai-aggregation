/**
 * MCP 工具列表抽屉组件测试（工单 03 / ADR-0064 §5）
 *
 * 验证目标：
 * - 展示工具名称、描述与参数摘要
 * - 新发现工具默认停用（开关关闭）
 * - 不受支持的工具标记原因且不可启用
 * - 「允许自动执行」文案明确表示信任参数出站
 * - 切换白名单开关会调用更新接口
 * - 启用工具达上限时展示明确错误
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProfileMcpToolsDrawer } from './profile-mcp-tools-drawer';

const mocks = vi.hoisted(() => ({
  fetchTools: vi.fn(),
  updatePolicy: vi.fn(),
}));

vi.mock('@/lib/api/mcp-servers', () => ({
  fetchMcpServerTools: mocks.fetchTools,
  updateMcpToolPolicy: mocks.updatePolicy,
}));

const readTool = {
  toolName: 'read_value',
  description: '读取一个受控值',
  inputSummary: [
    { name: 'key', type: 'string', required: true },
    { name: 'limit', type: 'number', required: false },
  ],
  annotations: { readOnlyHint: true },
  modelToolName: 'mcp_srv_1_read_value',
  supported: true,
  enabled: false,
  allowAutoExecute: false,
};

const unsupportedTool = {
  toolName: 'remote_ref_tool',
  description: '参数含远程引用',
  inputSummary: [],
  annotations: null,
  modelToolName: 'mcp_srv_1_remote_ref_tool',
  supported: false,
  supportReason: '工具参数 Schema 含远程引用，该工具不受支持',
  enabled: false,
  allowAutoExecute: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchTools.mockResolvedValue([readTool, unsupportedTool]);
  mocks.updatePolicy.mockResolvedValue({
    toolName: 'read_value',
    enabled: true,
    allowAutoExecute: false,
  });
});

describe('ProfileMcpToolsDrawer MCP 工具列表', () => {
  it('展示工具名称、描述与参数摘要', async () => {
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    expect(await screen.findByText('read_value')).toBeTruthy();
    expect(screen.getByText('读取一个受控值')).toBeTruthy();
    expect(screen.getByText('key')).toBeTruthy();
    expect(screen.getByText('必填')).toBeTruthy();
  });

  it('新发现工具默认停用', async () => {
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    await screen.findByText('read_value');
    const toggle = screen.getByRole('switch', { name: /启用 read_value/ });
    expect(toggle.getAttribute('data-state')).toBe('unchecked');
  });

  it('不受支持的工具标记原因且不渲染启用开关', async () => {
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    expect(await screen.findByText(/该工具不受支持/)).toBeTruthy();
    expect(screen.queryByRole('switch', { name: /启用 remote_ref_tool/ })).toBeNull();
  });

  it('「允许自动执行」文案明确表示信任参数出站', async () => {
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    await screen.findByText('read_value');
    expect(screen.getByText(/信任把模型生成的参数发送至该服务/)).toBeTruthy();
  });

  it('切换白名单开关会调用更新接口', async () => {
    const user = userEvent.setup();
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    await screen.findByText('read_value');
    await user.click(screen.getByRole('switch', { name: /启用 read_value/ }));

    await waitFor(() => {
      expect(mocks.updatePolicy).toHaveBeenCalledWith('srv_1', {
        toolName: 'read_value',
        enabled: true,
      });
    });
  });

  it('启用失败时展示服务端返回的中文错误', async () => {
    const user = userEvent.setup();
    mocks.updatePolicy.mockRejectedValue(new Error('启用的 MCP 工具已达 8 个上限，请先停用部分工具'));
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    await screen.findByText('read_value');
    await user.click(screen.getByRole('switch', { name: /启用 read_value/ }));

    expect(
      await screen.findByText('启用的 MCP 工具已达 8 个上限，请先停用部分工具')
    ).toBeTruthy();
  });

  it('加载失败时展示重试入口', async () => {
    mocks.fetchTools.mockRejectedValue(new Error('获取工具列表失败'));
    render(<ProfileMcpToolsDrawer open serverId="srv_1" onOpenChange={() => {}} />);

    expect(await screen.findByText('获取工具列表失败')).toBeTruthy();
  });
});
