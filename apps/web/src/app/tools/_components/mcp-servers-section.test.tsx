/**
 * 「MCP 服务」工作台板块组件测试（ADR-0064 §2）
 *
 * 验证目标：
 * - 空状态引导与 10 个上限提示
 * - 卡片展示名称、域名、发现状态与凭证状态
 * - 发现失败时显示原因并提供「重试工具发现」
 * - 表单校验失败时显示中文错误
 * - 删除二次确认流程
 * - 鉴权头取值永不回显
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { McpServersSection } from './mcp-servers-section';

const mocks = vi.hoisted(() => ({
  fetchServers: vi.fn(),
  createServer: vi.fn(),
  updateServer: vi.fn(),
  deleteServer: vi.fn(),
  refreshTools: vi.fn(),
  user: { id: 'user_1', username: 'u1' } as unknown,
  accessToken: 'token_1' as string | null,
  status: 'ready' as string,
}));

vi.mock('@/stores/auth-store', () => {
  const state = () => ({
    user: mocks.user,
    accessToken: mocks.accessToken,
    status: mocks.status,
  });
  const useAuthStore = (selector: (state: Record<string, unknown>) => unknown) =>
    selector(state());
  useAuthStore.getState = state;
  return { useAuthStore };
});

vi.mock('@/lib/api/mcp-servers', () => ({
  fetchMcpServers: mocks.fetchServers,
  createMcpServer: mocks.createServer,
  updateMcpServer: mocks.updateServer,
  deleteMcpServer: mocks.deleteServer,
  refreshMcpServerTools: mocks.refreshTools,
}));

const sampleServer = {
  id: 'srv_1',
  userId: 'user_1',
  name: '代码仓库服务',
  url: 'https://mcp.example.com/mcp',
  authHeaderName: 'Authorization',
  hasAuthHeaderValue: true,
  isActive: true,
  discoveryStatus: 'succeeded' as const,
  discoveryError: null,
  snapshotVersion: 2,
  createdAt: '2026-11-24T00:00:00Z',
  updatedAt: '2026-11-24T00:00:00Z',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.user = { id: 'user_1', username: 'u1' };
  mocks.accessToken = 'token_1';
  mocks.status = 'ready';
  mocks.fetchServers.mockResolvedValue([sampleServer]);
  mocks.createServer.mockResolvedValue(sampleServer);
  mocks.updateServer.mockResolvedValue(sampleServer);
  mocks.deleteServer.mockResolvedValue(undefined);
  mocks.refreshTools.mockResolvedValue({ server: sampleServer });
});

describe('McpServersSection MCP 服务器板块', () => {
  it('空状态展示添加引导', async () => {
    mocks.fetchServers.mockResolvedValue([]);

    render(<McpServersSection />);

    // 标题与按钮同名，用 role=heading 精确定位标题
    const heading = await screen.findByRole('heading', {
      name: '添加第一个 MCP 服务器',
    });
    expect(heading).toBeTruthy();
  });

  it('卡片展示名称、域名与发现状态并包含列表容器标识', async () => {
    render(<McpServersSection />);

    expect(await screen.findByText('代码仓库服务')).toBeTruthy();
    expect(screen.getByTestId('mcp-server-list')).toBeTruthy();
    expect(screen.getByText('mcp.example.com')).toBeTruthy();
    expect(screen.getByText('发现成功')).toBeTruthy();
    expect(screen.getByText('已配置鉴权')).toBeTruthy();
  });

  it('发现失败时展示原因并提供重试入口', async () => {
    mocks.fetchServers.mockResolvedValue([
      {
        ...sampleServer,
        discoveryStatus: 'failed' as const,
        discoveryError: '连接超时，请稍后重试',
      },
    ]);

    render(<McpServersSection />);

    expect(await screen.findByText('发现失败')).toBeTruthy();
    expect(screen.getByText('连接超时，请稍后重试')).toBeTruthy();
    const retryBtn = screen.getByRole('button', { name: /重试工具发现/ }) as HTMLButtonElement;
    expect(retryBtn.disabled).toBe(false);

    const user = userEvent.setup();
    await user.click(retryBtn);
    await waitFor(() => {
      expect(mocks.refreshTools).toHaveBeenCalledWith('srv_1');
    });
  });

  it('已发现成功的服务点击刷新工具会调用刷新接口', async () => {
    const user = userEvent.setup();
    render(<McpServersSection />);
    await screen.findByText('代码仓库服务');

    await user.click(screen.getByRole('button', { name: /刷新工具/ }));

    await waitFor(() => {
      expect(mocks.refreshTools).toHaveBeenCalledWith('srv_1');
    });
  });

  it('打开抽屉时鉴权头取值不回显', async () => {
    const user = userEvent.setup();
    render(<McpServersSection />);
    await screen.findByText('代码仓库服务');

    await user.click(screen.getByRole('button', { name: '配置' }));

    const valueInput = (await screen.findByLabelText(
      '鉴权头取值（可选）'
    )) as HTMLInputElement;
    expect(valueInput.value).toBe('');
    expect(valueInput.placeholder).toMatch(/已配置/);
    // 编辑态提示不得回显取值明文
    expect(document.body.textContent).not.toContain('super-secret-token');
  });

  it('保存失败时显示中文错误', async () => {
    const user = userEvent.setup();
    mocks.createServer.mockRejectedValue(new Error('服务器地址必须使用 https 协议'));
    render(<McpServersSection />);
    await screen.findByText('代码仓库服务');

    await user.click(screen.getByRole('button', { name: /添加 MCP Server/ }));
    await user.type(await screen.findByLabelText('名称'), '新服务');
    await user.type(await screen.findByLabelText('服务器地址'), 'http://x.example.com/mcp');
    await user.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('服务器地址必须使用 https 协议')).toBeTruthy();
  });

  it('删除需要二次确认并调用删除接口', async () => {
    const user = userEvent.setup();
    render(<McpServersSection />);
    await screen.findByText('代码仓库服务');

    await user.click(screen.getByRole('button', { name: '删除' }));
    expect(await screen.findByText(/确认删除「代码仓库服务」/)).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(mocks.deleteServer).toHaveBeenCalledWith('srv_1');
    });
  });

  it('未登录时展示登录引导而非表单', async () => {
    mocks.accessToken = null;

    render(<McpServersSection />);

    expect(await screen.findByText('登录后即可管理您的 MCP 服务器')).toBeTruthy();
    expect(screen.queryByLabelText('服务器地址')).toBeNull();
  });

  it('已达 10 个服务器上限时计数徽标显示 10 / 10 且新增按钮禁用并提示上限', async () => {
    mocks.fetchServers.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({
        ...sampleServer,
        id: `srv_${index + 1}`,
        name: `服务 ${index + 1}`,
        url: `https://mcp-${index + 1}.example.com/mcp`,
      }))
    );

    render(<McpServersSection />);

    // 计数徽标达到上限
    expect(await screen.findByText('10 / 10')).toBeTruthy();

    // 新增按钮禁用并给出中文上限提示
    const addButton = (await screen.findByRole('button', {
      name: /已达上限（最多 10 个）/,
    })) as HTMLButtonElement;
    expect(addButton.disabled).toBe(true);
    expect(screen.queryByRole('button', { name: '添加 MCP Server' })).toBeNull();
  });

  it('API 返回字段级校验错误时提取具体中文原因而非泛化提示', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/mcp-servers')>(
      '@/lib/api/mcp-servers'
    );
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: '请求参数错误',
          errorCode: 'INVALID_REQUEST',
          details: { errors: { url: ['该地址属于内部私有网络，不允许访问'] } },
        }),
        { status: 400, headers: { 'content-type': 'application/json' } }
      )
    );

    try {
      const err = await actual
        .createMcpServer({ name: '内网测试', url: 'http://192.168.1.1/mcp' })
        .catch((e) => e);
      expect(err).toBeInstanceOf(Error);
      expect((err as Error).message).toContain('内部私有网络');
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
