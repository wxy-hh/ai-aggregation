/**
 * 双快照转换 —— 本地快照与历史归档之间的唯一转换入口。
 *
 * 三个方向各有唯一函数：
 * - 运行时 → 本地快照：保留全部字段（推理、用量、引用、产物关联、计划、审批）；
 * - 运行时 → 历史归档：只保留正文、工具记录、计划、审批与工具产出附件；
 * - 历史归档 → 运行时：恢复计划与审批，不补造引用与产物关联。
 *
 * 页面与 store 不得内联重复映射，避免两处裁剪规则漂移。
 */

import type { ArchivedMessage, Message } from '@/types/chat-message';

/** 运行时 → 本地快照：浅拷贝保留全部字段，避免调用方后续改动回写到快照 */
export function toLocalSnapshot(messages: Message[]): Message[] {
  return messages.map((message) => ({ ...message }));
}

/** 运行时 → 历史归档：丢弃用户上传附件原文、过程旁白、推理、用量、引用与产物关联 */
export function toArchivedMessage(message: Message): ArchivedMessage {
  const toolAttachments = message.attachments?.filter((attachment) =>
    attachment.id.startsWith('tool-')
  );

  return {
    role: message.role,
    content: message.content,
    ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
    ...(message.plan ? { plan: message.plan } : {}),
    ...(message.approval ? { approval: message.approval } : {}),
    ...(toolAttachments?.length ? { attachments: toolAttachments } : {}),
  };
}

export function toArchivedMessages(messages: Message[]): ArchivedMessage[] {
  return messages.map(toArchivedMessage);
}

/** 历史归档 → 运行时：补消息 id；引用与产物关联不恢复（归档不保存这两类字段） */
export function fromArchivedMessage(message: ArchivedMessage, id: string): Message {
  return {
    id,
    role: message.role,
    content: message.content,
    ...(message.toolCalls?.length ? { toolCalls: message.toolCalls } : {}),
    ...(message.plan ? { plan: message.plan } : {}),
    ...(message.approval ? { approval: message.approval } : {}),
    ...(message.attachments?.length ? { attachments: message.attachments } : {}),
  };
}

export function fromArchivedMessages(
  messages: ArchivedMessage[],
  conversationId: string
): Message[] {
  return messages.map((message, index) =>
    fromArchivedMessage(message, `${conversationId}-msg-${index}`)
  );
}
