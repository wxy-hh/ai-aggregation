import { describe, it, expect } from 'vitest';
import {
  extractFinishFacts,
  REAL_ADAPTER_CAPABILITIES,
} from '../../../packages/shared/src/eval/real-adapter-facts';
import { createDryRunReplayAdapter, runRealAgentBenchmark } from '../runner';

/** 完成回调的两类事实：真实多步累加用量 / 单步终止帧用量，二者必须区分 */
describe('工单 04: 真实 adapter 计量事实与观测能力', () => {
  it('TC07-1: 用量与耗时取自完成回调的真实事实', () => {
    const facts = extractFinishFacts({
      outcome: 'success',
      usage: { inputTokens: 100, outputTokens: 50, totalTokens: 150 },
      durationMs: 1234,
    });
    expect(facts.usage.totalTokens).toBe(150);
    expect(facts.latencyMs).toBe(1234);
    expect(facts.usageEstimated).toBe(false);
    expect(facts.provenance).toBe('real-execution');
  });

  it('TC07-2: 完成回调缺真实用量时如实标记估算', () => {
    const facts = extractFinishFacts({ outcome: 'success', usage: null, durationMs: 10 });
    expect(facts.usage.totalTokens).toBe(0);
    expect(facts.usageEstimated).toBe(true);
  });

  it('TC07-3: 单步终止帧 usage 不等于多步总用量（由完成回调累计值决定）', () => {
    // 终止帧携带的 usage 不被 extractFinishFacts 读取；只有 onFinish 的累计 usage 生效
    const facts = extractFinishFacts({
      outcome: 'success',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      durationMs: 5,
      doneFrameUsage: { inputTokens: 999, outputTokens: 999, totalTokens: 1998 },
    });
    expect(facts.usage.totalTokens).toBe(15);
  });

  it('TC07-4: 真实 adapter 声明的观测能力与空工具注册表一致，规划/工具终态均不可观测', () => {
    expect(REAL_ADAPTER_CAPABILITIES.has('chunks_retrieved')).toBe(false);
    expect(REAL_ADAPTER_CAPABILITIES.has('ssrf_blocked')).toBe(false);
    expect(REAL_ADAPTER_CAPABILITIES.has('tool_call')).toBe(false);
    expect(REAL_ADAPTER_CAPABILITIES.has('approval_intercepted')).toBe(false);
    // 空工具注册表下阶段推进永不发生，规划终态不可观测 → 预先声明为能力外（S-H6）
    expect(REAL_ADAPTER_CAPABILITIES.has('plan_created')).toBe(false);
    expect(REAL_ADAPTER_CAPABILITIES.has('final_answer')).toBe(true);
  });

  it('TC07-5: 真实能力集合下 40 题中至少 10 题因缺观测能力而不可评分', async () => {
    // 用受控桩适配器（真实种类 + 回放轨迹 + 真实能力集合）：不调模型，只验证能力矩阵与题集一致性
    const adapter = {
      ...createDryRunReplayAdapter(),
      kind: 'real' as const,
      provenance: 'real-execution' as const,
      declaredCapabilities: REAL_ADAPTER_CAPABILITIES,
    };
    const summary = await runRealAgentBenchmark({
      mode: 'full',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter,
      persistToDb: false,
    });
    expect(summary.totalCases).toBe(40);
    expect(summary.unscoredCases).toBeGreaterThanOrEqual(10);
    expect(summary.scoredCases + summary.unscoredCases + summary.executionErrors).toBe(40);
    expect(summary.isDryRun).toBe(false);
  });
});
