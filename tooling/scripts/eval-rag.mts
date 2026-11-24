/**
 * @deprecated 该旧离线 RAG 评测脚本已弃用，请迁移至统一评测中枢：`pnpm eval:agent`
 *
 * 迁移背景与依据 (Stage 3 / ADR-0063)：
 * 历史评测中存在的硬编码与固定伪造结论已彻底收敛。
 * 本文件作为平滑过渡入口保留，运行时将直接委托统一评测引擎执行。
 */

export async function main() {
  console.warn('\n⚠️  [DEPRECATED] tooling/scripts/eval-rag.mts 已弃用！');
  console.warn('👉 请使用统一评测命令：`pnpm eval:agent --dry-run` 或 `pnpm eval:agent --smoke --confirm-real-run`\n');
  console.log('🔄 正在自动底层委托至新统一评测引擎运行...\n');

  const runnerModule = await import('../eval/runner.ts');
  const runDryRunBenchmark =
    runnerModule.runDryRunBenchmark || (runnerModule.default as any)?.runDryRunBenchmark;

  const summary = await runDryRunBenchmark();
  const ragSummary = summary.categories.rag;

  console.log('================================================================');
  console.log('  统一评测中枢 - RAG 检索子集执行结果 (真实客观裁决)');
  console.log('================================================================');
  console.log(`  RAG 总用例数 : ${ragSummary.total}`);
  console.log(`  通过用例数   : ${ragSummary.passed}`);
  console.log(`  实测通过率   : ${(ragSummary.passRate * 100).toFixed(1)}% (含遗漏与格式缺陷客观负结果)`);
  console.log(`  平均检索耗时 : ${ragSummary.avgLatencyMs.toFixed(0)}ms`);
  console.log(`  消耗 Token   : ${ragSummary.totalTokens}`);
  console.log('================================================================\n');
}

if (process.argv[1]?.includes('eval-rag')) {
  main().catch((err) => {
    console.error('执行失败:', err);
    process.exit(1);
  });
}
