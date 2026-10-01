// 消费聊天接口返回的标准 SSE 流
// 事件协议以 @repo/shared 的 ChatStreamEvent 为唯一权威定义（见 chat-stream-contract），
// 任何未在契约内的事件（未知类型、非标准帧）按「显式忽略」处理，不回调、不终止流。
import {
  parseChatStreamEvent,
  type ChatStreamToolCall,
  type ChatStreamToolResultEvent,
  type ChatStreamUsage,
} from '@repo/shared';
import { authFetch } from '@/lib/api/client';

/**
 * 统一聊天流编排（评审 C4：单聊 sendMessage/reload 与对比 runModel 三处重复收敛）。
 *
 * 职责：authFetch POST /api/chat → !ok 抛错（优先上游 error 文案）→ consumeChatResponse 消费。
 * 调用方只负责：请求体构造、onChunk/onWarning 的 UI 更新、完成/错误/中止的语义映射。
 * 返回流结束后的累计文本（供调用方完成动作与错误兜底）。
 *
 * 错误约定：
 * - HTTP !ok：抛 Error（errorData.error 或 `请求失败: ${status}`）；
 * - signal 中止：authFetch 抛出的 AbortError 原样透传（调用方按各自 Abort 语义处理）；
 * - 流被截断（未收到 done/error）：consumeChatResponse 抛「回答流被中断」，原样透传。
 */
export interface StreamChatRequest {
  /** POST 请求体（不含 method/signal 等 fetch 选项） */
  body: Record<string, unknown>;
  signal: AbortSignal;
}

export interface StreamChatResponseHandlers {
  /** 每次收到正文增量时回调一次，参数为当前累计文本 */
  onChunk?: (accumulatedText: string) => void;
  /** 每次收到推理增量时回调一次，参数为当前累计推理文本（可选，不传则忽略推理事件） */
  onReasoning?: (accumulatedReasoning: string) => void;
  /** 收到工具调用开始时回调一次（agent 模式；可选，不传则忽略） */
  onToolCall?: (call: ChatStreamToolCall) => void;
  /** 收到工具执行结束时回调一次（agent 模式；可选，不传则忽略） */
  onToolResult?: (result: ChatStreamToolResultEvent) => void;
  onWarning?: (warning: string) => void;
  onDone?: (usage?: ChatStreamUsage) => void;
}

export async function streamChatResponse(
  request: StreamChatRequest,
  handlers: StreamChatResponseHandlers
): Promise<string> {
  const response = await authFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify(request.body),
    signal: request.signal,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `请求失败: ${response.status}`);
  }

  let accumulated = '';
  // 推理文本独立累计，与正文互不影响（返回值仍是正文累计）
  let accumulatedReasoning = '';
  await consumeChatResponse(response, {
    onChunk: (chunk) => {
      accumulated += chunk;
      handlers.onChunk?.(accumulated);
    },
    onReasoning: handlers.onReasoning
      ? (chunk) => {
          accumulatedReasoning += chunk;
          handlers.onReasoning?.(accumulatedReasoning);
        }
      : undefined,
    onToolCall: handlers.onToolCall,
    onToolResult: handlers.onToolResult,
    onWarning: handlers.onWarning,
    onDone: handlers.onDone,
  });
  return accumulated;
}

/** consumeChatResponse 的回调集合（handlers 对象形式，onReasoning 可选） */
export interface ConsumeChatResponseHandlers {
  /** 每次收到正文增量时回调一次，参数为本帧增量文本 */
  onChunk: (chunk: string) => void;
  /** 每次收到推理增量时回调一次，参数为本帧增量文本（可选，不传则忽略推理事件） */
  onReasoning?: (chunk: string) => void;
  /** 收到工具调用开始时回调一次（agent 模式；可选，不传则忽略） */
  onToolCall?: (call: ChatStreamToolCall) => void;
  /** 收到工具执行结束时回调一次（agent 模式；可选，不传则忽略） */
  onToolResult?: (result: ChatStreamToolResultEvent) => void;
  onWarning?: (warning: string) => void;
  onDone?: (usage?: ChatStreamUsage) => void;
}

export async function consumeChatResponse(
  response: Response,
  handlers: ConsumeChatResponseHandlers
): Promise<void> {
  const { onChunk, onReasoning, onToolCall, onToolResult, onWarning, onDone } = handlers;
  const contentType = response.headers.get('Content-Type') || '';

  if (!contentType.includes('text/event-stream')) {
    throw new Error('聊天接口必须返回标准 SSE 响应');
  }

  if (!response.body) {
    throw new Error('响应体为空');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let isDone = false;

  const processBlock = (block: string) => {
    const lines = block
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    if (lines.length === 0) {
      return;
    }

    const dataLines = lines.filter((line) => line.startsWith('data:'));
    if (dataLines.length === 0) {
      return;
    }

    const payload = dataLines.map((line) => line.slice(5).trimStart()).join('\n');
    if (!payload || payload === '[DONE]') {
      isDone = true;
      onDone?.();
      return;
    }

    try {
      const event = parseChatStreamEvent(JSON.parse(payload));
      if (!event) {
        // 未知事件类型 / 非标准帧：显式忽略（不回调、不终止）。
        // 只有 done/error/[DONE] 能终止流；EOF 仍未收到终止事件则按截断抛错。
        return;
      }

      switch (event.type) {
        case 'text-delta':
          onChunk(event.text);
          return;
        case 'reasoning-delta':
          // 推理增量：仅透传给订阅方；未传 onReasoning 的调用方显式忽略（行为与现状一致）
          onReasoning?.(event.text);
          return;
        case 'tool_call':
          // 工具调用开始：仅透传给订阅方；未传 onToolCall 的调用方显式忽略
          onToolCall?.(event.call);
          return;
        case 'tool_result':
          // 工具执行结束：仅透传给订阅方；未传 onToolResult 的调用方显式忽略
          onToolResult?.(event);
          return;
        case 'warning':
          onWarning?.(event.warning);
          return;
        case 'done':
          isDone = true;
          onDone?.(event.usage);
          return;
        case 'error':
          throw new Error(event.error || '流式响应失败');
      }
    } catch (error) {
      // JSON.parse 的 SyntaxError：非 JSON 帧视为协议外数据，显式忽略
      if (error instanceof Error && error.name === 'SyntaxError') {
        return;
      }
      throw error;
    }
  };

  try {
    while (!isDone) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split('\n\n');
      buffer = blocks.pop() || '';

      for (const block of blocks) {
        processBlock(block);
        if (isDone) {
          break;
        }
      }
    }

    const rest = buffer + decoder.decode();
    if (!isDone && rest.trim()) {
      processBlock(rest);
    }

    // 流已关闭但仍未收到完成事件（done/[DONE]/error 都没有）：
    // 视为上游被截断（部署超时、网络中断、上游空流）。
    // 若此处静默返回，runModel 会把该请求标记为「已完成」且内容为空，
    // 表现为"调用成功但没有返回任何内容"。改为显式抛错，让上层能重试。
    if (!isDone) {
      throw new Error('回答流被中断，未能完整接收，请重试');
    }
  } finally {
    reader.releaseLock();
  }
}
