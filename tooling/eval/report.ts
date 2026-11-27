import type { BenchmarkRunSummary } from '../../packages/shared/src/eval/types';

export function generateMarkdownReport(summary: BenchmarkRunSummary): string {
  const modeLabel = summary.isDryRun ? 'Dry-run 模拟（固定回放）' : summary.isBenchmark ? '正式基准 (Benchmark)' : '冒烟调试 (Smoke)';
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

  const failedCases = summary.caseResults.filter((c) => c.status === 'failed' || (!c.status && !c.passed));
  const failureSection =
    failedCases.length === 0
      ? '> 已评分用例均通过断言，无失败用例。'
      : failedCases
          .map(
            (c, i) =>
              `${i + 1}. **[${c.caseId}] ${c.title}** (${categoryNameMap[c.category] || c.category})\n   - 错误详情: \`${c.errorDetail || '未知错误'}\``
          )
          .join('\n');

  const unscoredCases = summary.caseResults.filter((c) => c.status === 'unscored');
  const unscoredSection =
    unscoredCases.length === 0
      ? '> 本次无未评分用例。'
      : unscoredCases
          .map(
            (c, i) =>
              `${i + 1}. **[${c.caseId}] ${c.title}** (${categoryNameMap[c.category] || c.category})\n   - 所缺裁决事实: \`${(c.missingFacts || []).join('、') || '未记录'}\``
          )
          .join('\n');

  const errorCases = summary.caseResults.filter((c) => c.status === 'execution_error');
  const errorSection =
    errorCases.length === 0
      ? '> 本次无执行错误用例。'
      : errorCases
          .map((c, i) => `${i + 1}. **[${c.caseId}] ${c.title}** - ${c.errorDetail || '执行异常'}`)
          .join('\n');

  const sourceLabel =
    summary.provenance === 'real-execution'
      ? '编排级真实执行（OrchestrationLevelExecution）'
      : summary.provenance === 'replay'
        ? '固定回放（Replay）'
        : summary.provenance || '未声明';

  // 事实级来源汇总：逐用例收集 factProvenance 的取值，供报告读者复核每项事实的出处
  const factSources = new Set<string>();
  for (const c of summary.caseResults) {
    for (const value of Object.values(c.factProvenance || {})) factSources.add(value);
  }
  const factSourceLabel = factSources.size > 0 ? [...factSources].sort().join('、') : '未标注';

  return `# Agent 评测基准报告

> **运行模式**：${modeLabel}
> **事实来源**：${sourceLabel}
> **事实级来源取值**：${factSourceLabel}
> **数据来源**：本次执行（无跨运行历史趋势）
> **数据库写入**：${summary.persistedToDb ? '已写入' : '本次未写数据库'}
> **评测时间**：${summary.createdAt}
> **数据集版本**：${summary.datasetVersion}
> **被测模型**：${summary.modelProvider} / ${summary.modelId}

---

## 1. 核心概览指标

| 总用例数 | 已评分 | 通过数 | 未评分 | 执行错误 | 综合通过率（已评分为分母） | 平均端到端时延 | 总消耗 Token | 单任务预估成本 |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **${summary.totalCases}** | **${summary.scoredCases}** | **${summary.passedCases}** | **${summary.unscoredCases}** | **${summary.executionErrors}** | **${passPercent}%** | **${summary.avgLatencyMs.toFixed(0)}ms** | **${summary.totalTokens}** | **¥${summary.estimatedCostRmb.toFixed(4)}** |

> 结果不变量：已评分 + 未评分 + 执行错误 = 总题数；通过率仅以已评分题为分母。

---

## 2. 核心分类详细表现

| 评估维度 | 总题数 | 通过数 | 通过率 | 平均耗时 | 消耗 Token |
| :--- | :---: | :---: | :---: | :---: | :---: |
${rows}

---

## 3. 失败用例下钻详情 (Failure Case Inspector)

${failureSection}

---

## 4. 未评分用例 (UnscoredCase)

${unscoredSection}

---

## 5. 执行错误用例 (Execution Error)

${errorSection}

---

*报告由评测引擎自动生成，只呈现本次执行事实；未评分与执行错误不计入通过率。*
`;
}
