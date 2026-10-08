/**
 * 工具流投影适配器单测（tool-projector.test.ts）
 *
 * 接缝策略（ADR-0009）：
 * - 本测试位于 lib 层，零框架级 mock，直接构造 fake 流（AsyncIterable）与 toolCalls；
 * - 验证各种模型流输出下的事件映射（tool_call / tool_result 成对下发）、
 *   查询词提取兜底、以及归一化的步骤动作契约（StepAction）。
 */

import { describe, expect, it, vi } from 'vitest';
import type { ModelMessage } from 'ai';
import {
  projectDecisionStream,
  type StepAction,
  type ProjectorOutcome,
} from './tool-projector';

/** 构造模拟的异步流 */
async function* makeFakeStream(parts: Array<Record<string, unknown>>) {
  for (const part of parts) {
    yield part;
  }
}

describe('ToolStreamProjector 工具流投影适配器', () => {
  it('服务端工具执行并产出最终文本：正确映射成对事件与提取查询词，规约为 deliver_answer', async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const stream = makeFakeStream([
      {
        type: 'tool-call',
        toolCallId: 'call_ws_1',
        toolName: 'web_search',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call_ws_1',
        toolName: 'web_search',
        providerExecuted: true,
        output: { action: { query: '2026年诺贝尔奖' } },
      },
      {
        type: 'text-delta',
        text: '根据搜索结果，今年的获奖者是...',
      },
    ]);

    const rawToolCalls = [
      {
        toolCallId: 'call_ws_1',
        toolName: 'web_search',
        input: {},
        providerExecuted: true,
      },
    ];

    const outcome: ProjectorOutcome = await projectDecisionStream(
      stream,
      rawToolCalls,
      {
        onEvent: (ev) => events.push(ev as { type: string; [key: string]: unknown }),
      }
    );

    // 验证事件成对下发
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'tool_call',
      call: { id: 'call_ws_1', name: 'web_search', argsSummary: '' },
    });
    expect(events[1]).toEqual({
      type: 'tool_result',
      callId: 'call_ws_1',
      name: 'web_search',
      status: 'success',
      summary: '查询词：2026年诺贝尔奖',
    });

    // 验证计费观测计数
    expect(outcome.searchCallsIncrement).toBe(1);

    // 验证动作规约
    expect(outcome.action).toEqual({
      type: 'deliver_answer',
      text: '根据搜索结果，今年的获奖者是...',
    });
  });

  it('查询词结构缺失时：正确兜底为「搜索完成」且不报错', async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const stream = makeFakeStream([
      {
        type: 'tool-call',
        toolCallId: 'call_ws_2',
        toolName: 'web_search',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call_ws_2',
        toolName: 'web_search',
        providerExecuted: true,
        output: null,
      },
      {
        type: 'text-delta',
        text: '搜索完成后的回答',
      },
    ]);

    const rawToolCalls = [
      {
        toolCallId: 'call_ws_2',
        toolName: 'web_search',
        input: {},
        providerExecuted: true,
      },
    ];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev as { type: string; [key: string]: unknown }),
    });

    expect(events[1]).toMatchObject({
      type: 'tool_result',
      status: 'success',
      summary: '搜索完成',
    });
    expect(outcome.action.type).toBe('deliver_answer');
  });

  it('仅有服务端工具执行且无文本（被截断）：动作规约为 nudge_continue 引导语续跑一轮', async () => {
    const events: Array<unknown> = [];
    const stream = makeFakeStream([
      {
        type: 'tool-call',
        toolCallId: 'call_ws_3',
        toolName: 'web_search',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call_ws_3',
        toolName: 'web_search',
        providerExecuted: true,
        output: { action: { query: '量子计算突破' } },
      },
    ]);

    const rawToolCalls = [
      {
        toolCallId: 'call_ws_3',
        toolName: 'web_search',
        input: {},
        providerExecuted: true,
      },
    ];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev),
    });

    expect(outcome.searchCallsIncrement).toBe(1);
    expect(outcome.action).toEqual({
      type: 'nudge_continue',
      nudgeMessage: {
        role: 'user',
        content: '（系统提示：搜索已完成，请基于搜索结果直接给出回答，不要再调用工具）',
      },
    });
  });

  it('仅有本地自有工具调用（带文本旁白）：规约为 execute_local_tools 并携带 noteText', async () => {
    const events: Array<unknown> = [];
    const stream = makeFakeStream([
      {
        type: 'text-delta',
        text: '我需要先抓取网页内容...',
      },
      {
        type: 'tool-call',
        toolCallId: 'call_local_1',
        toolName: 'web_fetch',
      },
    ]);

    const rawToolCalls = [
      {
        toolCallId: 'call_local_1',
        toolName: 'web_fetch',
        input: { url: 'https://example.com' },
      },
    ];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev),
    });

    // 本地工具不在流式适配器中下发事件（由 runner 执行时下发）
    expect(events).toHaveLength(0);
    expect(outcome.searchCallsIncrement).toBe(0);
    expect(outcome.action).toEqual({
      type: 'execute_local_tools',
      noteText: '我需要先抓取网页内容...',
      localCalls: [
        {
          toolCallId: 'call_local_1',
          toolName: 'web_fetch',
          input: { url: 'https://example.com' },
        },
      ],
    });
  });

  it('服务端工具与本地工具混合调用：服务端工具直透事件，仅保留本地工具交由 execute_local_tools', async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const stream = makeFakeStream([
      {
        type: 'tool-call',
        toolCallId: 'call_ws_4',
        toolName: 'web_search',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call_ws_4',
        toolName: 'web_search',
        providerExecuted: true,
        output: { action: { query: '设计图' } },
      },
      {
        type: 'tool-call',
        toolCallId: 'call_img_1',
        toolName: 'image_generate',
      },
      {
        type: 'text-delta',
        text: '正在综合搜索结果绘图...',
      },
    ]);

    const rawToolCalls = [
      {
        toolCallId: 'call_ws_4',
        toolName: 'web_search',
        input: {},
        providerExecuted: true,
      },
      {
        toolCallId: 'call_img_1',
        toolName: 'image_generate',
        input: { prompt: '星空' },
      },
    ];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev as { type: string; [key: string]: unknown }),
    });

    // 服务端工具下发了 tool_call 和 tool_result
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe('tool_call');
    expect(events[1].type).toBe('tool_result');

    // 本地工具列表已剥离服务端工具
    expect(outcome.action).toEqual({
      type: 'execute_local_tools',
      noteText: '正在综合搜索结果绘图...',
      localCalls: [
        {
          toolCallId: 'call_img_1',
          toolName: 'image_generate',
          input: { prompt: '星空' },
        },
      ],
    });
    expect(outcome.searchCallsIncrement).toBe(1);
  });

  it('空决策（无工具、无文本、无服务端执行）：规约为 empty_finish', async () => {
    const events: Array<unknown> = [];
    const stream = makeFakeStream([]);
    const rawToolCalls: Array<any> = [];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev),
    });

    expect(events).toHaveLength(0);
    expect(outcome.searchCallsIncrement).toBe(0);
    expect(outcome.action).toEqual({
      type: 'empty_finish',
    });
  });

  it('无工具但有文本：直接规约为 deliver_answer', async () => {
    const events: Array<unknown> = [];
    const stream = makeFakeStream([
      {
        type: 'text-delta',
        text: '你好！有什么我可以帮你的？',
      },
    ]);
    const rawToolCalls: Array<any> = [];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev),
    });

    expect(events).toHaveLength(0);
    expect(outcome.searchCallsIncrement).toBe(0);
    expect(outcome.action).toEqual({
      type: 'deliver_answer',
      text: '你好！有什么我可以帮你的？',
    });
  });

  it('非 web_search 的其它服务端工具（如将来扩展）：不计入 searchCallsIncrement 但正确投影事件', async () => {
    const events: Array<{ type: string; [key: string]: unknown }> = [];
    const stream = makeFakeStream([
      {
        type: 'tool-call',
        toolCallId: 'call_other_1',
        toolName: 'other_server_tool',
        providerExecuted: true,
      },
      {
        type: 'tool-result',
        toolCallId: 'call_other_1',
        toolName: 'other_server_tool',
        providerExecuted: true,
        output: { result: 'ok' },
      },
      {
        type: 'text-delta',
        text: '完成处理',
      },
    ]);

    const rawToolCalls = [
      {
        toolCallId: 'call_other_1',
        toolName: 'other_server_tool',
        input: {},
        providerExecuted: true,
      },
    ];

    const outcome = await projectDecisionStream(stream, rawToolCalls, {
      onEvent: (ev) => events.push(ev as { type: string; [key: string]: unknown }),
    });

    expect(events).toHaveLength(2);
    // 非 web_search 不累加 searchCalls
    expect(outcome.searchCallsIncrement).toBe(0);
    expect(outcome.action).toEqual({
      type: 'deliver_answer',
      text: '完成处理',
    });
  });
});
