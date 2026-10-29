import { describe, it, expect, vi, beforeEach } from 'vitest';
import { trackPlanEvent, calculatePlanCompletionRate, recordAgentRunMetric } from './plan-events';
import { planEventPropsSchema, trackProductEventSchema, PLAN_EVENT_NAMES } from '@/schemas/product-event.schema';

const mocks = vi.hoisted(() => ({ trackEvent: vi.fn() }));
vi.mock('./tracker', () => ({ trackEvent: mocks.trackEvent }));

describe('TC05: 埋点事件与效能指标基线', () => {
  beforeEach(() => {
    mocks.trackEvent.mockReset();
  });

  it('1. 计划卡片展开、步骤跳过、计划干预触发时，行为埋点派发合规事件，事件属性包含 planId、stepCount、action，且绝不包含任务标题与正文隐私文本 (TC05-1)', () => {
    // 验证事件白名单
    expect([...PLAN_EVENT_NAMES]).toEqual([
      'plan.expand',
      'plan.step_skip',
      'plan.intervened',
    ]);

    const validProps = {
      planId: 'plan-xyz-123',
      stepCount: 4,
      action: 'expand' as const,
    };

    // 验证合规数据通过 schema
    const parsed = planEventPropsSchema.safeParse(validProps);
    expect(parsed.success).toBe(true);

    // 验证通过 trackProductEventSchema 校验
    for (const name of PLAN_EVENT_NAMES) {
      expect(trackProductEventSchema.safeParse({ event: name, props: validProps }).success).toBe(true);
    }

    // 验证隐私红线：附加 title、prompt、content 等隐私字段时，严格模式必须拒绝 (strict mode)
    const privacyViolations = [
      { ...validProps, title: '绝密商业计划' },
      { ...validProps, content: '正在搜索竞争对手财务报表' },
      { ...validProps, stepTitle: '分析未公开财报' },
      { ...validProps, prompt: '帮我制定商业机密' },
    ];

    for (const violated of privacyViolations) {
      const res = planEventPropsSchema.safeParse(violated);
      expect(res.success).toBe(false);
    }

    // 验证 trackPlanEvent 上报派发
    trackPlanEvent('plan.expand', validProps);
    expect(mocks.trackEvent).toHaveBeenCalledTimes(1);
    expect(mocks.trackEvent).toHaveBeenCalledWith('plan.expand', validProps);

    // 验证序列化后不含任何未授权字段
    const reportedProps = mocks.trackEvent.mock.calls[0][1];
    expect(Object.keys(reportedProps).sort()).toEqual(['action', 'planId', 'stepCount']);
  });

  it('2. 会话完成时记录智能体运行全周期指标，包含任务耗时与计划执行完成率 (TC05-2)', () => {
    const stepsFull = [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'completed' },
    ];
    expect(calculatePlanCompletionRate(stepsFull)).toBe(1);

    const stepsPartial = [
      { status: 'completed' },
      { status: 'skipped' },
      { status: 'pending' },
      { status: 'failed' },
    ];
    // 1 / 4 = 0.25
    expect(calculatePlanCompletionRate(stepsPartial)).toBe(0.25);

    const stepsEmpty: Array<{ status: string }> = [];
    expect(calculatePlanCompletionRate(stepsEmpty)).toBe(0);

    // 模拟全周期指标度量与记录
    const durationMs = 1500;
    const completionRate = calculatePlanCompletionRate(stepsPartial);
    const recorded = recordAgentRunMetric({
      planId: 'plan-metric-1',
      durationMs,
      stepCount: stepsPartial.length,
      completionRate,
    });

    expect(recorded.durationMs).toBe(1500);
    expect(recorded.stepCount).toBe(4);
    expect(recorded.completionRate).toBe(0.25);
  });
});
