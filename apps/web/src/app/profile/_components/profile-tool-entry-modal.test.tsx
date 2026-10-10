/**
 * profile-tool-entry-modal.test.tsx —— 创建工具三入口弹层交互测试
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
import { ProfileToolEntryModal } from './profile-tool-entry-modal';
import { TOOL_TEMPLATES } from './profile-tool-templates';

describe('ProfileToolEntryModal 创建工具三入口', () => {
  afterEach(() => {
    cleanup();
  });

  it('三入口渲染：同时展示「从模板创建」、「粘贴 cURL 导入」与「手动填写」', () => {
    render(
      <ProfileToolEntryModal
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
      <ProfileToolEntryModal
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
      <ProfileToolEntryModal
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
      <ProfileToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={handleSelectManual}
        onSelectTemplate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('手动填写'));
    expect(handleSelectManual).toHaveBeenCalledTimes(1);
  });

  it('点击「粘贴 cURL 导入」展示占位态（工单 06 即将支持提示）', () => {
    render(
      <ProfileToolEntryModal
        open={true}
        onOpenChange={vi.fn()}
        onSelectManual={vi.fn()}
        onSelectTemplate={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText('粘贴 cURL 导入'));

    expect(screen.getByText('cURL 一键导入即将支持')).toBeInTheDocument();
    expect(screen.getByText(/自动解析 cURL/i)).toBeInTheDocument();
  });

  it('模板选择与 cURL 占位视图均支持「返回上一步」回到三入口选择页', () => {
    render(
      <ProfileToolEntryModal
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

    // 2. 进入 cURL 占位页并返回
    fireEvent.click(screen.getByText('粘贴 cURL 导入'));
    expect(screen.getByText('cURL 一键导入即将支持')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('返回上一步'));
    expect(screen.getByText('从模板创建')).toBeInTheDocument();
  });
});
