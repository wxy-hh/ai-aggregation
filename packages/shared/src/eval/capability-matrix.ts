import type { BenchmarkCase, CaseGradingResult, TraceEventType } from './types';

/** 用例状态：已评分（通过/未通过）、未评分、执行错误 */
export type CaseOutcomeStatus = 'passed' | 'failed' | 'unscored' | 'execution_error';

/**
 * 从用例期望推导裁决所需的事实类型（预先声明，不依赖执行后观察到的事件）。
 * 与 gradeCaseResult 的分支逐一对应。
 */
export function requiredFactsFor(testCase: BenchmarkCase): TraceEventType[] {
  const { category, expected } = testCase;
  const facts: TraceEventType[] = [];

  // 与 gradeCaseResult 的分支顺序逐字对齐（链式 else-if 语义），避免两套期望映射口径不一
  if (category === 'planning') {
    facts.push('plan_created');
    if (expected.requireFinalAnswer !== false) facts.push('final_answer');
  } else if (category === 'tools') {
    if (!expected.noToolExpected) facts.push('tool_call');
  } else if (category === 'security') {
    if (expected.requireApprovalIntercept) {
      facts.push('approval_intercepted');
    } else if (expected.requireSsrfBlock) {
      facts.push('ssrf_blocked');
    } else if (expected.requireRejection) {
      facts.push('final_answer');
    }
  } else if (category === 'rag') {
    if (expected.requireRejection) {
      facts.push('final_answer');
    } else {
      if (expected.expectedChunkIds && expected.expectedChunkIds.length > 0) facts.push('chunks_retrieved');
      if (expected.requireCitations) facts.push('final_answer');
    }
  }

  return facts;
}

export interface ClassificationInput {
  testCase: BenchmarkCase;
  /** 适配器在执行前声明的可观测能力集合 */
  declaredCapabilities: Set<string>;
  /** 执行是否成功完成（超时/异常/中止为 false） */
  executionSucceeded: boolean;
  abnormalReason?: 'timeout' | 'error' | 'aborted';
  /** 确定性裁决结果（纯函数产出） */
  grade: Pick<CaseGradingResult, 'passed' | 'score' | 'errorDetail'>;
  /** 实际观察到的事实类型，仅用于记录，不参与「能力外」判定 */
  observedFacts?: string[];
}

export interface ClassificationResult {
  status: CaseOutcomeStatus;
  /** 超出适配器观测能力、导致未评分的事实类型 */
  missingFacts: string[];
  errorDetail?: string;
}

/**
 * 三态归类：能力外 = 未评分、能力内未满足断言 = 未通过、执行异常 = 执行错误。
 * 判定依据是「预先声明的能力矩阵」与「grade 结果」，绝不因执行后发现事件不存在即免评分。
 */
export function classifyExecution(input: ClassificationInput): ClassificationResult {
  if (!input.executionSucceeded) {
    return {
      status: 'execution_error',
      missingFacts: [],
      errorDetail: input.abnormalReason ? `执行错误：${input.abnormalReason}` : '执行错误',
    };
  }

  const required = requiredFactsFor(input.testCase);
  const missing = required.filter((fact) => !input.declaredCapabilities.has(fact));

  if (missing.length > 0) {
    return {
      status: 'unscored',
      missingFacts: missing,
      errorDetail: `观测能力缺失：${missing.join('、')}，本题未评分`,
    };
  }

  // 能力范围内：按确定性裁决结果判定，与「本次流里有没有事件」无关
  return {
    status: input.grade.passed ? 'passed' : 'failed',
    missingFacts: [],
    errorDetail: input.grade.errorDetail,
  };
}

export interface RunCounts {
  totalCases: number;
  scoredCases: number;
  passedCases: number;
  unscoredCases: number;
  executionErrors: number;
  passRate: number;
}

/** 结果不变量：已评分 + 未评分 + 执行错误 = 总题数；通过率仅以已评分题为分母 */
export function convergeRunCounts(statuses: Array<{ status: CaseOutcomeStatus }>): RunCounts {
  const totalCases = statuses.length;
  const passedCases = statuses.filter((s) => s.status === 'passed').length;
  const failedCases = statuses.filter((s) => s.status === 'failed').length;
  const scoredCases = passedCases + failedCases;
  const unscoredCases = statuses.filter((s) => s.status === 'unscored').length;
  const executionErrors = statuses.filter((s) => s.status === 'execution_error').length;
  const passRate = scoredCases > 0 ? passedCases / scoredCases : 0;
  return { totalCases, scoredCases, passedCases, unscoredCases, executionErrors, passRate };
}
