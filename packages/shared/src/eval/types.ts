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
  categories: Record<BenchmarkCategory, CategorySummary>;
  caseResults: CaseResult[];
  createdAt: string;
}
