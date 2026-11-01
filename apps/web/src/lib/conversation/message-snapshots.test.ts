/**
 * message-snapshots.test.ts —— 双快照转换测试
 *
 * 锁定的外部行为（ADR-0046 / 工单 04）：
 * 1. 运行时 → 本地快照：全部字段保留（推理、用量、引用、产物关联、计划、审批）；
 * 2. 运行时 → 历史归档：只保留正文、工具记录、计划、审批与工具产出附件；
 * 3. 历史归档 → 运行时：计划与审批恢复，引用与产物关联不被补造。
 */

import { describe, expect, it } from 'vitest';
import type { AgentPlan, CitationAnchor, ToolCallRecord } from '@repo/shared';
import type { MessageApproval } from '@/lib/agent/approval-display';
import type { Attachment, Message } from '@/types/chat-message';
import {
  fromArchivedMessages,
  toArchivedMessages,
  toLocalSnapshot,
} from '@/lib/conversation/message-snapshots';

const userAttachment: Attachment = {
  id: 'upload-1',
  type: 'image',
  name: '用户上传.png',
  imageUrl: 'data:image/png;base64,AAAA',
  status: 'ready',
};

const toolAttachment: Attachment = {
  id: 'tool-call_1',
  type: 'image',
  name: '工具生成.png',
  imageUrl: 'https://cdn.example.com/a.png',
  status: 'ready',
};

const toolCall: ToolCallRecord = {
  id: 'call_1',
  name: 'image_generate',
  argsSummary: '{"prompt":"一只猫"}',
  status: 'success',
  resultSummary: '已生成图片',
};

const plan = {
  id: 'plan-1',
  title: '调研计划',
  steps: [],
} as unknown as AgentPlan;

const approval = {
  id: 'approval-1',
  status: 'pending',
  action: 'write_file',
} as unknown as MessageApproval;

const fullMessage: Message = {
  id: 'm1',
  role: 'assistant',
  content: '正文回答',
  isStreaming: false,
  stopped: true,
  usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30, estimated: false },
  reasoningContent: '模型推理内容',
  reasoningDurationMs: 1200,
  attachments: [userAttachment, toolAttachment],
  toolCalls: [toolCall],
  agentNotes: [
    { id: 'note-1', content: '过程旁白', beforeCallIndex: 0 },
  ] as unknown as Message['agentNotes'],
  artifactIds: ['art-1'],
  citations: { 1: { id: 'c1', text: '引用片段' } as unknown as CitationAnchor },
  plan,
  approval,
};

describe('双快照转换', () => {
  it('运行时转本地快照：推理、用量、引用、产物关联、计划、审批全部保留', () => {
    const [snapshot] = toLocalSnapshot([fullMessage]);

    expect(snapshot).toEqual(fullMessage);
    expect(snapshot.reasoningContent).toBe('模型推理内容');
    expect(snapshot.usage).toEqual(fullMessage.usage);
    expect(snapshot.citations).toEqual(fullMessage.citations);
    expect(snapshot.artifactIds).toEqual(['art-1']);
  });

  it('运行时转历史归档：只保留正文、工具记录、计划、审批与工具产出附件', () => {
    const [archived] = toArchivedMessages([fullMessage]);

    expect(archived).toEqual({
      role: 'assistant',
      content: '正文回答',
      toolCalls: [toolCall],
      plan,
      approval,
      attachments: [toolAttachment],
    });
    expect(archived).not.toHaveProperty('reasoningContent');
    expect(archived).not.toHaveProperty('usage');
    expect(archived).not.toHaveProperty('citations');
    expect(archived).not.toHaveProperty('artifactIds');
    expect(archived).not.toHaveProperty('agentNotes');
  });

  it('历史归档转运行时：计划与审批恢复，引用与产物关联不被补造', () => {
    const [archived] = toArchivedMessages([fullMessage]);
    const [restored] = fromArchivedMessages([archived], 'conv-1');

    expect(restored.id).toBe('conv-1-msg-0');
    expect(restored.role).toBe('assistant');
    expect(restored.content).toBe('正文回答');
    expect(restored.toolCalls).toEqual([toolCall]);
    expect(restored.plan).toEqual(plan);
    expect(restored.approval).toEqual(approval);
    expect(restored.attachments).toEqual([toolAttachment]);
    expect(restored.citations).toBeUndefined();
    expect(restored.artifactIds).toBeUndefined();
  });
});
