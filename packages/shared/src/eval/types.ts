export type BenchmarkCategory = 'planning' | 'tools' | 'security' | 'rag';

export interface BenchmarkCaseExpected {
  // 规划题
  minCheckpoints?: number;
  requireFinalAnswer?: boolean;

  // 工具题
  expectedToolName?: string;
  validateArgs?: (args: unknown) => boolean;
  noToolExpected?: boolean;

  // 安全题
  requireApprovalIntercept?: boolean;
  requireSsrfBlock?: boolean;
  requireRejection?: boolean;

  // RAG 题
  expectedChunkIds?: string[];
  requireCitations?: boolean;
}

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCategory;
  title: string;
  prompt: string;
  expected: BenchmarkCaseExpected;
  meta?: Record<string, unknown>;
}

export interface BenchmarkDataset {
  version: string;
  name: string;
  description: string;
  cases: BenchmarkCase[];
}

export type TraceEventType =
  | 'plan_created'
  | 'checkpoint_updated'
  | 'tool_call'
  | 'approval_intercepted'
  | 'ssrf_blocked'
  | 'http_fetch'
  | 'chunks_retrieved'
  | 'final_answer'
  | 'error';

export interface EvalPlanCheckpoint {
  id: string;
  title: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface EvalTracePlan {
  id: string;
  title: string;
  checkpoints: EvalPlanCheckpoint[];
}

export interface EvalRetrievedChunk {
  chunkId: string;
  score?: number;
  content: string;
}

export interface TraceEvent {
  type: TraceEventType;
  timestamp: number;
  plan?: EvalTracePlan;
  checkpointId?: string;
  checkpointStatus?: string;
  toolName?: string;
  /** 配对标识：工具调用与结果按 callId 精确配对，审批挂起的调用不得算作已执行写操作 */
  callId?: string;
  args?: unknown;
  status?: string | number;
  approvalToken?: string;
  targetUrl?: string;
  reason?: string;
  chunks?: EvalRetrievedChunk[];
  content?: string;
  citations?: string[];
  error?: string;
}

export interface CaseGradingResult {
  passed: boolean;
  score: number; // 0.0 或 1.0
  judgeScore?: number; // 1.0 ~ 5.0 (可选裁判模型打分)
  errorDetail?: string;
  latencyMs?: number;
  tokensUsed?: number;
}

export interface CaseResult extends CaseGradingResult {
  caseId: string;
  category: BenchmarkCategory;
  title: string;
  traceEvents: TraceEvent[];
  /** 三态：通过 / 未通过 / 未评分 / 执行错误 */
  status?: 'passed' | 'failed' | 'unscored' | 'execution_error';
  /** 未评分时写明超出观测能力的裁决事实类型 */
  missingFacts?: string[];
  /** 该项裁决事实与计量事实的来源（用例级） */
  provenance?: 'real-execution' | 'replay' | 'estimated' | 'missing';
  /** 事实级来源：按裁决事实类型标注每项事实的出处（US 22 / TC06-4） */
  factProvenance?: Record<string, 'real-execution' | 'replay' | 'estimated' | 'missing'>;
}

export interface CategorySummary {
  category: BenchmarkCategory;
  total: number;
  passed: number;
  passRate: number;
  avgLatencyMs: number;
  totalTokens: number;
}

export interface BenchmarkRunSummary {
  id: string;
  suiteId?: string;
  datasetVersion: string;
  modelProvider: string;
  modelId: string;
  isDryRun: boolean;
  isBenchmark: boolean;
  totalCases: number;
  passedCases: number;
  passRate: number;
  avgLatencyMs: number;
  totalTokens: number;
  usageEstimated: boolean;
  estimatedCostRmb: number;
  scoredCases: number;
  unscoredCases: number;
  executionErrors: number;
  categories: Record<BenchmarkCategory, CategorySummary>;
  caseResults: CaseResult[];
  /** 本次执行的事实来源层级（编排级真实执行 / 固定回放） */
  provenance?: 'real-execution' | 'replay' | 'estimated' | 'missing';
  /** 本轮真实档未写数据库，报告据此显式标注 */
  persistedToDb?: boolean;
  createdAt: string;
}
