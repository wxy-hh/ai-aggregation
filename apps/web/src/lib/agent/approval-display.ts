/**
 * 审批卡片的展示态推导（AGENT-HITL-ACTION / ADR-0041）。
 *
 * 纯函数，供 ApprovalCard 渲染与 chat-store 恢复/失效判断共用。
 * 前端判断只用于展示，最终以服务端校验为准。
 */

import type { ChatStreamToolApproval } from '@repo/shared';
import type { WireMessage } from '@repo/shared';

/** 卡片状态：待确认 / 已确认 / 已拒绝 / 已失效 */
export type ApprovalStatus = 'pending' | 'confirmed' | 'rejected' | 'expired';

/** 规范化序列化：对象键排序，保证同一参数无论键序都得到同一串（前后端共享唯一实现） */
export function canonicalizeApprovalParams(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalizeApprovalParams).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalizeApprovalParams(record[k])}`)
    .join(',')}}`;
}

/** 随消息落盘的审批请求（服务端载荷 + 本地状态） */
export interface MessageApproval extends ChatStreamToolApproval {
  status: ApprovalStatus;
}

/**
 * 推导卡片实际展示状态：待确认且凭证已过期时按已失效展示。
 * 已确认 / 已拒绝是用户的终态决定，不被时间覆盖。
 */
export function resolveApprovalStatus(approval: MessageApproval, now: number = Date.now()): ApprovalStatus {
  if (approval.status === 'pending' && now > approval.expiresAt) {
    return 'expired';
  }
  return approval.status;
}

interface MessageWithApproval {
  approval?: MessageApproval;
}

/**
 * 把过期或已被新消息取代的待确认卡片置为已失效。
 *
 * - 仅处理 pending：已确认 / 已拒绝是用户终态，不改；
 * - 判断依据：凭证已过期，或该消息之后还有别的消息；
 * - 无变化时原样返回同一数组与同一消息对象，便于调用方用引用比较判断是否需要回写。
 */
export function expireStaleApprovals<T extends MessageWithApproval>(
  messages: T[],
  now: number = Date.now()
): T[] {
  let changed = false;
  const next = messages.map((m, index) => {
    if (m.approval?.status !== 'pending') return m;
    const superseded = index < messages.length - 1;
    if (!superseded && now <= m.approval.expiresAt) return m;
    changed = true;
    return { ...m, approval: { ...m.approval, status: 'expired' as const } };
  });
  return changed ? next : messages;
}

interface PlanLike {
  steps: Array<{ title: string; status: string; summary?: string }>;
}

/**
 * 恢复请求携带的计划已完成检查点：只含已完成步骤，提示模型沿用计划、不重复已完成的工作。
 * 没有已完成步骤时返回 null。输出为窄化线上消息，直接并入请求投影历史（评审 C4）。
 */
export function buildPlanCheckpointMessage(plan: PlanLike | undefined): WireMessage | null {
  if (!plan) return null;
  const done = plan.steps.filter((s) => s.status === 'completed');
  if (done.length === 0) return null;
  const lines = done.map((s, i) => `${i + 1}. ${s.title}${s.summary ? `：${s.summary}` : ''}`);
  return {
    role: 'system',
    content: `此前已完成的计划步骤（沿用该计划，不要重复这些步骤）：\n${lines.join('\n')}`,
  };
}
