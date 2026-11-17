/**
 * 请求投影唯一出口（评审 C4 / ADR-0050 决策 4/5）。
 *
 * 客户端把会话快照明确投影为聊天请求体的唯一组装位置：4+1 个调用方
 * （sendMessage / reload / ApprovalResume / 对比 runModel / 批量预留）统一经此出口，
 * 不再各自内联拼装。消息历史的安全语义（审批剥离、拒绝转写、历史附件自愈）
 * 由 @repo/shared 的 projectWireHistory 单一持有。
 */

import {
  projectWireHistory,
  toWireAttachment,
  type ApprovalResumePayload,
  type BatchReserveRequestBody,
  type ChatScene,
  type WireMessage,
} from '@repo/shared';
import type { ProviderName } from '@repo/providers';

export type ChatRequestMode = 'send' | 'reload' | 'approval_resume' | 'compare';

/** 投影入参的快照消息（鸭子类型：只需投影所需字段，兼容 Store Message 与对比分支消息） */
export interface ProjectableMessage {
  role: string;
  content: string;
  attachments?: unknown;
  approval?: unknown;
}

export interface BuildChatRequestInput {
  mode: ChatRequestMode;
  /** 会话快照消息（send/reload/approval_resume 为完整快照；compare 为窄分支消息） */
  messages?: ProjectableMessage[];
  /** approval_resume 模式：计划已完成检查点，追加在投影历史之后 */
  planCheckpoint?: WireMessage | null;
  provider: ProviderName;
  model?: string;
  thinking: boolean;
  agentMode: boolean;
  conversationId?: string | null;
  capabilityPackKey?: string | null;
  disabledToolKeys?: string[];
  artifactContext?: unknown;
  approvalResume?: ApprovalResumePayload;
  requestId?: string;
  reservationId?: string;
}

/** 经投影产出的聊天请求体（fetch body；字段名与聊天请求传输契约一致） */
export interface ChatTransportBody {
  messages: WireMessage[];
  provider: string;
  chatScene?: ChatScene;
  model?: string;
  thinking: boolean;
  agent?: true;
  approvalScope?: string;
  capabilityPack?: string;
  disabledToolKeys?: string[];
  artifactContext?: unknown;
  approvalResume?: ApprovalResumePayload;
  requestId?: string;
  reservationId?: string;
}

/** 当前发送轮次附件校验：任何附件投影失败即硬阻断，绝不静默吞图 */
function assertCurrentAttachments(messages: ProjectableMessage[]): void {
  const last = messages[messages.length - 1];
  if (!last || !Array.isArray(last.attachments)) return;
  for (const attachment of last.attachments) {
    if (!toWireAttachment(attachment)) {
      throw new Error('附件尚未上传完成或已损坏，请重新上传后再发送');
    }
  }
}

export function buildChatRequestBody(input: BuildChatRequestInput): ChatTransportBody {
  const {
    mode,
    messages = [],
    planCheckpoint = null,
    provider,
    model,
    thinking,
    agentMode,
    conversationId,
    capabilityPackKey,
    disabledToolKeys,
    artifactContext,
    approvalResume,
    requestId,
    reservationId,
  } = input;

  let wireMessages: WireMessage[];
  if (mode === 'compare') {
    // 对比模式：窄分支消息直取 role/content（无附件语义）
    wireMessages = messages.map((m) => ({ role: m.role as WireMessage['role'], content: m.content }));
  } else {
    if (mode === 'send') {
      // 当前轮硬阻断：末条（正在发送的）消息附件必须全部可投影
      assertCurrentAttachments(messages);
    }
    wireMessages = projectWireHistory(messages);
    if (mode === 'reload') {
      // 重新生成维持既有行为：不带任何附件（ADR-0050 决策 4）
      wireMessages = wireMessages.map(({ role, content }) => ({ role, content }));
    }
    if (mode === 'approval_resume' && planCheckpoint) {
      wireMessages = [...wireMessages, planCheckpoint];
    }
  }

  const body: ChatTransportBody = {
    messages: wireMessages,
    provider,
    chatScene: mode === 'compare' ? 'compare' : 'single',
    thinking,
  };
  if (model) body.model = model;
  if (agentMode) {
    body.agent = true;
    body.approvalScope = conversationId ?? '';
  }
  // reload 修复（评审 C4）：重新生成与首次发送同走此出口，capabilityPack / disabledToolKeys 不再漏传
  if (agentMode && capabilityPackKey) body.capabilityPack = capabilityPackKey;
  if (agentMode && disabledToolKeys && disabledToolKeys.length > 0) body.disabledToolKeys = disabledToolKeys;
  if (agentMode && artifactContext) body.artifactContext = artifactContext;
  if (mode === 'approval_resume' && approvalResume) body.approvalResume = approvalResume;
  if (requestId) body.requestId = requestId;
  if (reservationId) body.reservationId = reservationId;
  return body;
}

/** 批量预留请求体组装：messages 只取当前 prompt，models 剥离 UI 字段只留 provider/model */
export function buildBatchReserveRequestBody(
  prompt: string,
  models: Array<{ provider: string; model: string }>
): BatchReserveRequestBody {
  return {
    messages: [{ role: 'user', content: prompt }],
    models: models.map((m) => ({
      provider: m.provider as BatchReserveRequestBody['models'][number]['provider'],
      model: m.model,
    })),
  };
}
