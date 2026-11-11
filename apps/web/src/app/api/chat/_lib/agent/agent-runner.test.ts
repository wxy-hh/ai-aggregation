/**
 * Agent 编排器运行级测试（agent-runner.test.ts）
 *
 * 接缝策略：
 * 1. 测试层级：runner 级单元测试，直接调用 `runAgent` 函数，不启动外层 HTTP handler，不 mock 鉴权与计费。
 * 2. 模型接缝：使用 `vi.mock('ai')` 仅替换 `streamText`，保留 `tool`、`zodSchema`、`stepCountIs` 等真实实现。
 * 3. 工具注册表：使用 `createToolRegistry` 注册真实的假工具规格，检验工具执行与消息回注的全流程。
 * 4. 验证核心：Responses API 链式增量回传（previousResponseId、仅发送 tool-result 增量、决策步 maxToolCalls=3、收尾步无 maxToolCalls）与无响应 id 时的全量回退机制。
 */

import {
  setupAiSdkMocks,
  streamTextMock,
  generateTextMock,
} from '../testing/mock-ai-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { WireMessage } from '@repo/shared';
import type { AgentToolSpec, ToolRegistry } from '@/lib/agent/registry';
import { createToolRegistry } from '@/lib/agent/registry';
import { AGENT_MAX_TOOL_CALLS_PER_ROUND } from './agent-config';
import { runAgent } from './agent-runner';
import { generateAgentPlan } from './planner';
import { createAgentRuntimeContext, type AgentRuntimeContext } from './runtime-context';

const { evaluateAgentProgressMock } = vi.hoisted(() => {
  return {
    evaluateAgentProgressMock: vi.fn(),
  };
});

vi.mock('./evaluator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./evaluator')>();
  return {
    ...actual,
    evaluateAgentProgress: evaluateAgentProgressMock,
  };
});

vi.mock('./planner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./planner')>();
  return {
    ...actual,
    generateAgentPlan: vi.fn(async () => null),
  };
});

beforeEach(() => {
  setupAiSdkMocks();
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
    evaluateAgentProgressMock.mockResolvedValue({ passed: true, missingAspects: [] });

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
      messages: [{ role: 'user', content: '测试' }],
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

    // 前 3 次决策步均返回工具调用，耗尽常规决策轮次（AGENT_MAX_STEPS = 5：3 轮常规 + 1 步自愈预留 + 1 步收尾）
    // 传入不同的 input 参数，避免触发 runner 的重复调用去重保护
    for (let i = 1; i <= 3; i++) {
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: `c${i}`, toolName: 'test_tool', input: { step: i } }],
          response: { id: `resp_${i}` },
        })
      );
    }

    // 第 4 次收尾步返回纯文本（质检通过，自愈预留步不使用）
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['强制收尾最终文本'],
        response: { id: 'resp_4' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '测试' }],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    await readSseEvents(stream);

    expect(streamTextMock).toHaveBeenCalledTimes(4);

    // 第 4 次调用（收尾步）：仅 1 条 tool 消息、带 previousResponseId='resp_3'、无 tools 参数、无 maxToolCalls
    const fifthCall = streamTextMock.mock.calls[3][0];
    expect(fifthCall.messages).toHaveLength(1);
    expect(fifthCall.messages[0].role).toBe('tool');
    expect(fifthCall.messages[0].content).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'c3',
        toolName: 'test_tool',
        output: { type: 'text', value: '工具结果内容' },
      },
    ]);
    expect(fifthCall.providerOptions?.openai?.previousResponseId).toBe('resp_3');
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
      messages: [{ role: 'user', content: '测试' }],
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
      messages: [{ role: 'user', content: '测试' }],
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

  it('收尾步输出包含 <artifact> 标签时，流式下发 artifact_* 事件且剔除普通正文', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 模拟决策步无工具，收尾步产出研报
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: [
          '导语：已完成分析。\n',
          '<artifact identifier="art_report_1" type="markdown" title="AI 产业调研">\n',
          '# 核心结论\n技术迭代迅速。',
          '</artifact>\n请查阅右侧。',
        ],
        response: { id: 'resp_art' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '深度调研' }],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    const startEvent = events.find((e) => e.type === 'artifact_start');
    expect(startEvent).toBeDefined();
    expect(startEvent).toEqual({
      type: 'artifact_start',
      artifact: {
        id: 'art_report_1',
        type: 'markdown',
        title: 'AI 产业调研',
      },
    });

    const deltaEvents = events.filter((e) => e.type === 'artifact_delta');
    const fullArtifactContent = deltaEvents.map((e) => e.delta).join('');
    expect(fullArtifactContent).toBe('\n# 核心结论\n技术迭代迅速。');

    const endEvent = events.find((e) => e.type === 'artifact_end');
    expect(endEvent).toEqual({
      type: 'artifact_end',
      id: 'art_report_1',
      status: 'complete',
    });

    const textDeltas = events.filter((e) => e.type === 'text-delta').map((e) => e.text).join('');
    expect(textDeltas).toBe('导语：已完成分析。\n\n请查阅右侧。');
  });

  it('输出触顶（finishReason length）且产物标签未闭合时，最后一个 artifact_end 状态为 error，不冒充完成', async () => {
    const registry = createToolRegistry([fakeToolSpec]);

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: [
          '<artifact identifier="art_long" type="markdown" title="超长研报">\n',
          '# 第一章\n写到一半就被截断',
        ],
        finishReason: 'length',
        response: { id: 'resp_len' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '写一份超长研报' }],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
    });

    const events = await readSseEvents(stream);
    const ends = events.filter((e) => e.type === 'artifact_end');
    expect(ends).toHaveLength(1);
    expect(ends[ends.length - 1]).toEqual({ type: 'artifact_end', id: 'art_long', status: 'error' });
    expect(events.some((e) => e.type === 'warning')).toBe(true);
  });

  it('工具产出图片附件时，通过 tool_result 下发附件，不额外推送 artifact 事件（避免强行弹开工作台）', async () => {
    const imageToolSpec: AgentToolSpec = {
      name: 'image_generate',
      description: '生成图片',
      parameters: z.object({ prompt: z.string().optional() }),
      execute: async () => ({
        ok: true,
        contentForModel: '图片生成成功',
        summaryForDisplay: '已生成图片',
        attachment: {
          kind: 'image',
          url: 'https://example.com/generated-cat.png',
        },
      }),
    };

    const registry = createToolRegistry([imageToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 第 1 步调用生图工具，第 2 步收尾输出
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'call_img_1', toolName: 'image_generate', input: { prompt: '猫咪' } }],
          response: { id: 'resp_step1' },
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['这是为您生成的猫咪图片。'],
          response: { id: 'resp_step2' },
        })
      );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '画一只猫' }],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test_img',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 验证 tool_result 正确携带了图片附件
    const toolResultEvent = events.find((e) => e.type === 'tool_result');
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent).toMatchObject({
      type: 'tool_result',
      callId: 'call_img_1',
      name: 'image_generate',
      status: 'success',
      attachment: {
        kind: 'image',
        url: 'https://example.com/generated-cat.png',
      },
    });

    // 核心契约：绝对不产生 artifact_start 事件（不弹开工作台）
    const artifactEvents = events.filter(
      (e) => typeof e.type === 'string' && e.type.startsWith('artifact_')
    );
    expect(artifactEvents).toHaveLength(0);

    // 审计流水中不包含 artifactRefs
    expect(onFinishMock).toHaveBeenCalled();
    const finishArg = (onFinishMock.mock.calls as unknown as Array<[Record<string, unknown>]>)[0]?.[0];
    expect(finishArg?.artifactRefs).toEqual([]);
    expect(finishArg?.outcome).toBe('success');
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
      messages: [{ role: 'user', content: '测试' }],
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
    evaluateAgentProgressMock.mockResolvedValue({ passed: true, missingAspects: [] });

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
      messages: [{ role: 'user', content: '测试' }],
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
      messages: [{ role: 'user', content: '测试' }],
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
      messages: [{ role: 'user', content: '测试' }],
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
      messages: [{ role: 'user', content: '测试' }],
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
      messages: [{ role: 'user', content: '测试' }],
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
      messages: [{ role: 'user', content: '测试' }],
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
        messages: [{ role: 'user', content: '调研' }],
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

      // 8 步 = 6 轮常规工具调用 + 1 步自愈预留（质检通过时不使用）+ 1 轮收尾步（共 7 次 streamText）
      for (let i = 1; i <= 6; i++) {
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
        messages: [{ role: 'user', content: '长流程探索' }],
        stepOutputLimit: 2048,
        signal: new AbortController().signal,
        errorId: 'test',
        runtime: await testRuntime(registry),
        capabilityPack: 'deep-research',
        onFinish: onFinishMock,
      });

      const events = await readSseEvents(stream);

      // 共执行了 6 次决策 + 1 次收尾 = 7 次 streamText 调用
      expect(streamTextMock).toHaveBeenCalledTimes(7);
      // 收尾步不挂 tools
      const summaryCall = streamTextMock.mock.calls[6][0] as { tools?: unknown };
      expect(summaryCall.tools).toBeUndefined();

      expect(
        events.some((e) => e.type === 'text-delta' && e.text === '第 8 步最终收尾报告')
      ).toBe(true);
      expect(onFinishMock).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'success' })
      );
    });
  });

  describe('自适应工具挂载 (Adaptive Tool Mounting, ADR-0016 / 工单 02)', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      process.env = { ...originalEnv, DEEPSEEK_MODEL: 'test_key', ARK_API_KEY: 'test_ark_key' };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('provider 为 deepseek 时：挂载自有工具，安全剥离 Ark 专属 web_search', async () => {
      const toolSpec: AgentToolSpec = {
        name: 'local_tool',
        description: '本地测试工具',
        parameters: z.object({ query: z.string() }),
        execute: vi.fn(async () => ({
          ok: true,
          contentForModel: '本地结果',
          summaryForDisplay: '执行成功',
        })),
      };
      const registry = createToolRegistry([toolSpec]);
      const onFinishMock = vi.fn();

      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['DeepSeek 直接回答'],
        })
      );

      const stream = runAgent({
        userId: 'u1',
        provider: 'deepseek',
        model: 'deepseek-flash',
        messages: [{ role: 'user', content: '测试' }],
        stepOutputLimit: 2048,
        signal: new AbortController().signal,
        errorId: 'test',
        runtime: await testRuntime(registry),
        onFinish: onFinishMock,
      });

      await readSseEvents(stream);

      expect(streamTextMock).toHaveBeenCalledTimes(1);
      const call = streamTextMock.mock.calls[0][0] as { tools?: Record<string, unknown> };
      expect(call.tools).toBeDefined();
      expect(call.tools?.local_tool).toBeDefined();
      // 验证 Ark 专有的 web_search 在 deepseek 下被安全剥离
      expect(call.tools?.web_search).toBeUndefined();
    });
  });
});

describe('可观测性 Generation 记录（工单 01）', () => {
  it('决策步记录 Generation 并标注 Usage 三口径', async () => {
    vi.clearAllMocks();
    const fakeToolSpec: AgentToolSpec = {
      name: 'test_obs_tool',
      description: '测试假工具',
      parameters: z.object({}),
      execute: vi.fn(async () => ({ ok: true, contentForModel: 'ok', summaryForDisplay: '完成' })),
    };
    const registry = createToolRegistry([fakeToolSpec]);
    const mockGeneration = { update: vi.fn(), end: vi.fn() };
    const mockSpan = { update: vi.fn(), end: vi.fn() };
    const mockTrace: any = {
      generation: vi.fn(() => mockGeneration),
      span: vi.fn(() => mockSpan),
      update: vi.fn(),
      end: vi.fn(),
    };

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['直接交付的文本'],
        usage: { inputTokens: 20, outputTokens: 10, totalTokens: 30 },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '测试提问' }],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test-err',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
      trace: mockTrace,
    });

    await readSseEvents(stream);

    // 验证 Generation 记录
    expect(mockTrace.generation).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'decision_round_1',
        model: 'doubao-seed-evolving',
        usageType: 'actual',
        usage: expect.objectContaining({
          promptTokens: 20,
          completionTokens: 10,
          totalTokens: 30,
        }),
        metadata: expect.objectContaining({
          priceBookVersion: '2026.1',
        }),
      })
    );
    expect(mockGeneration.end).toHaveBeenCalled();

    // 验证 Trace 整体结束
    expect(mockTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        output: '直接交付的文本',
      })
    );
    expect(mockTrace.end).toHaveBeenCalled();
  });
});

describe('TC02: 编排器自愈反思回路与步数熔断状态机', () => {
  let fakeToolSpec: AgentToolSpec;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    fakeToolSpec = {
      name: 'search_tool',
      description: '搜索测试工具',
      parameters: z.object({ query: z.string().optional() }),
      execute: vi.fn(async (input: { query?: string }) => ({
        ok: true,
        contentForModel: `结果：${input.query || '默认结果'}`,
        summaryForDisplay: `已检索：${input.query || '默认'}`,
      })),
    };
  });

  it('1. 质检打回触发自愈回路与1次硬熔断 (TC02-1)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 1. 首轮决策：调用搜索工具检索 A 和 B
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: { query: 'A与B' } }],
        response: { id: 'resp_round1' },
      })
    );

    // 2. 模拟质检评估：第一次判定未通过（遗漏C实体），自愈后复检判定通过 (P-W6)
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['实体C'],
      suggestion: '请补充搜索实体C',
    });
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: true,
      missingAspects: [],
    });

    // 3. 自愈决策步：模型响应 Nudge 提示，追加调用搜索工具检索 C
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c2', toolName: 'search_tool', input: { query: '实体C' } }],
        response: { id: 'resp_remedy' },
      })
    );

    // 4. 最终收尾步输出
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['包含A、B、C的完整对比研报'],
        response: { id: 'resp_summary' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '对比A、B和C' }],
      stepOutputLimit: 2048,
      maxSteps: 3,
      signal: new AbortController().signal,
      errorId: 'test-tc02-1',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 断言执行了 3 次 streamText（第1轮决策 + 自愈决策步 + 收尾步）
    expect(streamTextMock).toHaveBeenCalledTimes(3);

    // 断言 Evaluator 被调用 2 次（首检打回 + 自愈后复检放行，P-W6）
    expect(evaluateAgentProgressMock).toHaveBeenCalledTimes(2);

    // 断言工具被调用了两次（首轮 c1 + 自愈轮 c2）
    expect(fakeToolSpec.execute).toHaveBeenCalledTimes(2);

    // 断言 onFinish 记录了自愈与最终通过状态
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'success',
        evaluator: {
          executed: true,
          passed: true,
          remedied: true,
        },
      })
    );

    // 断言收尾步未被注入局限性约束 (P-W6: 补检材料齐备后不误杀)
    const summaryCall = streamTextMock.mock.calls[2][0];
    const lastSummaryMessage = summaryCall.messages[summaryCall.messages.length - 1];
    expect(String(lastSummaryMessage.content)).not.toContain('诚实回答局限性约束');

    // 断言正文正常输出
    expect(events.some((e) => e.type === 'text-delta' && e.text === '包含A、B、C的完整对比研报')).toBe(true);
  });

  it('5. 连败熔断触发后质检打回不再自愈，直接注入局限性约束收尾 (TC02-5 / P-X4)', async () => {
    // 工具全部失败：连续失败 3 次触发管道熔断（AGENT_MAX_CONSECUTIVE_FAILURES，ADR-0008）
    (fakeToolSpec.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      contentForModel: '抓取失败：HTTP 404',
      summaryForDisplay: '抓取失败：HTTP 404',
    });
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 首轮决策一次申请 3 个工具调用，全部失败后熔断
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [
          { toolCallId: 'c1', toolName: 'search_tool', input: { query: '关键词1' } },
          { toolCallId: 'c2', toolName: 'search_tool', input: { query: '关键词2' } },
          { toolCallId: 'c3', toolName: 'search_tool', input: { query: '关键词3' } },
        ],
        response: { id: 'resp_round1' },
      })
    );
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['全部实体'],
      suggestion: '请更换关键词重新检索',
    });
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ textParts: ['检索受限的诚实回答'], response: { id: 'resp_summary' } })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '查询最新价格表' }],
      stepOutputLimit: 2048,
      maxSteps: 5,
      signal: new AbortController().signal,
      errorId: 'test-tc02-5',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });
    await readSseEvents(stream);

    // 熔断后不追加自愈决策步：决策 1 次 + 收尾 1 次
    expect(evaluateAgentProgressMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const summaryCall = streamTextMock.mock.calls[1][0];
    expect(summaryCall.tools).toBeUndefined();
    const lastSummaryMessage = summaryCall.messages[summaryCall.messages.length - 1];
    expect(String(lastSummaryMessage.content)).toContain('诚实回答局限性约束');
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluator: { executed: true, passed: false, remedied: false },
      })
    );
  });

  it('6. 自愈决策步执行中触发连败熔断时，收尾步仍注入局限性约束 (TC02-6 / P-W16)', async () => {
    // 工具全部失败：首轮 2 次失败未达熔断线，自愈步再失败 1 次达到 AGENT_MAX_CONSECUTIVE_FAILURES（3 次）
    (fakeToolSpec.execute as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      contentForModel: '抓取失败：HTTP 404',
      summaryForDisplay: '抓取失败：HTTP 404',
    });
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [
          { toolCallId: 'c1', toolName: 'search_tool', input: { query: '关键词1' } },
          { toolCallId: 'c2', toolName: 'search_tool', input: { query: '关键词2' } },
        ],
        response: { id: 'resp_round1' },
      })
    );
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['价格数据'],
      suggestion: '请更换关键词重新检索',
    });
    // 自愈决策步：换关键词再检索 1 次，仍失败触发熔断
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c3', toolName: 'search_tool', input: { query: '关键词3' } }],
        response: { id: 'resp_remedy' },
      })
    );
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ textParts: ['检索受限的诚实回答'], response: { id: 'resp_summary' } })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '查询最新价格表' }],
      stepOutputLimit: 2048,
      maxSteps: 3,
      signal: new AbortController().signal,
      errorId: 'test-tc02-6',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });
    await readSseEvents(stream);

    // 熔断后不再复检：首检 1 次；决策 + 自愈 + 收尾共 3 次
    expect(fakeToolSpec.execute).toHaveBeenCalledTimes(3);
    expect(evaluateAgentProgressMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(3);
    const summaryCall = streamTextMock.mock.calls[2][0];
    expect(summaryCall.tools).toBeUndefined();
    const summaryText = JSON.stringify(summaryCall.messages);
    expect(summaryText).toContain('诚实回答局限性约束');
    expect(summaryText).toContain('价格数据');
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluator: { executed: true, passed: false, remedied: true },
      })
    );
  });

  it('4. 复检仍失败不再自愈并注入局限性约束收尾 (TC02-4 / P-W8)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 首轮决策：检索 A 与 B
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: { query: 'A与B' } }],
        response: { id: 'resp_round1' },
      })
    );
    // 首检与复检均判定遗漏实体C
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['实体C'],
      suggestion: '请补充搜索实体C',
    });
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['实体C'],
      suggestion: '请补充搜索实体C',
    });
    // 自愈决策步：追加检索 C（仍未拿到有效材料）
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c2', toolName: 'search_tool', input: { query: '实体C' } }],
        response: { id: 'resp_remedy' },
      })
    );
    // 收尾步
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['受检索源所限，暂未获取到实体C数据'],
        response: { id: 'resp_summary' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '对比A、B和C' }],
      stepOutputLimit: 2048,
      maxSteps: 3,
      signal: new AbortController().signal,
      errorId: 'test-tc02-4',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 只追加 1 轮自愈：首轮决策 + 自愈决策步 + 收尾步
    expect(evaluateAgentProgressMock).toHaveBeenCalledTimes(2);
    expect(fakeToolSpec.execute).toHaveBeenCalledTimes(2);
    expect(streamTextMock).toHaveBeenCalledTimes(3);

    // 收尾步不挂 tools，且携带局限性约束
    const summaryCall = streamTextMock.mock.calls[2][0];
    expect(summaryCall.tools).toBeUndefined();
    const summaryText = JSON.stringify(summaryCall.messages);
    expect(summaryText).toContain('诚实回答局限性约束');
    expect(summaryText).toContain('实体C');

    // 自愈反思提示只下发 1 次
    const remedyNotes = events.filter(
      (e) => e.type === 'agent_note' && String(e.text).includes('质检反思')
    );
    expect(remedyNotes).toHaveLength(1);

    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluator: { executed: true, passed: false, remedied: true },
      })
    );
  });

  it('2. 步数耗尽平滑注入局限性收尾 (TC02-2)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 设置 maxSteps: 2（只允许 1 次决策步 + 1 次收尾步）
    // 决策步调用工具
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: { query: '仅A' } }],
        response: { id: 'resp_round1' },
      })
    );

    // 质检判定未通过（遗漏B）
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['实体B'],
      suggestion: '缺少实体B',
    });

    // 收尾步
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['由于检索限制，未能获取B，仅提供A的分析'],
        response: { id: 'resp_summary' },
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '对比A和B' }],
      stepOutputLimit: 2048,
      maxSteps: 2,
      signal: new AbortController().signal,
      errorId: 'test-tc02-2',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    const events = await readSseEvents(stream);

    // 因已达最大决策步数，不得追加决策步，只能有 2 次 streamText（决策步 + 收尾步）
    expect(streamTextMock).toHaveBeenCalledTimes(2);

    // 收尾步参数中注入了局限性约束
    const summaryCall = streamTextMock.mock.calls[1][0] as { messages: any[] };
    const lastMsgContent = JSON.stringify(summaryCall.messages);
    expect(lastMsgContent).toContain('诚实回答局限性约束');
    expect(lastMsgContent).toContain('实体B');

    // onFinish 记录 executed=true, passed=false, remedied=false (因步数耗尽未自愈)
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluator: {
          executed: true,
          passed: false,
          remedied: false,
        },
      })
    );
  });

  it('3. 纯直接回答跳过质检节点 (TC02-3)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});

    // 模型在第 1 轮决策步直接输出回答，未发起任何工具调用
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['你好！很高兴为您服务。'],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '你好' }],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'test-tc02-3',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
    });

    await readSseEvents(stream);

    // 验证质检节点完全不被触发
    expect(evaluateAgentProgressMock).not.toHaveBeenCalled();

    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluator: {
          executed: false,
          passed: true,
          remedied: false,
        },
      })
    );
  });
});

describe('TC03: 质检流式通知、思考区呈现与正文纯净性', () => {
  let fakeToolSpec: AgentToolSpec;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    fakeToolSpec = {
      name: 'search_tool',
      description: '搜索工具',
      parameters: z.object({}),
      execute: vi.fn(async () => ({
        ok: true,
        contentForModel: '检索数据',
        summaryForDisplay: '完成',
      })),
    };
  });

  it('1. 反思提示轻量透出且正文纯净 (TC03-1)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);

    // 轮次1：工具调用
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: {} }],
      })
    );

    // 质检打回
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['生态成熟度'],
      suggestion: '补充生态数据',
    });

    // 自愈步
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c2', toolName: 'search_tool', input: {} }],
      })
    );

    // 收尾步
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['这是纯净的正文内容'],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '生态调研' }],
      stepOutputLimit: 2048,
      maxSteps: 3,
      signal: new AbortController().signal,
      errorId: 'test-tc03-1',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
    });

    const events = await readSseEvents(stream);

    // 验证推送了包含质检反思的 agent_note 事件
    const noteEvents = events.filter((e) => e.type === 'agent_note');
    expect(noteEvents.some((e) => String(e.text).includes('质检反思'))).toBe(true);

    // 验证 text-delta 只有纯正文，绝不包含质检反思词句
    const textDeltas = events.filter((e) => e.type === 'text-delta').map((e) => e.text);
    const combinedText = textDeltas.join('');
    expect(combinedText).toBe('这是纯净的正文内容');
    expect(combinedText).not.toContain('质检反思');
  });

  /** 两步计划：首步检索、次步整理（带计划的质检与步骤流转用例共用） */
  const TWO_STEP_PLAN = {
    id: 'plan_1',
    title: '生态调研',
    steps: [
      { id: 's1', title: '检索生态数据', status: 'pending' as const },
      { id: 's2', title: '整理对比结论', status: 'pending' as const },
    ],
  };

  it('3. 有计划时质检反思提示经 plan_step_update 推送到当前步骤 (TC03-3 / P-W15)', async () => {
    vi.mocked(generateAgentPlan).mockResolvedValueOnce(TWO_STEP_PLAN);
    const registry = createToolRegistry([fakeToolSpec]);

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: {} }] })
    );
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['生态成熟度'],
      suggestion: '补充生态数据',
    });
    evaluateAgentProgressMock.mockResolvedValueOnce({ passed: true, missingAspects: [] });
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ toolCalls: [{ toolCallId: 'c2', toolName: 'search_tool', input: {} }] })
    );
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['这是纯净的正文内容'] }));

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '生态调研' }],
      stepOutputLimit: 2048,
      maxSteps: 3,
      signal: new AbortController().signal,
      errorId: 'test-tc03-3',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
    });
    const events = await readSseEvents(stream);

    // 反思提示挂在当前 running 步骤上，以 plan_step_update 推送
    const remedyUpdates = events.filter(
      (e) => e.type === 'plan_step_update' && String(e.summary ?? '').includes('质检反思')
    );
    expect(remedyUpdates).toHaveLength(1);
    expect(remedyUpdates[0]).toMatchObject({ stepId: 's2', status: 'running' });
    expect(String(remedyUpdates[0].summary)).toContain('生态成熟度');
    // 有计划时不再走 agent_note 通道，正文保持纯净
    expect(events.some((e) => e.type === 'agent_note' && String(e.text).includes('质检反思'))).toBe(false);
    const combinedText = events.filter((e) => e.type === 'text-delta').map((e) => e.text).join('');
    expect(combinedText).toBe('这是纯净的正文内容');
  });

  it('4. 有计划时步骤随决策与自愈依次推进并在交付后收敛 (TC03-4 / P-W11)', async () => {
    vi.mocked(generateAgentPlan).mockResolvedValueOnce(TWO_STEP_PLAN);
    const registry = createToolRegistry([fakeToolSpec]);

    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: {} }] })
    );
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: false,
      missingAspects: ['生态成熟度'],
      suggestion: '补充生态数据',
    });
    evaluateAgentProgressMock.mockResolvedValueOnce({ passed: true, missingAspects: [] });
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ toolCalls: [{ toolCallId: 'c2', toolName: 'search_tool', input: {} }] })
    );
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['最终正文'] }));

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '生态调研' }],
      stepOutputLimit: 2048,
      maxSteps: 3,
      signal: new AbortController().signal,
      errorId: 'test-tc03-4',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
    });
    const events = await readSseEvents(stream);

    expect(events.some((e) => e.type === 'plan_created')).toBe(true);
    // 步骤状态序列：首步开始 → 首轮工具后首步完成、次步开始 → 自愈反思挂次步 → 交付后次步完成
    const transitions = events
      .filter((e) => e.type === 'plan_step_update')
      .map((e) => `${e.stepId}:${e.status}`);
    expect(transitions).toEqual(['s1:running', 's1:completed', 's2:running', 's2:running', 's2:completed']);
  });

  it('2. 质检通过静默无多余事件扰民 (TC03-2)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);

    // 轮次1：工具调用
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: {} }],
      })
    );

    // 质检判定通过
    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: true,
      missingAspects: [],
    });

    // 收尾步
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['材料充分，正常交付正文'],
      })
    );

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '调研' }],
      stepOutputLimit: 2048,
      maxSteps: 2,
      signal: new AbortController().signal,
      errorId: 'test-tc03-2',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
    });

    const events = await readSseEvents(stream);

    // 验证质检通过时不推送任何 agent_note
    expect(events.filter((e) => e.type === 'agent_note')).toHaveLength(0);

    // 正文直接流式输出
    expect(events.some((e) => e.type === 'text-delta' && e.text === '材料充分，正常交付正文')).toBe(true);
  });
});

describe('TC04: 可观测性 Langfuse Trace 与运行元数据审计', () => {
  let fakeToolSpec: AgentToolSpec;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    fakeToolSpec = {
      name: 'search_tool',
      description: '搜索工具',
      parameters: z.object({}),
      execute: vi.fn(async () => ({ ok: true, contentForModel: 'ok', summaryForDisplay: 'ok' })),
    };
  });

  it('1. Langfuse独立Generation记录 (TC04-1)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const mockGeneration = { update: vi.fn(), end: vi.fn() };
    const mockSpan = { update: vi.fn(), end: vi.fn() };
    const mockTrace: any = {
      generation: vi.fn(() => mockGeneration),
      span: vi.fn(() => mockSpan),
      update: vi.fn(),
      end: vi.fn(),
    };

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: {} }],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['回答正文'],
        })
      );

    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: true,
      missingAspects: [],
    });

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '测试可观测' }],
      stepOutputLimit: 2048,
      maxSteps: 2,
      signal: new AbortController().signal,
      errorId: 'test-obs',
      runtime: await testRuntime(registry),
      onFinish: vi.fn(async () => {}),
      trace: mockTrace,
    });

    await readSseEvents(stream);

    // 验证 evaluateAgentProgress 收到了 trace 实例
    expect(evaluateAgentProgressMock).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: mockTrace,
      })
    );
  });

  it('2. onFinish与Trace元数据持久化 (TC04-2)', async () => {
    const registry = createToolRegistry([fakeToolSpec]);
    const onFinishMock = vi.fn(async () => {});
    const mockTrace: any = {
      generation: vi.fn(() => ({ end: vi.fn() })),
      span: vi.fn(() => ({ end: vi.fn(), update: vi.fn() })),
      update: vi.fn(),
      end: vi.fn(),
    };

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'c1', toolName: 'search_tool', input: {} }],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['回答文本'],
        })
      );

    evaluateAgentProgressMock.mockResolvedValueOnce({
      passed: true,
      missingAspects: [],
    });

    const stream = runAgent({
      userId: 'u1',
      provider: 'doubao',
      model: 'doubao-seed-evolving',
      messages: [{ role: 'user', content: '测试元数据' }],
      stepOutputLimit: 2048,
      maxSteps: 2,
      signal: new AbortController().signal,
      errorId: 'test-meta',
      runtime: await testRuntime(registry),
      onFinish: onFinishMock,
      trace: mockTrace,
    });

    await readSseEvents(stream);

    // 验证 onFinish 中的 evaluator 元数据
    expect(onFinishMock).toHaveBeenCalledWith(
      expect.objectContaining({
        evaluator: {
          executed: true,
          passed: true,
          remedied: false,
        },
      })
    );

    // 验证 trace.update 中的 evaluator 元数据
    expect(mockTrace.update).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          evaluator: {
            executed: true,
            passed: true,
            remedied: false,
          },
        }),
      })
    );
  });
});


