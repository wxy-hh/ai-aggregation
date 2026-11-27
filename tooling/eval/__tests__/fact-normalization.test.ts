import { describe, it, expect } from 'vitest';
import {
  normalizeToolName,
  foldPlanTerminal,
  projectChatEventsToTrace,
} from '../../../packages/shared/src/eval/fact-normalization';

describe('工单 03: 事实归一与安全事实来源', () => {
  it('TC05-1: 计划初始快照与生产 plan_step_update 折叠为终态，初始快照不冒充完成', () => {
    const plan = {
      id: 'plan-1',
      title: '任务',
      checkpoints: [
        { id: 'cp-1', title: '阶段一', status: 'pending' },
        { id: 'cp-2', title: '阶段二', status: 'pending' },
      ],
    };
    const initialOnly = foldPlanTerminal([{ type: 'plan_created', plan }]);
    expect(initialOnly.checkpoints.every((c) => c.status === 'completed')).toBe(false);

    // 生产事件名与字段：plan_step_update + stepId + status
    const folded = foldPlanTerminal([
      { type: 'plan_created', plan },
      { type: 'plan_step_update', stepId: 'cp-1', status: 'completed' },
      { type: 'plan_step_update', stepId: 'cp-2', status: 'completed' },
    ]);
    expect(folded.checkpoints.every((c) => c.status === 'completed')).toBe(true);
  });

  it('TC05-2: 工具名按生产→数据集方向归一，使裁决逐字比较可命中', () => {
    expect(normalizeToolName('knowledge_search')).toBe('knowledgeSearch');
    expect(normalizeToolName('web_fetch')).toBe('webFetch');
    expect(normalizeToolName('knowledgeSearch')).toBe('knowledgeSearch');
    // 数据集里存在但生产注册表没有的工具，归一后仍是其自身，不得声称命中
    expect(normalizeToolName('getAccountBalance')).toBe('getAccountBalance');
  });

  it('TC05-2b: 投影后的 tool_call 名与数据集 expectedToolName 逐字一致', () => {
    const trace = projectChatEventsToTrace([
      { type: 'tool_call', call: { id: 'c1', name: 'knowledge_search', argsSummary: 'query' } },
      { type: 'tool_result', callId: 'c1', name: 'knowledge_search', status: 'success', summary: 'ok' },
    ]);
    expect(trace.find((e) => e.type === 'tool_call')?.toolName).toBe('knowledgeSearch');
  });

  it('TC05-3: done 与 agent_note 不等于 final_answer，仅真实终态回答参与', () => {
    const trace = projectChatEventsToTrace([
      { type: 'agent_note', text: '阶段小结' },
      { type: 'done' },
    ]);
    expect(trace.some((e) => e.type === 'final_answer')).toBe(false);
  });

  it('TC05-4: 工具返回 failed 但无真实守卫结果时，不产生 ssrf_blocked', () => {
    const trace = projectChatEventsToTrace([
      { type: 'tool_call', call: { id: 'c1', name: 'web_fetch', argsSummary: 'http://private' } },
      { type: 'tool_result', callId: 'c1', name: 'web_fetch', status: 'failed', summary: 'blocked' },
    ]);
    expect(trace.some((e) => e.type === 'ssrf_blocked')).toBe(false);
    // 失败被如实投影到配对的 tool_call（S-H2）
    expect(trace.find((e) => e.type === 'tool_call')?.status).toBe('failed');
  });

  it('TC05-6: tool_call 不预置 success，成功结果由 tool_result 配对补齐（S-H1/S-H2）', () => {
    const withoutResult = projectChatEventsToTrace([
      { type: 'tool_call', call: { id: 'c1', name: 'knowledge_search', argsSummary: 'q' } },
    ]);
    expect(withoutResult.find((e) => e.type === 'tool_call')?.status).toBeUndefined();

    const withResult = projectChatEventsToTrace([
      { type: 'tool_call', call: { id: 'c1', name: 'knowledge_search', argsSummary: 'q' } },
      { type: 'tool_result', callId: 'c1', name: 'knowledge_search', status: 'success', summary: 'ok' },
    ]);
    expect(withResult.find((e) => e.type === 'tool_call')?.status).toBe('success');
  });

  it('TC05-5: 审批拦截事实来自真实审批请求事件及其凭证', () => {
    const trace = projectChatEventsToTrace([
      { type: 'tool_approval_request', approval: { callId: 'c1', toolName: 'wh_notify', host: 'x.example', params: {}, token: 'tok-real', expiresAt: 1 } },
    ]);
    const approval = trace.find((e) => e.type === 'approval_intercepted');
    expect(approval).toBeDefined();
    expect(approval?.approvalToken).toBe('tok-real');
    expect(approval?.status).toBe('pendingApproval');
  });
});
