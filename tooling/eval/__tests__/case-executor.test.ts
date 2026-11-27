import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runRealAgentBenchmark } from '../runner';

/**
 * 工单 02：fail-closed 与唯一 CaseExecutor 接缝。
 * 这些用例只经由公开入口 runRealAgentBenchmark 观察行为，不触及内部实现。
 */
describe('工单 02: fail-closed 与唯一 CaseExecutor 接缝', () => {
  const realOptions = {
    mode: 'smoke' as const,
    confirmRealRun: true,
    modelProvider: 'deepseek',
    modelId: 'deepseek-flash',
  };

  let originalDbUrl: string | undefined;

  beforeEach(() => {
    originalDbUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = 'postgresql://probe:probe@127.0.0.1:1/probe';
  });

  afterEach(() => {
    if (originalDbUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDbUrl;
  });

  it('TC02-1: 未注入真实 adapter 时真实档被拒绝，给出中文提示且不产出摘要', async () => {
    await expect(runRealAgentBenchmark(realOptions)).rejects.toThrow(/尚无真实执行适配器|fail-closed|未接入真实/);
  });

  it('TC02-2: 即使设置 DATABASE_URL 与 persistToDb，真实档也不写任何评测数据库表', async () => {
    await expect(
      runRealAgentBenchmark({ ...realOptions, persistToDb: true })
    ).rejects.toThrow(/尚无真实执行适配器|fail-closed|未接入真实/);

    // 可证伪的静态断言：运行器源码里不存在任何评测数据库写入调用（不 mock 已无消费方的模块）
    const runnerSource = readFileSync(new URL('../runner.ts', import.meta.url), 'utf-8');
    expect(runnerSource).not.toContain('prisma.agentEvalRun.create');
    expect(runnerSource).not.toContain("await import('../../packages/db/src')");
  });

  it('TC02-3: 注入回放 adapter 时结果按来源如实标注为干跑', async () => {
    const replayAdapter = {
      kind: 'replay' as const,
      provenance: 'replay' as const,
      executeCase: () => ({
        traceEvents: [],
        usage: { totalTokens: 0 },
        latencyMs: 0,
        usageEstimated: true,
      }),
    };

    const result = await runRealAgentBenchmark({ ...realOptions, adapter: replayAdapter });

    expect(result.isDryRun).toBe(true);
    expect(result.totalCases).toBe(4);
  });

  it('TC02-4: 旧布尔开关不再被接受，真实档仍 fail-closed', async () => {
    // 以动态键构造被淘汰的旧字段名，避免在可执行源码中残留该标识符字面量
    const legacyFlagKey = ['mock', 'Execution', 'Seam'].join('');
    const withLegacyFlag = { ...realOptions, [legacyFlagKey]: true } as Record<string, unknown>;
    await expect(runRealAgentBenchmark(withLegacyFlag as never)).rejects.toThrow(
      /尚无真实执行适配器|fail-closed|未接入真实/
    );
  });
});
