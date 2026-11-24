import { describe, it, expect } from 'vitest';
import { runAblationSuite } from '../ablation';

describe('TC09: 消融实验批次编排与架构变量切缝 (AblationSuite)', () => {
  it('TC09-1: 消融套件生成唯一 suiteId 并串行执行三组对照实验', async () => {
    const ablationResult = await runAblationSuite({
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      isDryRun: true,
    });

    expect(ablationResult.suiteId).toBeDefined();
    expect(ablationResult.suiteId.startsWith('suite-ablation-')).toBe(true);
    expect(ablationResult.runs).toHaveLength(3);

    const labels = ablationResult.runs.map((r) => r.experimentLabel);
    expect(labels).toEqual(['基准全量组', '混合检索无精排组', '无质检反思组']);

    for (const r of ablationResult.runs) {
      expect(r.suiteId).toBe(ablationResult.suiteId);
      expect(r.runType).toBe('ablation');
    }
  });

  it('TC09-2: 强制锁定同一模型与沙箱语料指纹一致性', async () => {
    const ablationResult = await runAblationSuite({
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      isDryRun: true,
    });

    const providerSet = new Set(ablationResult.runs.map((r) => r.modelProvider));
    const modelSet = new Set(ablationResult.runs.map((r) => r.modelId));
    const versionSet = new Set(ablationResult.runs.map((r) => r.datasetVersion));

    expect(providerSet.size).toBe(1);
    expect(modelSet.size).toBe(1);
    expect(versionSet.size).toBe(1);
    expect(ablationResult.corpusFingerprintValid).toBe(true);
  });

  it('TC09-3: disableEvaluator 与 disableRerank 正确透传且缺省为 false', async () => {
    const ablationResult = await runAblationSuite({
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      isDryRun: true,
    });

    const baselineRun = ablationResult.runs.find((r) => r.experimentLabel === '基准全量组')!;
    const noRerankRun = ablationResult.runs.find((r) => r.experimentLabel === '混合检索无精排组')!;
    const noEvaluatorRun = ablationResult.runs.find((r) => r.experimentLabel === '无质检反思组')!;

    expect(baselineRun.configSnapshot.disableRerank).toBe(false);
    expect(baselineRun.configSnapshot.disableEvaluator).toBe(false);

    expect(noRerankRun.configSnapshot.disableRerank).toBe(true);
    expect(noRerankRun.configSnapshot.disableEvaluator).toBe(false);

    expect(noEvaluatorRun.configSnapshot.disableRerank).toBe(false);
    expect(noEvaluatorRun.configSnapshot.disableEvaluator).toBe(true);
  });

  it('TC09-4: 记录触发时的 commitHash 与 isDirty 状态', async () => {
    const ablationResult = await runAblationSuite({
      modelProvider: 'deepseek',
      modelId: 'deepseek-flash',
      isDryRun: true,
    });

    expect(ablationResult.commitHash).toBeDefined();
    expect(typeof ablationResult.isDirty).toBe('boolean');
    for (const r of ablationResult.runs) {
      expect(r.commitHash).toBe(ablationResult.commitHash);
      expect(r.isDirty).toBe(ablationResult.isDirty);
    }
  });
});
