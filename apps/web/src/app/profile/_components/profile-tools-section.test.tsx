/**
 * profile-tools-section.test.tsx —— profile「我的工具」板块及抽屉表单交互测试
 *
 * 覆盖的规格与行为（spec §4.6 / 工单 04）：
 * 1. 列表渲染：渲染显示名、调用名、URL 域名、方法徽章、凭证状态标识；
 * 2. 空状态：列表为空时展示引导文案与一句话功能说明，点击可唤起新建抽屉；
 * 3. 启停开关：点击 Switch 即时调用 PATCH 接口并更新显示状态；
 * 4. 删除确认流程：点击删除弹出二次确认弹层，确认后调 DELETE 并从列表移除；
 * 5. 表单校验就地报错：前端基础校验拦截与后端 400 zod errors 字段级错误映射；
 * 6. 测试连接三态：成功（绿色+状态码+耗时）、失败（红色+原因）、429 限流友好提示；
 * 7. 上限禁用：当工具数量达到 10 个时，新建入口禁用并提示已达上限；
 * 8. 匿名/未登录：展示友好引导登录卡片，不产生异常报错。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { ProfileToolsSection } from './profile-tools-section';
import { useAuthStore } from '@/stores/auth-store';
import type { SanitizedAgentTool } from '@/lib/api/agent-tools';

const mockTool1: SanitizedAgentTool = {
  id: 'tool_1',
  userId: 'user_1',
  name: '天气查询助手',
  callName: 'query_weather',
  description: '查询指定城市的实时天气与空气质量信息',
  url: 'https://api.weather.com/v1/query',
  method: 'POST',
  authHeaderName: 'Authorization',
  hasAuthHeaderValue: true,
  params: [
    { name: 'city', type: 'string', required: true, description: '城市名' },
    { name: 'days', type: 'number', required: false, description: '预报天数' },
  ],
  enabled: true,
  createdAt: '2026-10-01T12:00:00.000Z',
  updatedAt: '2026-10-01T12:00:00.000Z',
};

const mockTool2: SanitizedAgentTool = {
  id: 'tool_2',
  userId: 'user_1',
  name: '快递追踪接口',
  callName: 'track_express',
  description: '查询快递物流单号的最新流转状态',
  url: 'https://api.express.com/track',
  method: 'GET',
  authHeaderName: null,
  hasAuthHeaderValue: false,
  params: [],
  enabled: false,
  createdAt: '2026-10-01T13:00:00.000Z',
  updatedAt: '2026-10-01T13:00:00.000Z',
};

describe('ProfileToolsSection 我的工具板块', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    useAuthStore.setState({
      status: 'ready',
      accessToken: 'test-token',
      user: {
        id: 'user_1',
        username: 'test_user',
        name: null,
        email: 'test@example.com',
        emailVerified: null,
        avatar: null,
        role: 'user',
        isAnonymous: false,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    cleanup();
  });

  it('列表渲染：正常展示工具列表信息（显示名、调用名、URL 域名、方法徽章、凭证标识）', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [mockTool1, mockTool2] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByText('天气查询助手')).toBeInTheDocument();
    });

    expect(screen.getByText('wh_query_weather')).toBeInTheDocument();
    expect(screen.getByText('api.weather.com')).toBeInTheDocument();
    expect(screen.getByText('POST')).toBeInTheDocument();
    expect(screen.getByText('已配置凭证')).toBeInTheDocument();
    expect(screen.getByText('2 个参数')).toBeInTheDocument();
    expect(screen.getByText('快递追踪接口')).toBeInTheDocument();
    expect(screen.getByText('wh_track_express')).toBeInTheDocument();
    expect(screen.getByText('api.express.com')).toBeInTheDocument();
    expect(screen.getByText('GET')).toBeInTheDocument();
    expect(screen.getByText('2 / 10')).toBeInTheDocument();
  });

  it('空状态：工具列表为空时显示引导文案与一句话说明，点击可打开新建抽屉', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加第一个工具' })).toBeInTheDocument();
    });

    expect(
      screen.getByText('配置您的私有 Webhook 接口，使 AI 智能体在对话中能调用您的专属服务与数据。')
    ).toBeInTheDocument();

    // 点击空状态中的添加按钮打开三入口弹层，选择手动填写打开抽屉
    const emptyAddBtn = screen.getByRole('button', { name: '添加第一个工具' });
    fireEvent.click(emptyAddBtn);

    expect(screen.getByText('从模板创建')).toBeInTheDocument();
    expect(screen.getByText('手动填写')).toBeInTheDocument();

    fireEvent.click(screen.getByText('手动填写'));
    expect(screen.getByText('添加自定义工具')).toBeInTheDocument();
  });

  it('启停开关：点击 Switch 即时调用 PATCH 接口并更新显示状态', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [mockTool1] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByText('天气查询助手')).toBeInTheDocument();
    });

    expect(screen.getByText('已启用')).toBeInTheDocument();

    // mock PATCH 响应
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { tool: { ...mockTool1, enabled: false } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const switchBtn = screen.getByRole('switch', { name: '停用工具' });
    fireEvent.click(switchBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agent-tools/tool_1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ enabled: false }),
        })
      );
    });

    expect(screen.getByText('已停用')).toBeInTheDocument();
  });

  it('删除确认流程：点击删除弹出二次确认弹层，确认后调用 DELETE 并从列表移除', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [mockTool1] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByText('天气查询助手')).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole('button', { name: '删除 天气查询助手' });
    fireEvent.click(deleteBtn);

    // 确认弹层弹出
    expect(screen.getByText('确认删除工具「天气查询助手」？')).toBeInTheDocument();

    // mock DELETE 响应
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const confirmBtn = screen.getByRole('button', { name: '确认删除' });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agent-tools/tool_1',
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    // 列表变为空状态
    await waitFor(() => {
      expect(screen.queryByText('天气查询助手')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '添加第一个工具' })).toBeInTheDocument();
    });
  });

  it('表单校验就地报错：前端必填拦截与后端 400 fieldErrors 映射', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加第一个工具' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加第一个工具' }));

    // 点击三入口中的「手动填写」以展开空白表单抽屉
    fireEvent.click(screen.getByText('手动填写'));
    expect(screen.getByText('添加自定义工具')).toBeInTheDocument();

    // 直接点击保存触发本地拦截
    const submitBtn = screen.getByRole('button', { name: '保存工具' });
    fireEvent.click(submitBtn);

    expect(screen.getByText('请输入工具名称')).toBeInTheDocument();
    expect(screen.getByText('请输入调用名')).toBeInTheDocument();

    // 填写名称，测试调用名自动建议
    const nameInput = screen.getByPlaceholderText('例如：城市天气查询');
    fireEvent.change(nameInput, { target: { value: 'Query Order' } });

    // 检查调用名是否自动建议生成为小写英文格式
    const callNameInput = screen.getByPlaceholderText('例如：query_weather');
    expect((callNameInput as HTMLInputElement).value).toBe('query_order');

    // 输入不合法调用名触发就地报错
    fireEvent.change(callNameInput, { target: { value: '123_invalid' } });
    expect(screen.getByText('调用名必须以小写英文字母开头')).toBeInTheDocument();

    // 填写合法的表单字段，模拟提交后端返回 400
    fireEvent.change(nameInput, { target: { value: '订单查询' } });
    fireEvent.change(callNameInput, { target: { value: 'order_query' } });
    const descInput = screen.getByPlaceholderText(
      /告诉模型什么时候该用这个工具/
    );
    fireEvent.change(descInput, { target: { value: '查询用户在平台的历史订单记录' } });
    const urlInput = screen.getByPlaceholderText('https://api.example.com/webhook');
    fireEvent.change(urlInput, { target: { value: 'https://api.example.com/orders' } });

    // mock 后端 400 响应
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: '请求参数错误',
          errorCode: 'INVALID_REQUEST',
          details: {
            errors: {
              callName: ['该调用名已存在，请更换其他名称'],
            },
          },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    );

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(screen.getByText('该调用名已存在，请更换其他名称')).toBeInTheDocument();
    });
  });

  it('测试连接三态反馈：成功（绿色+状态码+耗时）、失败（红色原因）、429 限流', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [mockTool1] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByText('天气查询助手')).toBeInTheDocument();
    });

    const testBtn = screen.getByRole('button', { name: '测试连接' });

    // 1. 成功态
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { reachable: true, statusCode: 200, durationMs: 42 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/连通成功 · HTTP 200 · 耗时 42ms/)).toBeInTheDocument();
    });

    // 2. 失败态
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: true,
          data: { reachable: false, reason: '目标服务器连接超时' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/连通失败：目标服务器连接超时/)).toBeInTheDocument();
    });

    // 3. 429 限流态
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          success: false,
          error: '操作过于频繁，请稍后再试',
          errorCode: 'TOO_MANY_REQUESTS',
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    );

    fireEvent.click(testBtn);

    await waitFor(() => {
      expect(screen.getByText(/连通失败：操作过于频繁，请稍后再试/)).toBeInTheDocument();
    });
  });

  it('上限禁用：当列表已有 10 个工具时，新建按钮为 disabled 且提示已达上限', async () => {
    const tenTools: SanitizedAgentTool[] = Array.from({ length: 10 }, (_, i) => ({
      id: `tool_${i}`,
      userId: 'user_1',
      name: `测试工具_${i}`,
      callName: `tool_${i}`,
      description: `描述信息_${i}`,
      url: `https://api${i}.example.com/wh`,
      method: 'POST',
      authHeaderName: null,
      hasAuthHeaderValue: false,
      params: [],
      enabled: true,
      createdAt: '2026-10-01T12:00:00.000Z',
      updatedAt: '2026-10-01T12:00:00.000Z',
    }));

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: tenTools } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByText('10 / 10')).toBeInTheDocument();
    });

    const addBtn = screen.getByRole('button', { name: '已达上限（最多 10 个）' });
    expect(addBtn).toBeDisabled();
  });

  it('匿名用户：友好引导登录，不请求工具列表，不抛出异常', async () => {
    useAuthStore.setState({
      user: {
        id: 'anon_1',
        username: 'guest',
        name: null,
        email: null,
        emailVerified: null,
        avatar: null,
        role: 'user',
        isAnonymous: true,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });

    render(<ProfileToolsSection />);

    expect(screen.getByText('登录后即可管理您的专属 Webhook 工具')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '前往登录' })).toHaveAttribute('href', '/login');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('工单05 / TC-P0-5（步骤 1-3）：从模板创建飞书群机器人 → 预填表单 → 仅填 URL 即可保存成功并出现在列表', async () => {
    // 1. 初始化空列表
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加第一个工具' })).toBeInTheDocument();
    });

    // 2. 点击添加，出现三入口
    fireEvent.click(screen.getByRole('button', { name: '添加第一个工具' }));
    expect(screen.getByText('从模板创建')).toBeInTheDocument();
    expect(screen.getByText('粘贴 cURL 导入')).toBeInTheDocument();
    expect(screen.getByText('手动填写')).toBeInTheDocument();

    // 3. 选择「从模板创建」→ 点击「飞书群机器人」
    fireEvent.click(screen.getByText('从模板创建'));
    expect(screen.getByText('飞书群机器人')).toBeInTheDocument();
    expect(screen.getByText('钉钉群机器人')).toBeInTheDocument();

    fireEvent.click(screen.getByText('飞书群机器人'));

    // 4. 进入抽屉表单，验证预填受控状态
    expect(screen.getByText(/从模板创建：飞书群机器人/)).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('例如：城市天气查询') as HTMLInputElement;
    const callNameInput = screen.getByPlaceholderText('例如：query_weather') as HTMLInputElement;
    const descInput = screen.getByPlaceholderText(/告诉模型什么时候该用这个工具/) as HTMLTextAreaElement;
    const urlInput = screen.getByPlaceholderText('https://open.feishu.cn/open-apis/bot/v2/hook/...') as HTMLInputElement;

    expect(nameInput.value).toBe('飞书群机器人');
    expect(callNameInput.value).toBe('feishu_bot');
    expect(descInput.value).toContain('当需要把消息、通知或查询结果推送到飞书群时调用此工具');
    expect(urlInput.value).toBe('');
    // 参数已预置 text 参数
    expect(screen.getByDisplayValue('text')).toBeInTheDocument();

    // 5. 用户仅需填写真实 Webhook URL
    const feishuWebhookUrl = 'https://open.feishu.cn/open-apis/bot/v2/hook/test-p0a-token-feishu';
    fireEvent.change(urlInput, { target: { value: feishuWebhookUrl } });

    // mock 创建成功响应
    const createdFeishuTool: SanitizedAgentTool = {
      id: 'tool_feishu_1',
      userId: 'user_1',
      name: '飞书群机器人',
      callName: 'feishu_bot',
      description: '当需要把消息、通知或查询结果推送到飞书群时调用此工具',
      url: feishuWebhookUrl,
      method: 'POST',
      authHeaderName: null,
      hasAuthHeaderValue: false,
      params: [{ name: 'text', type: 'string', required: true, description: '需要发送到飞书群的消息文本内容' }],
      enabled: true,
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T12:00:00.000Z',
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tool: createdFeishuTool } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    // 6. 点击保存
    const saveBtn = screen.getByRole('button', { name: '保存工具' });
    fireEvent.click(saveBtn);

    // 7. 提交验证：走标准 createAgentToolSchema 契约与 POST /api/agent-tools
    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/agent-tools',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            name: '飞书群机器人',
            callName: 'feishu_bot',
            description: '当需要把消息、通知或查询结果推送到飞书群时调用此工具',
            url: feishuWebhookUrl,
            method: 'POST',
            authHeaderName: null,
            authHeaderValue: null,
            params: [
              {
                name: 'text',
                type: 'string',
                required: true,
                description: '需要发送到飞书群的消息文本内容',
              },
            ],
            enabled: true,
          }),
        })
      );
    });

    // 8. 工具列表出现新卡片（名称含「飞书群机器人」、调用名 wh_feishu_bot）
    await waitFor(() => {
      expect(screen.getByText('飞书群机器人')).toBeInTheDocument();
      expect(screen.getByText('wh_feishu_bot')).toBeInTheDocument();
    });
  });

  it('工单05 / P1-9：从模板创建钉钉群机器人 → 预填表单 → 仅填 URL 即可保存成功', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加第一个工具' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加第一个工具' }));
    fireEvent.click(screen.getByText('从模板创建'));
    fireEvent.click(screen.getByText('钉钉群机器人'));

    expect(screen.getByText(/从模板创建：钉钉群机器人/)).toBeInTheDocument();
    const nameInput = screen.getByPlaceholderText('例如：城市天气查询') as HTMLInputElement;
    const callNameInput = screen.getByPlaceholderText('例如：query_weather') as HTMLInputElement;
    const urlInput = screen.getByPlaceholderText('https://oapi.dingtalk.com/robot/send?access_token=...') as HTMLInputElement;

    expect(nameInput.value).toBe('钉钉群机器人');
    expect(callNameInput.value).toBe('dingtalk_bot');

    const dingtalkWebhookUrl =
      'https://oapi.dingtalk.com/robot/send?access_token=test-p0a-token-dingtalk';
    fireEvent.change(urlInput, { target: { value: dingtalkWebhookUrl } });

    const createdDingtalkTool: SanitizedAgentTool = {
      id: 'tool_dingtalk_1',
      userId: 'user_1',
      name: '钉钉群机器人',
      callName: 'dingtalk_bot',
      description: '当需要把消息、通知或查询结果推送到钉钉群时调用此工具',
      url: dingtalkWebhookUrl,
      method: 'POST',
      authHeaderName: null,
      hasAuthHeaderValue: false,
      params: [{ name: 'text', type: 'string', required: true, description: '需要发送到钉钉群的消息文本内容' }],
      enabled: true,
      createdAt: '2026-10-10T12:00:00.000Z',
      updatedAt: '2026-10-10T12:00:00.000Z',
    };

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tool: createdDingtalkTool } }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    fireEvent.click(screen.getByRole('button', { name: '保存工具' }));

    await waitFor(() => {
      expect(screen.getByText('钉钉群机器人')).toBeInTheDocument();
      expect(screen.getByText('wh_dingtalk_bot')).toBeInTheDocument();
    });
  });

  it('工单05 验收项6：cURL 入口占位态可达且提示中文「即将支持」', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { tools: [] } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    render(<ProfileToolsSection />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '添加第一个工具' })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: '添加第一个工具' }));
    fireEvent.click(screen.getByText('粘贴 cURL 导入'));

    expect(screen.getByText('cURL 一键导入即将支持')).toBeInTheDocument();
    expect(screen.getByText(/自动解析 cURL 命令行中的 URL/)).toBeInTheDocument();
  });
});
