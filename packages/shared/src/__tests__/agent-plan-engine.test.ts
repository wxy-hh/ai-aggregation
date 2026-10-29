import { describe, it, expect } from 'vitest';
import {
  agentPlanSchema,
  planStepSchema,
  type AgentPlan,
  type PlanStep,
  updatePlanStepStatus,
  attachToolCallToRunningStep,
  finalizePlanExecution,
  applyUserPlanIntervention,
} from '../agent-plan';

describe('TC01: 计划数据结构、Zod Schema 校验与纯函数状态机', () => {
  it('1. Schema 校验合法与非法边界 (TC01-1)', () => {
    const validPlan: AgentPlan = {
      id: 'plan-123',
      title: '全网竞品调研与报告生成',
      steps: [
        { id: 's1', title: '全网检索行业动态', status: 'pending' },
        { id: 's2', title: '提炼核心竞争维度', status: 'pending' },
        { id: 's3', title: '撰写竞品对比分析表', status: 'pending' },
      ],
      createdAt: 1700000000000,
    };

    expect(agentPlanSchema.safeParse(validPlan).success).toBe(true);

    // 步骤为空应拒绝
    expect(
      agentPlanSchema.safeParse({
        id: 'plan-123',
        title: '空步骤计划',
        steps: [],
      }).success
    ).toBe(false);

    // 步骤超过 8 个应拒绝
    const tooManySteps: PlanStep[] = Array.from({ length: 9 }, (_, i) => ({
      id: `s${i}`,
      title: `步骤 ${i}`,
      status: 'pending',
    }));
    expect(
      agentPlanSchema.safeParse({
        id: 'plan-123',
        title: '超长计划',
        steps: tooManySteps,
      }).success
    ).toBe(false);

    // 步骤缺少 title 应拒绝
    expect(
      planStepSchema.safeParse({
        id: 's1',
        status: 'pending',
      }).success
    ).toBe(false);
  });

  it('2. 纯函数状态机更新步骤状态 (TC01-2)', () => {
    const initialPlan: AgentPlan = {
      id: 'plan-1',
      title: '竞品调研',
      steps: [
        { id: 's1', title: '检索数据', status: 'pending' },
        { id: 's2', title: '整理对比', status: 'pending' },
      ],
    };

    // 迁往 running
    const runningPlan = updatePlanStepStatus(initialPlan, 's1', 'running');
    expect(runningPlan.steps[0].status).toBe('running');
    expect(runningPlan.steps[1].status).toBe('pending');

    // 迁往 completed 并写 summary
    const completedPlan = updatePlanStepStatus(
      runningPlan,
      's1',
      'completed',
      '已获取 3 家核心竞品最新数据'
    );
    expect(completedPlan.steps[0].status).toBe('completed');
    expect(completedPlan.steps[0].summary).toBe('已获取 3 家核心竞品最新数据');

    // 不存在的 stepId 应原样返回且不崩溃
    const unchangedPlan = updatePlanStepStatus(completedPlan, 's999', 'completed');
    expect(unchangedPlan).toEqual(completedPlan);
  });

  it('3. 纯函数状态机工具绑定 (TC01-3)', () => {
    const plan: AgentPlan = {
      id: 'plan-1',
      title: '竞品调研',
      steps: [
        { id: 's1', title: '检索数据', status: 'running', toolCallIds: [] },
        { id: 's2', title: '整理对比', status: 'pending' },
      ],
    };

    const updated1 = attachToolCallToRunningStep(plan, 'call-web-search-1');
    expect(updated1.steps[0].toolCallIds).toEqual(['call-web-search-1']);

    const updated2 = attachToolCallToRunningStep(updated1, 'call-web-fetch-2');
    expect(updated2.steps[0].toolCallIds).toEqual(['call-web-search-1', 'call-web-fetch-2']);

    // 若无 running 步骤，不报错并保持结构
    const noRunningPlan: AgentPlan = {
      ...plan,
      steps: plan.steps.map((s) => ({ ...s, status: 'pending' })),
    };
    const untouched = attachToolCallToRunningStep(noRunningPlan, 'call-x');
    expect(untouched.steps[0].toolCallIds).toEqual([]);
  });

  it('4. 纯函数状态机异常与中止收尾 (TC01-4)', () => {
    const plan: AgentPlan = {
      id: 'plan-1',
      title: '竞品调研',
      steps: [
        { id: 's1', title: '检索数据', status: 'completed' },
        { id: 's2', title: '深度分析', status: 'running' },
        { id: 's3', title: '撰写报告', status: 'pending' },
      ],
    };

    // 用户主动中止收尾
    const abortedPlan = finalizePlanExecution(plan, 'aborted');
    expect(abortedPlan.steps[0].status).toBe('completed');
    expect(abortedPlan.steps[1].status).toBe('failed');
    expect(abortedPlan.steps[1].summary).toBe('用户中途中止执行');
    expect(abortedPlan.steps[2].status).toBe('skipped');

    // 正常完成收尾
    const successPlan = finalizePlanExecution(
      {
        ...plan,
        steps: plan.steps.map((s) => ({ ...s, status: 'completed' })),
      },
      'completed'
    );
    expect(successPlan.steps.every((s) => s.status === 'completed')).toBe(true);
  });

  it('5. 用户干预计划合并 (PlanIntervention)', () => {
    const plan: AgentPlan = {
      id: 'plan-1',
      title: '竞品调研',
      steps: [
        { id: 's1', title: '检索数据', status: 'completed' },
        { id: 's2', title: '深度分析', status: 'pending' },
        { id: 's3', title: '撰写报告', status: 'pending' },
      ],
    };

    // 用户修改了 s2 的标题并跳过了 s3
    const modifiedSteps: PlanStep[] = [
      { id: 's1', title: '检索数据', status: 'completed' },
      { id: 's2', title: '聚焦价格模型与降价趋势分析', status: 'pending' },
      { id: 's3', title: '撰写报告', status: 'skipped' },
    ];

    const intervened = applyUserPlanIntervention(plan, modifiedSteps);
    expect(intervened.steps[1].title).toBe('聚焦价格模型与降价趋势分析');
    expect(intervened.steps[2].status).toBe('skipped');
  });
});
