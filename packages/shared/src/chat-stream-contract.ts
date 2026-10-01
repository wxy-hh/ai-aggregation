// ============================================
// 聊天流式 SSE 事件契约 — 前后端唯一权威定义
// --------------------------------------------
// 适用链路（BFF → 前端 SSE）：
//   - /api/chat（generic / xunfei / doubao 三适配器）
//   - /api/destiny/copilot（追问对话）
//
// 事件类型（共 7 种，联合类型即完整枚举）：
//   - text-delta       增量文本（可重复出现；text 一定为非空字符串）
//   - reasoning-delta  推理增量文本（可重复出现；text 一定为非空字符串；
//                      仅 supportsReasoning 模型可能产生，先于 text-delta 到达；
//                      推理与正文的分界由消费端推断：首个 text-delta 或流终止）
//   - tool_call        工具调用开始（可重复出现；agent 模式专用；先于对应 tool_result 与
//                      所有 text-delta 到达。仅承载展示摘要，完整参数只留在服务端上下文）
//   - tool_result      工具执行结束（可重复出现；agent 模式专用；与某个 tool_call 按
//                      callId 配对。仅承载展示摘要，完整结果只留在服务端上下文）
//   - warning          警告信息（可重复出现；不终止流）
//   - error            错误（终止事件；随后可选跟 done 帧，消费方在 error 处即终止）
//   - done             正常终止（终止事件；流中最后一个事件）
//
// 状态机约束（消费端 consumeChatResponse 强制执行）：
//   - 终止事件 = done | error，每个流只允许出现一次，且必须是最后一个事件；
//   - 流 EOF（网络关闭）时若未收到任何终止事件，视为上游被截断，消费端必须抛错，
//     禁止把「无内容空回答」当作成功；
//   - 消费端解析到 error 时必须抛错并终止；
//   - 消费端收到未知事件类型时必须显式忽略（协议前向演进时旧端优雅降级）。
//
// 线协议：单帧单事件，`data: <JSON>\n\n`；
// 兼容帧：`data: [DONE]`（等价 done，历史遗留，仅解析侧保留）；
// 心跳行：实现可能在事件帧之间穿插 `: ping` 注释心跳行，消费方应按 SSE 规范忽略注释行。
// ============================================

/** 增量文本事件 */
export type ChatStreamTextDeltaEvent = { type: 'text-delta'; text: string };
/** 推理增量事件（模型真实推理流，非终止事件；仅推理模型产生） */
export type ChatStreamReasoningDeltaEvent = { type: 'reasoning-delta'; text: string };

/**
 * 工具调用展示记录（agent 模式）。
 *
 * 只承载「可展示」的截断摘要 —— 完整参数与完整工具结果留在服务端上下文，
 * 不下发前端：结果可能含大段网页正文，下发既费流量也泄内容。
 */
export interface ChatStreamToolCall {
  /** 工具调用 id（与对应 tool_result 的 callId 配对） */
  id: string;
  /** 工具名（如 image_generate / web_fetch） */
  name: string;
  /** 参数展示摘要（已截断；无参数工具允许为空串） */
  argsSummary: string;
}

/** 工具调用开始事件（agent 模式专用；先于对应 tool_result 与所有 text-delta 到达） */
export type ChatStreamToolCallEvent = { type: 'tool_call'; call: ChatStreamToolCall };
/** 工具执行状态 */
export type ChatStreamToolStatus = 'success' | 'failed';

/**
 * 工具产物附件（agent 模式）。
 * 仅图片类工具携带：生成结果本身就是给用户看的产物，不属于「不下发的大段正文」。
 */
export interface ChatStreamToolAttachment {
  kind: 'image';
  url: string;
}

/** 工具执行结束事件（agent 模式专用；与某个 tool_call 按 callId 配对） */
export type ChatStreamToolResultEvent = {
  type: 'tool_result';
  /** 配对的工具调用 id */
  callId: string;
  /** 工具名（冗余携带，便于消费端在缺省 call 记录时仍可展示） */
  name: string;
  status: ChatStreamToolStatus;
  /** 结果展示摘要（已截断） */
  summary: string;
  /** 产物附件（可选；仅 image_generate 等产出文件的工具携带） */
  attachment?: ChatStreamToolAttachment;
};

/** 聊天流式用量统计（done 帧携带） */
export interface ChatStreamUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number;
  /** true=估算值（上游未返回 usage，按结算同口径估算）；false=上游真实返回 */
  estimated: boolean;
}

/** 正常终止事件 */
export type ChatStreamDoneEvent = { type: 'done'; usage?: ChatStreamUsage };
/** 警告事件（不终止流） */
export type ChatStreamWarningEvent = { type: 'warning'; warning: string };
/** 错误事件（终止流） */
export type ChatStreamErrorEvent = { type: 'error'; error: string };

/** 聊天流式事件联合类型 — 编码（后端）与解码（前端）共用同一类型，杜绝双端字符串漂移 */
export type ChatStreamEvent =
  | ChatStreamTextDeltaEvent
  | ChatStreamReasoningDeltaEvent
  | ChatStreamToolCallEvent
  | ChatStreamToolResultEvent
  | ChatStreamDoneEvent
  | ChatStreamWarningEvent
  | ChatStreamErrorEvent;

/** 终止事件：done / error。作为「流终止」状态条件，供消费端判别 */
export type ChatStreamTerminalEvent = Extract<
  ChatStreamEvent,
  { type: 'done' } | { type: 'error' }
>;

/**
 * 解析单个 SSE data: 帧的 JSON payload（已 JSON.parse 的结果）为契约事件。
 *
 * 返回值说明：
 * - 合法的 7 类事件 → 对应事件对象；
 * - null → 非 JSON 对象、未知事件类型或字段不合法。消费端必须显式忽略并继续等待
 *   终止事件（未知类型不代表流结束；只有 done/error/[DONE] 才结束流）。
 */
export function parseChatStreamEvent(payload: unknown): ChatStreamEvent | null {
  if (typeof payload !== 'object' || payload === null) return null;
  const ev = payload as Record<string, unknown>;
  switch (ev.type) {
    case 'text-delta':
      // text 一定非空：空增量无意义，视为非法帧放弃
      return typeof ev.text === 'string' && ev.text.length > 0
        ? { type: 'text-delta', text: ev.text }
        : null;
    case 'reasoning-delta':
      // 与 text-delta 同款严格度：空推理增量无意义，视为非法帧放弃
      return typeof ev.text === 'string' && ev.text.length > 0
        ? { type: 'reasoning-delta', text: ev.text }
        : null;
    case 'tool_call': {
      // id / name 是配对与展示的必要字段，必须非空；argsSummary 允许空串（无参数工具）
      const call = ev.call as Record<string, unknown> | null | undefined;
      if (typeof call !== 'object' || call === null) return null;
      const { id, name, argsSummary } = call as Record<string, unknown>;
      if (typeof id !== 'string' || !id) return null;
      if (typeof name !== 'string' || !name) return null;
      if (typeof argsSummary !== 'string') return null;
      return { type: 'tool_call', call: { id, name, argsSummary } };
    }
    case 'tool_result': {
      // callId / name 非空；status 必须落在枚举内；summary 允许空串
      if (typeof ev.callId !== 'string' || !ev.callId) return null;
      if (typeof ev.name !== 'string' || !ev.name) return null;
      if (ev.status !== 'success' && ev.status !== 'failed') return null;
      if (typeof ev.summary !== 'string') return null;
      // attachment 为可选：给了就必须合法，非法则整个事件作废（不静默降级成无附件）
      let attachment: ChatStreamToolAttachment | undefined;
      if (ev.attachment !== undefined) {
        const att = ev.attachment as Record<string, unknown> | null;
        if (typeof att !== 'object' || att === null) return null;
        if (att.kind !== 'image') return null;
        if (typeof att.url !== 'string' || !att.url) return null;
        attachment = { kind: 'image', url: att.url };
      }
      return {
        type: 'tool_result',
        callId: ev.callId,
        name: ev.name,
        status: ev.status,
        summary: ev.summary,
        ...(attachment ? { attachment } : {}),
      };
    }
    case 'done': {
      if (typeof ev.usage === 'object' && ev.usage !== null) {
        const u = ev.usage as Record<string, unknown>;
        const isValidTokenNumber = (v: unknown): v is number =>
          typeof v === 'number' && Number.isFinite(v) && v >= 0;
        const isValidSubToken = (v: unknown): v is number | null =>
          v === null || isValidTokenNumber(v);
        if (
          isValidTokenNumber(u.totalTokens) &&
          isValidSubToken(u.inputTokens) &&
          isValidSubToken(u.outputTokens) &&
          typeof u.estimated === 'boolean'
        ) {
          return {
            type: 'done',
            usage: {
              inputTokens: u.inputTokens,
              outputTokens: u.outputTokens,
              totalTokens: u.totalTokens,
              estimated: u.estimated,
            },
          };
        }
      }
      return { type: 'done' };
    }
    case 'warning':
      return typeof ev.warning === 'string' ? { type: 'warning', warning: ev.warning } : null;
    case 'error':
      return typeof ev.error === 'string' ? { type: 'error', error: ev.error } : null;
    default:
      return null;
  }
}

/** 是否为流终止事件（done/error） */
export function isChatStreamTerminalEvent(
  event: ChatStreamEvent
): event is ChatStreamTerminalEvent {
  return event.type === 'done' || event.type === 'error';
}

/**
 * 编码一个契约事件为 SSE 帧字符串（`data: <JSON>\n\n`）。
 * 与 parseChatStreamEvent 同源：编码产物必然能被解析回同一类型。
 */
export function encodeChatStreamEvent(event: ChatStreamEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}
