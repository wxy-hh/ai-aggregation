/**
 * Agent 编排器运行级测试（agent-runner.test.ts）
 *
 * 接缝策略：
 * 1. 测试层级：runner 级单元测试，直接调用 `runAgent` 函数，不启动外层 HTTP handler，不 mock 鉴权与计费。
 * 2. 模型接缝：使用 `vi.mock('ai')` 仅替换 `streamText`，保留 `tool`、`zodSchema`、`stepCountIs` 等真实实现。
 * 3. 工具注册表：使用 `createToolRegistry` 注册真实的假工具规格，检验工具执行与消息回注的全流程。
 * 4. 验证核心：Responses API 链式增量回传（previousResponseId、仅发送 tool-result 增量、决策步 maxToolCalls=3、收尾步无 maxToolCalls）与无响应 id 时的全量回退机制。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { Message as ChatMessage } from '@/stores/chat-store';
import type { AgentToolSpec, ToolRegistry } from '@/lib/agent/registry';
import { createToolRegistry } from '@/lib/agent/registry';
import { AGENT_MAX_TOOL_CALLS_PER_ROUND } from './agent-config';
import { runAgent } from './agent-runner';
import { createAgentRuntimeContext, type AgentRuntimeContext } from './runtime-context';

// 仅替换 streamText，保留 tool、zodSchema、stepCountIs 等真实实现
const { streamTextMock } = vi.hoisted(() => {
  return {
    streamTextMock: vi.fn(),
  };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: streamTextMock };
});

/** 统一默认的 token 消耗统计（符合 normalizeUsage 解析规范） */
const DEFAULT_USAGE = { inputTokens: 10, outputTokens: 5, totalTokens: 15 };

/** 构造一次 streamText 的假返回（决策步与收尾步共用） */
function makeFakeResult(
  opts: {
    textParts?: string[];
    toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
    usage?: unknown;
    finishReason?: string;
    response?: { id?: string; messages?: Array<{ role: string; content: string }> };
  } = {}
) {
  const defaultMessages = [{ role: 'assistant', content: '决策步消息' }];
  let responseData: { id?: string; messages: Array<{ role: string; content: string }> };

  if (opts.response !== undefined) {
    responseData = {
      messages: opts.response.messages ?? defaultMessages,
      ...(opts.response.id !== undefined ? { id: opts.response.id } : {}),
    };
  } else {
    responseData = {
      id: 'resp_default',
      messages: defaultMessages,
    };
  }

  return {
    fullStream: (async function* () {
      for (const text of opts.textParts ?? []) {
        yield { type: 'text-delta', text };
      }
    })(),
    toolCalls: Promise.resolve(opts.toolCalls ?? []),
    usage: Promise.resolve(opts.usage !== undefined ? opts.usage : DEFAULT_USAGE),
    finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
    response: Promise.resolve(responseData),
  };
}

/** 从 ReadableStream 读取并解析 SSE 事件数组 */
async function readSseEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

/**
 * 用内存注册表构造 Agent 运行时上下文（测试不触库：用户工具加载注入为空实现）。
 * baseRegistry 原样透传 → 快照直接复用该注册表，行为与旧 `registry` 入参完全等价。
 */
function testRuntime(registry: ToolRegistry): Promise<AgentRuntimeContext> {
  return createAgentRuntimeContext({
    userId: 'u1',
    loadUserTools: async () => [],
    baseRegistry: registry,
  });
}

describe('agent-runner 链式迁移测试（runner 级）', () => {
  let fakeToolSpec: AgentToolSpec;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');

    fakeToolSpec = {
      name: 'test_tool',
      description: '测试假工具',
      parameters: z.object({}),
      execute: vi.fn(async () => ({
        ok: true,
        contentForModel: '工具结果内容',
        summaryForDisplay: '完成',
      })),
    };
  });

  it('链式增量发送：首轮全量且带 maxToolCalls，次轮仅回发增量工具结果带 previousResponseId 与 maxToolCalls', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'c1', toolName: 'test_tool', input: {} }],
          response: { id: 'resp_1' },
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['最终回答内容'],
          response: { id: 'resp_2' },
        })
      );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    await readSseEvents(stream);

    expect(streamTextMock).toHaveBeenCalledTimes(2);

    // 第 1 次调用：全量历史，无 previousResponseId，有 maxToolCalls=3
    const firstCall = streamTextMock.mock.calls[0][0];
    expect(firstCall.messages).toEqual([{ role: 'user', content: '测试' }]);
    expect(firstCall.providerOptions?.openai?.previousResponseId).toBeUndefined();
    expect(firstCall.providerOptions?.openai?.maxToolCalls).toBe(AGENT_MAX_TOOL_CALLS_PER_ROUND);

    // 第 2 次调用：仅 1 条 role:'tool' 消息，带 previousResponseId='resp_1'，有 maxToolCalls=3
    const secondCall = streamTextMock.mock.calls[1][0];
    expect(secondCall.messages).toHaveLength(1);
    expect(secondCall.messages[0].role).toBe('tool');
    expect(secondCall.messages[0].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'c1',
        toolName: 'test_tool',
        output: { type: 'text', value: '工具结果内容' },
      },
    ]);
    expect(secondCall.providerOptions?.openai?.previousResponseId).toBe('resp_1');
    expect(secondCall.providerOptions?.openai?.maxToolCalls).toBe(AGENT_MAX_TOOL_CALLS_PER_ROUND);
  });

  it('收尾步同样链式且无 maxToolCalls：用尽决策步后收尾步仅回发工具结果、带上一步响应 id 且不带 tools 与 maxToolCalls', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 前 4 次决策步均返回工具调用，耗尽 4 轮决策步预算（AGENT_MAX_STEPS = 5）
    // 传入不同的 input 参数，避免触发 runner 的重复调用去重保护
    for (let i = 1; i <= 4; i++) {
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: `c${i}`, toolName: 'test_tool', input: { step: i } }],
          response: { id: `resp_${i}` },
        })
      );
    }

    // 第 5 次收尾步返回纯文本
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['强制收尾最终文本'],
        response: { id: 'resp_5' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    await readSseEvents(stream);

    expect(streamTextMock).toHaveBeenCalledTimes(5);

    // 第 5 次调用（收尾步）：仅 1 条 tool 消息、带 previousResponseId='resp_4'、无 tools 参数、无 maxToolCalls
    const fifthCall = streamTextMock.mock.calls[4][0];
    expect(fifthCall.messages).toHaveLength(1);
    expect(fifthCall.messages[0].role).toBe('tool');
    expect(fifthCall.messages[0].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'c4',
        toolName: 'test_tool',
        output: { type: 'text', value: '工具结果内容' },
      },
    ]);
    expect(fifthCall.providerOptions?.openai?.previousResponseId).toBe('resp_4');
    expect(fifthCall.tools).toBeUndefined();
    expect(fifthCall.providerOptions?.openai?.maxToolCalls).toBeUndefined();
  });

  it('finishReason other 按正常完成：单次决策输出文本，事件流无 warning 且 onFinish 标记 success', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['正常回答文本'],
        finishReason: 'other',
        response: { id: 'resp_1' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    expect(events.some((e) => e.type === 'text-delta')).toBe(true);
    expect(events.some((e) => e.type === 'warning')).toBe(false);
    expect(onFinishMock).toHaveBeenCalledTimes(1);
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' })
    );
  });

  it('finishReason length 触发截断 warning：单次决策输出文本被截断，事件流包含 warning 且文案含截断', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['被截断的回答文本'],
        finishReason: 'length',
        response: { id: 'resp_1' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    const warningEvent = events.find((e) => e.type === 'warning');
    expect(warningEvent).toBeDefined();
    expect(typeof warningEvent?.warning).toBe('string');
    expect((warningEvent?.warning as string).includes('截断')).toBe(true);
  });

  it('无响应 id 时回退全量发送：两次调用响应均不带 id 时，第 2 次调用全量回发历史与中间消息且无 previousResponseId', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 两次调用的 response 均不带 id 属性
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'c1', toolName: 'test_tool', input: {} }],
          response: {
            messages: [{ role: 'assistant', content: '第 1 轮助手消息' }],
          },
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['最终回答文本'],
          response: {
            messages: [{ role: 'assistant', content: '第 2 轮助手消息' }],
          },
        })
      );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    await readSseEvents(stream);

    expect(streamTextMock).toHaveBeenCalledTimes(2);

    const secondCall = streamTextMock.mock.calls[1][0];
    // 验证第 2 次调用的 messages 为全量发送（长度 > 1，包含用户消息、助手消息与工具结果消息）
    expect(secondCall.messages.length).toBeGreaterThan(1);
    expect(secondCall.messages).toEqual([
      { role: 'user', content: '测试' },
      { role: 'assistant', content: '第 1 轮助手消息' },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'test_tool',
            output: { type: 'text', value: '工具结果内容' },
          },
        ],
      },
    ]);
    // 验证无 previousResponseId
    expect(secondCall.providerOptions?.openai?.previousResponseId).toBeUndefined();
  });
});

describe('web_search providerExecuted 映射', () => {
  let fakeToolSpec: AgentToolSpec;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');

    fakeToolSpec = {
      name: 'test_tool',
      description: '测试假工具',
      parameters: z.object({
        index: z.number().optional(),
      }),
      execute: vi.fn(async () => ({
        ok: true,
        contentForModel: '工具结果内容',
        summaryForDisplay: '完成',
      })),
    };
  });

  /** 构造包含自定义 streamPart 与 providerExecuted 字段的假 streamText 返回 */
  function makeFakeStreamResult(
    opts: {
      streamParts?: Array<{
        type: string;
        text?: string;
        toolCallId?: string;
        toolName?: string;
        providerExecuted?: boolean;
        output?: unknown;
      }>;
      toolCalls?: Array<{
        toolCallId: string;
        toolName: string;
        input: unknown;
        providerExecuted?: boolean;
      }>;
      usage?: unknown;
      finishReason?: string;
      response?: { id?: string; messages?: Array<{ role: string; content: string }> };
    } = {}
  ) {
    const defaultMessages = [{ role: 'assistant', content: '决策步消息' }];
    let responseData: { id?: string; messages: Array<{ role: string; content: string }> };

    if (opts.response !== undefined) {
      responseData = {
        messages: opts.response.messages ?? defaultMessages,
        ...(opts.response.id !== undefined ? { id: opts.response.id } : {}),
      };
    } else {
      responseData = {
        id: 'resp_default',
        messages: defaultMessages,
      };
    }

    return {
      fullStream: (async function* () {
        for (const part of opts.streamParts ?? []) {
          yield part;
        }
      })(),
      toolCalls: Promise.resolve(opts.toolCalls ?? []),
      usage: Promise.resolve(opts.usage !== undefined ? opts.usage : DEFAULT_USAGE),
      finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
      response: Promise.resolve(responseData),
    };
  }

  it('事件成对映射 + query 摘要', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeStreamResult({
        streamParts: [
          { type: 'tool-call', toolCallId: 'ws1', toolName: 'web_search', providerExecuted: true },
          {
            type: 'tool-result',
            toolCallId: 'ws1',
            toolName: 'web_search',
            providerExecuted: true,
            output: { action: { query: '今天新闻' } },
          },
          { type: 'text-delta', text: '今日新闻头条' },
        ],
        toolCalls: [
          { toolCallId: 'ws1', toolName: 'web_search', input: {}, providerExecuted: true },
        ],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 断言 SSE 事件：含 tool_call（call.name='web_search'、call.id='ws1'）
    const toolCallEvent = events.find((e) => e.type === 'tool_call');
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent).toMatchObject({
      type: 'tool_call',
      call: { id: 'ws1', name: 'web_search' },
    });

    // 配对的 tool_result（callId='ws1'、status='success'、summary='查询词：今天新闻'）
    const toolResultEvent = events.find((e) => e.type === 'tool_result');
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent).toMatchObject({
      type: 'tool_result',
      callId: 'ws1',
      name: 'web_search',
      status: 'success',
      summary: '查询词：今天新闻',
    });

    // 正文 text-delta 正常
    const textDeltaEvent = events.find((e) => e.type === 'text-delta');
    expect(textDeltaEvent).toBeDefined();
    expect(textDeltaEvent).toMatchObject({
      type: 'text-delta',
      text: '今日新闻头条',
    });

    // onFinish 收到 outcome 'success' 且 searchCalls: 1
    expect(onFinishMock).toHaveBeenCalledTimes(1);
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        searchCalls: 1,
      })
    );
  });

  it('providerExecuted-only 步骤路由为最终回答', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeStreamResult({
        streamParts: [
          { type: 'tool-call', toolCallId: 'ws1', toolName: 'web_search', providerExecuted: true },
          {
            type: 'tool-result',
            toolCallId: 'ws1',
            toolName: 'web_search',
            providerExecuted: true,
            output: { action: { query: '今天新闻' } },
          },
          { type: 'text-delta', text: '最终回答内容' },
        ],
        toolCalls: [
          { toolCallId: 'ws1', toolName: 'web_search', input: {}, providerExecuted: true },
        ],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 断言假工具 execute 未被调用
    expect(fakeToolSpec.execute).not.toHaveBeenCalled();

    // 验证仅调用 1 次模型（循环结束，未进入收尾步）
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    // 文本走 text-delta（即被视为最终回答）
    expect(events.some((e) => e.type === 'text-delta' && e.text === '最终回答内容')).toBe(true);

    // 事件流里没有 agent_note
    expect(events.some((e) => e.type === 'agent_note')).toBe(false);
  });

  it('providerExecuted 不计入自有工具上限', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 决策步返回 2 个 providerExecuted 的 web_search + 3 个自有 test_tool 调用（共 5 个）
    streamTextMock
      .mockReturnValueOnce(
        makeFakeStreamResult({
          streamParts: [
            { type: 'tool-call', toolCallId: 'ws1', toolName: 'web_search', providerExecuted: true },
            {
              type: 'tool-result',
              toolCallId: 'ws1',
              toolName: 'web_search',
              providerExecuted: true,
              output: { action: { query: '查询词1' } },
            },
            { type: 'tool-call', toolCallId: 'ws2', toolName: 'web_search', providerExecuted: true },
            {
              type: 'tool-result',
              toolCallId: 'ws2',
              toolName: 'web_search',
              providerExecuted: true,
              output: { action: { query: '查询词2' } },
            },
          ],
          toolCalls: [
            { toolCallId: 'ws1', toolName: 'web_search', input: {}, providerExecuted: true },
            { toolCallId: 'ws2', toolName: 'web_search', input: {}, providerExecuted: true },
            { toolCallId: 'c1', toolName: 'test_tool', input: { index: 1 } },
            { toolCallId: 'c2', toolName: 'test_tool', input: { index: 2 } },
            { toolCallId: 'c3', toolName: 'test_tool', input: { index: 3 } },
          ],
          response: { id: 'resp_1' },
        })
      )
      // 第 2 次 streamText 调用返回纯文本收尾
      .mockReturnValueOnce(
        makeFakeStreamResult({
          streamParts: [{ type: 'text-delta', text: '收尾回答' }],
          toolCalls: [],
          response: { id: 'resp_2' },
        })
      );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 断言假工具 execute 恰好被调 3 次（自有调用全执行，未因单轮超限被 skip）
    expect(fakeToolSpec.execute).toHaveBeenCalledTimes(3);

    // 断言 SSE 中 tool_result 事件 status 全是 success
    const toolResultEvents = events.filter((e) => e.type === 'tool_result');
    expect(toolResultEvents).toHaveLength(5);
    expect(toolResultEvents.every((e) => e.status === 'success')).toBe(true);
  });

  it('searchCalls 只数 web_search', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeStreamResult({
        streamParts: [
          { type: 'tool-call', toolCallId: 'ws1', toolName: 'web_search', providerExecuted: true },
          {
            type: 'tool-result',
            toolCallId: 'ws1',
            toolName: 'web_search',
            providerExecuted: true,
            output: { action: { query: '搜索关键词' } },
          },
          { type: 'tool-call', toolCallId: 'ob1', toolName: 'other_builtin', providerExecuted: true },
          {
            type: 'tool-result',
            toolCallId: 'ob1',
            toolName: 'other_builtin',
            providerExecuted: true,
            output: {},
          },
          { type: 'text-delta', text: '最终回答' },
        ],
        toolCalls: [
          { toolCallId: 'ws1', toolName: 'web_search', input: {}, providerExecuted: true },
          { toolCallId: 'ob1', toolName: 'other_builtin', input: {}, providerExecuted: true },
        ],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 断言 onFinish 的 searchCalls === 1
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({ searchCalls: 1 })
    );

    // 断言 other_builtin 的 tool_result 事件 summary 为 '搜索完成'（query 缺失时的兜底）
    const otherResult = events.find((e) => e.type === 'tool_result' && e.callId === 'ob1');
    expect(otherResult).toBeDefined();
    expect(otherResult?.summary).toBe('搜索完成');
  });

  it('query 缺失兜底', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeStreamResult({
        streamParts: [
          { type: 'tool-call', toolCallId: 'ws1', toolName: 'web_search', providerExecuted: true },
          {
            type: 'tool-result',
            toolCallId: 'ws1',
            toolName: 'web_search',
            providerExecuted: true,
            output: {},
          },
          { type: 'text-delta', text: '最终回答' },
        ],
        toolCalls: [
          { toolCallId: 'ws1', toolName: 'web_search', input: {}, providerExecuted: true },
        ],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 断言不抛错，流程正常完成
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' })
    );

    // 断言 web_search 的 summary 为 '搜索完成'
    const wsResult = events.find((e) => e.type === 'tool_result' && e.callId === 'ws1');
    expect(wsResult).toBeDefined();
    expect(wsResult?.summary).toBe('搜索完成');
  });

  it('providerExecuted-only 且无文本：不终结，链上补引导语续跑一轮', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock
      .mockReturnValueOnce(
        // 第 1 步：只有服务端搜索，无正文（典型：搜索被 maxToolCalls 按轮截断）
        makeFakeStreamResult({
          streamParts: [
            { type: 'tool-call', toolCallId: 'ws1', toolName: 'web_search', providerExecuted: true },
            {
              type: 'tool-result',
              toolCallId: 'ws1',
              toolName: 'web_search',
              providerExecuted: true,
              output: { action: { query: '今天新闻' } },
            },
          ],
          toolCalls: [
            { toolCallId: 'ws1', toolName: 'web_search', input: {}, providerExecuted: true },
          ],
          response: { id: 'resp_s1' },
        })
      )
      .mockReturnValueOnce(
        // 第 2 步：模型基于服务端已有的搜索结果给出最终回答
        makeFakeStreamResult({
          streamParts: [{ type: 'text-delta', text: '基于搜索的最终回答' }],
          response: { id: 'resp_s2' },
        })
      );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ id: 'm1', role: 'user', content: '测试' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 续跑的第 2 次调用：链式（previousResponseId=resp_s1）且只带引导语增量
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const secondCall = streamTextMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: unknown }>;
      providerOptions?: { openai?: { previousResponseId?: string } };
    };
    expect(secondCall.messages).toHaveLength(1);
    expect(secondCall.messages[0].role).toBe('user');
    expect(String(secondCall.messages[0].content)).toContain('搜索');
    expect(secondCall.providerOptions?.openai?.previousResponseId).toBe('resp_s1');

    // 最终回答正常下发，按成功结算（搜索次数照常计数）
    expect(
      events.some((e) => e.type === 'text-delta' && String(e.text).includes('最终回答'))
    ).toBe(true);
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success', searchCalls: 1 })
    );
  });

  describe('场景能力包专属注入与 8 步扩容 (ADR-0014 / 工单 01)', () => {
    it('决策步应注入能力包专属 systemPrompt', async () => {
      const registry = createToolRegistry([fakeToolSpec]);
      const onFinishMock = vi.fn(async () => {});

      streamTextMock.mockReturnValueOnce(
        makeFakeStreamResult({
          streamParts: [{ type: 'text-delta', text: '研报最终文本' }],
          toolCalls: [],
        })
      );

      const stream = runAgent({
        userId: 'u1',
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        messages: [{ id: 'm1', role: 'user', content: '调研' }] as ChatMessage[],
        stepOutputLimit: 2048,
        signal: new AbortController().signal,
        errorId: 'test',
        runtime: await testRuntime(registry),
        capabilityPack: 'deep-research',
        onFinish: onFinishMock,
      });

      await readSseEvents(stream);

      expect(streamTextMock).toHaveBeenCalledTimes(1);
      const callArgs = streamTextMock.mock.calls[0][0] as {
        system?: string;
      };
      expect(callArgs.system).toBeDefined();
      expect(callArgs.system).toContain('深度调研');
    });

    it('deep-research 场景下，effectiveMaxSteps 取 8 步，允许执行多轮决策直至收尾', async () => {
      const registry = createToolRegistry([fakeToolSpec]);
      const onFinishMock = vi.fn(async () => {});

      // 模拟 7 轮工具调用 + 1 轮收尾步（共 8 次 streamText）
      for (let i = 1; i <= 7; i++) {
        streamTextMock.mockReturnValueOnce(
          makeFakeStreamResult({
            streamParts: [],
            toolCalls: [{ toolCallId: `call_${i}`, toolName: 'test_tool', input: { index: i } }],
            response: { id: `resp_${i}` },
          })
        );
      }
      // 收尾步
      streamTextMock.mockReturnValueOnce(
        makeFakeStreamResult({
          streamParts: [{ type: 'text-delta', text: '第 8 步最终收尾报告' }],
          toolCalls: [],
          response: { id: 'resp_summary' },
        })
      );

      const stream = runAgent({
        userId: 'u1',
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        messages: [{ id: 'm1', role: 'user', content: '长流程探索' }] as ChatMessage[],
        stepOutputLimit: 2048,
        signal: new AbortController().signal,
        errorId: 'test',
        runtime: await testRuntime(registry),
        capabilityPack: 'deep-research',
        onFinish: onFinishMock,
      });

      const events = await readSseEvents(stream);

      // 共执行了 7 次决策 + 1 次收尾 = 8 次 streamText 调用
      expect(streamTextMock).toHaveBeenCalledTimes(8);
      // 收尾步不挂 tools
      const summaryCall = streamTextMock.mock.calls[7][0] as { tools?: unknown };
      expect(summaryCall.tools).toBeUndefined();

      expect(
        events.some((e) => e.type === 'text-delta' && e.text === '第 8 步最终收尾报告')
      ).toBe(true);
      expect(onFinishMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'success' })
      );
    });
  });
});

