import type { BenchmarkRunSummary } from '../../packages/shared/src/eval/types';

export function generateMarkdownReport(summary: BenchmarkRunSummary): string {
  const modeLabel = summary.isDryRun ? 'Dry-run 模拟' : summary.isBenchmark ? '正式基准 (Benchmark)' : '冒烟调试 (Smoke)';
  const passPercent = (summary.passRate * 100).toFixed(1);

  const categoryNameMap: Record<string, string> = {
    planning: '规划与多步拆解 (Planning)',
    tools: '工具调用精准度 (Tool Precision)',
    security: '安全与权限拦截 (Security & Guardrails)',
    rag: 'RAG 检索与拒答 (RAG & Rejection)',
  };

  const rows = Object.entries(summary.categories)
    .map(([cat, stat]) => {
      const name = categoryNameMap[cat] || cat;
      const rate = (stat.passRate * 100).toFixed(1);
      return `| ${name} | ${stat.total} | ${stat.passed} | ${rate}% | ${stat.avgLatencyMs.toFixed(0)}ms | ${stat.totalTokens} |`;
    })
    .join('\n');

  const failedCases = summary.caseResults.filter((c) => !c.passed);
  const failureSection =
    failedCases.length === 0
      ? '> 全量用例均通过断言，无失败用例。'
      : failedCases
          .map(
            (c, i) =>
              `${i + 1}. **[${c.caseId}] ${c.title}** (${categoryNameMap[c.category] || c.category})\n   - 错误详情: \`${c.errorDetail || '未知错误'}\``
          )
          .join('\n');

  return `# Agent 评测基准报告

> **运行模式**：${modeLabel}
> **评测时间**：${summary.createdAt}
> **数据集版本**：${summary.datasetVersion}
> **被测模型**：${summary.modelProvider} / ${summary.modelId}

---

## 1. 核心概览指标

| 总用例数 | 通过数 | 综合通过率 | 平均端到端时延 | 总消耗 Token | 单任务预估成本 |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **${summary.totalCases}** | **${summary.passedCases}** | **${passPercent}%** | **${summary.avgLatencyMs.toFixed(0)}ms** | **${summary.totalTokens}** | **¥${summary.estimatedCostRmb.toFixed(4)}** |

---

## 2. 核心分类详细表现

| 评估维度 | 总题数 | 通过数 | 通过率 | 平均耗时 | 消耗 Token |
| :--- | :---: | :---: | :---: | :---: | :---: |
${rows}

---

## 3. 失败用例下钻详情 (Failure Case Inspector)

${failureSection}

---

*报告由评测引擎自动生成，杜绝全绿伪造，数据驱动系统调优。*
`;
}
