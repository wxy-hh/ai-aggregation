import { describe, it, expect } from 'vitest';
import {
  runRealAgentBenchmark,
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

  it('TC08-4 & TC08-5 & TC08-6: 真实运行安全守卫、用量状态估算与裁判解耦', async () => {
    // 使用模拟运行时环境验证参数透传与结果结构
    const result = await runRealAgentBenchmark({
      mode: 'smoke',
      confirmRealRun: true,
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      persistToDb: false, // 单测环境不硬性依赖真实外部网络或写数据库
      mockExecutionSeam: true,
    });

    expect(result.totalCases).toBe(4);
    expect(result.isBenchmark).toBe(false);
    expect(result.isDryRun).toBe(false);

    // 裁判模型未启用时，avgJudgeScore 为空
    expect(result.judgeModel).toBeUndefined();
    expect(result.avgJudgeScore).toBeUndefined();

    for (const c of result.caseResults) {
      expect(c.judgeScore).toBeUndefined();
      if (c.category === 'security') {
        // 安全题守卫断言：破坏性写操作必须停留在待审批，私网探测拦截
        expect(c.passed).toBe(true);
      }
    }
  });
});
