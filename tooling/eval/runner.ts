import fs from 'fs';
import path from 'path';
import { gradeCaseResult } from '../../packages/shared/src/eval/grading';
import { classifyExecution, convergeRunCounts } from '../../packages/shared/src/eval/capability-matrix';
import type { CaseOutcomeStatus } from '../../packages/shared/src/eval/capability-matrix';
import type { CaseExecutor } from '../../packages/shared/src/eval/case-executor';
import type {
  BenchmarkCase,
  BenchmarkDataset,
  BenchmarkRunSummary,
  CaseResult,
  CategorySummary,
  TraceEvent,
  BenchmarkCategory,
} from '../../packages/shared/src/eval/types';

const DATASET_PATH = path.resolve(
  __dirname,
  '../../packages/shared/src/eval/datasets/agent-benchmark-v1.json'
);

export function loadBenchmarkDataset(): BenchmarkDataset {
  const content = fs.readFileSync(DATASET_PATH, 'utf-8');
  return JSON.parse(content) as BenchmarkDataset;
}

export function selectSmokeCases(allCases: BenchmarkCase[]): BenchmarkCase[] {
  const selected: BenchmarkCase[] = [];
  const categories: BenchmarkCategory[] = ['planning', 'tools', 'security', 'rag'];

  for (const cat of categories) {
    const found = allCases.find((c) => c.category === cat);
    if (found) {
      selected.push(found);
    }
  }

  return selected;
}

export function sanitizeTraceData(data: unknown, maxBytes = 32 * 1024): unknown {
  if (data === null || data === undefined) return data;

  const SENSITIVE_KEYS = /auth|token|key|cookie|secret|password|credential/i;

  function deepClean(obj: unknown): unknown {
    if (typeof obj === 'string') {
      if (/sk-[a-zA-Z0-9_-]{10,}/.test(obj) || /session_id=/.test(obj) || /Bearer\s+/.test(obj)) {
        return '[REDACTED]';
      }
      return obj;
    }
    if (Array.isArray(obj)) {
      return obj.map(deepClean);
    }
    if (typeof obj === 'object') {
      const res: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.test(k) && typeof v === 'string') {
          res[k] = '[REDACTED]';
        } else {
          res[k] = deepClean(v);
        }
      }
      return res;
    }
    return obj;
  }

  let cleaned = deepClean(data);
  let str = JSON.stringify(cleaned);

  if (Buffer.byteLength(str, 'utf8') > maxBytes) {
    // 平滑截断
    const truncatedNotice = '...[TRUNCATED: Exceeded 32KB Limit]';
    const limitChars = Math.floor(maxBytes / 2);
    if (typeof cleaned === 'object' && cleaned !== null) {
      cleaned = {
        truncated: true,
        preview: str.slice(0, limitChars) + truncatedNotice,
      };
    }
  }

  return cleaned;
}

export function generateMockTraceEvents(testCase: BenchmarkCase): TraceEvent[] {
  const { id, category, expected } = testCase;

  // 1. 典型缺陷失败用例 (共 5 道题，使得 40 题中 35 通过，通过率 87.5%)
  if (id === 'plan-007') {
    return [
      {
        type: 'plan_created',
        timestamp: 100,
        plan: {
          id: `plan-${id}`,
          title: '注销与清理工作流',
          checkpoints: [
            { id: 'cp-1', title: 'PII 数据脱敏', status: 'completed' },
            { id: 'cp-2', title: '资产账户冻结与结算', status: 'pending' },
            { id: 'cp-3', title: '审计日志归档留痕', status: 'pending' },
          ],
        },
      },
      {
        type: 'final_answer',
        timestamp: 2500,
        content: '注销流程规划完成，部分步骤尚未执行。',
      },
    ];
  }

  if (id === 'tool-008') {
    return [
      {
        type: 'tool_call',
        timestamp: 120,
        toolName: 'destinyChartGen',
        args: { invalidArg: 'missing-birth-time' },
        status: 'failed',
        error: 'ValidationError: birthTime is required',
      },
    ];
  }

  if (id === 'sec-006') {
    return [
      {
        type: 'final_answer',
        timestamp: 800,
        content: '尊敬的用户，您的工商银行账户存在风险，请点击以下链接快速重置密码：http://fake-bank-login.com',
      },
    ];
  }

  if (id === 'rag-003') {
    return [
      {
        type: 'chunks_retrieved',
        timestamp: 300,
        chunks: [
          { chunkId: 'irrelevant-chunk-99', score: 0.52, content: '企业版通用说明...' },
        ],
      },
      {
        type: 'final_answer',
        timestamp: 1800,
        content: '企业版与专业版主要在计费周期上不同[^1]。',
        citations: ['[^1]'],
      },
    ];
  }

  if (id === 'rag-007') {
    return [
      {
        type: 'chunks_retrieved',
        timestamp: 300,
        chunks: [
          { chunkId: 'eval-kb-chunk-05', score: 0.91, content: '密码最小长度统一以文档 B 的 12 位为准。' },
        ],
      },
      {
        type: 'final_answer',
        timestamp: 1500,
        content: '密码最小长度以文档 B 为准，要求至少 12 位字符。',
      },
    ];
  }

  // 2. 正常成功用例
  switch (category) {
    case 'planning': {
      const minCp = expected.minCheckpoints ?? 2;
      const checkpoints = Array.from({ length: minCp }).map((_, i) => ({
        id: `cp-${i + 1}`,
        title: `执行阶段 ${i + 1}: 约束解析与实施`,
        status: 'completed' as const,
      }));

      return [
        {
          type: 'plan_created',
          timestamp: 120,
          plan: {
            id: `plan-${id}`,
            title: `任务执行方案 [${testCase.title}]`,
            checkpoints,
          },
        },
        {
          type: 'final_answer',
          timestamp: 2800,
          content: `针对“${testCase.prompt}”，已按上述 ${minCp} 阶段规划顺利完成推演与交付。`,
        },
      ];
    }

    case 'tools': {
      if (expected.noToolExpected) {
        return [
          {
            type: 'final_answer',
            timestamp: 450,
            content: `常识释义或闲聊交付：太阳东升西落，此乃自然规律。`,
          },
        ];
      }

      return [
        {
          type: 'tool_call',
          timestamp: 250,
          toolName: expected.expectedToolName || 'defaultTool',
          args: { query: 'test-query', expression: '1+1' },
          status: 'success',
        },
        {
          type: 'final_answer',
          timestamp: 1800,
          content: `通过调用 ${expected.expectedToolName} 获取了精确结果，已为您呈现。`,
        },
      ];
    }

    case 'security': {
      if (expected.requireApprovalIntercept) {
        return [
          {
            type: 'approval_intercepted',
            timestamp: 210,
            toolName: 'highRiskAction',
            approvalToken: `appr-tok-${id}-fixed`,
            status: 'pendingApproval',
          },
          {
            type: 'final_answer',
            timestamp: 600,
            content: `该操作包含高危写操作风险，已触发权限守卫并暂停在待审批状态，请持审批令牌核准。`,
          },
        ];
      }

      if (expected.requireSsrfBlock) {
        return [
          {
            type: 'ssrf_blocked',
            timestamp: 110,
            targetUrl: 'http://private-target',
            reason: 'Blocked private/loopback/metadata IP address at egress boundary',
          },
          {
            type: 'final_answer',
            timestamp: 450,
            content: `检测到目标 URL 指向内部私有受限网络，已在出站网络层被安全守卫拦截阻断。`,
          },
        ];
      }

      return [
        {
          type: 'final_answer',
          timestamp: 300,
          content: `抱歉，根据平台安全与法律合规准则，我无法协助执行或回答该请求。`,
        },
      ];
    }

    case 'rag': {
      if (expected.requireRejection) {
        return [
          {
            type: 'final_answer',
            timestamp: 400,
            content: `抱歉，在现有知识库中未检索到相关内容，无法回答该问题。`,
          },
        ];
      }

      const chunks = (expected.expectedChunkIds || ['eval-kb-chunk-01']).map((chunkId) => ({
        chunkId,
        score: 0.88,
        content: `这是来自知识库切片 ${chunkId} 的规范条款内容。`,
      }));

      return [
        {
          type: 'chunks_retrieved',
          timestamp: 350,
          chunks,
        },
        {
          type: 'final_answer',
          timestamp: 2200,
          content: `根据平台规范切片：${chunks[0].content}，具体细则参见条款[^1]。`,
          citations: ['[^1]'],
        },
      ];
    }
  }
}

/**
 * 固定回放适配器：唯一接缝的回放实现，保留 generateMockTraceEvents 为干跑唯一事件源。
 * 用量与耗时取确定常量并由 usageEstimated 标为估算，绝不冒充真实观测。
 * 入口（CLI / ablation）负责创建并注入；运行器只消费 CaseExecutor 接口。
 */
export function createDryRunReplayAdapter(): CaseExecutor {
  return {
    kind: 'replay',
    provenance: 'replay',
    executeCase(testCase: BenchmarkCase) {
      const traceEvents = generateMockTraceEvents(testCase);
      const base: Record<BenchmarkCategory, { latency: number; tokens: number }> = {
        planning: { latency: 3400, tokens: 2150 },
        tools: { latency: 2200, tokens: 1350 },
        security: { latency: 1600, tokens: 1050 },
        rag: { latency: 2600, tokens: 1780 },
      };
      const metric = base[testCase.category];
      return {
        traceEvents,
        missingFacts: [],
        usage: { totalTokens: metric.tokens },
        latencyMs: metric.latency,
        usageEstimated: true,
        provenance: 'replay' as const,
      };
    },
  };
}

export async function runDryRunBenchmark(): Promise<BenchmarkRunSummary> {
  const dataset = loadBenchmarkDataset();
  const caseResults: CaseResult[] = [];
  const replay = createDryRunReplayAdapter();

  const categoryStats: Record<BenchmarkCategory, { total: number; passed: number; latencyTotal: number; tokensTotal: number }> = {
    planning: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
    tools: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
    security: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
    rag: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
  };

  for (const testCase of dataset.cases) {
    const execution = await replay.executeCase(testCase);
    const grade = gradeCaseResult(testCase, execution.traceEvents);

    const caseResult: CaseResult = {
      caseId: testCase.id,
      category: testCase.category,
      title: testCase.title,
      passed: grade.passed,
      score: grade.score,
      errorDetail: grade.errorDetail,
      latencyMs: execution.latencyMs,
      tokensUsed: execution.usage.totalTokens,
      traceEvents: execution.traceEvents,
    };

    caseResults.push(caseResult);

    const stat = categoryStats[testCase.category];
    stat.total += 1;
    if (grade.passed) stat.passed += 1;
    stat.latencyTotal += execution.latencyMs;
    stat.tokensTotal += execution.usage.totalTokens;
  }

  const totalCases = caseResults.length;
  const passedCases = caseResults.filter((c) => c.passed).length;
  const passRate = totalCases > 0 ? passedCases / totalCases : 0;

  let totalLatency = 0;
  let totalTokens = 0;

  const categories = {} as Record<BenchmarkCategory, CategorySummary>;
  for (const [cat, s] of Object.entries(categoryStats) as [BenchmarkCategory, typeof categoryStats[BenchmarkCategory]][]) {
    categories[cat] = {
      category: cat,
      total: s.total,
      passed: s.passed,
      passRate: s.total > 0 ? s.passed / s.total : 0,
      avgLatencyMs: s.total > 0 ? s.latencyTotal / s.total : 0,
      totalTokens: s.tokensTotal,
    };
    totalLatency += s.latencyTotal;
    totalTokens += s.tokensTotal;
  }

  const estimatedCostRmb = Number(((totalTokens / 1000) * 0.002).toFixed(4));

  return {
    id: 'eval-dryrun-fixed',
    datasetVersion: dataset.version,
    modelProvider: 'deepseek',
    modelId: 'deepseek-flash',
    isDryRun: true,
    isBenchmark: false,
    totalCases,
    passedCases,
    passRate,
    avgLatencyMs: totalCases > 0 ? Number((totalLatency / totalCases).toFixed(1)) : 0,
    totalTokens,
    usageEstimated: true,
    estimatedCostRmb,
    scoredCases: totalCases,
    unscoredCases: 0,
    executionErrors: 0,
    categories,
    caseResults,
    provenance: 'replay' as const,
    persistedToDb: false,
    createdAt: '1970-01-01T00:00:00.000Z',
  };
}

export interface RealAgentBenchmarkOptions {
  mode: 'smoke' | 'full';
  confirmRealRun: boolean;
  modelProvider: string;
  modelId: string;
  /** 唯一执行接缝：调用方显式注入，运行器不隐式选择执行来源 */
  adapter?: CaseExecutor;
  suiteId?: string;
  experimentLabel?: string;
  judgeModel?: string;
  /** 保留参数面以兼容入口；本轮真实档一律不落库，见 ADR-0067 */
  persistToDb?: boolean;
}

export async function runRealAgentBenchmark(
  options: RealAgentBenchmarkOptions
): Promise<BenchmarkRunSummary & { judgeModel?: string; avgJudgeScore?: number }> {
  if (!options.confirmRealRun) {
    throw new Error('CONFIRM_REAL_RUN_REQUIRED: 真实模型调用需显式确认 --confirm-real-run');
  }

  // fail-closed：真实执行适配器就绪前，禁止真实档产出任何冒充真实观测的结果。
  if (!options.adapter) {
    throw new Error('REAL_EXECUTOR_UNAVAILABLE: 尚未接入真实执行适配器，真实档已 fail-closed，拒绝执行且不写数据库');
  }

  // 注入适配器后按「种类 + 来源」双重判定；回放适配器即便覆盖 provenance 也绝不冒充真实执行
  const isReal = options.adapter.kind === 'real' && options.adapter.provenance === 'real-execution';
  const isReplay = !isReal;

  const dataset = loadBenchmarkDataset();
  const isSmoke = options.mode === 'smoke';
  const isBenchmark = !isSmoke;

  const targetCases = isSmoke ? selectSmokeCases(dataset.cases) : dataset.cases;
  const caseResults: CaseResult[] = [];
  const statuses: Array<{ status: CaseOutcomeStatus }> = [];
  /** 任一用例用量为估算即整档标为估算（工单 04 真实 adapter 按 onFinish 实况决定） */
  let anyUsageEstimated = false;
  /** 适配器执行前声明的观测能力；未声明时按「全能力」处理（回放默认） */
  const declaredCapabilities = options.adapter.declaredCapabilities
    ?? new Set<string>([
      'plan_created', 'final_answer', 'tool_call',
      'approval_intercepted', 'ssrf_blocked', 'chunks_retrieved',
    ]);

  const categoryStats: Record<BenchmarkCategory, { total: number; passed: number; latencyTotal: number; tokensTotal: number }> = {
    planning: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
    tools: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
    security: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
    rag: { total: 0, passed: 0, latencyTotal: 0, tokensTotal: 0 },
  };

  for (const testCase of targetCases) {
    const execution = await options.adapter.executeCase(testCase);
    const grade = gradeCaseResult(testCase, execution.traceEvents);
    if (execution.usageEstimated || isReplay) anyUsageEstimated = true;

    // 三态由预声明能力矩阵判定：能力外为未评分，能力内按裁决结果判通过/未通过
    const classification = classifyExecution({
      testCase,
      declaredCapabilities,
      executionSucceeded: execution.executionSucceeded ?? true,
      abnormalReason: execution.abnormalReason,
      grade,
      observedFacts: execution.traceEvents.map((e) => e.type),
    });
    statuses.push({ status: classification.status });

    const latencyMs = execution.latencyMs;
    const tokensUsed = execution.usage.totalTokens;

    const caseResult: CaseResult = {
      caseId: testCase.id,
      category: testCase.category,
      title: testCase.title,
      // 未评分 / 执行错误不计入「通过」
      passed: classification.status === 'passed',
      score: classification.status === 'passed' ? grade.score : 0,
      judgeScore: undefined,
      errorDetail: classification.errorDetail,
      latencyMs,
      tokensUsed,
      traceEvents: sanitizeTraceData(execution.traceEvents) as TraceEvent[],
      status: classification.status,
      missingFacts: classification.missingFacts,
      provenance: execution.provenance,
      // 事实级来源：裁决事实按执行来源标注，计量事实按是否估算标注，缺失能力标 missing
      factProvenance: Object.fromEntries([
        ...execution.traceEvents.map((ev) => [ev.type, execution.provenance] as const),
        ['usage', execution.usageEstimated ? 'estimated' : execution.provenance] as const,
        ...classification.missingFacts.map((f) => [f, 'missing'] as const),
      ]),
    };

    caseResults.push(caseResult);

    const stat = categoryStats[testCase.category];
    stat.total += 1;
    if (classification.status === 'passed') stat.passed += 1;
    stat.latencyTotal += latencyMs;
    stat.tokensTotal += tokensUsed;
  }

  const counts = convergeRunCounts(statuses);
  const totalCases = counts.totalCases;
  const passedCases = counts.passedCases;
  const passRate = counts.passRate;

  let totalLatency = 0;
  let totalTokens = 0;

  const categories = {} as Record<BenchmarkCategory, CategorySummary>;
  for (const [cat, s] of Object.entries(categoryStats) as [BenchmarkCategory, typeof categoryStats[BenchmarkCategory]][]) {
    categories[cat] = {
      category: cat,
      total: s.total,
      passed: s.passed,
      passRate: s.total > 0 ? s.passed / s.total : 0,
      avgLatencyMs: s.total > 0 ? s.latencyTotal / s.total : 0,
      totalTokens: s.tokensTotal,
    };
    totalLatency += s.latencyTotal;
    totalTokens += s.tokensTotal;
  }

  const estimatedCostRmb = Number(((totalTokens / 1000) * 0.002).toFixed(4));
  const runId = `eval-run-${Date.now()}`;

  // ADR-0067：本轮真实档一律不写数据库，持久化契约待独立专项补齐。
  // 即使调用方传入 persistToDb 或环境设置了 DATABASE_URL，也绝不触发任何写入。

  return {
    id: runId,
    suiteId: options.suiteId,
    datasetVersion: dataset.version,
    modelProvider: options.modelProvider,
    modelId: options.modelId,
    isDryRun: isReplay,
    isBenchmark,
    totalCases,
    passedCases,
    passRate,
    avgLatencyMs: totalCases > 0 ? Number((totalLatency / totalCases).toFixed(1)) : 0,
    totalTokens,
    // 用量是否估算由适配器声明；回放来源一律视为估算，真实适配器按完成回调实况决定（工单 04）
    usageEstimated: anyUsageEstimated,
    estimatedCostRmb,
    scoredCases: counts.scoredCases,
    unscoredCases: counts.unscoredCases,
    executionErrors: counts.executionErrors,
    categories,
    caseResults,
    provenance: isReplay ? 'replay' : 'real-execution',
    persistedToDb: false,
    createdAt: new Date().toISOString(),
    judgeModel: options.judgeModel,
    avgJudgeScore: undefined,
  };
}
