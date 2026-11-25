/**
 * 聊天流事件纯函数投影器（ChatStreamProjector）（ADR-0045）
 *
 * 职责：
 * 将聊天流式传输过程中到达的离散领域事件（正文合帧、推理时钟、工具调用与结果、
 * 过程旁白、产物生命周期、计划检查点、审批卡片）纯函数化转换为不可变消息结构
 * 与会话状态增量。
 *
 * 约束：
 * 1. 本模块所有导出函数均为纯函数或状态计算工具，禁止直接触发 UI 渲染或持久化副作用（无 emit / requestAnimationFrame / localStorage）；
 * 2. 状态变更遵循不可变原则（immutable update），无变更时尽量保留原对象引用；
 * 3. 严格遵守 ADR-0015、ADR-0037、ADR-0038、ADR-0041 的状态突变与清洗规范。
 */

import type { Message, Attachment } from './chat-store';
import {
  toolCallRecordSchema,
  applyArtifactEvent,
  finalizeStreamingArtifacts,
  updatePlanStepStatus,
  finalizePlanExecution,
  type Artifact,
  type ArtifactMeta,
  type AgentPlan,
  type PlanStepStatus,
  type ChatStreamUsage,
  type ChatStreamToolStatus,
  type ChatStreamToolAttachment,
} from '@repo/shared';
import {
  expireStaleApprovals,
  type MessageApproval,
} from '@/lib/agent/approval-display';

// ==================== 1. 正文与推理投影 (Text & Reasoning) ====================

/**
 * 推理计时状态条目（内存状态，不持久化）
 */
export interface ReasoningTiming {
  startedAt?: number;
  durationMs?: number;
}

/**
 * 记录首个推理增量到达的起始时间戳（纯函数计算）
 */
export function projectReasoningStart(
  timing: ReasoningTiming | undefined,
  now = Date.now()
): ReasoningTiming {
  if (timing?.startedAt !== undefined) return timing;
  return { ...timing, startedAt: now };
}

/**
 * 自动计算并冻结推理时长：首个 text-delta / done / error / abort 先到先冻
 */
export function projectCalculateReasoningDuration(
  timing: ReasoningTiming | undefined,
  now = Date.now()
): { timing: ReasoningTiming | undefined; durationMs?: number } {
  if (!timing || timing.startedAt === undefined) {
    return { timing, durationMs: undefined };
  }
  if (timing.durationMs !== undefined) {
    return { timing, durationMs: timing.durationMs };
  }
  const durationMs = Math.max(0, now - timing.startedAt);
  return { timing: { ...timing, durationMs }, durationMs };
}

/**
 * 正文增量累加
 */
export function projectStreamContentDelta(message: Message, delta: string): Message {
  return {
    ...message,
    content: (message.content || '') + delta,
  };
}

/**
 * 推理增量累加
 */
export function projectReasoningContentDelta(message: Message, delta: string): Message {
  return {
    ...message,
    reasoningContent: (message.reasoningContent || '') + delta,
  };
}

/**
 * 冻结思考时长：若已记录或已冻结，不覆盖既有值（保持幂等）
 */
export function projectFreezeReasoningDuration(
  message: Message,
  durationMs?: number
): Message {
  if (durationMs === undefined || message.reasoningDurationMs !== undefined) {
    return message;
  }
  return {
    ...message,
    reasoningDurationMs: durationMs,
  };
}

/**
 * 合帧投影：更新消息的正文、推理与冻结时长（rAF 合帧落地）
 */
export function projectStreamFrame(
  message: Message,
  payload: {
    content?: string;
    reasoningContent?: string;
    reasoningDurationMs?: number;
  }
): Message {
  return {
    ...message,
    ...(payload.content !== undefined ? { content: payload.content } : {}),
    ...(payload.reasoningContent !== undefined
      ? { reasoningContent: payload.reasoningContent }
      : {}),
    ...(payload.reasoningDurationMs !== undefined
      ? { reasoningDurationMs: payload.reasoningDurationMs }
      : {}),
  };
}

/**
 * 清洗持久化消息里的 toolCalls 残留（running 归一为 failed）
 */
export function sanitizeToolCalls(m: Message): Message {
  if (!m.toolCalls?.length) return m;
  const valid = m.toolCalls.filter((c) => toolCallRecordSchema.safeParse(c).success);
  const hasRunning = valid.some((c) => c.status === 'running');
  if (valid.length === m.toolCalls.length && !hasRunning) return m;
  return {
    ...m,
    toolCalls: valid.map((c) =>
      c.status === 'running'
        ? { ...c, status: 'failed' as const, resultSummary: c.resultSummary || '执行未完成' }
        : c
    ),
  };
}

/**
 * 消息是否含有可留存的产出（正文 / 推理 / 工具调用记录 / 计划 / 审批任一）
 */
export function hasRetainableContent(m: Message): boolean {
  return Boolean(m.content || m.reasoningContent || m.toolCalls?.length || m.plan || m.approval);
}

/**
 * 最终收尾流式 assistant 消息
 */
export function projectFinalizeStreamingMessage(
  message: Message,
  options: {
    latestText?: string;
    latestReasoning?: string;
    reasoningDurationMs?: number;
    usage?: ChatStreamUsage;
    planStatus?: 'completed' | 'aborted' | 'failed';
  }
): Message {
  const content = options.latestText !== undefined ? options.latestText : message.content;
  const reasoningContent =
    options.latestReasoning !== undefined ? options.latestReasoning : message.reasoningContent;
  const reasoningDurationMs =
    options.reasoningDurationMs !== undefined
      ? options.reasoningDurationMs
      : message.reasoningDurationMs;

  const withContent: Message = {
    ...message,
    content,
    ...(reasoningContent !== undefined ? { reasoningContent } : {}),
    ...(reasoningDurationMs !== undefined ? { reasoningDurationMs } : {}),
    isStreaming: false,
    ...(options.usage ? { usage: options.usage } : {}),
  };

  const withPlan: Message =
    withContent.plan && options.planStatus
      ? { ...withContent, plan: finalizePlanExecution(withContent.plan, options.planStatus) }
      : withContent;

  return sanitizeToolCalls(withPlan);
}

// ==================== 2. 工具调用与过程旁白投影 (Tools & Notes) ====================

export interface ToolCallInput {
  id: string;
  name: string;
  argsSummary?: string;
  serverName?: string;
}

export interface ToolResultInput {
  callId: string;
  name: string;
  status: ChatStreamToolStatus;
  summary: string;
  serverName?: string;
  durationMs?: number;
  attachment?: ChatStreamToolAttachment;
  citations?: Message['citations'];
}

/**
 * 工具调用开始：追加 running 记录（具备同 callId 幂等性）
 */
export function projectToolCall(
  messages: readonly Message[],
  assistantId: string,
  call: ToolCallInput
): { messages: Message[]; changed: boolean } {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== assistantId) return m;
    const prev = m.toolCalls ?? [];
    if (prev.some((c) => c.id === call.id)) return m;
    changed = true;
    return {
      ...m,
      toolCalls: [
        ...prev,
        {
          id: call.id,
          name: call.name,
          argsSummary: call.argsSummary ?? '',
          ...(call.serverName ? { serverName: call.serverName } : {}),
          status: 'running' as const,
          resultSummary: '',
        },
      ],
    };
  });
  return { messages: next, changed };
}

/**
 * 工具执行结束：更新终态与结果，合并图片附件和引用字典
 */
export function projectToolResult(
  messages: readonly Message[],
  assistantId: string,
  result: ToolResultInput
): { messages: Message[]; changed: boolean } {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== assistantId) return m;
    changed = true;
    const prev = m.toolCalls ?? [];
    const nextCalls = prev.some((c) => c.id === result.callId)
      ? prev.map((c) =>
          c.id === result.callId
            ? {
                ...c,
                status: result.status,
                resultSummary: result.summary,
                ...(result.serverName && !c.serverName ? { serverName: result.serverName } : {}),
                ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
              }
            : c
        )
      : [
          ...prev,
          {
            id: result.callId,
            name: result.name,
            argsSummary: '',
            ...(result.serverName ? { serverName: result.serverName } : {}),
            status: result.status,
            resultSummary: result.summary,
            ...(result.durationMs !== undefined ? { durationMs: result.durationMs } : {}),
          },
        ];

    const attachmentId = `tool-${result.callId}`;
    const prevAttachments = m.attachments ?? [];
    const nextAttachments =
      result.attachment && !prevAttachments.some((a) => a.id === attachmentId)
        ? [
            ...prevAttachments,
            {
              id: attachmentId,
              type: 'image' as const,
              name: '工具生成的图片',
              imageUrl: result.attachment.url,
              status: 'ready' as const,
            },
          ]
        : m.attachments;

    const nextCitations = result.citations
      ? { ...(m.citations ?? {}), ...result.citations }
      : m.citations;

    return {
      ...m,
      toolCalls: nextCalls,
      attachments: nextAttachments,
      ...(nextCitations ? { citations: nextCitations } : {}),
    };
  });
  return { messages: next, changed };
}

/**
 * 过程旁白增量投影
 */
export function projectAgentNote(
  messages: readonly Message[],
  assistantId: string,
  delta: string
): { messages: Message[]; changed: boolean } {
  if (!delta) return { messages: [...messages], changed: false };
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== assistantId) return m;
    changed = true;
    const entry = { beforeCallIndex: m.toolCalls?.length ?? 0, text: delta };
    return { ...m, agentNotes: [...(m.agentNotes ?? []), entry] };
  });
  return { messages: next, changed };
}

// ==================== 3. 产物生命周期投影 (Artifacts) ====================

/**
 * 产物开始投影：更新产物池
 */
export function projectArtifactStart(
  artifacts: readonly Artifact[],
  artifact: ArtifactMeta,
  now = Date.now()
): Artifact[] {
  return applyArtifactEvent(
    artifacts as Artifact[],
    { type: 'artifact_start', artifact },
    now
  );
}

/**
 * 消息关联产物 ID
 */
export function projectAssociateArtifact(
  messages: readonly Message[],
  assistantId: string,
  artifactId: string
): { messages: Message[]; changed: boolean } {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== assistantId) return m;
    const prevIds = m.artifactIds ?? [];
    if (prevIds.includes(artifactId)) return m;
    changed = true;
    return { ...m, artifactIds: [...prevIds, artifactId] };
  });
  return { messages: next, changed };
}

/**
 * 产物增量投影
 */
export function projectArtifactDelta(
  artifacts: readonly Artifact[],
  id: string,
  delta: string,
  now = Date.now()
): Artifact[] {
  return applyArtifactEvent(
    artifacts as Artifact[],
    { type: 'artifact_delta', id, delta },
    now
  );
}

/**
 * 产物结束投影
 */
export function projectArtifactEnd(
  artifacts: readonly Artifact[],
  id: string,
  status: 'complete' | 'error',
  now = Date.now()
): Artifact[] {
  return applyArtifactEvent(
    artifacts as Artifact[],
    { type: 'artifact_end', id, status },
    now
  );
}

/**
 * 收尾流式未完成产物（正常结束缺 end 帧、中止、失败共用）
 */
export function projectFinalizeArtifacts(
  artifacts: readonly Artifact[]
): { artifacts: Artifact[]; changed: boolean } {
  const before = artifacts;
  const after = finalizeStreamingArtifacts(artifacts as Artifact[]);
  return { artifacts: after, changed: before !== after };
}

// ==================== 4. 计划与审批投影 (Plan & Approval) ====================

/**
 * 计划创建投影
 */
export function projectPlanCreated(
  messages: readonly Message[],
  assistantId: string,
  plan: AgentPlan
): { messages: Message[]; changed: boolean } {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id === assistantId) {
      changed = true;
      return { ...m, plan };
    }
    return m;
  });
  return { messages: next, changed };
}

/**
 * 计划步骤状态更新投影
 */
export function projectPlanStepUpdate(
  messages: readonly Message[],
  assistantId: string,
  stepId: string,
  status: PlanStepStatus,
  summary?: string
): { messages: Message[]; changed: boolean } {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id !== assistantId || !m.plan) return m;
    changed = true;
    return {
      ...m,
      plan: updatePlanStepStatus(m.plan, stepId, status, summary),
    };
  });
  return { messages: next, changed };
}

/**
 * 审批请求卡片投影
 */
export function projectToolApprovalRequest(
  messages: readonly Message[],
  assistantId: string,
  approval: Omit<MessageApproval, 'status'>
): { messages: Message[]; changed: boolean } {
  let changed = false;
  const next = messages.map((m) => {
    if (m.id === assistantId) {
      changed = true;
      return { ...m, approval: { ...approval, status: 'pending' as const } };
    }
    return m;
  });
  return { messages: next, changed };
}

/**
 * 失效历史未决审批卡片
 */
export function projectExpireApprovals(messages: Message[]): Message[] {
  return expireStaleApprovals(messages);
}

/**
 * 纯前端拒绝审批
 */
export function projectRejectApproval(
  messages: Message[],
  messageId: string
): Message[] {
  return messages.map((m) => {
    if (m.id !== messageId || !m.approval) return m;
    return {
      ...m,
      approval: { ...m.approval, status: 'rejected' as const },
    };
  });
}
