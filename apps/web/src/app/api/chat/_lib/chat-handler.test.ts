import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createChatHandler } from './chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { encodeSseEvent } from './sse';
import type { ChatContext, ChatProviderAdapter } from './types';
import type { ProviderName } from '@repo/providers';

const { currentUserMock, rateLimiterMock, quotaSessionReserveMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  rateLimiterMock: {
    check: vi.fn(),
  },
  quotaSessionReserveMock: vi.fn(),
}));

vi.mock('@/lib/auth/get-current-user', () => ({
  getCurrentUser: currentUserMock,
}));

vi.mock('@repo/redis', () => ({
  getRateLimiter: () => rateLimiterMock,
}));

vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: {
    reserve: quotaSessionReserveMock,
  },
}));

async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

describe('createChatHandler 通用对话处理器合规拦截与审计', () => {
  let mockAdapterStream: ReturnType<typeof vi.fn<(ctx: ChatContext) => Promise<ReadableStream<Uint8Array>>>>;
  let mockAdapter: ChatProviderAdapter;
  let handler: ReturnType<typeof createChatHandler>;
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;

  beforeEach(() => {
    vi.clearAllMocks();

    currentUserMock.mockResolvedValue({
      id: 'test-user-id',
      role: 'user',
    });

    rateLimiterMock.check.mockResolvedValue({
      allowed: true,
      remaining: 60,
      reset: Date.now() + 60000,
    });

    fakeSession = createFakeQuotaSession({
      outputLimit: 2048,
    });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);

    mockAdapterStream = vi.fn(async (ctx: ChatContext) => {
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encodeSseEvent({ type: 'text-delta', text: '你好' }));
          await ctx.onFinish({
            outcome: 'success',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimated: false },
            outputText: '你好',
          });
          controller.enqueue(encodeSseEvent({ type: 'done' }));
          controller.close();
        },
      });
    });

    mockAdapter = {
      stream: (ctx: ChatContext) => mockAdapterStream(ctx),
    };

    handler = createChatHandler({
      getAdapter: (_provider: ProviderName) => mockAdapter,
    });
  });

  it('用例 1：最后一条用户消息命中合规词库 → 返回安全话术流，不预留额度、不调适配器', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '我想了解洗钱怎么操作' },
        ],
        provider: 'xunfei',
      }),
    });

    const response = await handler(req);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/event-stream');

    const events = await readSseEvents(response);
    expect(events).toHaveLength(2);
    expect(events[0]).toEqual({
      type: 'text-delta',
      text: '这个问题涉及违法犯罪内容，我无法提供帮助。如果你有其他问题，欢迎随时问我。',
    });
    expect(events[1]).toEqual({
      type: 'done',
    });
    expect(events[1]).not.toHaveProperty('usage');

    // 严禁调用额度预留与适配器
    expect(quotaSessionReserveMock).not.toHaveBeenCalled();
    expect(mockAdapterStream).not.toHaveBeenCalled();
  });

  it('管理员用户命中合规词库同样被拦截（合规层无人可绕）', async () => {
    currentUserMock.mockResolvedValue({
      id: 'admin-user-id',
      role: 'admin',
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '如何策划恐怖袭击？' },
        ],
        provider: 'xunfei',
      }),
    });

    const response = await handler(req);
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    expect(events[0].text).toContain('暴恐');

    expect(quotaSessionReserveMock).not.toHaveBeenCalled();
    expect(mockAdapterStream).not.toHaveBeenCalled();
  });

  it('历史消息包含违规词但最后一条用户消息正常：只扫描最后一条 user 消息，正常放行', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '怎么办假证' },
          { role: 'assistant', content: '这个问题涉及违法犯罪内容，我无法提供帮助。' },
          { role: 'user', content: '我感冒了该吃什么药' },
        ],
        provider: 'xunfei',
      }),
    });

    const response = await handler(req);
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    expect(events[0]).toEqual({ type: 'text-delta', text: '你好' });

    expect(quotaSessionReserveMock).toHaveBeenCalledTimes(1);
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
  });

  it('用例 2：正常消息 → 正常调用配额预留并委派给适配器产流', async () => {
    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '我想买房贷款怎么算' },
        ],
        provider: 'xunfei',
      }),
    });

    const response = await handler(req);
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    expect(events[0]).toEqual({ type: 'text-delta', text: '你好' });
    expect(events[1]).toEqual({ type: 'done' });

    expect(quotaSessionReserveMock).toHaveBeenCalledTimes(1);
    expect(quotaSessionReserveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'test-user-id',
        feature: 'chat',
        provider: 'xunfei',
      }),
      'user'
    );
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
  });

  it('用例 3：输出审计 → 模型输出命中合规词库时，在 finalize metadata 中添加 safetyFlag 标记', async () => {
    mockAdapterStream.mockImplementation(async (ctx: ChatContext) => {
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          const sensitiveOutput = '这是一段涉及劣等民族言论的输出内容';
          controller.enqueue(encodeSseEvent({ type: 'text-delta', text: sensitiveOutput }));
          await ctx.onFinish({
            outcome: 'success',
            usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50, estimated: false },
            outputText: sensitiveOutput,
          });
          controller.enqueue(encodeSseEvent({ type: 'done' }));
          controller.close();
        },
      });
    });

    const req = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: '请给我讲讲二战相关的历史背景' },
        ],
        provider: 'xunfei',
      }),
    });

    const response = await handler(req);
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    expect(events[0].text).toContain('劣等民族');

    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    const finalizeCall = fakeSession.finalize.mock.calls[0];
    const [outcome, finalizeContext] = finalizeCall;

    // 输出拦截不改 outcome，不影响结算
    expect(outcome).toBe('success');
    expect(finalizeContext.metadata).toMatchObject({
      safetyFlag: 'hate',
    });
  });
});


describe('聊天请求传输契约接入（评审 C4 / ADR-0050）', () => {
  let mockAdapterStream: ReturnType<typeof vi.fn<(ctx: ChatContext) => Promise<ReadableStream<Uint8Array>>>>;
  let mockAdapter: ChatProviderAdapter;
  let getAdapterMock: ReturnType<typeof vi.fn<(provider: ProviderName) => ChatProviderAdapter>>;
  let handler: ReturnType<typeof createChatHandler>;
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;

  beforeEach(() => {
    vi.clearAllMocks();

    currentUserMock.mockResolvedValue({
      id: 'test-user-id',
      role: 'user',
    });
    rateLimiterMock.check.mockResolvedValue({
      allowed: true,
      remaining: 60,
      reset: Date.now() + 60000,
    });
    fakeSession = createFakeQuotaSession({ outputLimit: 2048 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);

    mockAdapterStream = vi.fn(async (ctx: ChatContext) => {
      return new ReadableStream<Uint8Array>({
        async start(controller) {
          controller.enqueue(encodeSseEvent({ type: 'text-delta', text: '你好' }));
          await ctx.onFinish({
            outcome: 'success',
            usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimated: false },
            outputText: '你好',
          });
          controller.enqueue(encodeSseEvent({ type: 'done' }));
          controller.close();
        },
      });
    });
    mockAdapter = { stream: (ctx: ChatContext) => mockAdapterStream(ctx) };
    getAdapterMock = vi.fn((_provider: ProviderName) => mockAdapter);
    handler = createChatHandler({ getAdapter: getAdapterMock });
  });

  function postJson(body: Record<string, unknown>) {
    return new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('TC08-1: 非法 role 请求 → 400 且响应体含 error/code/errorId/details', async () => {
    const response = await handler(
      postJson({
        messages: [
          { role: 'tool', content: '工具结果' },
          { role: 'user', content: '你好' },
        ],
        provider: 'xunfei',
      })
    );
    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(typeof data.error).toBe('string');
    expect(/[\u4e00-\u9fa5]/.test(data.error as string)).toBe(true);
    expect(typeof data.code).toBe('string');
    expect(typeof data.errorId).toBe('string');
    expect(Array.isArray(data.details)).toBe(true);
    expect(mockAdapterStream).not.toHaveBeenCalled();
  });

  it('TC08-2: 旧客户端快照字段（isStreaming/stopped）被剥离，adapter 收到窄消息', async () => {
    const response = await handler(
      postJson({
        messages: [
          {
            role: 'user',
            content: '你好',
            isStreaming: false,
            stopped: false,
            usage: { totalTokens: 15 },
          },
        ],
        provider: 'xunfei',
      })
    );
    expect(response.status).toBe(200);
    expect(mockAdapterStream).toHaveBeenCalledTimes(1);
    const ctx = mockAdapterStream.mock.calls[0][0];
    expect(ctx.messages[0]).toEqual({ role: 'user', content: '你好' });
  });

  it('TC08-3: agent=1 归一化为普通对话，getAdapter 以请求 provider 调用', async () => {
    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '你好' }],
        provider: 'xunfei',
        model: 'lite',
        agent: 1,
      })
    );
    expect(response.status).toBe(200);
    expect(getAdapterMock).toHaveBeenCalledWith('xunfei');
    const ctx = mockAdapterStream.mock.calls[0][0];
    expect(ctx.model).toBe('lite');
  });

  it('TC08-4: provider="openai" → 400', async () => {
    const response = await handler(
      postJson({
        messages: [{ role: 'user', content: '你好' }],
        provider: 'openai',
      })
    );
    expect(response.status).toBe(400);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.code).toBe('INVALID_CHAT_REQUEST');
  });

  it('TC08-6: 末条消息附件缺载荷 → 400', async () => {
    const response = await handler(
      postJson({
        messages: [
          { role: 'user', content: '你好' },
          { role: 'user', content: '看图', attachments: [{ type: 'image' }] },
        ],
        provider: 'xunfei',
      })
    );
    expect(response.status).toBe(400);
    expect(mockAdapterStream).not.toHaveBeenCalled();
  });
});
