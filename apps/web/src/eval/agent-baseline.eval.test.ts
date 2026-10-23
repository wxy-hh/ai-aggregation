/**
 * Phase 0 基线冒烟评测套件 (apps/web/src/eval/agent-baseline.eval.test.ts)
 *
 * 学习目标：
 * 1. 掌握如何使用可复现的评测用例（Eval Cases）为 Agent 建立客观基线；
 * 2. 验证 Agent 编排器（agent-runner）在 5 类典型场景下的实际行为与指标表现：
 *    - Case 1: 纯文本问答（无工具调用，直接交付 deliver_answer）
 *    - Case 2: 正常工具调用与结果回注（Tool Re-injection 完整链路）
 *    - Case 3: 入参重复调用诱导（哈希去重缓存拦截，防重复发网络请求）
 *    - Case 4: 工具超时预算拦截（时间预算耗尽，触发优雅拦截与跳出）
 *    - Case 5: 连续失败熔断跳闸（连续 3 次失败触发熔断器，平稳进入收尾步）
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { Message as ChatMessage } from '@/stores/chat-store';
import type { AgentToolSpec, ToolRegistry } from '@/lib/agent/registry';
import { createToolRegistry } from '@/lib/agent/registry';
import { runAgent } from '../app/api/chat/_lib/agent/agent-runner';
import { createAgentRuntimeContext, type AgentRuntimeContext } from '../app/api/chat/_lib/agent/runtime-context';
import type { ChatStreamFinish } from '../app/api/chat/_lib/types';

// Mock streamText，夺回模型响应控制权
const { streamTextMock } = vi.hoisted(() => {
  return { streamTextMock: vi.fn() };
});

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: streamTextMock };
});

/** 辅助函数：构造模拟的模型流式返回 */
function makeMockStreamResult(opts: {
  textParts?: string[];
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  inputTokens?: number;
  outputTokens?: number;
  responseId?: string;
}) {
  const inputTokens = opts.inputTokens ?? 20;
  const outputTokens = opts.outputTokens ?? 10;
  return {
    fullStream: (async function* () {
      for (const text of opts.textParts ?? []) {
        yield { type: 'text-delta', text };
      }
    })(),
    toolCalls: Promise.resolve(opts.toolCalls ?? []),
    usage: Promise.resolve({
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
    }),
    finishReason: Promise.resolve('stop'),
    response: Promise.resolve({
      id: opts.responseId ?? 'mock_resp_1',
      messages: [{ role: 'assistant', content: opts.textParts?.join('') ?? '' }],
    }),
  };
}

/** 辅助函数：消费并解析流式 SSE 事件 */
async function collectSseEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let rawText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    rawText += decoder.decode(value, { stream: true });
  }
  rawText += decoder.decode();

  return rawText
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => {
      try {
        return JSON.parse(chunk) as Record<string, unknown>;
      } catch {
        return { raw: chunk };
      }
    });
}

/** 辅助函数：构造不触碰数据库的内存运行时上下文 */
async function makeTestRuntime(registry: ToolRegistry): Promise<AgentRuntimeContext> {
  return createAgentRuntimeContext({
    userId: 'test_eval_user',
    loadUserTools: async () => [],
    baseRegistry: registry,
  });
}

describe('Phase 0: Agent 基线冒烟评测与防御机制验证', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
  });

  // =========================================================================
  // Case 1: 纯文本问答（无工具调用）
  // =========================================================================
  it('Case 1: 纯文本问答，走 deliver_answer 直接交付，0 次工具调用', async () => {
    const registry = createToolRegistry([]);
    let finishData: ChatStreamFinish | null = null;

    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        textParts: ['你好！我是 AI 智能助手，有什么我可以帮您的吗？'],
        inputTokens: 15,
        outputTokens: 22,
      })
    );

    const stream = runAgent({
      userId: 'test_eval_user',
      provider: 'doubao',
      model: 'doubao-pro',
      messages: [{ id: 'm1', role: 'user', content: '你好' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'err_c1',
      runtime: await makeTestRuntime(registry),
      onFinish: async (f) => { finishData = f; },
    });

    const events = await collectSseEvents(stream);

    // 断言 1：仅调用了 1 次大模型（决策步直接产出答案，未触发收尾步）
    expect(streamTextMock).toHaveBeenCalledTimes(1);

    // 断言 2：没有发生任何工具调用事件
    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents).toHaveLength(0);

    // 断言 3：文本通过 text-delta 事件正确下发
    const textDeltaEvents = events.filter((e) => e.type === 'text-delta');
    expect(textDeltaEvents.length).toBeGreaterThan(0);

    // 断言 4：完成态数据正确落盘
    expect(finishData).not.toBeNull();
    const finalData = finishData!;
    expect(finalData.outcome).toBe('success');
    expect(finalData.steps).toBe(1);
    expect((finalData.usage as any)?.totalTokens).toBe(37);
    console.log('[Case 1 基线结果] 纯文本问答成功, 步数: 1, Token消耗: 37, 工具调次: 0');
  });

  // =========================================================================
  // Case 2: 正常单步工具调用与结果回注
  // =========================================================================
  it('Case 2: 正常工具调用，验证工具执行、结果回注与二次总结', async () => {
    const weatherToolExecute = vi.fn(async (args: { city: string }) => ({
      ok: true,
      contentForModel: JSON.stringify({ city: args.city, temp: 24, weather: '晴' }),
      summaryForDisplay: `${args.city} 24℃ 晴`,
    }));

    const weatherTool: AgentToolSpec = {
      name: 'get_weather',
      description: '查询城市天气',
      parameters: z.object({ city: z.string() }),
      execute: weatherToolExecute,
    };

    const registry = createToolRegistry([weatherTool]);
    let finishData: ChatStreamFinish | null = null;

    // 第 1 轮：模型决策调用工具
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        textParts: ['正在为您查询北京天气...'],
        toolCalls: [{ toolCallId: 'call_wt_1', toolName: 'get_weather', input: { city: '北京' } }],
        inputTokens: 30,
        outputTokens: 15,
        responseId: 'resp_step1',
      })
    );

    // 第 2 轮（收尾步）：模型根据回注的工具结果生成总结
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        textParts: ['北京今天天气晴朗，气温 24℃，非常适合出门。'],
        inputTokens: 60,
        outputTokens: 25,
        responseId: 'resp_step2',
      })
    );

    const stream = runAgent({
      userId: 'test_eval_user',
      provider: 'doubao',
      model: 'doubao-pro',
      messages: [{ id: 'm1', role: 'user', content: '查一下北京天气' }] as ChatMessage[],
      maxSteps: 2, // 1 轮决策 + 1 轮强制收尾步
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'err_c2',
      runtime: await makeTestRuntime(registry),
      onFinish: async (f) => { finishData = f; },
    });

    const events = await collectSseEvents(stream);

    // 断言 1：共调用 2 次大模型（1 次决策 + 1 次收尾）
    expect(streamTextMock).toHaveBeenCalledTimes(2);

    // 断言 2：本地工具函数确实被执行，且参数正确（同时验证透传了运行时安全上下文）
    expect(weatherToolExecute).toHaveBeenCalledTimes(1);
    expect(weatherToolExecute).toHaveBeenCalledWith(
      { city: '北京' },
      expect.objectContaining({ userId: 'test_eval_user', errorId: 'err_c2' })
    );

    // 断言 3：产生了 tool_call 与 tool_result 事件
    expect(events.some((e) => e.type === 'tool_call')).toBe(true);
    expect(events.some((e) => e.type === 'tool_result' && e.status === 'success')).toBe(true);

    // 断言 4：第 2 次调用的收尾步中，tools 必须为 undefined（无工具收尾）
    const secondCallConfig = streamTextMock.mock.calls[1][0];
    expect(secondCallConfig.tools).toBeUndefined();

    // 断言 5：Token 累加正确 (30+15 + 60+25 = 130)
    expect(finishData).not.toBeNull();
    const finalData = finishData!;
    expect(finalData.outcome).toBe('success');
    expect((finalData.usage as any)?.totalTokens).toBe(130);
    console.log('[Case 2 基线结果] 正常工具调用成功, 步数: 2, Token消耗: 130, 工具调次: 1');
  });

  // =========================================================================
  // Case 3: 入参重复调用诱导（去重缓存短路）
  // =========================================================================
  it('Case 3: 重复入参调用，验证去重缓存拦截，本地工具仅真实执行 1 次', async () => {
    const searchExecute = vi.fn(async (args: { query: string }) => ({
      ok: true,
      contentForModel: `搜索结果: 关于 ${args.query} 的资料`,
      summaryForDisplay: '搜索成功',
    }));

    const searchTool: AgentToolSpec = {
      name: 'web_search',
      description: '搜索资料',
      parameters: z.object({ query: z.string() }),
      execute: searchExecute,
    };

    const registry = createToolRegistry([searchTool]);

    // 第 1 轮：模型调用搜索
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        toolCalls: [{ toolCallId: 'call_s1', toolName: 'web_search', input: { query: 'Next.js 15' } }],
      })
    );

    // 第 2 轮：模型幻觉，用完全一模一样的参数再次调用
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        toolCalls: [{ toolCallId: 'call_s2', toolName: 'web_search', input: { query: 'Next.js 15' } }],
      })
    );

    // 第 3 轮（收尾步）：模型终于作答
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        textParts: ['Next.js 15 带来了诸多升级...'],
      })
    );

    const stream = runAgent({
      userId: 'test_eval_user',
      provider: 'doubao',
      model: 'doubao-pro',
      messages: [{ id: 'm1', role: 'user', content: '搜 Next.js 15' }] as ChatMessage[],
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'err_c3',
      runtime: await makeTestRuntime(registry),
      onFinish: async () => {},
    });

    const events = await collectSseEvents(stream);

    // ★★★ 核心断言：虽然模型发起了 2 次调用，但本地 searchExecute 函数只执行了 1 次！
    expect(searchExecute).toHaveBeenCalledTimes(1);

    // 前端收到了 2 次 tool_call 和 2 次 tool_result
    const toolResults = events.filter((e) => e.type === 'tool_result');
    expect(toolResults).toHaveLength(2);

    console.log('[Case 3 基线结果] 重复调用成功拦截: 模型发起 2 次, 底层真实执行 1 次 (命中 toolCache)');
  });

  // =========================================================================
  // Case 4: 工具超时预算拦截
  // =========================================================================
  it('Case 4: 运行时间耗尽，时间预算拦截生效，平稳退出', async () => {
    let mockCurrentTime = 1000;
    vi.spyOn(Date, 'now').mockImplementation(() => mockCurrentTime);

    const slowTool: AgentToolSpec = {
      name: 'slow_calc',
      description: '慢速计算',
      parameters: z.object({}),
      execute: vi.fn(async () => ({ ok: true, contentForModel: '完成', summaryForDisplay: '完成' })),
    };

    const registry = createToolRegistry([slowTool]);
    let finishData: ChatStreamFinish | null = null;

    // 模拟第 1 轮决策：模型返回调用工具后，时间流逝超出预算（600ms > 500ms）
    streamTextMock.mockImplementationOnce(() => {
      mockCurrentTime += 600;
      return makeMockStreamResult({
        toolCalls: [{ toolCallId: 'call_slow', toolName: 'slow_calc', input: {} }],
      });
    });

    // 模拟收尾步
    streamTextMock.mockImplementationOnce(() => {
      return makeMockStreamResult({ textParts: ['因时间耗尽提前总结已获信息。'] });
    });

    // 设置 500ms 时间预算
    const stream = runAgent({
      userId: 'test_eval_user',
      provider: 'doubao',
      model: 'doubao-pro',
      messages: [{ id: 'm1', role: 'user', content: '开始慢任务' }] as ChatMessage[],
      stepOutputLimit: 2048,
      runTimeBudgetMs: 500, // 500ms 时间预算
      signal: new AbortController().signal,
      errorId: 'err_c4',
      runtime: await makeTestRuntime(registry),
      onFinish: async (f) => { finishData = f; },
    });

    const events = await collectSseEvents(stream);

    // 断言 1：由于超出时间预算，工具被标记为未执行跳过
    const failedResult = events.find((e) => e.type === 'tool_result' && e.status === 'failed');
    expect(failedResult).toBeDefined();
    expect((failedResult?.summary as string) || '').toContain('执行时间超出预算');

    // 断言 2：收尾步仍然顺利执行，保证交付最终文本
    expect(events.some((e) => e.type === 'text-delta')).toBe(true);

    console.log('[Case 4 基线结果] 超时拦截成功: 正确捕获时间预算超限，未陷入永久卡死');
  });

  // =========================================================================
  // Case 5: 连续失败熔断跳闸（Circuit Breaker）
  // =========================================================================
  it('Case 5: 外部工具连续 3 次失败，触发连败熔断提前跳出，平稳进入收尾步', async () => {
    // 模拟一个总是报错 500 的故障工具
    const brokenTool: AgentToolSpec = {
      name: 'broken_api',
      description: '故障接口',
      parameters: z.object({ attempt: z.number() }),
      execute: vi.fn(async () => ({
        ok: false,
        contentForModel: '500 Internal Server Error: 上游连接断开',
        summaryForDisplay: '外部服务异常 500',
      })),
    };

    const registry = createToolRegistry([brokenTool]);
    let finishData: ChatStreamFinish | null = null;

    // 第 1 轮：失败 1 次
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        toolCalls: [{ toolCallId: 'c_fail_1', toolName: 'broken_api', input: { attempt: 1 } }],
      })
    );
    // 第 2 轮：失败 2 次
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        toolCalls: [{ toolCallId: 'c_fail_2', toolName: 'broken_api', input: { attempt: 2 } }],
      })
    );
    // 第 3 轮：失败 3 次（此时 consecutiveFailures = 3，达到上限，熔断器跳闸！）
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        toolCalls: [{ toolCallId: 'c_fail_3', toolName: 'broken_api', input: { attempt: 3 } }],
      })
    );
    // 熔断后强制触发收尾步：模型输出最终致歉说明
    streamTextMock.mockReturnValueOnce(
      makeMockStreamResult({
        textParts: ['抱歉，外部依赖接口持续异常，无法完成查询。'],
      })
    );

    const stream = runAgent({
      userId: 'test_eval_user',
      provider: 'doubao',
      model: 'doubao-pro',
      messages: [{ id: 'm1', role: 'user', content: '查询故障数据' }] as ChatMessage[],
      maxSteps: 5, // 设定最大步数为 5
      stepOutputLimit: 2048,
      signal: new AbortController().signal,
      errorId: 'err_c5',
      runtime: await makeTestRuntime(registry),
      onFinish: async (f) => { finishData = f; },
    });

    await collectSseEvents(stream);

    // ★★★ 核心断言：
    // maxSteps 设的是 5 步（原本应该走满 4 轮决策 + 1 轮收尾 = 5 次模型调用）
    // 但因为在第 3 轮连败达到 3 次，熔断器提前掐断，总共只进行了 4 次调用（3 次决策 + 1 次收尾）！
    // 成功为系统挽救了第 4 轮毫无意义的徒劳重试，节省了 1 轮调用的 Token！
    expect(streamTextMock).toHaveBeenCalledTimes(4);

    console.log('[Case 5 基线结果] 连败熔断成功跳闸: 连续 3 次失败后立即跳出，有效避免无限盲目重试');
  });
});
