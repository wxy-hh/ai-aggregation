/**
 * agent 模式 HTTP 级测试（spec §9 主接缝）
 *
 * 策略：真实链路 = createChatHandler + runAgent + tool-policy + 契约编码；
 * 只替换两处外部依赖 —— AI SDK 的 streamText（决定模型行为）与工具注册表（决定工具行为）。
 * 这样事件序列、计费参数、合规接线、降级与失败语义都在真实代码路径上被验证。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createChatHandler } from './chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import type { AgentToolSpec, ToolRegistry } from '@/lib/agent/registry';
import { createToolRegistry } from '@/lib/agent/registry';
import { createImageGenerateTool } from './agent/tools/image-generate';

const {
  currentUserMock,
  rateLimiterMock,
  quotaSessionReserveMock,
  streamTextMock,
  toolExecuteMock,
  registryHolder,
  requestAgnesImageMock,
  AgnesUpstreamErrorMock,
  getAvailableQuotaMock,
} = vi.hoisted(() => {
  class AgnesUpstreamError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.name = 'AgnesUpstreamError';
      this.status = status;
    }
  }
  return {
    currentUserMock: vi.fn(),
    rateLimiterMock: { check: vi.fn() },
    quotaSessionReserveMock: vi.fn(),
    streamTextMock: vi.fn(),
    toolExecuteMock: vi.fn(),
    registryHolder: { current: null as unknown },
    requestAgnesImageMock: vi.fn(),
    AgnesUpstreamErrorMock: AgnesUpstreamError,
    getAvailableQuotaMock: vi.fn(),
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: currentUserMock }));
vi.mock('@repo/redis', () => ({ getRateLimiter: () => rateLimiterMock }));
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: quotaSessionReserveMock },
}));
vi.mock('@/lib/billing/quota-service', () => ({
  getAvailableQuota: getAvailableQuotaMock,
}));
// 仅替换 streamText，保留 tool / zodSchema / stepCountIs 等真实实现
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: streamTextMock };
});
vi.mock('./agent/tools', () => ({ getDefaultToolRegistry: () => registryHolder.current }));
// image_generate 使用真实工具实现，只把上游请求换成替身
vi.mock('@/lib/services/agnes-image', () => ({
  AGNES_IMAGE_MODEL: 'agnes-image-2.1-flash',
  AgnesUpstreamError: AgnesUpstreamErrorMock,
  requestAgnesImage: requestAgnesImageMock,
}));

/** 构造一次 streamText 的假返回（decision 步与 summary 步共用） */
function makeFakeResult(opts: {
  textParts?: string[];
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  usage?: unknown;
  finishReason?: string;
}) {
  return {
    fullStream: (async function* () {
      for (const text of opts.textParts ?? []) {
        yield { type: 'text-delta', text };
      }
    })(),
    toolCalls: Promise.resolve(opts.toolCalls ?? []),
    usage: Promise.resolve(opts.usage ?? null),
    finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
    response: Promise.resolve({ messages: [{ role: 'assistant', content: '决策步消息' }] }),
  };
}

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

/** 构造一个「流迭代中抛错」的假返回，用于模拟用户中断 / 上游异常 */
function makeThrowingResult(error: Error) {
  return {
    fullStream: (async function* () {
      yield await Promise.reject(error);
    })(),
    toolCalls: Promise.resolve([]),
    usage: Promise.resolve(null),
    response: Promise.resolve({ messages: [] }),
  };
}

function agentRequest(overrides: Record<string, unknown> = {}, signal?: AbortSignal) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '帮我看看这个网页' }],
      provider: 'xunfei',
      model: 'lite',
      agent: true,
      ...overrides,
    }),
    ...(signal ? { signal } : {}),
  });
}

describe('agent 模式编排（HTTP 级）', () => {
  let handler: ReturnType<typeof createChatHandler>;
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;
  let fakeSpec: AgentToolSpec;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');

    currentUserMock.mockResolvedValue({ id: 'test-user-id', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({ allowed: true, remaining: 60, reset: Date.now() + 60000 });
    getAvailableQuotaMock.mockResolvedValue(100_000);

    fakeSession = createFakeQuotaSession({ outputLimit: 4096 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);

    // 工具替身：真实 tool-policy / 校验逻辑照常参与，只把 execute 换掉
    fakeSpec = {
      name: 'web_fetch',
      description: '抓取网页（测试替身）',
      parameters: z.object({ url: z.string() }),
      execute: toolExecuteMock,
    };
    const fakeRegistry: ToolRegistry = {
      get: (name) => (name === 'web_fetch' ? fakeSpec : undefined),
      list: () => [fakeSpec],
      has: (name) => name === 'web_fetch',
    };
    registryHolder.current = fakeRegistry;

    toolExecuteMock.mockResolvedValue({
      ok: true,
      contentForModel: '网页正文内容：这是一篇文章的主要内容。',
      summaryForDisplay: '已抓取 example.com（正文 20 字）',
    });

    handler = createChatHandler({
      // agent 分流后不会走到适配器；给一个会抛错的替身，用于证明"确实没走适配器"
      getAdapter: () => ({
        stream: async () => {
          throw new Error('agent 模式不应委派适配器');
        },
      }),
    });
  });

  it('模型未调用工具 → 降级为单段回答，仍按 chat-agent 计费', async () => {
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['这是直接回答。'],
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      })
    );

    const response = await handler(agentRequest());
    expect(response.status).toBe(200);
    const events = await readSseEvents(response);

    expect(events.map((e) => e.type)).toEqual(['text-delta', 'done']);
    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(toolExecuteMock).not.toHaveBeenCalled();

    expect(quotaSessionReserveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        feature: 'chat-agent',
        provider: 'doubao',
        model: 'doubao-seed-evolving',
        maxOutputTokens: 10240,
      }),
      'user'
    );
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('success');
  });

  it('模型调用工具 → 事件序列 tool_call → tool_result → text-delta → done，且 usage 为两步汇总', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_1', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['根据网页内容，这篇文章讲了……'],
          usage: { inputTokens: 150, outputTokens: 30, totalTokens: 180 },
        })
      );

    const response = await handler(agentRequest());
    const events = await readSseEvents(response);

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'text-delta', 'done']);

    const toolCall = events[0] as { call: { id: string; name: string; argsSummary: string } };
    expect(toolCall.call.name).toBe('web_fetch');
    expect(toolCall.call.id).toBe('call_1');
    expect(toolCall.call.argsSummary).toContain('example.com');

    const toolResult = events[1] as { callId: string; status: string; summary: string };
    expect(toolResult.callId).toBe('call_1');
    expect(toolResult.status).toBe('success');

    // 执行了工具，且两段式跑满两次模型调用
    expect(toolExecuteMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).toHaveBeenCalledTimes(2);

    // 结算用量 = 决策步 + 总结步
    const finalizeCtx = fakeSession.finalize.mock.calls[0][1] as { usage: Record<string, number> };
    expect(finalizeCtx.usage).toMatchObject({
      inputTokens: 250,
      outputTokens: 50,
      totalTokens: 300,
    });

    // 事件序列契约：done 在最后且带 usage
    const done = events[3] as { usage?: { totalTokens: number } };
    expect(done.usage?.totalTokens).toBe(300);
  });

  it('请求指定 xunfei/lite → 服务端静默覆盖为 doubao/doubao-seed-evolving 并在 finalize 留痕', async () => {
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['ok'] }));

    const response = await handler(agentRequest({ provider: 'xunfei', model: 'lite' }));
    await readSseEvents(response);

    expect(quotaSessionReserveMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'doubao', model: 'doubao-seed-evolving' }),
      'user'
    );
    expect(quotaSessionReserveMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'xunfei' }),
      expect.anything()
    );

    // 断言 finalize metadata 包含被静默覆盖的原始 provider 与 model（ADR-0003 接缝断言）
    expect(fakeSession.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        metadata: expect.objectContaining({
          agent: true,
          overriddenProvider: 'xunfei',
          overriddenModel: 'lite',
        }),
      })
    );
  });

  it('请求已指定 doubao/doubao-seed-evolving → 不记录静默覆盖留痕', async () => {
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['ok'] }));

    const response = await handler(
      agentRequest({ provider: 'doubao', model: 'doubao-seed-evolving' })
    );
    await readSseEvents(response);

    expect(fakeSession.finalize).toHaveBeenCalledWith(
      'success',
      expect.objectContaining({
        metadata: expect.not.objectContaining({
          overriddenProvider: expect.anything(),
          overriddenModel: expect.anything(),
        }),
      })
    );
  });

  it('工具执行失败 → tool_result 标记 failed，但总结步有产出仍按 success 结算', async () => {
    toolExecuteMock.mockResolvedValue({
      ok: false,
      contentForModel: '工具「web_fetch」执行失败：连接超时，请稍后重试',
      summaryForDisplay: '执行失败：连接超时，请稍后重试',
    });
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_x', toolName: 'web_fetch', input: { url: 'https://slow.example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['很抱歉，网页抓取失败了。'] }));

    const events = await readSseEvents(await handler(agentRequest()));

    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'text-delta', 'done']);
    expect((events[1] as { status: string }).status).toBe('failed');
    expect((events[1] as { summary: string }).summary).toContain('超时');
    // 工具失败是业务结果而非系统失败：总结步有文本 → success
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('success');
  });

  it('工具抛异常 → 由策略层归一化为可读中文并标记 failed', async () => {
    toolExecuteMock.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:80'));
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_y', toolName: 'web_fetch', input: { url: 'https://refused.example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['抓取失败，我换个方式回答你。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const result = events[1] as { status: string; summary: string };

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('拒绝连接');
  });

  it('工具参数不合法 → 不执行工具，直接以校验失败回给模型', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'call_z', toolName: 'web_fetch', input: { notUrl: 1 } }],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['我需要一个正确的网址。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const result = events[1] as { status: string; summary: string };

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('参数');
    expect(toolExecuteMock).not.toHaveBeenCalled();
  });

  it('模型幻觉出未注册工具 → 按失败处理，不抛异常', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'call_h', toolName: 'no_such_tool', input: {} }],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['这个工具我暂时用不了。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const result = events[1] as { status: string; summary: string };

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('工具不存在');
  });

  it('工具结果命中合规 → 注入总结步前被替换为安全话术（原文不进模型上下文）', async () => {
    toolExecuteMock.mockResolvedValue({
      ok: true,
      contentForModel: '这篇文章在讲洗钱的具体操作方法。',
      summaryForDisplay: '已抓取 example.com',
    });
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_s', toolName: 'web_fetch', input: { url: 'https://bad.example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['该网页内容不适合展示。'] }));

    // 必须先消费完 SSE 流再断言：agent 是异步两段式编排，
    // 流结束时第二次 streamText（总结步）才必然已经发生
    await readSseEvents(await handler(agentRequest()));

    // 第二次 streamText（总结步）的 messages 中，tool 消息的 output.value 已替换
    const summaryCall = streamTextMock.mock.calls[1][0] as {
      messages: Array<{ role: string; content: Array<{ output?: { value: string } }> }>;
    };
    const toolMessage = summaryCall.messages.find((m) => m.role === 'tool');
    const injected = toolMessage?.content?.[0]?.output?.value ?? '';

    expect(injected).not.toContain('洗钱');
    expect(injected).toContain('违法犯罪');
  });

  it('决策步先出正文再调工具 → 决策文本以 agent_note 下发，不进正文 text-delta（二期契约）', async () => {
    // 二期契约（D-二期-6）：决策步文本先缓冲，步末发现有工具调用则以 agent_note 事件下发，
    // 渲染进过程卡片，绝不进正文 text-delta。最终回答由收尾步产出。
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['我先查一下这个网页。'],
          toolCalls: [
            { toolCallId: 'call_pre', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['好了，这个网页讲的是……'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const types = events.map((e) => e.type);

    expect(types).toEqual(['agent_note', 'tool_call', 'tool_result', 'text-delta', 'done']);
    expect(events[0]).toEqual({ type: 'agent_note', text: '我先查一下这个网页。' });
    expect(events[3]).toEqual({ type: 'text-delta', text: '好了，这个网页讲的是……' });
    // tool_call 必先于它自己的 tool_result
    expect(types.indexOf('tool_call')).toBeLessThan(types.indexOf('tool_result'));
    // 关键保证：tool_result 先于收尾步正文
    expect(types.indexOf('tool_result')).toBeLessThan(types.indexOf('text-delta'));
    expect(types.at(-1)).toBe('done');
  });

  // ==================== spec §9：用户中断（abort） ====================

  it('用户中断（abort）：工具被取消且全程无产出 → 整轮释放（failed）', async () => {
    const ac = new AbortController();
    let signalToolStarted: (() => void) | undefined;
    const toolStarted = new Promise<void>((resolve) => {
      signalToolStarted = resolve;
    });

    // 工具挂起不返回，直到请求信号被 abort —— 复刻 T07 #7「画图中途点停止」
    toolExecuteMock.mockImplementation(
      (_args: unknown, ctx: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          ctx.signal.addEventListener('abort', () =>
            reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
          );
          signalToolStarted?.();
        })
    );

    const abortError = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_ab', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      // 同一 signal 也让总结步中断
      .mockReturnValueOnce(makeThrowingResult(abortError));

    const response = await handler(agentRequest({}, ac.signal));
    const bodyPromise = readSseEvents(response);

    await toolStarted;
    ac.abort();
    const events = await bodyPromise;

    const toolResult = events.find((e) => e.type === 'tool_result') as { status: string; summary: string };
    expect(toolResult.status).toBe('failed');
    expect(toolResult.summary).toContain('取消');

    // 什么都没产出（工具没跑完、正文为空）→ 全额释放，不计费
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('failed');
  });

  it('用户中断（abort）：工具已交付产物、正文为空 → 按 partial 结算（不得整轮退款）', async () => {
    // 回归背景：判态原先只看正文（`outcome: text ? 'partial' : 'failed'`）。
    // 而 QuotaSession 里 failed → release＝**全额退款**、partial → settle＝按用量计费。
    // 于是「图片已经生成并随 tool_result 下发给用户、正文还没开始写就被中断」的轮次
    // 会被判 failed 而白送上游成本与产物。判定必须把工具产出算进来。
    const imageUrl = 'https://platform-outputs.agnes-ai.space/generated/cat.png';
    toolExecuteMock.mockResolvedValue({
      ok: true,
      contentForModel: `图片已生成：${imageUrl}`,
      summaryForDisplay: '已生成图片',
      attachment: { kind: 'image', url: imageUrl },
    });

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_img', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      // 用户在总结步产出任何正文之前按了停止
      .mockReturnValueOnce(makeThrowingResult(new Error('aborted')));

    const events = await readSseEvents(await handler(agentRequest()));

    // 产物确实已经交付给用户（事件里带着附件）
    const toolResult = events.find((e) => e.type === 'tool_result') as {
      status: string;
      attachment?: unknown;
    };
    expect(toolResult.status).toBe('success');
    expect(toolResult.attachment).toEqual({ kind: 'image', url: imageUrl });

    // 关键断言：有产出 → partial（计费），不是 failed（退款）
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('partial');
  });

  it('工具成功交付产物但总结步无正文 → 仍按 success 结算并下发 done', async () => {
    toolExecuteMock.mockResolvedValue({
      ok: true,
      contentForModel: '网页正文内容：这是一篇文章的主要内容。',
      summaryForDisplay: '已抓取 example.com（正文 20 字）',
    });
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_nt', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: [] }));

    const events = await readSseEvents(await handler(agentRequest()));

    // 有产出 → 终态是 done，不能反过来给用户报 error
    expect(events.map((e) => e.type)).toEqual(['tool_call', 'tool_result', 'done']);
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('success');
  });

  // ==================== spec §9：匿名用户路径 ====================

  it('匿名用户 → 正常进入 agent 分支并以 chat-agent 计费', async () => {
    currentUserMock.mockResolvedValue({ id: 'anon-user-id', role: 'user', isAnonymous: true });
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['这是给匿名用户的回答。'] }));

    const response = await handler(agentRequest());
    expect(response.status).toBe(200);
    const events = await readSseEvents(response);

    expect(events.map((e) => e.type)).toEqual(['text-delta', 'done']);
    expect(quotaSessionReserveMock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'chat-agent' }),
      'user'
    );
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('success');
  });

  it('agent 关闭（默认）→ 不进入 agent 分支，feature 仍为 chat', async () => {
    const adapterStreamMock = vi.fn(async () => {
      const { ReadableStream: RS } = globalThis;
      return new RS<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
          controller.close();
        },
      });
    });
    handler = createChatHandler({
      getAdapter: () => ({ stream: adapterStreamMock }),
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '普通对话' }],
        provider: 'xunfei',
      }),
    });

    await handler(req);

    expect(adapterStreamMock).toHaveBeenCalledTimes(1);
    expect(streamTextMock).not.toHaveBeenCalled();
    expect(quotaSessionReserveMock).toHaveBeenCalledWith(
      expect.objectContaining({ feature: 'chat', provider: 'xunfei' }),
      'user'
    );
  });

  // ==================== B-7：agent 标志运行时校验 ====================

  it.each([['false'], [1], ['true']])(
    'agent 标志为 truthy 非布尔值 %j → 不进入 agent 分支（严格 === true 才生效）',
    async (rawAgent) => {
      const adapterStreamMock = vi.fn(async () => {
        const { ReadableStream: RS } = globalThis;
        return new RS<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
            controller.close();
          },
        });
      });
      handler = createChatHandler({
        getAdapter: () => ({ stream: adapterStreamMock }),
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '普通对话' }],
          provider: 'xunfei',
          agent: rawAgent,
        }),
      });

      await handler(req);

      // truthy 脏数据不得静默进入「强制换模型 + chat-agent 计费」的 agent 模式
      expect(adapterStreamMock).toHaveBeenCalledTimes(1);
      expect(streamTextMock).not.toHaveBeenCalled();
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'chat' }),
        'user'
      );
    }
  );

  // ==================== B-1：单轮工具调用数量上限 ====================

  it('决策步一次返回超过上限的 tool_call → 超出部分不真跑，事件仍成对且如实告知模型', async () => {
    const manyCalls = [1, 2, 3, 4, 5].map((i) => ({
      toolCallId: `call_${i}`,
      toolName: 'web_fetch',
      input: { url: `https://example.com/${i}` },
    }));
    streamTextMock
      .mockReturnValueOnce(makeFakeResult({ toolCalls: manyCalls }))
      .mockReturnValueOnce(makeFakeResult({ textParts: ['前三个抓好了，其余本轮没跑。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const types = events.map((e) => e.type);

    // 上限 3：只有前 3 个真跑，后 2 个不触工具执行器（成本闸门）
    expect(toolExecuteMock).toHaveBeenCalledTimes(3);

    // 5 个调用全部成对推送（协议完整：每个 tool_call 都有对应 tool_result）
    expect(types.filter((t) => t === 'tool_call')).toHaveLength(5);
    expect(types.filter((t) => t === 'tool_result')).toHaveLength(5);
    expect(types.at(-1)).toBe('done');

    // 超出上限的调用如实标记 failed 并说明原因（用户可见 + 模型可见）
    const results = events.filter((e) => e.type === 'tool_result') as Array<{
      callId: string;
      status: string;
      summary: string;
    }>;
    expect(results[3]).toMatchObject({ callId: 'call_4', status: 'failed' });
    expect(results[3].summary).toContain('超过上限');
    expect(results[4]).toMatchObject({ callId: 'call_5', status: 'failed' });

    // 有产出（前 3 个成功）→ 正常 success 收尾
    expect(fakeSession.finalize.mock.calls[0][0]).toBe('success');
  });

  // ==================== B-3：输出截断提示 ====================

  it('总结步被 maxOutputTokens 截断（finishReason=length）→ done 前下发 warning', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_1', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({ textParts: ['这篇长文的要点是……'], finishReason: 'length' })
      );

    const events = await readSseEvents(await handler(agentRequest()));
    const types = events.map((e) => e.type);

    expect(types).toEqual(['tool_call', 'tool_result', 'text-delta', 'warning', 'done']);
    const warning = events.find((e) => e.type === 'warning') as { warning: string };
    expect(warning.warning).toContain('截断');
  });

  it('降级路径（未调工具）决策步被截断 → 同样下发 warning', async () => {
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({ textParts: ['这个回答很长……'], finishReason: 'length' })
    );

    const events = await readSseEvents(await handler(agentRequest()));

    expect(events.map((e) => e.type)).toEqual(['text-delta', 'warning', 'done']);
  });

  // ==================== 二期多步循环与边界退化测试 ====================

  it('两轮决策都调工具、第三轮产出文本：事件序为 agent_note/tool 对/最终 text-delta，done 的 usage 为各步之和', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['我先查询第一个信息。'],
          toolCalls: [
            { toolCallId: 'call_1', toolName: 'web_fetch', input: { url: 'https://example.com/1' } },
          ],
          usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['接着查询第二个信息。'],
          toolCalls: [
            { toolCallId: 'call_2', toolName: 'web_fetch', input: { url: 'https://example.com/2' } },
          ],
          usage: { inputTokens: 150, outputTokens: 30, totalTokens: 180 },
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['基于上述两项信息，综合回答如下……'],
          usage: { inputTokens: 200, outputTokens: 40, totalTokens: 240 },
        })
      );

    const response = await handler(agentRequest());
    const events = await readSseEvents(response);

    expect(events.map((e) => e.type)).toEqual([
      'agent_note',
      'tool_call',
      'tool_result',
      'agent_note',
      'tool_call',
      'tool_result',
      'text-delta',
      'done',
    ]);

    expect(events[0]).toEqual({ type: 'agent_note', text: '我先查询第一个信息。' });
    expect(events[3]).toEqual({ type: 'agent_note', text: '接着查询第二个信息。' });
    expect(events[6]).toEqual({
      type: 'text-delta',
      text: '基于上述两项信息，综合回答如下……',
    });

    expect(toolExecuteMock).toHaveBeenCalledTimes(2);
    expect(streamTextMock).toHaveBeenCalledTimes(3);

    const done = events[7] as { usage?: { totalTokens: number } };
    expect(done.usage?.totalTokens).toBe(120 + 180 + 240);

    const finalizeCtx = fakeSession.finalize.mock.calls[0][1] as { usage: Record<string, number> };
    expect(finalizeCtx.usage).toMatchObject({
      inputTokens: 450,
      outputTokens: 90,
      totalTokens: 540,
    });
  });

  it('maxSteps 打满（4 轮决策调工具）：第 5 次模型调用不挂 tools 强制收尾，全程无第 6 次调用', async () => {
    for (let i = 1; i <= 4; i++) {
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: [`第 ${i} 轮决策思考`],
          toolCalls: [
            { toolCallId: `call_${i}`, toolName: 'web_fetch', input: { url: `https://example.com/${i}` } },
          ],
          usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        })
      );
    }
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['最终收尾总结文本。'],
        usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
      })
    );

    const response = await handler(agentRequest());
    const events = await readSseEvents(response);

    expect(streamTextMock).toHaveBeenCalledTimes(5);
    for (let i = 0; i < 4; i++) {
      expect(streamTextMock.mock.calls[i][0].tools).toBeDefined();
    }
    expect(streamTextMock.mock.calls[4][0].tools).toBeUndefined();

    const textDelta = events.find((e) => e.type === 'text-delta') as { text: string };
    expect(textDelta.text).toBe('最终收尾总结文本。');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('跨轮累积达到全局第 11 个工具 → 超出部分不真跑，推成对事件且模型收到未执行结果', async () => {
    // 轮 1: 3 工具（全局 1-3）
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [1, 2, 3].map((i) => ({
          toolCallId: `call_${i}`,
          toolName: 'web_fetch',
          input: { url: `https://example.com/${i}` },
        })),
      })
    );
    // 轮 2: 3 工具（全局 4-6）
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [4, 5, 6].map((i) => ({
          toolCallId: `call_${i}`,
          toolName: 'web_fetch',
          input: { url: `https://example.com/${i}` },
        })),
      })
    );
    // 轮 3: 3 工具（全局 7-9）
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [7, 8, 9].map((i) => ({
          toolCallId: `call_${i}`,
          toolName: 'web_fetch',
          input: { url: `https://example.com/${i}` },
        })),
      })
    );
    // 轮 4: 2 工具（全局 10、全局 11）
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        toolCalls: [10, 11].map((i) => ({
          toolCallId: `call_${i}`,
          toolName: 'web_fetch',
          input: { url: `https://example.com/${i}` },
        })),
      })
    );
    // 第 5 步：收尾步
    streamTextMock.mockReturnValueOnce(
      makeFakeResult({
        textParts: ['全部查询完毕。'],
      })
    );

    const events = await readSseEvents(await handler(agentRequest()));

    expect(toolExecuteMock).toHaveBeenCalledTimes(10);

    const toolResults = events.filter((e) => e.type === 'tool_result') as Array<{
      callId: string;
      status: string;
      summary: string;
    }>;
    expect(toolResults).toHaveLength(11);
    expect(toolResults[9].status).toBe('success');
    expect(toolResults[10].status).toBe('failed');
    expect(toolResults[10].summary).toContain('上限');

    const summaryCall = streamTextMock.mock.calls[4][0] as {
      messages: Array<{ role: string; content: Array<{ toolCallId?: string; output?: { value: string } }> }>;
    };
    const toolMessages = summaryCall.messages.filter((m) => m.role === 'tool');
    const lastToolMsg = toolMessages.at(-1);
    const lastOutput = lastToolMsg?.content?.find((p) => p.toolCallId === 'call_11')?.output?.value;
    expect(lastOutput).toContain('未执行');
  });

  it('执行时间预算耗尽 → 剩余工具被跳过并直接跳出循环进入收尾步', async () => {
    // 时间预算通过 config 注入（spec Testing Decisions 4），不打真实时钟：
    // 预算 200ms，首个工具真实睡眠 300ms，其后的工具检查点与循环尾检查都会看到预算耗尽
    handler = createChatHandler({
      // agent 分流后不会走到适配器；替身抛错以证明"确实没走适配器"
      getAdapter: () => ({
        stream: async () => {
          throw new Error('agent 模式不应委派适配器');
        },
      }),
      agentRunTimeBudgetMs: 200,
    });

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_t1', toolName: 'web_fetch', input: { url: 'https://example.com/1' } },
            { toolCallId: 'call_t2', toolName: 'web_fetch', input: { url: 'https://example.com/2' } },
          ],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['时间不够了，基于已有结果作答。'],
        })
      );

    toolExecuteMock.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      return {
        ok: true,
        contentForModel: '页面 1 内容',
        summaryForDisplay: '抓取成功 1',
      };
    });

    const events = await readSseEvents(await handler(agentRequest()));

    expect(toolExecuteMock).toHaveBeenCalledTimes(1);

    const toolResults = events.filter((e) => e.type === 'tool_result') as Array<{
      callId: string;
      status: string;
      summary: string;
    }>;
    expect(toolResults[1].callId).toBe('call_t2');
    expect(toolResults[1].status).toBe('failed');
    expect(toolResults[1].summary).toContain('预算');

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events.find((e) => e.type === 'text-delta')).toEqual({
      type: 'text-delta',
      text: '时间不够了，基于已有结果作答。',
    });
  });

  it('相同参数第 2 次调用 → 不重新执行工具（spy 不递增），成对事件复用展示摘要，模型收到软提示', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_dup_1', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'call_dup_2', toolName: 'web_fetch', input: { url: 'https://example.com' } },
          ],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['回答完毕。'],
        })
      );

    const events = await readSseEvents(await handler(agentRequest()));

    expect(toolExecuteMock).toHaveBeenCalledTimes(1);

    const results = events.filter((e) => e.type === 'tool_result') as Array<{
      callId: string;
      status: string;
      summary: string;
    }>;
    expect(results).toHaveLength(2);
    expect(results[0].callId).toBe('call_dup_1');
    expect(results[0].summary).toBe('已抓取 example.com（正文 20 字）');
    expect(results[1].callId).toBe('call_dup_2');
    expect(results[1].summary).toBe('已抓取 example.com（正文 20 字）');

    const summaryCall = streamTextMock.mock.calls[2][0] as {
      messages: Array<{ role: string; content: Array<{ toolCallId?: string; output?: { value: string } }> }>;
    };
    const toolMsgs = summaryCall.messages.filter((m) => m.role === 'tool');
    const secondToolMsg = toolMsgs[1]?.content?.find((p) => p.toolCallId === 'call_dup_2');
    expect(secondToolMsg?.output?.value).toContain('该调用已执行过，结果同前，请基于现有信息作答或调整参数');
  });

  it('连续 3 次工具失败 → 触发连败熔断，直接跳出循环进收尾步，无后续决策步', async () => {
    toolExecuteMock.mockResolvedValue({
      ok: false,
      contentForModel: '抓取失败：服务器错误',
      summaryForDisplay: '抓取失败',
    });

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'f_1', toolName: 'web_fetch', input: { url: 'https://e.com/1' } }],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'f_2', toolName: 'web_fetch', input: { url: 'https://e.com/2' } }],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [{ toolCallId: 'f_3', toolName: 'web_fetch', input: { url: 'https://e.com/3' } }],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['多次尝试均失败，基于现有情况给出的答复。'],
        })
      );

    const events = await readSseEvents(await handler(agentRequest()));

    expect(streamTextMock).toHaveBeenCalledTimes(4);
    expect(streamTextMock.mock.calls[3][0].tools).toBeUndefined();
    expect(toolExecuteMock).toHaveBeenCalledTimes(3);

    expect(events.find((e) => e.type === 'text-delta')).toEqual({
      type: 'text-delta',
      text: '多次尝试均失败，基于现有情况给出的答复。',
    });
  });

  // ==================== 工单 03：计费自适应降级 ====================

  describe('agent 模式 · 计费自适应降级（工单 03）', () => {
    it('满额：reserve 的 maxOutputTokens = 2048 × 5；runAgent 实际可用 5 步（可用 streamText 调用次数上限侧证）', async () => {
      getAvailableQuotaMock.mockResolvedValue(50_000);

      for (let i = 1; i <= 4; i++) {
        streamTextMock.mockReturnValueOnce(
          makeFakeResult({
            textParts: [`第 ${i} 轮决策思考`],
            toolCalls: [
              { toolCallId: `call_${i}`, toolName: 'web_fetch', input: { url: `https://example.com/${i}` } },
            ],
            usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
          })
        );
      }
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['最终收尾总结文本。'],
          usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        })
      );

      const response = await handler(agentRequest());
      expect(response.status).toBe(200);
      const events = await readSseEvents(response);

      // 断言 reserve 入参中 maxOutputTokens 为 2048 × 5 = 10240
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'chat-agent',
          maxOutputTokens: 10240,
        }),
        'user'
      );

      // streamText 总共被调用 5 次，第 5 次不挂 tools，全程无第 6 次调用
      expect(streamTextMock).toHaveBeenCalledTimes(5);
      for (let i = 0; i < 4; i++) {
        expect(streamTextMock.mock.calls[i][0].tools).toBeDefined();
      }
      expect(streamTextMock.mock.calls[4][0].tools).toBeUndefined();

      const textDelta = events.find((e) => e.type === 'text-delta') as { text: string };
      expect(textDelta.text).toBe('最终收尾总结文本。');
    });

    it('余额仅够 3 步：reserve 按 3 步冻结，且流的行为上限为 3 步', async () => {
      // 输入 28 tokens，28 + 2048 × 3 = 6172，给 6200（仅够 3 步，不够 4 步 8220）
      getAvailableQuotaMock.mockResolvedValue(6_200);

      // 前 2 轮决策调工具
      for (let i = 1; i <= 2; i++) {
        streamTextMock.mockReturnValueOnce(
          makeFakeResult({
            textParts: [`第 ${i} 轮决策思考`],
            toolCalls: [
              { toolCallId: `call_${i}`, toolName: 'web_fetch', input: { url: `https://example.com/${i}` } },
            ],
            usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
          })
        );
      }
      // 第 3 步为收尾步（不挂 tools）强制总结
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['3 步打满后收尾回答。'],
          usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        })
      );

      const response = await handler(agentRequest());
      expect(response.status).toBe(200);
      const events = await readSseEvents(response);

      // 断言 reserve 入参中 maxOutputTokens 按 3 步冻结：2048 × 3 = 6144
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'chat-agent',
          maxOutputTokens: 6144,
        }),
        'user'
      );

      // 行为上限为 3 步：前 2 轮调工具后，第 3 轮强制收尾（不挂 tools），无第 4 轮调用
      expect(streamTextMock).toHaveBeenCalledTimes(3);
      expect(streamTextMock.mock.calls[0][0].tools).toBeDefined();
      expect(streamTextMock.mock.calls[1][0].tools).toBeDefined();
      expect(streamTextMock.mock.calls[2][0].tools).toBeUndefined();

      const textDelta = events.find((e) => e.type === 'text-delta') as { text: string };
      expect(textDelta.text).toBe('3 步打满后收尾回答。');
    });

    it('余额仅够 2 步：静默降级为一期形态（2 步），无降级提示事件', async () => {
      // 输入 28 tokens，28 + 2048 × 2 = 4124，给 4200（仅够 2 步，不够 3 步 6172）
      getAvailableQuotaMock.mockResolvedValue(4_200);

      // 第 1 轮决策调工具
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['第 1 轮决策思考'],
          toolCalls: [
            { toolCallId: 'call_1', toolName: 'web_fetch', input: { url: 'https://example.com/1' } },
          ],
          usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        })
      );
      // 第 2 步为收尾步强制总结
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['两步完成收尾回答。'],
          usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60 },
        })
      );

      const response = await handler(agentRequest());
      expect(response.status).toBe(200);
      const events = await readSseEvents(response);

      // 断言 reserve 入参中 maxOutputTokens 按 2 步冻结：2048 × 2 = 4096
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'chat-agent',
          maxOutputTokens: 4096,
        }),
        'user'
      );

      // 严格限制为 2 步
      expect(streamTextMock).toHaveBeenCalledTimes(2);
      expect(streamTextMock.mock.calls[0][0].tools).toBeDefined();
      expect(streamTextMock.mock.calls[1][0].tools).toBeUndefined();

      // 降级全程静默：无任何降级提示事件（无 warning 事件，无额外错误事件）
      const warningEvents = events.filter((e) => e.type === 'warning');
      expect(warningEvents).toHaveLength(0);

      const textDelta = events.find((e) => e.type === 'text-delta') as { text: string };
      expect(textDelta.text).toBe('两步完成收尾回答。');
    });

    it('余额不足 2 步预估：请求被拒、错误响应与现有额度不足一致、无预留泄漏', async () => {
      // 输入 28 tokens，2 步需要 4124。给定余额 2000（仅够 0 步或 1 步）
      getAvailableQuotaMock.mockResolvedValue(2_000);

      const response = await handler(agentRequest());

      // 拒绝请求，HTTP 状态码 402
      expect(response.status).toBe(402);
      const payload = (await response.json()) as { code: string; error: string; requestId?: string };
      expect(payload.code).toBe('QUOTA_INSUFFICIENT');
      expect(payload.error).toContain('当前额度不足');

      // 无预留泄漏：预检直接拒绝，fakeSession.reserve 未被调用
      expect(quotaSessionReserveMock).not.toHaveBeenCalled();
      expect(fakeSession.release).not.toHaveBeenCalled();
      expect(fakeSession.finalize).not.toHaveBeenCalled();
      expect(streamTextMock).not.toHaveBeenCalled();
    });

    it('预检函数抛异常：console.warn 后按 5 步尝试 reserve', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      getAvailableQuotaMock.mockRejectedValueOnce(new Error('数据库查询连接失败'));

      streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['预检降级兜底回答。'] }));

      const response = await handler(agentRequest());
      expect(response.status).toBe(200);
      const events = await readSseEvents(response);

      // 预检失败记录告警日志
      expect(warnSpy).toHaveBeenCalledWith(
        '[chat] 余额预检异常，按满配步数尝试预留',
        expect.objectContaining({
          userId: 'test-user-id',
          error: '数据库查询连接失败',
        })
      );

      // 仍按满配 5 步（2048 × 5 = 10240）尝试 reserve
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'chat-agent',
          maxOutputTokens: 10240,
        }),
        'user'
      );

      expect(events.map((e) => e.type)).toEqual(['text-delta', 'done']);
      warnSpy.mockRestore();
    });

    it('非 agent 请求：不出现任何预检调用', async () => {
      getAvailableQuotaMock.mockClear();

      const adapterStreamMock = vi.fn(async () => {
        const { ReadableStream: RS } = globalThis;
        return new RS<Uint8Array>({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
            controller.close();
          },
        });
      });
      handler = createChatHandler({
        getAdapter: () => ({ stream: adapterStreamMock }),
      });

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '普通对话消息' }],
          provider: 'xunfei',
          agent: false,
        }),
      });

      await handler(req);

      // 验证普通请求未触发余额预检函数
      expect(getAvailableQuotaMock).not.toHaveBeenCalled();
      expect(adapterStreamMock).toHaveBeenCalledTimes(1);
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({ feature: 'chat' }),
        'user'
      );
    });
  });
});

describe('agent 模式 · image_generate（真实工具实现 + 上游替身）', () => {
  let handler: ReturnType<typeof createChatHandler>;
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    currentUserMock.mockResolvedValue({ id: 'test-user-id', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({ allowed: true, remaining: 60, reset: Date.now() + 60000 });
    fakeSession = createFakeQuotaSession({ outputLimit: 4096 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
    getAvailableQuotaMock.mockResolvedValue(100_000);
    // 真实注册表 + 真实 image_generate 工具，只替换最上层上游请求
    registryHolder.current = createToolRegistry([createImageGenerateTool()]);
    handler = createChatHandler({
      getAdapter: () => ({
        stream: async () => {
          throw new Error('agent 模式不应委派适配器');
        },
      }),
    });
  });

  it('生成成功 → tool_result 携带图片附件供前端直接展示', async () => {
    requestAgnesImageMock.mockResolvedValue({ url: 'https://cdn.agnes.ai/a.png' });
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            {
              toolCallId: 'img_1',
              toolName: 'image_generate',
              input: { prompt: '一只在雨夜行走的猫' },
            },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['已经为你画好啦。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const result = events[1] as {
      status: string;
      summary: string;
      attachment?: { kind: string; url: string };
    };

    expect(result.status).toBe('success');
    expect(result.attachment).toEqual({ kind: 'image', url: 'https://cdn.agnes.ai/a.png' });
    expect(result.summary).toContain('已生成图片');
    expect(requestAgnesImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ prompt: '一只在雨夜行走的猫' }),
      expect.anything()
    );
  });

  it('未指定尺寸 → 用默认 1024x1024', async () => {
    requestAgnesImageMock.mockResolvedValue({ url: 'https://cdn.agnes.ai/b.png' });
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'img_2', toolName: 'image_generate', input: { prompt: '水墨山水' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['完成。'] }));

    await readSseEvents(await handler(agentRequest()));

    expect(requestAgnesImageMock).toHaveBeenCalledWith(
      expect.objectContaining({ size: '1024x1024' }),
      expect.anything()
    );
  });

  it('上游限流 → failed、无附件，给出可读提示', async () => {
    requestAgnesImageMock.mockRejectedValue(new AgnesUpstreamErrorMock('rate limited', 429));
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'img_3', toolName: 'image_generate', input: { prompt: '一只猫' } },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['图片服务暂时繁忙，稍后再试。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const result = events[1] as { status: string; summary: string; attachment?: unknown };

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('繁忙');
    expect(result.attachment).toBeUndefined();
  });

  it('描述命中合规 → 不调用上游，直接以安全文案失败', async () => {
    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            {
              toolCallId: 'img_4',
              toolName: 'image_generate',
              input: { prompt: '画一张讲解洗钱方法的宣传图' },
            },
          ],
        })
      )
      .mockReturnValueOnce(makeFakeResult({ textParts: ['换个主题吧。'] }));

    const events = await readSseEvents(await handler(agentRequest()));
    const result = events[1] as { status: string; summary: string };

    expect(result.status).toBe('failed');
    expect(result.summary).toContain('内容安全');
    expect(requestAgnesImageMock).not.toHaveBeenCalled();
  });

  it('第 4 次 image_generate → 超出出图上限被拒，成对事件下发且模型收到出图次数已用完文案', async () => {
    requestAgnesImageMock.mockResolvedValue({ url: 'https://cdn.agnes.ai/test.png' });

    streamTextMock
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'img_c1', toolName: 'image_generate', input: { prompt: '画猫' } },
            { toolCallId: 'img_c2', toolName: 'image_generate', input: { prompt: '画狗' } },
          ],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          toolCalls: [
            { toolCallId: 'img_c3', toolName: 'image_generate', input: { prompt: '画鸟' } },
            { toolCallId: 'img_c4', toolName: 'image_generate', input: { prompt: '画鱼' } },
          ],
        })
      )
      .mockReturnValueOnce(
        makeFakeResult({
          textParts: ['前三张图片已生成，第四张因达到上限未生成。'],
        })
      );

    const events = await readSseEvents(await handler(agentRequest()));

    expect(requestAgnesImageMock).toHaveBeenCalledTimes(3);

    const toolResults = events.filter((e) => e.type === 'tool_result') as Array<{
      callId: string;
      status: string;
      summary: string;
    }>;
    expect(toolResults).toHaveLength(4);
    expect(toolResults[2].status).toBe('success');
    expect(toolResults[3].status).toBe('failed');
    expect(toolResults[3].summary).toContain('出图次数已用完');

    const summaryCall = streamTextMock.mock.calls[2][0] as {
      messages: Array<{ role: string; content: Array<{ toolCallId?: string; output?: { value: string } }> }>;
    };
    const toolMsgs = summaryCall.messages.filter((m) => m.role === 'tool');
    const fourthImgOutput = toolMsgs[1]?.content?.find((p) => p.toolCallId === 'img_c4')?.output?.value;
    expect(fourthImgOutput).toContain('本次对话的出图次数已用完');
  });

  // ==================== ADR-0014 / 工单 01：场景能力包核心链路 ====================

  describe('agent 模式 · 场景能力包核心链路 (ADR-0014 / 工单 01)', () => {
    it('选择 deep-research 能力包：按 8 步上限（16384 tokens）预留，决策步注入专属 systemPrompt 且留痕', async () => {
      getAvailableQuotaMock.mockResolvedValue(100_000);
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['深度研报产出完毕。'],
        })
      );

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '请对新能源汽车市场做深度调研' }],
          agent: true,
          capabilityPack: 'deep-research',
        }),
      });

      const response = await handler(req);
      expect(response.status).toBe(200);
      const events = await readSseEvents(response);

      // 1. 预算预留按 8 步扩容计算：2048 * 8 = 16384
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'chat-agent',
          maxOutputTokens: 16384,
        }),
        'user'
      );

      // 2. 决策步传入能力包专属 systemPrompt
      expect(streamTextMock).toHaveBeenCalledTimes(1);
      const callOptions = streamTextMock.mock.calls[0][0] as {
        system?: string;
        tools?: Record<string, unknown>;
      };
      expect(callOptions.system).toBeDefined();
      expect(callOptions.system).toContain('深度调研');

      // 3. 内置工具白名单收敛：由于 registryHolder 当前只有 image_generate，在 deep-research 下被剔除！
      // tools 中只包含 web_search（若允许），不包含 image_generate
      expect(callOptions.tools?.image_generate).toBeUndefined();

      // 4. finalize metadata 包含能力包标记
      expect(fakeSession.finalize).toHaveBeenCalledWith(
        'success',
        expect.objectContaining({
          metadata: expect.objectContaining({
            agent: true,
            capabilityPack: 'deep-research',
          }),
        })
      );

      expect(events.some((e) => e.type === 'text-delta' && e.text === '深度研报产出完毕。')).toBe(true);
    });

    it('未指定能力包：保持 5 步基线（10240 tokens）预留，不挂载专项 systemPrompt', async () => {
      getAvailableQuotaMock.mockResolvedValue(100_000);
      streamTextMock.mockReturnValueOnce(
        makeFakeResult({
          textParts: ['通用 Agent 回答。'],
        })
      );

      const req = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: '通用问题' }],
          agent: true,
        }),
      });

      const response = await handler(req);
      expect(response.status).toBe(200);
      await readSseEvents(response);

      // 保持 5 步基线预算：2048 * 5 = 10240
      expect(quotaSessionReserveMock).toHaveBeenCalledWith(
        expect.objectContaining({
          feature: 'chat-agent',
          maxOutputTokens: 10240,
        }),
        'user'
      );

      // 决策步无特定专项能力包提示词
      const callOptions = streamTextMock.mock.calls[0][0] as {
        system?: string;
      };
      expect(callOptions.system).toBeUndefined();
    });

    describe('会话级临时停用工具二次过滤 (disabledToolKeys · ADR-0014 / 工单 02)', () => {
      it('请求携带 disabledToolKeys 时二次过滤剔除对应工具', async () => {
        getAvailableQuotaMock.mockResolvedValue(100_000);
        streamTextMock.mockReturnValueOnce(
          makeFakeResult({
            textParts: ['工具已被过滤，直接回答。'],
          })
        );

        const req = new Request('http://localhost/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '临时关闭画图' }],
            agent: true,
            disabledToolKeys: ['image_generate'],
          }),
        });

        const response = await handler(req);
        expect(response.status).toBe(200);
        const events = await readSseEvents(response);

        const callOptions = streamTextMock.mock.calls[0][0] as {
          tools?: Record<string, unknown>;
        };
        // 验证 image_generate 被过滤剔除
        expect(callOptions.tools?.image_generate).toBeUndefined();
        expect(events.some((e) => e.type === 'text-delta' && e.text === '工具已被过滤，直接回答。')).toBe(true);
      });

      it('全部工具禁用时（含 web_search），编排器安全退化为纯文本流', async () => {
        getAvailableQuotaMock.mockResolvedValue(100_000);
        streamTextMock.mockReturnValueOnce(
          makeFakeResult({
            textParts: ['全关工具，安全退化为纯文本回答。'],
          })
        );

        const req = new Request('http://localhost/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', content: '关闭所有工具' }],
            agent: true,
            disabledToolKeys: ['image_generate', 'web_fetch', 'web_search'],
          }),
        });

        const response = await handler(req);
        expect(response.status).toBe(200);
        const events = await readSseEvents(response);

        const callOptions = streamTextMock.mock.calls[0][0] as {
          tools?: Record<string, unknown>;
        };
        // 验证 tools 为空对象，web_search 与内置工具全都不在
        expect(callOptions.tools).toEqual({});
        expect(events.some((e) => e.type === 'text-delta' && e.text === '全关工具，安全退化为纯文本回答。')).toBe(true);
      });
    });
  });
});

