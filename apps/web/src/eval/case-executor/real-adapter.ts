/**
 * 真实 Case Executor 适配器（工单 04，ADR-0067）：
 * 在 web 评测侧复用与线上同一 runAgent 与既有 collectChatEvents，
 * 把生产 SSE 事件投影为裁决轨迹，并从 onFinish 完成回调提取真实用量与耗时。
 *
 * 边界：编排级真实执行（OrchestrationLevelExecution），绕过 HTTP 入口、认证与配额结算；
 * 受控评测身份 + 显式空工具集合，不挂载私有 Webhook / MCP 工具，不自动审批，不放宽安全守卫；
 * 本轮不写任何评测数据库表。真实模型冒烟为人工可选验证，自动化用例只走受控流/完成回调。
 */
import type { ChatStreamEvent } from '@repo/shared';
import type { CaseExecutor, CaseExecution } from '../../../../../packages/shared/src/eval/case-executor';
import type { BenchmarkCase } from '../../../../../packages/shared/src/eval/types';
import {
  projectChatEventsToTrace,
  type ProjectableChatEvent,
} from '../../../../../packages/shared/src/eval/fact-normalization';
import {
  extractFinishFacts,
  REAL_ADAPTER_CAPABILITIES,
} from '../../../../../packages/shared/src/eval/real-adapter-facts';
import { createToolRegistry } from '@/lib/agent/registry';
import { runAgent } from '../../app/api/chat/_lib/agent/agent-runner';
import { collectChatEvents } from '../artifact-patch/runner';
import {
  AGENT_MAX_STEPS,
  AGENT_MODEL,
  AGENT_PROVIDER,
  AGENT_STEP_OUTPUT_LIMIT,
  AGENT_SUMMARY_OUTPUT_LIMIT,
} from '../../app/api/chat/_lib/agent/agent-config';
import type { ChatStreamFinish } from '../../app/api/chat/_lib/types';

/** 受控评测身份：不复用任何真实用户身份 */
const CONTROLLED_EVAL_USER_ID = 'eval-case-executor-controlled';

/** 单次真实调用的墙钟超时，与线上整请求运行预算一致 */
const REAL_RUN_TIMEOUT_MS = 240_000;

/** 把生产 SSE 事件转换为可投影的结构化子集（字段形状归一层，不复制解析逻辑） */
function toProjectable(events: ChatStreamEvent[]): ProjectableChatEvent[] {
  return events.map((e) => {
    if (e.type === 'plan_created') {
      return {
        type: 'plan_created',
        plan: {
          id: e.plan.id,
          title: e.plan.title,
          checkpoints: e.plan.steps.map((s) => ({
            id: s.id,
            title: s.title,
            status: s.status as 'pending' | 'in_progress' | 'completed' | 'failed',
          })),
        },
      };
    }
    if (e.type === 'plan_step_update') {
      // 生产阶段更新事件必须进入折叠，否则规划题永远停在初始 pending（P-W1 / S-H5）
      return { type: 'plan_step_update', stepId: e.stepId, status: e.status };
    }
    if (e.type === 'tool_call') {
      return { type: 'tool_call', call: e.call };
    }
    if (e.type === 'tool_result') {
      return { type: 'tool_result', callId: e.callId, name: e.name, status: e.status, summary: e.summary };
    }
    if (e.type === 'tool_approval_request') {
      return { type: 'tool_approval_request', approval: e.approval };
    }
    if (e.type === 'text-delta') {
      return { type: 'text-delta', text: e.text };
    }
    // done / agent_note / warning / error / artifact_* / plan_step_update 等一律不投影为裁决事实
    return { type: e.type };
  });
}

/** 构造真实执行适配器；声明的能力集合来自生产 SSE 的真实观测面 */
export function createRealAgentAdapter(): CaseExecutor {
  return {
    kind: 'real',
    provenance: 'real-execution',
    declaredCapabilities: REAL_ADAPTER_CAPABILITIES,
    async executeCase(testCase: BenchmarkCase): Promise<CaseExecution> {
      const controller = new AbortController();
      let localTimedOut = false;
      const timer = setTimeout(() => { localTimedOut = true; controller.abort(); }, REAL_RUN_TIMEOUT_MS);
      let finish: ChatStreamFinish | null = null;

      try {
        const stream = runAgent({
          userId: CONTROLLED_EVAL_USER_ID,
          provider: AGENT_PROVIDER,
          model: AGENT_MODEL,
          messages: [{ role: 'user', content: testCase.prompt }],
          stepOutputLimit: AGENT_STEP_OUTPUT_LIMIT,
          summaryOutputLimit: AGENT_SUMMARY_OUTPUT_LIMIT,
          maxSteps: AGENT_MAX_STEPS,
          signal: controller.signal,
          errorId: `eval-case-${testCase.id}`,
          // 显式空工具集合：不挂载任何私有 Webhook / MCP 工具，不自动审批、不放宽守卫
          runtime: {
            registry: createToolRegistry([]),
            finishMetadata: () => ({ webhookCalls: 0 }),
          },
          onFinish: async (f) => { finish = f; },
        });

        const events = await collectChatEvents(stream);
        const traceEvents = projectChatEventsToTrace(toProjectable(events));
        const facts = extractFinishFacts({
          ...(finish ?? {}),
          localTimedOut,
        });

        return {
          traceEvents,
          // 真实观测缺口由能力矩阵在编排层判定；此处只记录本次流里确实缺失的事实类型
          missingFacts: [],
          ...facts,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
