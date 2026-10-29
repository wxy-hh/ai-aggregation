import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AgentPlanCard } from './agent-plan-card';
import type { AgentPlan } from '@repo/shared';
import { useChatStore } from '@/stores/chat-store';

// 模拟埋点追踪器
const trackerMock = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('@/lib/events/tracker', () => ({ trackEvent: trackerMock.trackEvent }));

describe('AgentPlanCard 组件与交互测试', () => {
  const samplePlan: AgentPlan = {
    id: 'plan-test-card',
    title: '行业竞品调研',
    steps: [
      { id: 's1', title: '全网检索', status: 'completed', summary: '已检索3款产品' },
      { id: 's2', title: '特性对比分析', status: 'running' },
      { id: 's3', title: '撰写输出报告', status: 'pending' },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useChatStore.getState().reset();
  });

  it('1. 胶囊条正确渲染当前步骤进度与标题 (TC06-1)', () => {
    render(<AgentPlanCard messageId="msg-1" plan={samplePlan} isStreaming={true} />);

    expect(screen.getByTestId('agent-plan-card')).toBeInTheDocument();
    expect(screen.getByTestId('plan-capsule')).toBeInTheDocument();
    expect(screen.getByText('[◉ 步骤 2/3]')).toBeInTheDocument();
    expect(screen.getByText('特性对比分析')).toBeInTheDocument();
  });

  it('2. 点击胶囊条平滑展开步骤清单，完整展示步骤项与摘要 (TC06-2)', () => {
    render(<AgentPlanCard messageId="msg-1" plan={samplePlan} />);

    // 默认折叠，不显示 step-list
    expect(screen.queryByTestId('plan-step-list')).not.toBeInTheDocument();

    // 点击胶囊条展开
    fireEvent.click(screen.getByTestId('plan-capsule'));

    expect(screen.getByTestId('plan-step-list')).toBeInTheDocument();
    expect(screen.getAllByTestId('plan-step-item').length).toBe(3);
    expect(screen.getByText('已检索3款产品')).toBeInTheDocument();

    // 验证派发展开埋点
    expect(trackerMock.trackEvent).toHaveBeenCalledWith(
      'plan.expand',
      expect.objectContaining({
        planId: 'plan-test-card',
        stepCount: 3,
        action: 'expand',
      })
    );

    // 再次点击折叠
    fireEvent.click(screen.getByTestId('plan-capsule'));
    expect(screen.queryByTestId('plan-step-list')).not.toBeInTheDocument();
  });

  it('3. 点击「调整」弹出干预弹窗，支持修改目标与跳过步骤 (TC06-3)', async () => {
    const interruptSpy = vi.spyOn(useChatStore.getState(), 'interruptAndResumeWithPlan').mockResolvedValue();

    render(<AgentPlanCard messageId="msg-1" plan={samplePlan} />);

    // 点击「调整」按钮
    const interveneBtn = screen.getByTestId('plan-intervene-button');
    fireEvent.click(interveneBtn);

    // 弹窗出现
    expect(screen.getByTestId('plan-intervention-dialog')).toBeInTheDocument();
    expect(screen.getByText('调整执行计划')).toBeInTheDocument();

    // 未开始步骤 s3 应有输入框
    const inputs = screen.getAllByTestId('plan-step-input');
    expect(inputs.length).toBeGreaterThan(0);
    fireEvent.change(inputs[0], { target: { value: '重点输出 PPT 结构' } });

    // 点击跳过按钮
    const skipBtn = screen.getByTestId('plan-step-skip-btn');
    fireEvent.click(skipBtn);
    expect(skipBtn).toHaveTextContent('恢复');

    // 再次点击恢复
    fireEvent.click(skipBtn);
    expect(skipBtn).toHaveTextContent('跳过');

    // 点击「应用并继续执行」
    const confirmBtn = screen.getByTestId('plan-intervention-confirm-btn');
    fireEvent.click(confirmBtn);

    expect(interruptSpy).toHaveBeenCalledTimes(1);
    const [msgId, modified] = interruptSpy.mock.calls[0];
    expect(msgId).toBe('msg-1');
    expect(modified.steps[2].title).toBe('重点输出 PPT 结构');
  });

  it('4. 点击「取消」关闭干预弹窗，不触发更新', () => {
    const interruptSpy = vi.spyOn(useChatStore.getState(), 'interruptAndResumeWithPlan').mockResolvedValue();

    render(<AgentPlanCard messageId="msg-1" plan={samplePlan} />);

    fireEvent.click(screen.getByTestId('plan-intervene-button'));
    expect(screen.getByTestId('plan-intervention-dialog')).toBeInTheDocument();

    const cancelBtn = screen.getByTestId('plan-intervention-cancel-btn');
    fireEvent.click(cancelBtn);

    expect(interruptSpy).not.toHaveBeenCalled();
  });
});
