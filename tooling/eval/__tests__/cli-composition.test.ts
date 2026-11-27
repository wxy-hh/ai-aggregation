import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolveAdapterKind } from '../composition';
import { createDryRunReplayAdapter, runRealAgentBenchmark } from '../runner';
import { runAblationSuite, printAblationMatrix } from '../ablation';
import { REAL_ADAPTER_CAPABILITIES } from '../../../packages/shared/src/eval/real-adapter-facts';

afterEach(() => { vi.restoreAllMocks(); });

/** 受控桩适配器：真实种类 + 回放轨迹 + 真实能力集合，不调模型 */
function controlledRealStub() {
  return {
    ...createDryRunReplayAdapter(),
    kind: 'real' as const,
    provenance: 'real-execution' as const,
    declaredCapabilities: REAL_ADAPTER_CAPABILITIES,
  };
}

describe('工单 05: 三入口组合根决策', () => {
  it('TC08-1: dry-run 入口解析为回放适配器', () => {
    expect(resolveAdapterKind({ isDryRun: true, confirmRealRun: false })).toBe('replay');
  });

  it('TC08-2: 未显式确认的真实档不注入真实适配器', () => {
    expect(resolveAdapterKind({ isDryRun: false, confirmRealRun: false })).toBe('none');
  });

  it('TC08-3: 显式确认的真实档解析为真实执行适配器', () => {
    expect(resolveAdapterKind({ isDryRun: false, confirmRealRun: true })).toBe('real');
  });

  it('TC08-4: 三个入口（dry-run / smoke / full）共用同一决策函数', () => {
    const inputs = [
      { isDryRun: true, confirmRealRun: false },
      { isDryRun: false, confirmRealRun: true },
      { isDryRun: false, confirmRealRun: false },
    ];
    for (const input of inputs) {
      expect(resolveAdapterKind(input)).toBe(resolveAdapterKind(input));
    }
    expect(resolveAdapterKind(inputs[0])).toBe('replay');
    expect(resolveAdapterKind(inputs[1])).toBe('real');
    expect(resolveAdapterKind(inputs[2])).toBe('none');
  });

  it('TC08-5: 显式确认档按真实能力集合运行，诚实呈现至少 10 题不可评分且绝不落库', async () => {
    const original = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://probe:probe@127.0.0.1:1/probe';
    try {
      const summary = await runRealAgentBenchmark({
        mode: 'full',
        confirmRealRun: true,
        modelProvider: 'deepseek',
        modelId: 'deepseek-flash',
        adapter: controlledRealStub(),
        persistToDb: true,
      });
      expect(summary.unscoredCases).toBeGreaterThanOrEqual(10);
      expect(summary.isDryRun).toBe(false);
      // 可证伪的静态断言：运行器与消融编排源码均无评测数据库写入
      const runnerSource = readFileSync(new URL('../runner.ts', import.meta.url), 'utf-8');
      const ablationSource = readFileSync(new URL('../ablation.ts', import.meta.url), 'utf-8');
      expect(runnerSource).not.toContain('prisma.agentEvalRun.create');
      expect(ablationSource).not.toContain('prisma.agentEvalRun.create');
    } finally {
      if (original === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = original;
    }
  });

  it('TC08-6: 消融真实档三组编排经同一接缝注入桩适配器，不调模型且无落库', async () => {
    const result = await runAblationSuite({
      isDryRun: false,
      confirmRealRun: true,
      adapterFactory: () => controlledRealStub(),
    });
    expect(result.runs).toHaveLength(3);
    expect(result.corpusFingerprintValid).toBe(true);
    for (const run of result.runs) {
      expect(run.totalCases).toBe(40);
      expect(run.unscoredCases).toBeGreaterThanOrEqual(10);
      expect(run.isDryRun).toBe(false);
    }
    // 三组编排共享同一 suiteId 与同一被测模型（严格对照约束）
    expect(new Set(result.runs.map((r) => r.suiteId)).size).toBe(1);
  });

  it('TC08-7: 消融真实档逐组产出 Markdown 报告（P-M6）', async () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const result = await runAblationSuite({
      isDryRun: false,
      confirmRealRun: true,
      adapterFactory: () => controlledRealStub(),
    });
    printAblationMatrix(result);
    const printed = logSpy.mock.calls.map((c) => c.join(' ')).join('\n');
    // 三组报告均含「本次未写数据库」与三态分列，与 CLI 真实档口径一致
    expect(printed).toContain('消融真实档报告');
    expect(printed).toContain('本次未写数据库');
    expect((printed.match(/消融真实档报告/g) || []).length).toBe(3);
  });
});
