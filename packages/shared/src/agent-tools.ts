/**
 * Agent 工具调用记录 — 前后端共享契约
 *
 * 这是「持久化到消息」的展示记录：前端把流式 tool_call / tool_result 事件
 * 合并累积成该结构，随会话持久化，用于刷新后回看（spec §8）。
 *
 * 与 chat-stream-contract 的事件类型的分工：
 * - 事件（tool_call / tool_result）是**传输态**，分两条事件先后到达；
 * - 本记录是**落库态**，是一条完整的调用记录（参数摘要 + 状态 + 结果摘要）。
 *
 * 只承载可展示的截断摘要；完整参数与完整工具结果留在服务端上下文（spec §5.1）。
 */

import { z } from 'zod';

export const toolCallRecordSchema = z.object({
  /** 工具调用 id（与 tool_call / tool_result 事件的 id / callId 对齐） */
  id: z.string().min(1),
  /** 工具名（如 image_generate / web_fetch） */
  name: z.string().min(1),
  /** 参数展示摘要（已截断） */
  argsSummary: z.string(),
  /**
   * 执行状态：
   * - running  —— 仅前端中间态（tool_call 已到达、tool_result 未到），用于过程可见的「进行中」；
   * - success / failed —— 由 tool_result 事件落地，也是持久化时的最终态。
   */
  status: z.enum(['running', 'success', 'failed']),
  /** 结果展示摘要（已截断；running 阶段为空串） */
  resultSummary: z.string(),
  /** 工具真实执行耗时（毫秒；可选，由 tool_result 事件回填） */
  durationMs: z.number().int().nonnegative().optional(),
});

export type ToolCallRecord = z.infer<typeof toolCallRecordSchema>;

/** 工具执行终态（tool_result 事件与持久化记录共用） */
export type ToolCallStatus = Exclude<ToolCallRecord['status'], 'running'>;

/**
 * 过程旁白记录（二期多步循环）：中间轮决策文本落到消息上的结构。
 * beforeCallIndex = 旁白到达时 toolCalls 的长度（即渲染时插入到第几个工具调用之前）。
 * 进过程卡片、不进正文、不入历史持久化（spec D-二期-6），故无 zod schema（不持久化即无需清洗）。
 */
export type AgentNote = {
  beforeCallIndex: number;
  text: string;
};

/**
 * 决策步动作契约类型（二期多步循环）：
 * 描述单轮决策步执行后，流投影适配器向编排器交付的归一化标准动作类型。
 */
export type StepActionType =
  | 'deliver_answer'
  | 'nudge_continue'
  | 'execute_local_tools'
  | 'empty_finish';
