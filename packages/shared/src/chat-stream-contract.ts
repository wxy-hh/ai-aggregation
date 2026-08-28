// ============================================
// 聊天流式 SSE 事件契约 — 前后端唯一权威定义
// --------------------------------------------
// 适用链路（BFF → 前端 SSE）：
//   - /api/chat（generic / xunfei / doubao 三适配器）
//   - /api/destiny/copilot（追问对话）
//
// 事件类型（共 4 种，联合类型即完整枚举）：
//   - text-delta  增量文本（可重复出现；text 一定为非空字符串）
//   - warning     警告信息（可重复出现；不终止流）
//   - error       错误（终止事件；随后可选跟 done 帧，消费方在 error 处即终止）
//   - done        正常终止（终止事件；流中最后一个事件）
//
// 状态机约束（消费端 consumeChatResponse 强制执行）：
//   - 终止事件 = done | error，每个流只允许出现一次，且必须是最后一个事件；
//   - 流 EOF（网络关闭）时若未收到任何终止事件，视为上游被截断，消费端必须抛错，
//     禁止把「无内容空回答」当作成功；
//   - 消费端解析到 error 时必须抛错并终止；
//   - 消费端收到未知事件类型时必须显式忽略（协议前向演进时旧端优雅降级）。
//
// 线协议：单帧单事件，`data: <JSON>\n\n`；
// 兼容帧：`data: [DONE]`（等价 done，历史遗留，仅解析侧保留）。
// ============================================

/** 增量文本事件 */
export type ChatStreamTextDeltaEvent = { type: 'text-delta'; text: string };
/** 正常终止事件 */
export type ChatStreamDoneEvent = { type: 'done' };
/** 警告事件（不终止流） */
export type ChatStreamWarningEvent = { type: 'warning'; warning: string };
/** 错误事件（终止流） */
export type ChatStreamErrorEvent = { type: 'error'; error: string };

/** 聊天流式事件联合类型 — 编码（后端）与解码（前端）共用同一类型，杜绝双端字符串漂移 */
export type ChatStreamEvent =
  | ChatStreamTextDeltaEvent
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
 * - 合法的 4 类事件 → 对应事件对象；
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
    case 'done':
      return { type: 'done' };
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
