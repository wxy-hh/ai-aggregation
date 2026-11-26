/**
 * tool-entry-modal.test.tsx —— 创建工具三入口弹层交互测试
 *
 * 覆盖的规格与验收标准（工单 05 / spec §E2）：
 * 1. 三入口展示：从模板创建、粘贴 cURL 导入、手动填写；
 * 2. 移动端与桌面端遵从 DESIGN.md §8.4（抽屉抓手、热区规范）；
 * 3. 点击「从模板创建」能选择飞书群机器人与钉钉群机器人模板并触发回调；
 * 4. 点击「手动填写」触发回调并进入空白表单；
 * 5. 点击「粘贴 cURL 导入」展示占位态（文案「即将支持」+ TODO(工单 06) 注释）；
 * 6. 支持返回上一步与关闭弹层。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ToolEntryModal } from './tool-entry-modal';
import { TOOL_TEMPLATES } from './tool-templates';

describe('ToolEntryModal 创建工具三入口', () => {
  afterEach(() => {
    cleanup();
  });

  it('三入口渲染：同时展示「从模板创建」、「粘贴 cURL 导入」与「手动填写」', () => {
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
      />
    );

    expect(screen.getByText('从模板创建')).toBeInTheDocument();
    expect(screen.getByText('粘贴 cURL 导入')).toBeInTheDocument();
    expect(screen.getByText('手动填写')).toBeInTheDocument();
  });

  it('点击「从模板创建」展示飞书群机器人与钉钉群机器人模板，选择飞书触发回调', () => {
    const handleSelectTemplate = vi.fn();
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={handleSelectTemplate}
      />
    );

    // 点击「从模板创建」
    fireEvent.click(screen.getByText('从模板创建'));

    // 应展示飞书和钉钉两个模板选项
    expect(screen.getByText('飞书群机器人')).toBeInTheDocument();
    expect(screen.getByText('钉钉群机器人')).toBeInTheDocument();

    // 点击飞书群机器人
    fireEvent.click(screen.getByText('飞书群机器人'));

    expect(handleSelectTemplate).toHaveBeenCalledTimes(1);
    expect(handleSelectTemplate).toHaveBeenCalledWith(TOOL_TEMPLATES.feishu_bot);
  });

  it('从模板列表选择钉钉群机器人触发回调并传递钉钉模板', () => {
    const handleSelectTemplate = vi.fn();
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={handleSelectTemplate}
      />
    );

    fireEvent.click(screen.getByText('从模板创建'));
    fireEvent.click(screen.getByText('钉钉群机器人'));

    expect(handleSelectTemplate).toHaveBeenCalledTimes(1);
    expect(handleSelectTemplate).toHaveBeenCalledWith(TOOL_TEMPLATES.dingtalk_bot);
  });

  it('点击「手动填写」直接触发 onSelectManual 回调', () => {
    const handleSelectManual = vi.fn();
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={handleSelectManual}
        onSelectTemplate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('手动填写'));
    expect(handleSelectManual).toHaveBeenCalledTimes(1);
  });

  it('点击「粘贴 cURL 导入」进入真实解析界面，展示输入文本框与解析提示', () => {
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
        onSelectCurl={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('粘贴 cURL 导入'));

    expect(screen.getByPlaceholderText(/curl -X POST/i)).toBeInTheDocument();
    expect(screen.getByText('解析并导入')).toBeInTheDocument();
  });

  it('输入合法 cURL 命令解析成功，展示提取摘要、warnings 并可点击「使用此配置」完成回调', () => {
    const handleSelectCurl = vi.fn();
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
        onSelectCurl={handleSelectCurl}
      />
    );

    fireEvent.click(screen.getByText('粘贴 cURL 导入'));

    const textarea = screen.getByPlaceholderText(/curl -X POST/i);
    const validCurl =
      'curl -X POST https://api.example.com/webhook -H "Authorization: Bearer tok_123" -H "User-Agent: test" -d \'{"event":"ping","details":{"nested":1}}\'';

    fireEvent.change(textarea, { target: { value: validCurl } });
    fireEvent.click(screen.getByText('解析并导入'));

    // 展示摘要信息
    expect(screen.getByText('解析成功')).toBeInTheDocument();
    expect(screen.getByText('https://api.example.com/webhook')).toBeInTheDocument();
    // 展示 warnings（非鉴权头与嵌套字段）
    expect(screen.getByText(/已忽略 1 个非鉴权请求头/)).toBeInTheDocument();
    expect(screen.getByText(/已忽略请求体中的嵌套对象或数组字段/)).toBeInTheDocument();

    // 点击「使用此配置」
    const useBtn = screen.getByText('使用此配置');
    fireEvent.click(useBtn);

    expect(handleSelectCurl).toHaveBeenCalledTimes(1);
    expect(handleSelectCurl).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://api.example.com/webhook',
        method: 'POST',
        authHeaderName: 'Authorization',
        authHeaderValue: 'Bearer tok_123',
        params: expect.arrayContaining([
          expect.objectContaining({ name: 'event', type: 'string' }),
        ]),
      })
    );
  });

  it('输入内网 IP 网址（如 http://192.168.1.1/api）解析成功但即时展示不支持与阻断提示', () => {
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
        onSelectCurl={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('粘贴 cURL 导入'));

    const textarea = screen.getByPlaceholderText(/curl -X POST/i);
    fireEvent.change(textarea, {
      target: { value: 'curl http://192.168.1.1/api' },
    });
    fireEvent.click(screen.getByText('解析并导入'));

    // 即时展示网址风险警告，且禁用「使用此配置」
    expect(screen.getByText(/该地址不允许访问|Webhook 网址必须使用 https 协议/)).toBeInTheDocument();
    expect(screen.getByText('使用此配置')).toBeDisabled();
  });

  it('输入普通文本等非法内容展示「无法识别，请手动填写」降级态，并支持一键转手动填写', () => {
    const handleSelectManual = vi.fn();
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={handleSelectManual}
        onSelectTemplate={vi.fn()}
        onSelectCurl={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('粘贴 cURL 导入'));

    const textarea = screen.getByPlaceholderText(/curl -X POST/i);
    fireEvent.change(textarea, {
      target: { value: '这是一段普通文字' },
    });
    fireEvent.click(screen.getByText('解析并导入'));

    expect(screen.getByText('无法识别，请手动填写')).toBeInTheDocument();

    const manualBtn = screen.getByText('改为手动填写');
    fireEvent.click(manualBtn);
    expect(handleSelectManual).toHaveBeenCalledTimes(1);
  });

  it('模板选择与 cURL 解析视图均支持「返回上一步」回到三入口选择页', () => {
    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
      />
    );

    // 1. 进入模板页并返回
    fireEvent.click(screen.getByText('从模板创建'));
    expect(screen.getByText('选择工具模板')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('返回上一步'));
    expect(screen.getByText('从模板创建')).toBeInTheDocument();

    // 2. 进入 cURL 解析页并返回
    fireEvent.click(screen.getByText('粘贴 cURL 导入'));
    expect(screen.getByText('粘贴 cURL 导入')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('返回上一步'));
    expect(screen.getByText('从模板创建')).toBeInTheDocument();
  });

  it('点击「智能生成」进入自然语言输入界面，输入后点击「生成配置」触发 draft API 与回调', async () => {
    const handleSelectDraft = vi.fn();
    const mockDraft = {
      name: '天气查询',
      callName: 'query_weather',
      description: '查天气',
      method: 'POST' as const,
      url: 'https://api.example.com/weather',
      params: [{ name: 'city', type: 'string' as const, required: true, description: '城市' }],
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, data: { draft: mockDraft } }),
    } as any);

    render(
      <ToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
        onSelectDraft={handleSelectDraft}
      />
    );

    // 点击智能生成入口
    fireEvent.click(screen.getByTestId('entry-ai-draft'));

    // 检查输入框与按钮
    const input = screen.getByPlaceholderText('描述您需要的工具功能，例如：输入快递单号查询物流轨迹...');
    expect(input).toBeInTheDocument();

    const submitBtn = screen.getByRole('button', { name: '生成配置' });
    expect(submitBtn).toBeDisabled();

    // 输入需求描述
    fireEvent.change(input, { target: { value: '帮我查北京的天气预报' } });
    expect(submitBtn).not.toBeDisabled();

    // 提交生成
    fireEvent.click(submitBtn);

    await vi.waitFor(() => {
      expect(handleSelectDraft).toHaveBeenCalledWith(mockDraft);
    });
  });
});

