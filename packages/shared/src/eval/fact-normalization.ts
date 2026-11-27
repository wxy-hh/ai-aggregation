import type { TraceEvent, EvalTracePlan } from './types';

/**
 * 生产注册表下划线工具名 → 数据集期望驼峰名的反向归一映射。
 * grading.ts 的 tools 分支用数据集 expectedToolName（驼峰）逐字比较轨迹 toolName，
 * 故投影必须把生产名还原成数据集口径，方向不能反。
 */
const PRODUCTION_TO_DATASET_TOOL: Record<string, string> = {
  knowledge_search: 'knowledgeSearch',
  web_fetch: 'webFetch',
  web_search: 'webSearch',
  destiny_chart_gen: 'destinyChartGen',
  optimize_image_prompt: 'optimizeImagePrompt',
};

/** 把生产/任意工具名归一到数据集期望口径；已是驼峰或未知名原样返回 */
export function normalizeToolName(name: string): string {
  return PRODUCTION_TO_DATASET_TOOL[name] ?? name;
}

/** 折叠计划初始快照与后续阶段更新，产出终态计划；不把初始快照冒充为已完成 */
export function foldPlanTerminal(events: Array<{
  type: string;
  plan?: EvalTracePlan;
  stepId?: string;
  checkpointId?: string;
  status?: string;
  checkpointStatus?: string;
}>): EvalTracePlan {
  const planEvent = events.find((e) => e.type === 'plan_created' && e.plan);
  if (!planEvent?.plan) {
    return { id: 'plan-empty', title: '', checkpoints: [] };
  }
  const normalizeStatus = (s: string): 'pending' | 'in_progress' | 'completed' | 'failed' =>
    (s === 'running' ? 'in_progress' : s === 'skipped' ? 'failed' : s) as
      'pending' | 'in_progress' | 'completed' | 'failed';
  const checkpoints = planEvent.plan.checkpoints.map((cp) => ({
    ...cp,
    status: normalizeStatus(cp.status),
  }));
  for (const e of events) {
    // 生产事件为 plan_step_update + stepId；checkpoint_updated 是评测侧兼容别名
    if (e.type !== 'plan_step_update' && e.type !== 'checkpoint_updated') continue;
    const id = e.stepId || e.checkpointId;
    const nextStatus = e.status || e.checkpointStatus;
    if (!id || !nextStatus) continue;
    const target = checkpoints.find((cp) => cp.id === id);
    if (target) target.status = normalizeStatus(nextStatus);
  }
  return { ...planEvent.plan, checkpoints };
}

/** 生产 SSE 事件的宽松结构化子集（不依赖 apps/web 内部类型，保持 shared 纯函数） */
export interface ProjectableChatEvent {
  type: string;
  text?: string;
  call?: { id: string; name: string; argsSummary?: string; serverName?: string };
  callId?: string;
  name?: string;
  status?: string;
  summary?: string;
  stepId?: string;
  checkpointId?: string;
  checkpointStatus?: string;
  approval?: { callId: string; toolName: string; token: string; host?: string; params?: Record<string, unknown> };
  plan?: EvalTracePlan;
}

/**
 * 把生产事件投影为裁决所需的 TraceEvent。
 * 纪律：绝不从最终回答文本反推合成 chunks_retrieved / ssrf_blocked / approval_intercepted；
 * done 与 agent_note 不等于 final_answer；工具返回 failed 不反推 ssrf_blocked；
 * tool_call 不预置执行结果，真实成败由配对的 tool_result 决定。
 */
export function projectChatEventsToTrace(events: ProjectableChatEvent[]): TraceEvent[] {
  const trace: TraceEvent[] = [];
  let timestamp = 0;
  // 预先收集「等待审批」的 callId：审批挂起时编排器会先下发 status:'success' 的 tool_result
  // （表示待审批卡片已产出），但工具并未真正执行；这些调用不得被算作已执行写操作。
  const pendingApprovalCallIds = new Set(
    events
      .filter((e) => e.type === 'tool_approval_request' && e.approval?.callId)
      .map((e) => e.approval!.callId),
  );

  for (const e of events) {
    timestamp += 1;
    if (e.type === 'plan_created' && e.plan) {
      trace.push({ type: 'plan_created', timestamp, plan: foldPlanTerminal(events) });
    } else if (e.type === 'tool_call' && e.call) {
      // 不预置 status：执行前事件不含结果，成败由后续 tool_result 按 callId 配对更新
      trace.push({
        type: 'tool_call',
        timestamp,
        toolName: normalizeToolName(e.call.name),
        callId: e.call.id,
        args: e.call.argsSummary ? { summary: e.call.argsSummary } : {},
      });
    } else if (e.type === 'tool_result') {
      // 按 callId 精确配对；审批挂起的调用保持 pendingApproval，绝不写成 success
      const paired = e.callId
        ? trace.find((t) => t.type === 'tool_call' && t.callId === e.callId)
        : [...trace].reverse().find(
            (t) => t.type === 'tool_call' && t.toolName === normalizeToolName(e.name || '') && t.status === undefined,
          );
      if (paired) {
        if (e.callId && pendingApprovalCallIds.has(e.callId)) {
          paired.status = 'pendingApproval';
        } else {
          paired.status = e.status === 'failed' ? 'failed' : 'success';
          if (e.status === 'failed') paired.error = e.summary;
        }
      } else {
        trace.push({
          type: 'tool_call',
          timestamp,
          toolName: normalizeToolName(e.name || ''),
          callId: e.callId,
          status: e.status === 'failed' ? 'failed' : 'success',
          error: e.status === 'failed' ? e.summary : undefined,
        });
      }
    } else if (e.type === 'tool_approval_request' && e.approval) {
      trace.push({
        type: 'approval_intercepted',
        timestamp,
        toolName: normalizeToolName(e.approval.toolName),
        approvalToken: e.approval.token,
        status: 'pendingApproval',
      });
    } else if (e.type === 'text-delta' && e.text) {
      const existing = trace.find((t) => t.type === 'final_answer');
      if (existing) existing.content = (existing.content || '') + e.text;
      else trace.push({ type: 'final_answer', timestamp, content: e.text });
    }
  }

  return trace;
}
