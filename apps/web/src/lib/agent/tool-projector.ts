/**
 * 工具流投影适配器（ToolStreamProjector）（ADR-0009）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 职责：
 * 1. 订阅消费底层模型决策步的异步流事件（`decisionStream`）；
 * 2. 识别服务端执行工具（`providerExecuted: true`）的 `tool-call` 与 `tool-result`，
 *    自动完成结构提取（如查询词 query）、规范化 summary，并通过 onEvent 回调向上层
 *    推送展示级 SSE 契约事件（ChatStreamToolCallEvent / ChatStreamToolResultEvent）；
 * 3. 统计服务端调用指标（如 web_search 的调用增量 searchCallsIncrement）；
 * 4. 收集决策步缓冲文本，过滤待本地执行的自有工具（排除 providerExecuted 工具）；
 * 5. 将本轮流式结果规约为单一排他的决策动作契约（StepAction）：
 *    - deliver_answer: 无自有工具且有文本输出，作为回答交付给用户；
 *    - nudge_continue: 仅有服务端工具执行且无文本（如搜索被截断），自动注入系统引导语续跑一轮；
 *    - execute_local_tools: 包含待本地执行的自有工具，携带可选的过程旁白文本与规范化的本地工具列表；
 *    - empty_finish: 无工具、无文本、无服务端执行，模型主动不作为。
 */

import type { ModelMessage } from 'ai';
import type {
  ChatStreamToolCallEvent,
  ChatStreamToolResultEvent,
  StepActionType,
} from '@repo/shared';

/** 本地待执行的工具调用规范结构 */
export interface LocalToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

/** 决策动作契约 */
export type StepAction =
  | {
      type: 'deliver_answer';
      text: string;
    }
  | {
      type: 'nudge_continue';
      nudgeMessage: ModelMessage;
    }
  | {
      type: 'execute_local_tools';
      noteText?: string;
      localCalls: LocalToolCall[];
    }
  | {
      type: 'empty_finish';
    };

/** 原始工具调用项（由模型流返回） */
export interface RawToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  providerExecuted?: boolean;
}

/** 投影产出结果 */
export interface ProjectorOutcome {
  action: StepAction;
  searchCallsIncrement: number;
}

/** 投影配置项 */
export interface ProjectorOptions {
  /** 向前端流式下发展示级工具事件的回调 */
  onEvent?: (event: ChatStreamToolCallEvent | ChatStreamToolResultEvent) => void;
}

/**
 * 从 web_search 的 tool-result output 提取查询词。
 * 针对上游返回的 action.query 路径进行安全提取，结构缺失或异常时优雅回退为 null。
 */
function extractSearchQuery(output: unknown): string | null {
  if (output && typeof output === 'object') {
    const action = (output as { action?: unknown }).action;
    if (action && typeof action === 'object') {
      const query = (action as { query?: unknown }).query;
      if (typeof query === 'string' && query) {
        return query;
      }
    }
  }
  return null;
}

/**
 * 判断流事件或工具调用是否由服务端执行（providerExecuted）。
 */
function isProviderExecuted(item: unknown): boolean {
  if (item && typeof item === 'object') {
    return Boolean((item as { providerExecuted?: boolean }).providerExecuted);
  }
  return false;
}

/**
 * 投影决策步的异步流与工具调用集合，输出标准化动作与服务端观测统计。
 */
export async function projectDecisionStream(
  decisionStream: AsyncIterable<unknown>,
  rawToolCalls: RawToolCall[],
  options?: ProjectorOptions
): Promise<ProjectorOutcome> {
  const onEvent = options?.onEvent;
  let decisionBufferedText = '';
  let sawProviderExecuted = false;
  let searchCallsIncrement = 0;

  for await (const rawPart of decisionStream) {
    if (!rawPart || typeof rawPart !== 'object') {
      continue;
    }

    const part = rawPart as {
      type?: string;
      text?: string;
      toolCallId?: string;
      toolName?: string;
      output?: unknown;
    };

    if (part.type === 'text-delta' && typeof part.text === 'string') {
      decisionBufferedText += part.text;
    }

    if (part.type === 'tool-call' && isProviderExecuted(rawPart)) {
      sawProviderExecuted = true;
      if (onEvent && part.toolCallId && part.toolName) {
        onEvent({
          type: 'tool_call',
          call: {
            id: part.toolCallId,
            name: part.toolName,
            argsSummary: '',
          },
        });
      }
    }

    if (part.type === 'tool-result' && isProviderExecuted(rawPart)) {
      sawProviderExecuted = true;
      if (part.toolName === 'web_search') {
        searchCallsIncrement++;
      }
      if (onEvent && part.toolCallId && part.toolName) {
        const query = extractSearchQuery(part.output);
        onEvent({
          type: 'tool_result',
          callId: part.toolCallId,
          name: part.toolName,
          status: 'success',
          summary: query ? `查询词：${query}` : '搜索完成',
        });
      }
    }
  }

  // 过滤掉服务端已经执行过的工具，仅保留本地待执行工具
  const localCalls: LocalToolCall[] = rawToolCalls
    .filter((call) => !call.providerExecuted)
    .map((call) => ({
      toolCallId: call.toolCallId,
      toolName: call.toolName,
      input: call.input,
    }));

  // 根据本地工具与缓冲文本规约步骤动作
  if (localCalls.length === 0) {
    if (decisionBufferedText) {
      return {
        action: {
          type: 'deliver_answer',
          text: decisionBufferedText,
        },
        searchCallsIncrement,
      };
    }

    if (sawProviderExecuted) {
      return {
        action: {
          type: 'nudge_continue',
          nudgeMessage: {
            role: 'user',
            content: '（系统提示：搜索已完成，请基于搜索结果直接给出回答，不要再调用工具）',
          },
        },
        searchCallsIncrement,
      };
    }

    return {
      action: {
        type: 'empty_finish',
      },
      searchCallsIncrement,
    };
  }

  return {
    action: {
      type: 'execute_local_tools',
      ...(decisionBufferedText ? { noteText: decisionBufferedText } : {}),
      localCalls,
    },
    searchCallsIncrement,
  };
}
