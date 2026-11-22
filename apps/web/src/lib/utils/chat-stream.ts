// 消费聊天接口返回的标准 SSE 流
// 事件协议以 @repo/shared 的 ChatStreamEvent 为唯一权威定义（见 chat-stream-contract），
// 任何未在契约内的事件（未知类型、非标准帧）按「显式忽略」处理，不回调、不终止流。
import {
  parseChatStreamEvent,
  type ChatStreamToolCall,
  type ChatStreamToolResultEvent,
  type ChatStreamUsage,
  type ArtifactMeta,
  type AgentPlan,
  type PlanStepStatus,
  type ChatStreamToolApproval,
} from '@repo/shared';
import { authFetch } from '@/lib/api/client';
import { toast } from 'sonner';
import type { ChatTransportBody } from '@/lib/chat/request-projection';

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
  /** POST 请求体（聊天请求传输契约的投影形状，评审 C4；不含 method/signal 等 fetch 选项） */
  body: ChatTransportBody;
  signal: AbortSignal;
}

/**
 * 沉默看门狗阈值（2026-10-15 评审 H3：服务端挂起时客户端不再无限等待骨架屏）：
 * - 首个事件超时：请求发出后 60s 内没有任何 SSE 事件 → 判超时（免费/拥堵线路首字慢于该值的概率极低）；
 * - 中途沉默超时：任意事件后再沉默 150s → 判超时（覆盖工具执行等长间隔，事件到达即重置）。
 * 任何事件（正文/推理/旁白/工具/产物/告警）都会重置计时；超时转为明确错误而非静默挂起。
 */
export const STREAM_FIRST_BYTE_TIMEOUT_MS = 60_000;
export const STREAM_SILENCE_TIMEOUT_MS = 150_000;

/** 与调用方 signal 联动的 AbortController：看门狗超时只中断联动控制器，不污染调用方信号 */
function linkAbortController(signal: AbortSignal): AbortController {
  const controller = new AbortController();
  if (signal.aborted) {
    controller.abort();
  } else {
    signal.addEventListener('abort', () => controller.abort(), { once: true });
  }
  return controller;
}

export interface StreamChatResponseHandlers {
  /** 每次收到正文增量时回调一次，参数为当前累计文本 */
  onChunk?: (accumulatedText: string) => void;
  /** 每次收到推理增量时回调一次，参数为当前累计推理文本（可选，不传则忽略推理事件） */
  onReasoning?: (accumulatedReasoning: string) => void;
  /** 每次收到过程旁白增量时回调一次，参数为当前累计旁白文本（agent 模式；可选，不传则忽略） */
  onAgentNote?: (accumulatedAgentNote: string) => void;
  /** 收到工具调用开始时回调一次（agent 模式；可选，不传则忽略） */
  onToolCall?: (call: ChatStreamToolCall) => void;
  /** 收到工具执行结束时回调一次（agent 模式；可选，不传则忽略） */
  onToolResult?: (result: ChatStreamToolResultEvent) => void;
  /** 产物开始生成时回调一次（可选） */
  onArtifactStart?: (artifact: ArtifactMeta) => void;
  /** 产物正文增量到达时回调（可选） */
  onArtifactDelta?: (id: string, delta: string) => void;
  /** 产物生成结束时回调（可选） */
  onArtifactEnd?: (id: string, status: 'complete' | 'error') => void;
  /** 收到计划创建事件时回调一次（agent 模式；可选，不传则忽略） */
  onPlanCreated?: (plan: AgentPlan) => void;
  /** 收到计划步骤状态更新时回调（agent 模式；可选，不传则忽略） */
  onPlanStepUpdate?: (stepId: string, status: PlanStepStatus, summary?: string) => void;
  /** 收到写操作审批请求时回调一次（agent 模式；可选，ADR-0041） */
  onToolApprovalRequest?: (approval: ChatStreamToolApproval) => void;
  /** 收到运行挂载事件时回调（ADR-0061；可选，不传则忽略） */
  onRunAttached?: (runId: string, resumed: boolean) => void;
  onWarning?: (warning: string) => void;
  /** 智能体环境探针降级事件：自动切换为极速对话时回调 */
  onAgentFallback?: (reason: string) => void;
  onDone?: (usage?: ChatStreamUsage) => void;
}

export async function streamChatResponse(
  request: StreamChatRequest,
  handlers: StreamChatResponseHandlers
): Promise<string> {
  // 沉默看门狗：见上方阈值常量注释。首个事件到达前用首字节阈值，之后切换为沉默阈值
  let watchdogTimer: ReturnType<typeof setTimeout> | null = null;
  let watchdogFired = false;
  const linkedController = linkAbortController(request.signal);
  const armWatchdog = (ms: number) => {
    if (watchdogTimer) clearTimeout(watchdogTimer);
    watchdogTimer = setTimeout(() => {
      watchdogFired = true;
      linkedController.abort();
    }, ms);
  };
  // 任意事件到达：重置计时（首个事件后切到较长的中途沉默阈值）
  const petWatchdog = () => armWatchdog(STREAM_SILENCE_TIMEOUT_MS);
  // 统一插桩包装：事件回调先喂狗再透传，避免逐一手写（评审：Duplicated Code）
  const withPet = <A extends unknown[]>(fn?: (...args: A) => void) =>
    fn
      ? (...args: A) => {
          petWatchdog();
          fn(...args);
        }
      : undefined;

  try {
    armWatchdog(STREAM_FIRST_BYTE_TIMEOUT_MS);
    const response = await authFetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify(request.body),
      signal: linkedController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      // 携带 HTTP 状态码，供调用方区分「服务暂不可用，可重试」与「已被拒绝」（审批确认依赖此区分，ADR-0041）
      throw Object.assign(new Error(errorData.error || `请求失败: ${response.status}`), {
        status: response.status,
      });
    }

    // 智能体环境探针降级处理（ADR-0060）：检测响应头注入并弹出中文友好提示
    const isFallback = response.headers.get('x-agent-fallback') === 'true';
    if (isFallback) {
      const rawReason = response.headers.get('x-agent-fallback-reason');
      const fallbackReason = rawReason
        ? decodeURIComponent(rawReason)
        : '已自动平滑切换为极速对话';
      handlers.onAgentFallback?.(fallbackReason);
      try {
        toast.info(fallbackReason);
      } catch {
        // 非浏览器或单测环境安全兜底
      }
    }

    let accumulated = '';
    // 推理文本独立累计，与正文互不影响（返回值仍是正文累计）
    let accumulatedReasoning = '';
    // 过程旁白文本独立累计（agent 模式中间轮决策文本，不进正文）
    let accumulatedAgentNote = '';
    try {
      await consumeChatResponse(response, {
        onChunk: (chunk: string) => {
          petWatchdog();
          accumulated += chunk;
          handlers.onChunk?.(accumulated);
        },
        onReasoning: withPet(
          handlers.onReasoning
            ? (chunk: string) => {
                accumulatedReasoning += chunk;
                handlers.onReasoning?.(accumulatedReasoning);
              }
            : undefined
        ),
        onAgentNote: withPet(
          handlers.onAgentNote
            ? (chunk: string) => {
                accumulatedAgentNote += chunk;
                handlers.onAgentNote?.(accumulatedAgentNote);
              }
            : undefined
        ),
        onToolCall: withPet(handlers.onToolCall),
        onToolResult: withPet(handlers.onToolResult),
        onArtifactStart: withPet(handlers.onArtifactStart),
        onArtifactDelta: withPet(handlers.onArtifactDelta),
        onArtifactEnd: withPet(handlers.onArtifactEnd),
        onPlanCreated: withPet(handlers.onPlanCreated),
        onPlanStepUpdate: withPet(handlers.onPlanStepUpdate),
        onToolApprovalRequest: withPet(handlers.onToolApprovalRequest),
        onRunAttached: withPet(handlers.onRunAttached),
        onWarning: withPet(handlers.onWarning),
        onDone: withPet((usage?: ChatStreamUsage) => {
          handlers.onDone?.(usage);
        }),
      });
    } catch (err) {
      // 看门狗超时 → 转为明确错误（用户主动取消维持 AbortError 透传语义）
      if (
        watchdogFired &&
        !(err instanceof Error && err.name === 'AbortError' && request.signal.aborted)
      ) {
        throw new Error('模型响应超时，请重试或切换模型');
      }
      throw err;
    }
    return accumulated;
  } finally {
    if (watchdogTimer) clearTimeout(watchdogTimer);
  }
}

/**
 * 断点挂载：凭 runId 重新订阅 Agent 运行事件日志（ADR-0061 / 工单 03）。
 *
 * 与 streamChatResponse 共用同一套 SSE 消费逻辑；区别是不发聊天请求、不产生新消息，
 * 事件按累计口径回调给调用方重建既有助手消息。
 */
export async function resumeAgentRun(
  runId: string,
  handlers: StreamChatResponseHandlers,
  options: { signal?: AbortSignal } = {}
): Promise<string> {
  const response = await authFetch(
    `/api/chat/agent/resume?runId=${encodeURIComponent(runId)}`,
    { signal: options.signal }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw Object.assign(
      new Error(errorData.error || `重新连接失败: ${response.status}`),
      { status: response.status, code: errorData.code }
    );
  }

  let accumulated = '';
  let accumulatedReasoning = '';
  let accumulatedAgentNote = '';

  await consumeChatResponse(response, {
    onChunk: (chunk) => {
      accumulated += chunk;
      handlers.onChunk?.(accumulated);
    },
    onReasoning: (chunk) => {
      accumulatedReasoning += chunk;
      handlers.onReasoning?.(accumulatedReasoning);
    },
    onAgentNote: (chunk) => {
      accumulatedAgentNote += chunk;
      handlers.onAgentNote?.(accumulatedAgentNote);
    },
    onToolCall: handlers.onToolCall,
    onToolResult: handlers.onToolResult,
    onArtifactStart: handlers.onArtifactStart,
    onArtifactDelta: handlers.onArtifactDelta,
    onArtifactEnd: handlers.onArtifactEnd,
    onPlanCreated: handlers.onPlanCreated,
    onPlanStepUpdate: handlers.onPlanStepUpdate,
    onToolApprovalRequest: handlers.onToolApprovalRequest,
    onRunAttached: handlers.onRunAttached,
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
  /** 每次收到过程旁白增量时回调一次，参数为本帧增量文本（agent 模式；可选，不传则忽略） */
  onAgentNote?: (chunk: string) => void;
  /** 收到工具调用开始时回调一次（agent 模式；可选，不传则忽略） */
  onToolCall?: (call: ChatStreamToolCall) => void;
  /** 收到工具执行结束时回调一次（agent 模式；可选，不传则忽略） */
  onToolResult?: (result: ChatStreamToolResultEvent) => void;
  /** 产物开始生成时回调一次（可选） */
  onArtifactStart?: (artifact: ArtifactMeta) => void;
  /** 产物正文增量到达时回调（可选） */
  onArtifactDelta?: (id: string, delta: string) => void;
  /** 产物生成结束时回调（可选） */
  onArtifactEnd?: (id: string, status: 'complete' | 'error') => void;
  /** 收到计划创建事件时回调一次（agent 模式；可选） */
  onPlanCreated?: (plan: AgentPlan) => void;
  /** 收到计划步骤状态更新时回调（agent 模式；可选） */
  onPlanStepUpdate?: (stepId: string, status: PlanStepStatus, summary?: string) => void;
  /** 收到写操作审批请求时回调一次（agent 模式；可选，ADR-0041） */
  onToolApprovalRequest?: (approval: ChatStreamToolApproval) => void;
  /** 收到运行挂载事件时回调（ADR-0061；可选） */
  onRunAttached?: (runId: string, resumed: boolean) => void;
  onWarning?: (warning: string) => void;
  /** 智能体环境探针降级事件：自动切换为极速对话时回调 */
  onAgentFallback?: (reason: string) => void;
  onDone?: (usage?: ChatStreamUsage) => void;
}

export async function consumeChatResponse(
  response: Response,
  handlers: ConsumeChatResponseHandlers
): Promise<void> {
  const {
    onChunk,
    onReasoning,
    onAgentNote,
    onToolCall,
    onToolResult,
    onRunAttached,
    onWarning,
    onDone,
  } = handlers;
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
        case 'agent_note':
          // 过程旁白：仅透传给订阅方；未传 onAgentNote 的调用方显式忽略
          onAgentNote?.(event.text);
          return;
        case 'tool_call':
          // 工具调用开始：仅透传给订阅方；未传 onToolCall 的调用方显式忽略
          onToolCall?.(event.call);
          return;
        case 'tool_result':
          // 工具执行结束：仅透传给订阅方；未传 onToolResult 的调用方显式忽略
          onToolResult?.(event);
          return;
        case 'artifact_start':
          // 产物生成开始（ADR-0015）
          handlers.onArtifactStart?.(event.artifact);
          return;
        case 'artifact_delta':
          // 产物增量正文（ADR-0015）
          handlers.onArtifactDelta?.(event.id, event.delta);
          return;
        case 'artifact_end':
          // 产物生成结束（ADR-0015）
          handlers.onArtifactEnd?.(event.id, event.status);
          return;
        case 'plan_created':
          // 智能体计划生成（ADR-0038）
          handlers.onPlanCreated?.(event.plan);
          return;
        case 'run_attached':
          onRunAttached?.(event.runId, event.resumed);
          return;
        case 'plan_step_update':
          // 智能体计划单步更新（ADR-0038）
          handlers.onPlanStepUpdate?.(event.stepId, event.status, event.summary);
          return;
        case 'tool_approval_request':
          // 写操作审批请求（ADR-0041）：未传回调的调用方显式忽略
          handlers.onToolApprovalRequest?.(event.approval);
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
