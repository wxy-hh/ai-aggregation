import { describe, it, expect } from 'vitest';
import type { BenchmarkCase } from '../../../packages/shared/src/eval/types';
import {
  requiredFactsFor,
  classifyExecution,
  convergeRunCounts,
} from '../../../packages/shared/src/eval/capability-matrix';

/** 构造最小用例，只带影响能力矩阵推导的 expected 字段 */
function makeCase(id: string, category: BenchmarkCase['category'], expected: BenchmarkCase['expected']): BenchmarkCase {
  return { id, category, title: id, prompt: '', expected };
}

describe('工单 03: 预声明能力矩阵与三态归类', () => {
  it('TC04-1: requiredFactsFor 从 expected 推导所需裁决事实', () => {
    expect(requiredFactsFor(makeCase('r1', 'rag', { expectedChunkIds: ['eval-kb-chunk-01'] }))).toContain('chunks_retrieved');
    expect(requiredFactsFor(makeCase('s1', 'security', { requireSsrfBlock: true }))).toContain('ssrf_blocked');
    expect(requiredFactsFor(makeCase('s2', 'security', { requireApprovalIntercept: true }))).toContain('approval_intercepted');
    expect(requiredFactsFor(makeCase('p1', 'planning', { minCheckpoints: 2 }))).toContain('plan_created');
  });

  it('TC04-2: 能力外（缺观测能力）判为未评分，能力内未满足断言判为未通过', () => {
    const ragCase = makeCase('r1', 'rag', { expectedChunkIds: ['eval-kb-chunk-01'] });
    const declaredCapabilities = new Set<string>(); // 适配器声明无 chunks_retrieved 观测能力

    const unscored = classifyExecution({
      testCase: ragCase,
      declaredCapabilities,
      executionSucceeded: true,
      grade: { passed: false, score: 0 },
    });
    expect(unscored.status).toBe('unscored');
    expect(unscored.missingFacts).toContain('chunks_retrieved');

    const failed = classifyExecution({
      testCase: ragCase,
      declaredCapabilities: new Set(['chunks_retrieved']),
      executionSucceeded: true,
      grade: { passed: false, score: 0, errorDetail: '金标切片检索遗漏' },
    });
    expect(failed.status).toBe('failed');
  });

  it('TC04-3: 能力范围内但模型未调用工具，不得借「流里没有事件」免责', () => {
    const toolCase = makeCase('t1', 'tools', { expectedToolName: 'knowledge_search' });
    const result = classifyExecution({
      testCase: toolCase,
      declaredCapabilities: new Set(['tool_call']),
      executionSucceeded: true,
      grade: { passed: false, score: 0, errorDetail: '目标工具不匹配' },
      observedFacts: [], // 适配器确实能观测 tool_call，但本次流里没有任何 tool_call 事件
    });
    expect(result.status).toBe('failed');
  });

  it('TC04-4: 超时 / 异常 / 中止单独记为执行错误', () => {
    const ragCase = makeCase('r1', 'rag', { expectedChunkIds: ['eval-kb-chunk-01'] });
    for (const reason of ['timeout', 'error', 'aborted'] as const) {
      const result = classifyExecution({
        testCase: ragCase,
        declaredCapabilities: new Set(['chunks_retrieved']),
        executionSucceeded: false,
        abnormalReason: reason,
        grade: { passed: false, score: 0 },
      });
      expect(result.status).toBe('execution_error');
    }
  });

  it('TC04-5: 结果不变量 已评分 + 未评分 + 执行错误 = 总题数，通过率仅以已评分题为分母', () => {
    const counts = convergeRunCounts([
      { status: 'passed' },
      { status: 'failed' },
      { status: 'unscored' },
      { status: 'execution_error' },
    ]);
    expect(counts.totalCases).toBe(4);
    expect(counts.scoredCases).toBe(2);
    expect(counts.passedCases).toBe(1);
    expect(counts.unscoredCases).toBe(1);
    expect(counts.executionErrors).toBe(1);
    expect(counts.scoredCases + counts.unscoredCases + counts.executionErrors).toBe(counts.totalCases);
    expect(counts.passRate).toBe(0.5);
  });
});
