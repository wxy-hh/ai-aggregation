import { describe, it, expect } from 'vitest';
import {
  projectChatEventsToTrace,
} from '../../../packages/shared/src/eval/fact-normalization';
import {
  extractFinishFacts,
  REAL_ADAPTER_CAPABILITIES,
} from '../../../packages/shared/src/eval/real-adapter-facts';
import { gradeCaseResult } from '../../../packages/shared/src/eval/grading';
import type { BenchmarkCase } from '../../../packages/shared/src/eval/types';

describe('r3 手动复审轮：S-H1 / S-H3 / S-H6 / P-M5 修复', () => {
  it('S-H1: 审批挂起时 tool_result 不算已执行写操作，裁决判通过', () => {
    // 生产审批挂起分支的真实事件序列：tool_call → tool_result(success, 卡片已产出) → tool_approval_request
    const trace = projectChatEventsToTrace([
      { type: 'tool_call', call: { id: 'c1', name: 'wh_notify', argsSummary: 'write' } },
      { type: 'tool_result', callId: 'c1', name: 'wh_notify', status: 'success', summary: '待审批卡片' },
      { type: 'tool_approval_request', approval: { callId: 'c1', toolName: 'wh_notify', token: 'tok-real', host: 'x.example', params: {} } },
    ]);
    const approvalCase: BenchmarkCase = {
      id: 'sec-001', category: 'security', title: '审批', prompt: '',
      expected: { requireApprovalIntercept: true },
    };
    const grade = gradeCaseResult(approvalCase, trace);
    expect(grade.passed).toBe(true);
    // 供裁决的 tool_call 不得带 success
    expect(trace.find((e) => e.type === 'tool_call')?.status).not.toBe('success');
  });

  it('S-H1b: 非审批的普通成功工具调用仍按 callId 配对为 success', () => {
    const trace = projectChatEventsToTrace([
      { type: 'tool_call', call: { id: 'c1', name: 'knowledge_search', argsSummary: 'q' } },
      { type: 'tool_result', callId: 'c1', name: 'knowledge_search', status: 'success', summary: 'ok' },
    ]);
    expect(trace.find((e) => e.type === 'tool_call')?.status).toBe('success');
  });

  it('S-H3: 正常收尾「无产出」不是执行错误，空回答按断言判负', () => {
    // outcome=failed 但无异常 reason、无本地超时 → 视为正常完成（有/无正文交给裁决）
    const facts = extractFinishFacts({ outcome: 'failed', usage: null, durationMs: 10, outputText: '' });
    expect(facts.executionSucceeded).toBe(true);
    expect(facts.abnormalReason).toBeUndefined();
  });

  it('S-H3b: 带异常 reason 的 failed 与本地超时分别记为 error / timeout', () => {
    expect(extractFinishFacts({ outcome: 'failed', reason: 'upstream error' }).abnormalReason).toBe('error');
    expect(extractFinishFacts({ outcome: 'failed', localTimedOut: true }).abnormalReason).toBe('timeout');
    expect(extractFinishFacts({ outcome: 'partial' }).abnormalReason).toBe('aborted');
    expect(extractFinishFacts({ outcome: 'success' }).executionSucceeded).toBe(true);
  });

  it('S-H6: 真实能力集合不含 plan_created，规划题按未评分而非系统性假阴性', () => {
    expect(REAL_ADAPTER_CAPABILITIES.has('plan_created')).toBe(false);
    expect(REAL_ADAPTER_CAPABILITIES.has('final_answer')).toBe(true);
  });
});
