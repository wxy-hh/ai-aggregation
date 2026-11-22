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

  it('5. 真实案例复现：当部分步骤 completed、剩余步骤 skipped 且执行结束时，胶囊应呈现最后实际执行步骤的精准位次而非虚标为总步数或回退到步骤 1/5，且不显示调整按钮', () => {
    const userPlanWithSkipped: AgentPlan = {
      id: 'plan-real-case',
      title: '主流厂商 Token/编码套餐对比',
      steps: [
        { id: 's1', title: '界定调研范围', status: 'completed', summary: '已搜索智谱 GLM Coding Plan' },
        { id: 's2', title: '采集官方定价', status: 'completed', summary: '已抓取 bigmodel.cn' },
        { id: 's3', title: '统一折算基准', status: 'completed', summary: '已抓取 docs.bigmodel.cn' },
        { id: 's4', title: '场景化测算', status: 'completed', summary: '任务交付完成' },
        { id: 's5', title: '输出对比结论', status: 'skipped', summary: '提前交付，步骤已略过' },
      ],
    };

    render(<AgentPlanCard messageId="msg-1" plan={userPlanWithSkipped} isStreaming={false} />);

    // 应该不再显示错误的 [◉ 步骤 1/5]
    expect(screen.queryByText('[◉ 步骤 1/5]')).not.toBeInTheDocument();
    // 应该显示最后实际执行步骤的精准位次 [◉ 步骤 4/5]
    expect(screen.getByText('[◉ 步骤 4/5]')).toBeInTheDocument();
    expect(screen.getByText('场景化测算')).toBeInTheDocument();
    // 应该不再显示调整按钮
    expect(screen.queryByTestId('plan-intervene-button')).not.toBeInTheDocument();
  });

  it('6. 当任务执行中遭遇失败并结束时，呈现发生故障的具体步骤索引与失败告警样式，不显示调整按钮', () => {
    const failedPlan: AgentPlan = {
      id: 'plan-failed-case',
      title: '失败中断任务',
      steps: [
        { id: 's1', title: '步骤1', status: 'completed' },
        { id: 's2', title: '步骤2', status: 'failed', summary: '前序故障中止执行' },
        { id: 's3', title: '步骤3', status: 'skipped', summary: '前序故障已跳过' },
      ],
    };

    render(<AgentPlanCard messageId="msg-1" plan={failedPlan} isStreaming={false} />);

    // 最后执行的是发生故障的第 2 步，应精准显示 [◉ 步骤 2/3]
    expect(screen.getByText('[◉ 步骤 2/3]')).toBeInTheDocument();
    expect(screen.getByText('步骤2')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-intervene-button')).not.toBeInTheDocument();
    const capsule = screen.getByTestId('plan-capsule-text');
    expect(capsule.className).toContain('text-rose-700');
  });

  it('7. 用户实际调研场景：5步计划执行完第3步提前交付（后2步略过），胶囊精准显示 [◉ 步骤 3/5] 与第3步标题', () => {
    const surveyPlan: AgentPlan = {
      id: 'plan-ev-survey',
      title: '新能源汽车深度调研',
      steps: [
        { id: 's1', title: '界定调研范围与报告框架', status: 'completed', summary: '已搜索 IEA' },
        { id: 's2', title: '多轮网络检索', status: 'completed', summary: '已搜索 2026年新能源' },
        { id: 's3', title: '精读核心网页，交叉验证销量', status: 'completed', summary: '任务交付完成' },
        { id: 's4', title: '提炼核心论点', status: 'skipped', summary: '提前交付，步骤已略过' },
        { id: 's5', title: '输出结构化调研报告', status: 'skipped', summary: '提前交付，步骤已略过' },
      ],
    };

    render(<AgentPlanCard messageId="msg-1" plan={surveyPlan} isStreaming={false} />);

    expect(screen.getByText('[◉ 步骤 3/5]')).toBeInTheDocument();
    expect(screen.getByText('精读核心网页，交叉验证销量')).toBeInTheDocument();
    expect(screen.queryByTestId('plan-intervene-button')).not.toBeInTheDocument();
  });
});
