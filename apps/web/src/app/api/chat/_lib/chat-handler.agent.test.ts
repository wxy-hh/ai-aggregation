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
import type { AgentToolSpec, ToolRegistry } from './agent/tools/registry';
import { createToolRegistry } from './agent/tools/registry';
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
  };
});

vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: currentUserMock }));
vi.mock('@repo/redis', () => ({ getRateLimiter: () => rateLimiterMock }));
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: quotaSessionReserveMock },
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
}) {
  return {
    fullStream: (async function* () {
      for (const text of opts.textParts ?? []) {
        yield { type: 'text-delta', text };
      }
    })(),
    toolCalls: Promise.resolve(opts.toolCalls ?? []),
    usage: Promise.resolve(opts.usage ?? null),
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
        maxOutputTokens: 4096,
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

  it('请求指定 xunfei/lite → 服务端静默覆盖为 doubao/doubao-seed-evolving', async () => {
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['ok'] }));

    await handler(agentRequest({ provider: 'xunfei', model: 'lite' }));

    expect(quotaSessionReserveMock).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'doubao', model: 'doubao-seed-evolving' }),
      'user'
    );
    expect(quotaSessionReserveMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'xunfei' }),
      expect.anything()
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
});
