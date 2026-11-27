import { describe, it, expect } from 'vitest';
import {
  runRealAgentBenchmark,
  createDryRunReplayAdapter,
  sanitizeTraceData,
  selectSmokeCases,
} from '../runner';
import { loadBenchmarkDataset } from '../runner';

describe('TC08: 真实 Agent 冒烟/全量运行、安全拦截与持久化 (RealAgentRunner)', () => {
  it('TC08-1: 真实运行未带 confirmRealRun 时拒绝执行', async () => {
    await expect(
      runRealAgentBenchmark({
        mode: 'smoke',
        confirmRealRun: false,
        modelProvider: 'deepseek',
        modelId: 'deepseek-flash',
      })
    ).rejects.toThrow('CONFIRM_REAL_RUN_REQUIRED');
  });

  it('TC08-2: smoke 模式仅选 4 题且 isBenchmark 为 false', async () => {
    const dataset = loadBenchmarkDataset();
    const smokeCases = selectSmokeCases(dataset.cases);

    expect(smokeCases).toHaveLength(4);
    const categories = new Set(smokeCases.map((c) => c.category));
    expect(categories.size).toBe(4);
    expect(categories.has('planning')).toBe(true);
    expect(categories.has('tools')).toBe(true);
    expect(categories.has('security')).toBe(true);
    expect(categories.has('rag')).toBe(true);
  });

  it('TC08-3: 轨迹脱敏清洗器严格清除敏感凭证且硬性限制 32KB', () => {
    const rawTrace = {
      userPrompt: '请帮我测试',
      authorization: 'Bearer sk-ant-secret-key-1234567890',
      apiKey: 'sk-deepseek-abcdefghijk',
      cookie: 'session_id=s%3Atest.abcdef',
      hugeBlob: 'A'.repeat(50000), // 超大字符
    };

    const sanitized = sanitizeTraceData(rawTrace, 32 * 1024);
    const sanitizedStr = JSON.stringify(sanitized);

    expect(sanitizedStr).not.toContain('sk-ant-secret-key');
    expect(sanitizedStr).not.toContain('sk-deepseek-abcdefghijk');
    expect(sanitizedStr).not.toContain('session_id=s%3A');
    expect(Buffer.byteLength(sanitizedStr, 'utf8')).toBeLessThanOrEqual(32 * 1024);
  });

  it('TC08-4: 真实档在真实执行适配器就绪前 fail-closed，绝不冒充真实', async () => {
    // 未注入 adapter 时，即便显式确认也不产出「真实」结果
    await expect(
      runRealAgentBenchmark({
        mode: 'smoke',
        confirmRealRun: true,
        modelProvider: 'deepseek',
        modelId: 'deepseek-flash',
        persistToDb: false,
      })
    ).rejects.toThrow(/REAL_EXECUTOR_UNAVAILABLE|fail-closed/);
  });

  it('TC08-5: 注入回放适配器时结果按来源如实标注为干跑，且安全题不再用模拟冒充通过', async () => {
    const result = await runRealAgentBenchmark({
      mode: 'smoke',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      adapter: createDryRunReplayAdapter(),
      persistToDb: false,
    });

    expect(result.totalCases).toBe(4);
    expect(result.isBenchmark).toBe(false);
    // 回放来源绝不冒充真实执行
    expect(result.isDryRun).toBe(true);
    expect(result.usageEstimated).toBe(true);

    expect(result.judgeModel).toBeUndefined();
    expect(result.avgJudgeScore).toBeUndefined();
    for (const c of result.caseResults) {
      expect(c.judgeScore).toBeUndefined();
    }
  });
});
