import { runDryRunBenchmark, runRealAgentBenchmark } from './runner';
import { generateMarkdownReport } from './report';

export async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run');
  const isSmoke = args.includes('--smoke');
  const confirmRealRun = args.includes('--confirm-real-run');

  if (isDryRun || (!isSmoke && !confirmRealRun)) {
    console.log('\n🚀 [Eval Benchmark] 启动脱机 Dry-run 评测（零外部网络 / 纯内存模式）...\n');
    const startTime = Date.now();
    const summary = await runDryRunBenchmark();
    const elapsed = Date.now() - startTime;

    console.log('================================================================');
    console.log(`  Agent 40 题标准基准评测 (Dry-run 结果) - 耗时: ${elapsed}ms`);
    console.log('================================================================');
    console.log(`  总用例数    : ${summary.totalCases}`);
    console.log(`  通过用例数  : ${summary.passedCases}`);
    console.log(`  综合通过率  : ${(summary.passRate * 100).toFixed(1)}% (含 5 道预设缺陷真实测试用例)`);
    console.log(`  单任务平均耗时: ${summary.avgLatencyMs.toFixed(0)}ms`);
    console.log(`  总消耗 Token: ${summary.totalTokens}`);
    console.log(`  预估单任务成本: ¥${summary.estimatedCostRmb.toFixed(4)}`);
    console.log('----------------------------------------------------------------');
    console.log('  四大分类维度细分表现:');
    for (const [cat, s] of Object.entries(summary.categories)) {
      console.log(
        `    - ${cat.padEnd(10)}: 通过率 ${(s.passRate * 100).toFixed(1)}% (${s.passed}/${s.total}) | 平均耗时 ${s.avgLatencyMs.toFixed(0)}ms`
      );
    }
    console.log('----------------------------------------------------------------');
    const failed = summary.caseResults.filter((c) => !c.passed);
    console.log(`  失败用例下钻 (${failed.length} 个):`);
    for (const f of failed) {
      console.log(`    ❌ [${f.caseId}] ${f.title} -> ${f.errorDetail}`);
    }
    console.log('================================================================\n');

    if (args.includes('--markdown') || args.includes('--print-report')) {
      const reportMd = generateMarkdownReport(summary);
      console.log(reportMd);
    }

    process.exit(0);
  }

  if (isSmoke && confirmRealRun) {
    console.log('\n🧪 [Eval Benchmark] 启动真实模型冒烟评测 (Smoke 4 题模式)...\n');
    const startTime = Date.now();
    const summary = await runRealAgentBenchmark({
      mode: 'smoke',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      persistToDb: true,
    });
    const elapsed = Date.now() - startTime;

    console.log('================================================================');
    console.log(`  Agent 真实模型冒烟评测结果 - 耗时: ${elapsed}ms (非正式基准)`);
    console.log('================================================================');
    console.log(`  总用例数    : ${summary.totalCases}`);
    console.log(`  通过用例数  : ${summary.passedCases}`);
    console.log(`  综合通过率  : ${(summary.passRate * 100).toFixed(1)}%`);
    console.log(`  单任务平均耗时: ${summary.avgLatencyMs.toFixed(0)}ms`);
    console.log(`  总消耗 Token: ${summary.totalTokens}`);
    console.log(`  预估单任务成本: ¥${summary.estimatedCostRmb.toFixed(4)}`);
    console.log('================================================================\n');

    process.exit(0);
  }

  console.error('❌ 未知评测运行参数组合。可用命令:');
  console.error('   pnpm eval:agent --dry-run');
  console.error('   pnpm eval:agent --smoke --confirm-real-run');
  process.exit(1);
}

if (process.argv[1]?.endsWith('cli.ts') || process.argv[1]?.endsWith('cli.js')) {
  main().catch((err) => {
    console.error('评测执行异常:', err);
    process.exit(1);
  });
}
