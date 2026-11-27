import { describe, it, expect } from 'vitest';
import { runRealAgentBenchmark, createDryRunReplayAdapter } from '../runner';
import { generateMarkdownReport } from '../report';

/** 只声明有限观测能力的回放适配器：用于验证「能力外 → 未评分」 */
function limitedReplayAdapter() {
  const base = createDryRunReplayAdapter();
  return {
    ...base,
    declaredCapabilities: new Set<string>(['plan_created', 'final_answer', 'tool_call']),
  };
}

describe('工单 03: 三态集成与诚实报告', () => {
  it('TC06-1: 报告分列已评分 / 未评分 / 执行错误三态并给出计数', async () => {
    const summary = await runRealAgentBenchmark({
      mode: 'smoke',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter: limitedReplayAdapter() as never,
      persistToDb: false,
    });
    const report = generateMarkdownReport(summary);

    expect(report).toContain('已评分');
    expect(report).toContain('未评分');
    expect(report).toContain('执行错误');
  });

  it('TC06-2: 报告含「本次未写数据库」标注', async () => {
    const summary = await runRealAgentBenchmark({
      mode: 'smoke',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter: limitedReplayAdapter() as never,
      persistToDb: false,
    });
    expect(generateMarkdownReport(summary)).toContain('本次未写数据库');
  });

  it('TC06-3: 已知至少 10 题中依赖 chunks_retrieved / ssrf_blocked 观测的用例被诚实呈现为不可评分', async () => {
    const summary = await runRealAgentBenchmark({
      mode: 'full',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter: limitedReplayAdapter() as never,
      persistToDb: false,
    });
    expect(summary.unscoredCases).toBeGreaterThanOrEqual(10);
    expect(summary.totalCases).toBe(40);
  });

  it('TC06-4: 结果不变量与通过率分母均为已评分题，且每项事实带来源标记', async () => {
    const summary = await runRealAgentBenchmark({
      mode: 'full',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter: limitedReplayAdapter() as never,
      persistToDb: false,
    });
    expect(summary.scoredCases + summary.unscoredCases + summary.executionErrors).toBe(summary.totalCases);
    expect(summary.passRate).toBeCloseTo(summary.passedCases / summary.scoredCases, 6);
    // 事实级来源：每个用例都有 factProvenance，且用量按估算标注
    for (const c of summary.caseResults) {
      expect(Object.keys(c.factProvenance || {}).length).toBeGreaterThan(0);
      expect(c.factProvenance?.usage).toBe('estimated');
    }
    expect(generateMarkdownReport(summary)).toContain('事实级来源取值');
  });

  it('TC06-5: 每个未评分用例写明所缺的裁决事实类型', async () => {
    const summary = await runRealAgentBenchmark({
      mode: 'full',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter: limitedReplayAdapter() as never,
      persistToDb: false,
    });
    const unscored = summary.caseResults.filter((c) => c.status === 'unscored');
    expect(unscored.length).toBeGreaterThan(0);
    for (const c of unscored) {
      expect(c.missingFacts.length).toBeGreaterThan(0);
    }
  });
});
