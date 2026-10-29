/**
 * 章节补丁离线评测：命令行逻辑（ADR-0037 / 工单 10）
 *
 * 用法（由 tooling/scripts/eval-artifact-patch.mts 薄封装调用）：
 *   pnpm artifact-patch:eval --dry-run                      干跑：不调用模型，退出码 0
 *   pnpm artifact-patch:eval --confirm-real-run             真实运行（消耗账户额度）
 *   pnpm artifact-patch:eval --confirm-real-run --cases single-01,new-01 --runs 1   试跑子集
 *
 * 安全约束：
 * - 未传 --dry-run 也未传 --confirm-real-run 时，拒绝发起任何真实模型调用（退出码 2）；
 * - 全量用例集每条至少跑 3 次，少于 3 次只允许用 --cases 指定子集试跑；
 * - 干跑不落盘报告（避免模拟数据覆盖真实基线），只打印；真实运行写入 docs/reports。
 */

import { PATCH_EVAL_CASES, type PatchEvalCase } from './cases';
import { analyzeRun, failedRun, type RunAnalysis } from './metrics';
import { buildReport } from './report';
import type { ChatStreamEvent } from '@repo/shared';

export const MIN_RUNS_FULL_SET = 3;
export const DEFAULT_REPORT_PATH = 'docs/reports/artifact-patch-eval-report.md';

export interface CliOptions {
  dryRun: boolean;
  confirmRealRun: boolean;
  caseIds: string[] | null;
  runs: number;
  reportPath: string | null;
}

/** 命令行依赖：真实运行与模拟输出均可注入，便于测试断言「未确认不调用」 */
export interface CliDeps {
  runReal: (testCase: PatchEvalCase) => Promise<ChatStreamEvent[]>;
  simulate: (testCase: PatchEvalCase) => ChatStreamEvent[];
  writeReport: (path: string, content: string) => void;
  log: (message: string) => void;
  error: (message: string) => void;
  now: () => Date;
  model: { provider: string; model: string };
}

export type ParseResult = { ok: true; options: CliOptions } | { ok: false; message: string };

export function parseArgs(argv: string[]): ParseResult {
  const options: CliOptions = {
    dryRun: false,
    confirmRealRun: false,
    caseIds: null,
    runs: MIN_RUNS_FULL_SET,
    reportPath: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--confirm-real-run') options.confirmRealRun = true;
    else if (arg === '--cases') {
      const value = next();
      if (!value) return { ok: false, message: '--cases 需要逗号分隔的用例 ID' };
      options.caseIds = value.split(',').map((s) => s.trim()).filter(Boolean);
    } else if (arg === '--runs') {
      const value = Number(next());
      if (!Number.isInteger(value) || value < 1) return { ok: false, message: '--runs 需要正整数' };
      options.runs = value;
    } else if (arg === '--out') {
      const value = next();
      if (!value) return { ok: false, message: '--out 需要报告路径' };
      options.reportPath = value;
    } else {
      return { ok: false, message: `未知参数：${arg}` };
    }
  }
  return { ok: true, options };
}

/** 命令行入口：返回退出码（0 成功；1 运行失败；2 参数错误或拒绝发起真实调用） */
export async function runCli(argv: string[], deps: CliDeps): Promise<number> {
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    deps.error(`参数错误：${parsed.message}`);
    return 2;
  }
  const { options } = parsed;

  if (!options.dryRun && !options.confirmRealRun) {
    deps.error(
      '拒绝发起真实模型调用：真实运行会消耗账户额度，需显式传入 --confirm-real-run；' +
        '只想验证流水线请传 --dry-run（不调用模型）。'
    );
    return 2;
  }
  if (options.dryRun && options.confirmRealRun) {
    deps.error('--dry-run 与 --confirm-real-run 不能同时使用');
    return 2;
  }

  const selected = options.caseIds
    ? PATCH_EVAL_CASES.filter((c) => options.caseIds!.includes(c.id))
    : [...PATCH_EVAL_CASES];
  if (options.caseIds) {
    const unknown = options.caseIds.filter((id) => !PATCH_EVAL_CASES.some((c) => c.id === id));
    if (unknown.length > 0) {
      deps.error(`未知用例 ID：${unknown.join(', ')}`);
      return 2;
    }
  }
  const fullCaseSet = options.caseIds === null;
  if (fullCaseSet && options.runs < MIN_RUNS_FULL_SET) {
    deps.error(`全量用例每条至少运行 ${MIN_RUNS_FULL_SET} 次；少于该次数请用 --cases 指定子集试跑`);
    return 2;
  }

  const runs: RunAnalysis[] = [];
  for (const testCase of selected) {
    for (let runIndex = 0; runIndex < options.runs; runIndex++) {
      try {
        const events = options.dryRun ? deps.simulate(testCase) : await deps.runReal(testCase);
        const errorEvent = events.find((e) => e.type === 'error');
        if (errorEvent && errorEvent.type === 'error') {
          runs.push(failedRun(testCase, runIndex, errorEvent.error));
        } else {
          runs.push(analyzeRun(testCase, runIndex, events));
        }
      } catch (error) {
        runs.push(failedRun(testCase, runIndex, error instanceof Error ? error.message : String(error)));
      }
      deps.log(`[${testCase.id}] 第 ${runIndex + 1}/${options.runs} 次完成`);
    }
  }

  const report = buildReport(runs, {
    mode: options.dryRun ? 'dry-run' : 'real',
    provider: deps.model.provider,
    model: deps.model.model,
    runsPerCase: options.runs,
    date: deps.now().toISOString().slice(0, 10),
    fullCaseSet,
  });

  if (options.dryRun) {
    deps.log(report);
    if (options.reportPath) deps.writeReport(options.reportPath, report);
  } else {
    // 子集试跑不覆盖全量基线：默认只在全量时写入标准路径，试跑需显式 --out
    const target = options.reportPath ?? (fullCaseSet ? DEFAULT_REPORT_PATH : null);
    if (target) {
      deps.writeReport(target, report);
      deps.log(`报告已写入 ${target}`);
    } else {
      deps.log(report);
    }
  }

  // 全部运行都作废视为失败，避免空报告被当成成功
  const valid = runs.filter((r) => !r.failed).length;
  return valid === 0 ? 1 : 0;
}
