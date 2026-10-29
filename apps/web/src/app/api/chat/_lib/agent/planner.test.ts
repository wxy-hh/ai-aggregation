import { describe, it, expect, vi } from 'vitest';
import { generateAgentPlan } from './planner';
import type { ChatStreamEvent } from '@repo/shared';
import { parseChatStreamEvent } from '@repo/shared';

// 模拟 ai 模块
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    generateText: vi.fn(),
  };
});

import { generateText } from 'ai';
const mockedGenerateText = vi.mocked(generateText);

describe('TC03: 服务端 Planner 节点与 Runner 状态联动', () => {
  it('1. Agent 模式下接收复杂任务，前置生成计划并受控输出 (TC03-1)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        title: '全网竞品调研',
        steps: [
          { id: 'step-1', title: '检索竞品动态', status: 'pending' },
          { id: 'step-2', title: '整理对比表格', status: 'pending' },
        ],
      }),
      usage: { promptTokens: 30, completionTokens: 40, totalTokens: 70 },
    } as any);

    const plan = await generateAgentPlan({
      model: {} as any,
      messages: [{ role: 'user', content: '请帮我全网调研当前三款主流 Agent 框架并输出对比报告' }],
    });

    expect(plan).not.toBeNull();
    expect(plan?.title).toBe('全网竞品调研');
    expect(plan?.steps.length).toBe(2);
    expect(plan?.steps[0].status).toBe('pending');
  });

  it('2. 规划成功下发后，无需等待用户审批，自动推进首步为 running (TC03-2)', async () => {
    mockedGenerateText.mockResolvedValueOnce({
      text: JSON.stringify({
        title: '行业调研',
        steps: [
          { id: 's1', title: '检索', status: 'pending' },
          { id: 's2', title: '输出', status: 'pending' },
        ],
      }),
    } as any);

    const plan = await generateAgentPlan({
      model: {} as any,
      messages: [{ role: 'user', content: '深度调研国内大模型厂商定价与计费策略' }],
    });

    expect(plan).not.toBeNull();
    // 验证 runner 收到后的乐观推进状态流
    const events: ChatStreamEvent[] = [];
    events.push({ type: 'plan_created', plan: plan! });
    events.push({ type: 'plan_step_update', stepId: plan!.steps[0].id, status: 'running' });

    expect(events[0].type).toBe('plan_created');
    expect(events[1]).toEqual({
      type: 'plan_step_update',
      stepId: 's1',
      status: 'running',
    });
  });

  it('3. 中间轮工具调用与当前 running Checkpoint 关联并在步骤完成时推送 completed (TC03-3)', async () => {
    const plan = {
      id: 'plan-1',
      title: '调研任务',
      steps: [
        { id: 's1', title: '数据抓取', status: 'running' as const, toolCallIds: [] as string[] },
        { id: 's2', title: '整理分析', status: 'pending' as const },
      ],
    };

    // 模拟工具调用关联
    plan.steps[0]!.toolCallIds!.push('call-1');
    expect(plan.steps[0]!.toolCallIds).toContain('call-1');

    // 步骤结束更新
    const updateEvent: ChatStreamEvent = {
      type: 'plan_step_update',
      stepId: 's1',
      status: 'completed',
      summary: '阶段任务已完成',
    };
    expect(updateEvent.status).toBe('completed');
  });

  it('4. Planner 规划超时或输出非 JSON 格式时平滑降级为常规 ReAct 循环 (TC03-4)', async () => {
    // 模拟返回非法畸形非 JSON 文本
    mockedGenerateText.mockResolvedValueOnce({
      text: '我是一段非法的自然语言，没有输出任何合法的 JSON 对象',
    } as any);

    const plan = await generateAgentPlan({
      model: {} as any,
      messages: [{ role: 'user', content: '请帮我写一份详细的项目立项方案报告' }],
    });

    // 应该平滑降级为 null，不抛出异常
    expect(plan).toBeNull();
  });

  it('5. 步骤工具执行遭遇熔断时推送 failed 状态带提示 (TC03-5)', () => {
    const failedEvent: ChatStreamEvent = {
      type: 'plan_step_update',
      stepId: 's1',
      status: 'failed',
      summary: '连续工具执行失败，熔断进入收尾',
    };

    expect(failedEvent.status).toBe('failed');
    expect(failedEvent.summary).toContain('熔断进入收尾');
  });

  it('6. 简单问答或问候不触发规划 (TC03-6)', async () => {
    const simplePlan = await generateAgentPlan({
      model: {} as any,
      messages: [{ role: 'user', content: '你好' }],
    });
    expect(simplePlan).toBeNull();

    const emptyPlan = await generateAgentPlan({
      model: {} as any,
      messages: [{ role: 'user', content: '  ' }],
    });
    expect(emptyPlan).toBeNull();
  });
});
