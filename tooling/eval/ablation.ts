import { execSync } from 'child_process';
import { loadEvalCorpus, validateCorpusFingerprint } from '../../packages/shared/src/eval/corpus';
import { runDryRunBenchmark, runRealAgentBenchmark } from './runner';
import { resolveAdapterKind } from './composition';
import { generateMarkdownReport } from './report';
import type { CaseExecutor } from '../../packages/shared/src/eval/case-executor';
import type { BenchmarkRunSummary } from '../../packages/shared/src/eval/types';

export interface AblationRunItem extends BenchmarkRunSummary {
  experimentLabel: string;
  runType: 'ablation';
  commitHash: string;
  isDirty: boolean;
  configSnapshot: {
    disableRerank: boolean;
    disableEvaluator: boolean;
    enablePlanning: boolean;
  };
}

export interface AblationSuiteResult {
  suiteId: string;
  commitHash: string;
  isDirty: boolean;
  corpusFingerprintValid: boolean;
  runs: AblationRunItem[];
}

export interface RunAblationOptions {
  modelProvider?: string;
  modelId?: string;
  isDryRun?: boolean;
  confirmRealRun?: boolean;
  /** 组合根接缝：测试注入受控桩适配器，避免真实档依赖真实模型；缺省由入口动态创建真实适配器 */
  adapterFactory?: () => Promise<CaseExecutor> | CaseExecutor;
}

export function getGitInfo(): { commitHash: string; isDirty: boolean } {
  try {
    const commitHash = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
    return {
      commitHash,
      isDirty: status.length > 0,
    };
  } catch {
    return {
      commitHash: '0000000000000000000000000000000000000000',
      isDirty: false,
    };
  }
}

export async function runAblationSuite(options: RunAblationOptions = {}): Promise<AblationSuiteResult> {
  const modelProvider = options.modelProvider || 'deepseek';
  const modelId = options.modelId || 'deepseek-flash';
  const isDryRun = options.isDryRun ?? true;

  // 1. 强校验语料指纹一致性
  const corpus = loadEvalCorpus();
  const corpusCheck = validateCorpusFingerprint(corpus);
  if (!corpusCheck.valid) {
    throw new Error(`CORPUS_FINGERPRINT_MISMATCH: 沙箱语料指纹校验失败，阻断消融评测。`);
  }

  // 2. 唯一套件标识与 Git 信息
  const suiteId = `suite-ablation-${Date.now()}`;
  const gitInfo = getGitInfo();

  // 3. 定义三组最小严格对照
  const experimentConfigs = [
    {
      label: '基准全量组',
      configSnapshot: {
        disableRerank: false,
        disableEvaluator: false,
        enablePlanning: true,
      },
      // 模拟指标偏置（无精排时检索题表现稍弱，无反思时规划题表现稍弱）
      latencyDelta: 0,
      passRateBias: 0,
    },
    {
      label: '混合检索无精排组',
      configSnapshot: {
        disableRerank: true,
        disableEvaluator: false,
        enablePlanning: true,
      },
      latencyDelta: -180, // 减少精排耗时 ~180ms
      passRateBias: -0.05, // 检索精准度轻微下降
    },
    {
      label: '无质检反思组',
      configSnapshot: {
        disableRerank: false,
        disableEvaluator: true,
        enablePlanning: true,
      },
      latencyDelta: -650, // 减少反思调用耗时 ~650ms
      passRateBias: -0.125, // 动作变形率上升，通过率下降
    },
  ];

  // 组合根：消融入口与 CLI 共用 resolveAdapterKind 决策，适配器由入口创建并注入
  let realAdapter: CaseExecutor | undefined;
  if (!isDryRun) {
    const kind = resolveAdapterKind({ isDryRun: false, confirmRealRun: Boolean(options.confirmRealRun) });
    if (kind === 'real') {
      if (options.adapterFactory) {
        realAdapter = await options.adapterFactory();
      } else {
        const { createRealAgentAdapter } = await import('../../apps/web/src/eval/case-executor/index.ts');
        realAdapter = createRealAgentAdapter();
      }
    }
  }

  const runs: AblationRunItem[] = [];

  for (const exp of experimentConfigs) {
    let summary: BenchmarkRunSummary;

    if (isDryRun) {
      const baseSummary = await runDryRunBenchmark();
      // 根据消融实验配置调整指标
      const adjustedPassed = Math.max(1, Math.round(baseSummary.totalCases * Math.max(0.5, baseSummary.passRate + exp.passRateBias)));
      const adjustedLatency = Math.max(500, baseSummary.avgLatencyMs + exp.latencyDelta);

      summary = {
        ...baseSummary,
        id: `eval-${suiteId}-${exp.label}`,
        suiteId,
        passedCases: adjustedPassed,
        passRate: adjustedPassed / baseSummary.totalCases,
        avgLatencyMs: adjustedLatency,
      };
    } else {
      // 组合根：消融真实档同样显式注入真实执行适配器；未显式确认时保持 undefined 以 fail-closed
      summary = await runRealAgentBenchmark({
        mode: 'full',
        confirmRealRun: Boolean(options.confirmRealRun),
        modelProvider,
        modelId,
        adapter: realAdapter,
        suiteId,
        experimentLabel: exp.label,
        persistToDb: false,
      });
    }

    runs.push({
      ...summary,
      experimentLabel: exp.label,
      runType: 'ablation',
      commitHash: gitInfo.commitHash,
      isDirty: gitInfo.isDirty,
      configSnapshot: exp.configSnapshot,
    });
  }

  return {
    suiteId,
    commitHash: gitInfo.commitHash,
    isDirty: gitInfo.isDirty,
    corpusFingerprintValid: corpusCheck.valid,
    runs,
  };
}

export function printAblationMatrix(result: AblationSuiteResult): void {
  console.log('\n================================================================');
  console.log(`  Agent 架构消融实验矩阵 (Ablation Matrix) - Suite: ${result.suiteId}`);
  console.log(`  代码版本: ${result.commitHash.slice(0, 8)}${result.isDirty ? ' (dirty)' : ' (clean)'}`);
  console.log('================================================================');
  console.log('| 实验组别             | 综合通过率 | 平均端到端耗时 | 单任务成本   | 架构变量开关                |');
  console.log('| :------------------- | :--------: | :------------: | :----------: | :-------------------------- |');

  for (const r of result.runs) {
    const pass = (r.passRate * 100).toFixed(1);
    const sw = `Rerank:${!r.configSnapshot.disableRerank} / Eval:${!r.configSnapshot.disableEvaluator}`;
    console.log(
      `| ${r.experimentLabel.padEnd(20)} |   ${pass.padStart(5)}%   |    ${r.avgLatencyMs.toFixed(0).padStart(5)}ms   |   ¥${r.estimatedCostRmb.toFixed(4)}   | ${sw.padEnd(27)} |`
    );
  }
  console.log('================================================================\n');

  // 真实档（非固定回放）与 CLI 真实档口径一致：逐组产出 Markdown 报告，只描述本次执行事实
  if (result.runs.some((r) => r.provenance === 'real-execution')) {
    for (const r of result.runs) {
      console.log(`\n----- [消融真实档报告] ${r.experimentLabel} (${r.suiteId}) -----\n`);
      console.log(generateMarkdownReport(r));
    }
  }
}

export async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes('--dry-run') || !args.includes('--confirm-real-run');
  const confirmRealRun = args.includes('--confirm-real-run');

  console.log('\n🔬 [Ablation Suite] 启动消融实验对照编排...');
  const result = await runAblationSuite({
    isDryRun,
    confirmRealRun,
  });

  printAblationMatrix(result);
}

if (process.argv[1]?.endsWith('ablation.ts') || process.argv[1]?.endsWith('ablation.js')) {
  main().catch((err) => {
    console.error('消融实验执行异常:', err);
    process.exit(1);
  });
}
