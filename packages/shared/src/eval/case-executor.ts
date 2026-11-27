import type { BenchmarkCase, TraceEvent } from './types';

/**
 * 评测事实来源（EvalFactProvenance）：区分真实执行、固定回放、估算与缺失。
 * 实现概念，不属于领域术语字典；用于让每项事实的出处可复核。
 */
export type EvalFactProvenance = 'real-execution' | 'replay' | 'estimated' | 'missing';

/** 单次用例执行的计量事实 */
export interface CaseUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens: number;
}

/**
 * 用例执行结果：裁决事实与计量事实分开，各自带来源，避免把回放或估算冒充真实观测。
 * missingFacts 由预声明观测能力矩阵填充（工单 03 落地），本阶段为最小形状。
 */
export interface CaseExecution {
  traceEvents: TraceEvent[];
  missingFacts: string[];
  usage: CaseUsage;
  latencyMs: number;
  usageEstimated: boolean;
  provenance: EvalFactProvenance;
  /** 执行是否成功完成；超时/异常/中止为 false，由适配器从完成回调终态推导 */
  executionSucceeded?: boolean;
  abnormalReason?: 'timeout' | 'error' | 'aborted';
}

/**
 * CaseExecutor：评测运行器唯一接缝。运行器只消费该接口，不感知适配器内部。
 * kind 用于区分回放与真实执行；provenance 声明该适配器产出的事实来源。
 */
export interface CaseExecutor {
  kind: 'replay' | 'real';
  provenance: EvalFactProvenance;
  /** 执行前声明的可观测能力集合，与用例所需事实比对产生未评分态 */
  declaredCapabilities?: Set<string>;
  executeCase(testCase: BenchmarkCase): Promise<CaseExecution> | CaseExecution;
}

