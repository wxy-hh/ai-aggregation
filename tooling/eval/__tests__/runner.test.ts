import { describe, it, expect } from 'vitest';
import { runDryRunBenchmark } from '../runner';
import { generateMarkdownReport } from '../report';

describe('TC06: Dry-run 内存执行闭环与基准评测报告 (DryRunRunner & Reporter)', () => {
  it('TC06-1 & TC06-2 & TC06-3: dry-run 模式零网络零DB运行全量40题，如实反映失败得分，通过率 < 100%', async () => {
    const summary = await runDryRunBenchmark();

    // TC06-1: 纯内存对象，标记为 dry-run 模式
    expect(summary.isDryRun).toBe(true);
    expect(summary.totalCases).toBe(40);

    // TC06-2: 四大分类完整统计
    expect(summary.categories.planning.total).toBe(10);
    expect(summary.categories.tools.total).toBe(10);
    expect(summary.categories.security.total).toBe(10);
    expect(summary.categories.rag.total).toBe(10);

    // 耗时与 Token 统计
    expect(summary.avgLatencyMs).toBeGreaterThan(0);
    expect(summary.totalTokens).toBeGreaterThan(0);
    expect(summary.estimatedCostRmb).toBeGreaterThan(0);

    // TC06-3: 模拟轨迹包含典型缺陷失败用例，通过率非 100%（例如 35/40 = 87.5%）
    expect(summary.passedCases).toBeLessThan(summary.totalCases);
    expect(summary.passedCases).toBeGreaterThan(0);
    expect(summary.passRate).toBeLessThan(1.0);
    expect(summary.passRate).toBeGreaterThan(0.7);

    // 失败用例存在且具备详细 errorDetail
    const failedCases = summary.caseResults.filter((c) => !c.passed);
    expect(failedCases.length).toBe(summary.totalCases - summary.passedCases);
    expect(failedCases[0].errorDetail).toBeDefined();
    expect(failedCases[0].errorDetail!.length).toBeGreaterThan(0);
  });

  it('TC06-4: 内存生成标准 Markdown 报告包含分类得分与失败清单', async () => {
    const summary = await runDryRunBenchmark();
    const reportMd = generateMarkdownReport(summary);

    expect(typeof reportMd).toBe('string');
    expect(reportMd).toContain('# Agent 评测基准报告');
    expect(reportMd).toContain('40');
    expect(reportMd).toContain('规划与多步拆解');
    expect(reportMd).toContain('工具调用精准度');
    expect(reportMd).toContain('安全与权限拦截');
    expect(reportMd).toContain('RAG 检索与拒答');
    expect(reportMd).toContain('失败用例下钻');
    expect(reportMd).toContain('Dry-run 模拟');
  });
});
