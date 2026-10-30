/**
 * agent 模式用户自定义 Webhook 工具 HTTP 级主接缝测试（spec §4.4 / §4.5 / §5 / 工单 03）
 *
 * 验证目标：
 * 1. 模型调用 wh_ 工具 → 真实适配器 + 执行器走通（mock 传输层 200 JSON）→ tool_call / tool_result 成对事件 → 结果回注 → 收尾回答；
 * 2. 鉴权凭证端到端解密：断言加密凭证在出站请求头中被正确解密注入；
 * 3. 每请求 3 次上限（spec D-三期-6）：第 4 次调用在适配器闭包层被拦截，不发出站请求，推 failed 事件，模型收到次数已用完提示，审计写入 outcome='skipped'；
 * 4. 停用工具隔离：disabled 工具不进入注册表，模型侧 tools 不可见；
 * 5. 计费 metadata 完整性：finalize metadata 中正确携带 webhookCalls 计数；
 * 6. 异常容灾降级：getUserTools 抛错时不阻断对话（console.warn 留痕并走无用户工具降级路径）；
 * 7. GET 方法 query 拼接与参数校验。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ClientRequestArgs } from 'node:http';
import type { UserWebhookTool } from '@repo/db';
import { encryptWebhookSecret } from '@/lib/crypto';
import { createChatHandler } from './chat-handler';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';

/** 审批凭证签名密钥（测试用） */
const APPROVAL_TEST_SECRET = 'approval-test-secret-0123456789abcdef0123456789abcdef';

/** 测试用 32 字节对称主密钥（64 字符十六进制） */
const TEST_SECRET_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

/** 模拟客户端请求对象 */
class MockClientRequest extends EventEmitter {
  writtenData: string[] = [];
  destroyed = false;
  destroyError?: Error;

  write(chunk: unknown) {
    if (typeof chunk === 'string') {
      this.writtenData.push(chunk);
    } else if (Buffer.isBuffer(chunk)) {
      this.writtenData.push(chunk.toString('utf8'));
    }
    return true;
  }

  end(chunk?: unknown) {
    if (chunk) {
      this.write(chunk);
    }
    return this;
  }

  destroy(err?: Error) {
    this.destroyed = true;
    this.destroyError = err;
    if (err) {
      process.nextTick(() => this.emit('error', err));
    }
    this.emit('close');
    return this;
  }

  setTimeout(_ms: number, cb?: () => void) {
    if (cb) this.on('timeout', cb);
    return this;
  }
}

/** 模拟响应流对象 */
class MockIncomingMessage extends PassThrough {
  statusCode: number;
  headers: Record<string, string | string[] | undefined>;
  destroyed = false;

  constructor(options: {
    statusCode?: number;
    headers?: Record<string, string | string[] | undefined>;
  }) {
    super();
    this.statusCode = options.statusCode ?? 200;
    this.headers = options.headers ?? {};
  }

  override destroy(err?: Error): this {
    this.destroyed = true;
    if (err) {
      this.emit('error', err);
    }
    return super.destroy(err);
  }
}

interface MockResponseConfig {
  statusCode?: number;
  headers?: Record<string, string | string[] | undefined>;
  body?: string | Buffer;
  error?: Error;
}

const {
  currentUserMock,
  rateLimiterMock,
  quotaSessionReserveMock,
  streamTextMock,
  generateTextMock,
  getAvailableQuotaMock,
  prismaAuditCreateMock,
  httpsRequestMock,
  dnsLookupMock,
  networkState,
  redisState,
} = vi.hoisted(() => {
  const currentUserMock = vi.fn();
  const rateLimiterMock = { check: vi.fn() };
  const quotaSessionReserveMock = vi.fn();
  const streamTextMock = vi.fn();
  const generateTextMock = vi.fn();
  const getAvailableQuotaMock = vi.fn();
  const prismaAuditCreateMock = vi.fn();

  // 假 Redis（AGENT-HITL-ACTION）：SET NX 语义 + 可注入故障；used 记录已占用的 key
  const redisState = {
    used: new Set<string>(),
    down: false,
    setMock: vi.fn(),
  };
  redisState.setMock.mockImplementation(async (key: string) => {
    if (redisState.down) throw new Error('redis down');
    if (redisState.used.has(key)) return null;
    redisState.used.add(key);
    return 'OK';
  });

  const networkState = {
    responseConfig: {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 0, data: { orderId: 'ord_123', status: 'shipped' } }),
    } as MockResponseConfig,
    lastOptions: null as ClientRequestArgs | null,
    lastReq: null as MockClientRequest | null,
    requestCount: 0,
  };

  const dnsLookupMock = vi.fn(
    (
      _hostname: string,
      options: unknown,
      callback?: (...args: unknown[]) => void
    ) => {
      const cb = (typeof options === 'function' ? options : callback) as (
        err: Error | null,
        addresses?: Array<{ address: string; family: number }>
      ) => void;
      if (cb) {
        cb(null, [{ address: '93.184.216.34', family: 4 }]);
      }
    }
  );

  const httpsRequestMock = vi.fn(
    (options: ClientRequestArgs, callback?: (res: MockIncomingMessage) => void) => {
      networkState.requestCount++;
      networkState.lastOptions = options;
      const req = new MockClientRequest();
      networkState.lastReq = req;

      if (typeof options.lookup === 'function') {
        const hostname = typeof options.hostname === 'string' ? options.hostname : 'localhost';
        options.lookup(
          hostname,
          { all: true },
          (err: Error | null) => {
            if (err) {
              process.nextTick(() => req.emit('error', err));
              return;
            }
            dispatchResponse(req, callback);
          }
        );
      } else {
        dispatchResponse(req, callback);
      }

      return req;
    }
  );

  function dispatchResponse(
    req: MockClientRequest,
    callback?: (res: MockIncomingMessage) => void
  ) {
    if (networkState.responseConfig.error) {
      process.nextTick(() => req.emit('error', networkState.responseConfig.error));
      return;
    }

    const res = new MockIncomingMessage({
      statusCode: networkState.responseConfig.statusCode ?? 200,
      headers: networkState.responseConfig.headers ?? {},
    });

    process.nextTick(() => {
      if (callback) {
        callback(res);
      }
      if (networkState.responseConfig.body !== undefined) {
        res.write(networkState.responseConfig.body);
      }
      res.end();
    });
  }

  return {
    currentUserMock,
    rateLimiterMock,
    quotaSessionReserveMock,
    streamTextMock,
    generateTextMock,
    getAvailableQuotaMock,
    prismaAuditCreateMock,
    httpsRequestMock,
    dnsLookupMock,
    networkState,
    redisState,
  };
});

// 模块级 Mock
vi.mock('@/lib/auth/get-current-user', () => ({ getCurrentUser: currentUserMock }));
vi.mock('@repo/redis', () => ({
  getRateLimiter: () => rateLimiterMock,
  getRedisClient: () => ({ set: redisState.setMock }),
}));
vi.mock('@/lib/billing/quota-session', () => ({
  QuotaSession: { reserve: quotaSessionReserveMock },
}));
vi.mock('@/lib/billing/quota-service', () => ({
  getAvailableQuota: getAvailableQuotaMock,
}));
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return { ...actual, streamText: streamTextMock, generateText: generateTextMock };
});
vi.mock('@repo/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/db')>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      webhookToolCall: {
        create: prismaAuditCreateMock,
      },
      userWebhookTool: {
        findMany: vi.fn(),
      },
    },
  };
});
vi.mock('node:https', () => ({
  request: httpsRequestMock,
  default: {
    request: httpsRequestMock,
  },
}));
vi.mock('node:dns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns')>();
  return {
    ...actual,
    lookup: dnsLookupMock,
    default: {
      ...actual,
      lookup: dnsLookupMock,
    },
  };
});

/** 构造 streamText 的模拟返回 */
function makeFakeResult(opts: {
  textParts?: string[];
  toolCalls?: Array<{ toolCallId: string; toolName: string; input: unknown }>;
  finishReason?: string;
}) {
  return {
    fullStream: (async function* () {
      for (const text of opts.textParts ?? []) {
        yield { type: 'text-delta', text };
      }
    })(),
    toolCalls: Promise.resolve(opts.toolCalls ?? []),
    usage: Promise.resolve({ promptTokens: 100, completionTokens: 50, totalTokens: 150 }),
    finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
    response: Promise.resolve({ messages: [{ role: 'assistant', content: '决策步消息' }] }),
  };
}

/** 解析 SSE 事件流 */
async function readSseEvents(response: Response) {
  const text = await response.text();
  return text
    .trim()
    .split('\n\n')
    .map((chunk) => chunk.replace(/^data:\s*/, ''))
    .filter(Boolean)
    .map((chunk) => JSON.parse(chunk) as Record<string, unknown>);
}

/** 构造对话请求 */
function makeAgentRequest(overrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '查一下订单 ord_123 的物流情况' }],
      provider: 'xunfei',
      model: 'lite',
      agent: true,
      ...overrides,
    }),
  });
}

describe('agent 模式 · 用户自定义 Webhook 工具（主接缝闭环）', () => {
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('WEBHOOK_SECRET_KEY', TEST_SECRET_KEY);
    vi.stubEnv('ARK_API_KEY', 'test-ark-key');
    vi.stubEnv('DEEPSEEK_MODEL', 'test-deepseek-key');
    vi.stubEnv('APPROVAL_TOKEN_SECRET', APPROVAL_TEST_SECRET);

    // 规划 / 质检的 generateText 一律失败：与未接真实模型时的降级行为一致（计划缺省、质检 fail-open）
    generateTextMock.mockReset();
    generateTextMock.mockRejectedValue(new Error('测试环境不接真实模型'));
    redisState.used.clear();
    redisState.down = false;

    currentUserMock.mockResolvedValue({ id: 'user-001', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({ allowed: true, remaining: 60, reset: Date.now() + 60000 });
    getAvailableQuotaMock.mockResolvedValue(100_000);

    fakeSession = createFakeQuotaSession({ outputLimit: 4096 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
    prismaAuditCreateMock.mockResolvedValue({ id: 'audit-log-1' });

    networkState.requestCount = 0;
    networkState.lastOptions = null;
    networkState.lastReq = null;
    networkState.responseConfig = {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ orderId: 'ord_123', status: 'shipped' }),
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('模型调用 wh_ 工具 → 走通真实适配器与执行器，加密凭证解密注入请求头，结果回注并完成回答', async () => {
    // 构造测试 Webhook 工具实体（携带加密后的凭证）
    const encryptedSecret = encryptWebhookSecret('Bearer token_secret_abc123', TEST_SECRET_KEY);
    const mockTool: UserWebhookTool = {
      id: 'tool-order-query',
      userId: 'user-001',
      name: '订单查询接口',
      callName: 'order_query',
      description: '根据订单ID查询订单的最新物流状态',
      url: 'https://api.merchant.com/orders',
      method: 'POST',
      authHeaderName: 'Authorization',
      authHeaderValueEnc: encryptedSecret,
      params: [
        { name: 'orderId', type: 'string', required: true, description: '订单号' },
      ],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 模拟两步循环：第一轮模型决定调用 wh_order_query 工具；第二轮收尾输出总结文本
    let streamTextCalls = 0;
    streamTextMock.mockImplementation(() => {
      streamTextCalls++;
      if (streamTextCalls === 1) {
        return makeFakeResult({
          textParts: ['正在为您查询订单...'],
          toolCalls: [
            {
              toolCallId: 'call_webhook_1',
              toolName: 'wh_order_query',
              input: { orderId: 'ord_123' },
            },
          ],
        });
      }
      return makeFakeResult({
        textParts: ['您的订单 ord_123 当前状态为已发货。'],
      });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('未开启 agent 时不应调用 adapter');
      },
      getUserTools: async () => [mockTool],
    });

    const response = await handler(makeAgentRequest());
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);

    // 1. 验证下发了成对的 tool_call 与 tool_result 事件
    const toolCallEvent = events.find((e) => e.type === 'tool_call') as
      | { type: string; call: { id: string; name: string; argsSummary: string } }
      | undefined;
    expect(toolCallEvent).toBeDefined();
    expect(toolCallEvent?.call).toMatchObject({
      id: 'call_webhook_1',
      name: 'wh_order_query',
      argsSummary: expect.stringContaining('ord_123'),
    });

    const toolResultEvent = events.find((e) => e.type === 'tool_result') as
      | { type: string; callId: string; name: string; status: string; summary: string }
      | undefined;
    expect(toolResultEvent).toBeDefined();
    expect(toolResultEvent).toMatchObject({
      callId: 'call_webhook_1',
      name: 'wh_order_query',
      status: 'success',
      summary: expect.stringContaining('调用成功'),
    });

    // 2. 验证决策步文本作为 agent_note 下发，收尾步文本作为 text-delta 正常交付
    const agentNoteEvent = events.find((e) => e.type === 'agent_note') as
      | { type: string; text: string }
      | undefined;
    expect(agentNoteEvent?.text).toBe('正在为您查询订单...');

    const textDeltaEvents = events.filter((e) => e.type === 'text-delta') as Array<{
      type: string;
      text: string;
    }>;
    const fullAnswer = textDeltaEvents.map((e) => e.text).join('');
    expect(fullAnswer).toBe('您的订单 ord_123 当前状态为已发货。');

    // 3. 验证真实发起出站请求并解密注入了鉴权头
    expect(networkState.requestCount).toBe(1);
    expect(networkState.lastOptions?.headers).toMatchObject({
      Authorization: 'Bearer token_secret_abc123',
      'Content-Type': 'application/json',
    });
    // 验证请求 body 正确序列化参数
    expect(networkState.lastReq?.writtenData.join('')).toBe(JSON.stringify({ orderId: 'ord_123' }));

    // 4. 验证全量审计记录已落库
    expect(prismaAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-001',
          toolId: 'tool-order-query',
          hostname: 'api.merchant.com',
          method: 'POST',
          statusCode: 200,
          outcome: 'success',
        }),
      })
    );

    // 5. 验证 finalize metadata 包含 webhookCalls 计数为 1
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    const [finalizeOutcome, finalizeCtx] = fakeSession.finalize.mock.calls[0] as [
      string,
      { metadata?: Record<string, unknown> },
    ];
    expect(finalizeOutcome).toBe('success');
    expect(finalizeCtx.metadata?.webhookCalls).toBe(1);
  });

  it('第 4 次 wh_ 调用被每请求上限（3 次）拦截：不发出站请求、成对事件 failed、模型收到已用完文案、审计记录 skipped', async () => {
    const mockTool: UserWebhookTool = {
      id: 'tool-counter-query',
      userId: 'user-001',
      name: '数据统计工具',
      callName: 'query_metric',
      description: '查询统计数据',
      url: 'https://api.metrics.com/data',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [{ name: 'metric', type: 'string', required: true }],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 模拟跨轮次调用：第一轮 3 次，第二轮 1 次（单轮均未超限，整请求累计第 4 次触发 webhook 上限）
    let streamTextCalls = 0;
    streamTextMock.mockImplementation(() => {
      streamTextCalls++;
      if (streamTextCalls === 1) {
        return makeFakeResult({
          textParts: ['第一轮查询 3 项指标...'],
          toolCalls: [
            { toolCallId: 'call_1', toolName: 'wh_query_metric', input: { metric: 'm1' } },
            { toolCallId: 'call_2', toolName: 'wh_query_metric', input: { metric: 'm2' } },
            { toolCallId: 'call_3', toolName: 'wh_query_metric', input: { metric: 'm3' } },
          ],
        });
      }
      if (streamTextCalls === 2) {
        return makeFakeResult({
          textParts: ['第二轮查询第 4 项指标...'],
          toolCalls: [
            { toolCallId: 'call_4', toolName: 'wh_query_metric', input: { metric: 'm4' } },
          ],
        });
      }
      return makeFakeResult({
        textParts: ['指标查询结束。'],
      });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => [mockTool],
    });

    const response = await handler(makeAgentRequest());
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);

    // 验证前 3 次正常发出网络请求，第 4 次未发出网络出站请求
    expect(networkState.requestCount).toBe(3);

    // 验证第 4 次调用产生成对的 tool_call 与 tool_result 事件
    const fourthToolCall = events.find(
      (e) => e.type === 'tool_call' && (e as { call: { id: string } }).call?.id === 'call_4'
    );
    expect(fourthToolCall).toBeDefined();

    const fourthToolResult = events.find(
      (e) => e.type === 'tool_result' && (e as { callId: string }).callId === 'call_4'
    ) as { type: string; callId: string; name: string; status: string; summary: string } | undefined;
    expect(fourthToolResult).toBeDefined();
    // 标记为失败并带有清晰文案
    expect(fourthToolResult?.status).toBe('failed');
    expect(fourthToolResult?.summary).toContain('webhook 调用次数已用完（3 次）');

    // 验证审计日志记录了第 4 次的 skipped 记录（durationMs=0, responseBytes=0, hostname/method 从记录提取）
    expect(prismaAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-001',
          toolId: 'tool-counter-query',
          hostname: 'api.metrics.com',
          method: 'POST',
          statusCode: null,
          durationMs: 0,
          responseBytes: 0,
          outcome: 'skipped',
        }),
      })
    );

    // 验证 finalize metadata 记录实际派发的 Webhook 调用次数为 3（被拦截的第 4 次不计入）
    const [, finalizeCtx] = fakeSession.finalize.mock.calls[0] as [
      string,
      { metadata?: Record<string, unknown> },
    ];
    expect(finalizeCtx.metadata?.webhookCalls).toBe(3);
  });

  it('停用工具（enabled: false）不出现在注册表中，模型侧 tools 集合无此工具', async () => {
    const enabledTool: UserWebhookTool = {
      id: 'tool-enabled',
      userId: 'user-001',
      name: '启用工具',
      callName: 'active_one',
      description: '正常启用的工具',
      url: 'https://api.active.com/test',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const disabledTool: UserWebhookTool = {
      id: 'tool-disabled',
      userId: 'user-001',
      name: '停用工具',
      callName: 'inactive_one',
      description: '被停用的工具',
      url: 'https://api.inactive.com/test',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [],
      enabled: false,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let receivedTools: Record<string, unknown> = {};
    streamTextMock.mockImplementation((opts: { tools?: Record<string, unknown> }) => {
      receivedTools = opts.tools ?? {};
      return makeFakeResult({ textParts: ['无需调用工具'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => [enabledTool, disabledTool],
    });

    const response = await handler(makeAgentRequest());
    await readSseEvents(response);

    // 断言启用的工具存在，停用的工具被彻底过滤
    expect(receivedTools['wh_active_one']).toBeDefined();
    expect(receivedTools['wh_inactive_one']).toBeUndefined();
    // 内置工具依然存在
    expect(receivedTools['web_fetch']).toBeDefined();
    expect(receivedTools['image_generate']).toBeDefined();
  });

  it('finalize metadata 包含 webhookCalls 正确计数（未调用时为 0，调用 N 次为 N）', async () => {
    const mockTool: UserWebhookTool = {
      id: 'tool-1',
      userId: 'user-001',
      name: '测试工具',
      callName: 'test_tool',
      description: '测试用',
      url: 'https://api.test.com/hook',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [{ name: 'id', type: 'string', required: true }],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 场景 A：模型未调用任何工具
    streamTextMock.mockReturnValueOnce(makeFakeResult({ textParts: ['直接回答'] }));

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => [mockTool],
    });

    const responseA = await handler(makeAgentRequest());
    await readSseEvents(responseA);

    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    const [, ctxA] = fakeSession.finalize.mock.calls[0] as [
      string,
      { metadata?: Record<string, unknown> },
    ];
    expect(ctxA.metadata?.webhookCalls).toBe(0);

    // 场景 B：模型调用 2 次 Webhook 工具
    fakeSession = createFakeQuotaSession({ outputLimit: 4096 });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);

    let step = 0;
    streamTextMock.mockImplementation(() => {
      step++;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'c1', toolName: 'wh_test_tool', input: { id: '1' } },
            { toolCallId: 'c2', toolName: 'wh_test_tool', input: { id: '2' } },
          ],
        });
      }
      return makeFakeResult({ textParts: ['全部完成'] });
    });

    const responseB = await handler(makeAgentRequest());
    await readSseEvents(responseB);

    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    const [, ctxB] = fakeSession.finalize.mock.calls[0] as [
      string,
      { metadata?: Record<string, unknown> },
    ];
    expect(ctxB.metadata?.webhookCalls).toBe(2);
  });

  it('getUserTools 抛错时对话正常走完降级路径（console.warn 留痕且不阻断对话）', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    streamTextMock.mockReturnValue(makeFakeResult({ textParts: ['降级回答成功'] }));

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => {
        throw new Error('Postgres 连接超时');
      },
    });

    const response = await handler(makeAgentRequest());
    expect(response.status).toBe(200);

    const events = await readSseEvents(response);
    const textDelta = events.find((e) => e.type === 'text-delta') as
      | { type: string; text: string }
      | undefined;
    expect(textDelta?.text).toBe('降级回答成功');

    // 验证有告警留痕且未抛给客户端
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[chat] 加载用户自定义工具失败，按无用户工具继续'),
      expect.objectContaining({ error: 'Postgres 连接超时' })
    );

    warnSpy.mockRestore();
  });

  it('GET 方法的 Webhook 工具：将参数正确拼接至 URL query 中发起请求', async () => {
    const getTool: UserWebhookTool = {
      id: 'tool-get',
      userId: 'user-001',
      name: '天气查询',
      callName: 'weather_get',
      description: '查询城市天气',
      url: 'https://api.weather.com/v1/query',
      method: 'GET',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [
        { name: 'city', type: 'string', required: true },
        { name: 'days', type: 'number', required: false },
      ],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let step = 0;
    streamTextMock.mockImplementation(() => {
      step++;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [
            {
              toolCallId: 'call_get_1',
              toolName: 'wh_weather_get',
              input: { city: 'Beijing', days: 3 },
            },
          ],
        });
      }
      return makeFakeResult({ textParts: ['北京天气晴朗。'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => [getTool],
    });

    const response = await handler(makeAgentRequest());
    await readSseEvents(response);

    // 验证出站请求方法为 GET，且参数正确追加到 path/search
    expect(networkState.lastOptions?.method).toBe('GET');
    expect(networkState.lastOptions?.path).toBe('/v1/query?city=Beijing&days=3');
  });

  it('目标接口返回 500 错误时：结果标记 failed 并回注模型，审计记录 outcome=failed', async () => {
    networkState.responseConfig = {
      statusCode: 500,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };

    const mockTool: UserWebhookTool = {
      id: 'tool-err',
      userId: 'user-001',
      name: '故障接口',
      callName: 'faulty_api',
      description: '故障测试',
      url: 'https://api.faulty.com/err',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let step = 0;
    streamTextMock.mockImplementation(() => {
      step++;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [{ toolCallId: 'call_err_1', toolName: 'wh_faulty_api', input: {} }],
        });
      }
      return makeFakeResult({ textParts: ['接口返回 500，无法继续'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => [mockTool],
    });

    const response = await handler(makeAgentRequest());
    const events = await readSseEvents(response);

    const toolResultEvent = events.find((e) => e.type === 'tool_result') as
      | { type: string; callId: string; status: string; summary: string }
      | undefined;
    expect(toolResultEvent?.status).toBe('failed');
    expect(toolResultEvent?.summary).toContain('500');

    expect(prismaAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-001',
          toolId: 'tool-err',
          hostname: 'api.faulty.com',
          statusCode: 500,
          outcome: 'failed',
        }),
      })
    );
  });

  it('目标接口返回 302 重定向时：禁重定向策略触发，标记 failed 并写 failed 审计', async () => {
    networkState.responseConfig = {
      statusCode: 302,
      headers: { location: 'https://api.redirect.com/target' },
      body: '',
    };

    const mockTool: UserWebhookTool = {
      id: 'tool-redirect',
      userId: 'user-001',
      name: '重定向接口',
      callName: 'redirect_api',
      description: '重定向测试',
      url: 'https://api.redirect.com/source',
      method: 'POST',
      authHeaderName: null,
      authHeaderValueEnc: null,
      params: [],
      enabled: true,
      requiresApproval: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    let step = 0;
    streamTextMock.mockImplementation(() => {
      step++;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [{ toolCallId: 'call_redir_1', toolName: 'wh_redirect_api', input: {} }],
        });
      }
      return makeFakeResult({ textParts: ['重定向被拒绝'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用 adapter');
      },
      getUserTools: async () => [mockTool],
    });

    const response = await handler(makeAgentRequest());
    const events = await readSseEvents(response);

    const toolResultEvent = events.find((e) => e.type === 'tool_result') as
      | { type: string; callId: string; status: string; summary: string }
      | undefined;
    expect(toolResultEvent?.status).toBe('failed');
    expect(toolResultEvent?.summary).toContain('重定向已拒绝');

    expect(prismaAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-001',
          toolId: 'tool-redirect',
          hostname: 'api.redirect.com',
          statusCode: 302,
          outcome: 'failed',
        }),
      })
    );
  });

  describe('写操作审批（AGENT-HITL-ACTION / ADR-0041）', () => {
    /** 需审批的 POST 工具（默认） */
    function makeNotifyTool(overrides: Partial<UserWebhookTool> = {}): UserWebhookTool {
      return {
        id: 'tool-hitl-notify',
        userId: 'user-001',
        name: '通知接口',
        callName: 'notify',
        description: '向外部系统发送通知',
        url: 'https://hooks.merchant.com/notify',
        method: 'POST',
        authHeaderName: null,
        authHeaderValueEnc: null,
        params: [{ name: 'message', type: 'string', required: true, description: '通知内容' }],
        enabled: true,
        requiresApproval: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    /** 只读 GET 工具（默认无需审批） */
    function makeLookupTool(overrides: Partial<UserWebhookTool> = {}): UserWebhookTool {
      return makeNotifyTool({
        id: 'tool-hitl-lookup',
        name: '查询接口',
        callName: 'lookup',
        description: '只读查询',
        url: 'https://api.merchant.com/lookup',
        method: 'GET',
        params: [{ name: 'q', type: 'string', required: true, description: '查询词' }],
        requiresApproval: false,
        ...overrides,
      });
    }

    /** 第 1 次 streamText 返回给定工具调用，之后返回收尾文本 */
    function mockModelCalls(
      toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>
    ) {
      let n = 0;
      streamTextMock.mockImplementation(() => {
        n++;
        if (n === 1) return makeFakeResult({ toolCalls });
        return makeFakeResult({ textParts: ['已处理完毕。'] });
      });
    }

    function makeHandler(tools: UserWebhookTool[]) {
      return createChatHandler({
        getAdapter: () => {
          throw new Error('不应调用 adapter');
        },
        getUserTools: async () => tools,
      });
    }

    async function run(
      tools: UserWebhookTool[],
      toolCalls: Array<{ toolCallId: string; toolName: string; input: unknown }>,
      bodyOverrides: Record<string, unknown> = {}
    ) {
      mockModelCalls(toolCalls);
      const response = await makeHandler(tools)(
        makeAgentRequest({ approvalScope: 'conv-1', ...bodyOverrides })
      );
      return { response, events: await readSseEvents(response) };
    }

    const notifyCall = {
      toolCallId: 'call_n1',
      toolName: 'wh_notify',
      input: { message: '你好' },
    };

    it('1. 需审批工具被调用时，流含 tool_approval_request，携带工具名、域名、参数与过期时间 (TC03-1)', async () => {
      const { events } = await run([makeNotifyTool()], [notifyCall]);

      const approval = events.find((e) => e.type === 'tool_approval_request') as
        | { approval: Record<string, unknown> }
        | undefined;
      expect(approval).toBeDefined();
      expect(approval?.approval).toMatchObject({
        callId: 'call_n1',
        toolName: 'wh_notify',
        host: 'hooks.merchant.com',
        params: { message: '你好' },
      });
      expect(approval?.approval.token).toEqual(expect.any(String));
      expect(approval?.approval.expiresAt as number).toBeGreaterThan(Date.now());
    });

    it('2. 审批请求之后流以正常 done 事件结束，不出现 error (TC03-2)', async () => {
      const { events } = await run([makeNotifyTool()], [notifyCall]);

      const approvalIndex = events.findIndex((e) => e.type === 'tool_approval_request');
      expect(approvalIndex).toBeGreaterThanOrEqual(0);
      expect(events[events.length - 1].type).toBe('done');
      expect(events.some((e) => e.type === 'error')).toBe(false);
      expect(events.findIndex((e) => e.type === 'done')).toBeGreaterThan(approvalIndex);
    });

    it('3. 暂停的调用不产生任何出站请求 (TC03-3)', async () => {
      await run([makeNotifyTool()], [notifyCall]);
      expect(networkState.requestCount).toBe(0);
    });

    it('4. 暂停时写入一条 pending_approval 审计记录 (TC03-4)', async () => {
      await run([makeNotifyTool()], [notifyCall]);

      const pending = prismaAuditCreateMock.mock.calls.filter(
        (c) => (c[0] as { data: { outcome: string } }).data.outcome === 'pending_approval'
      );
      expect(pending).toHaveLength(1);
      expect((pending[0][0] as { data: Record<string, unknown> }).data).toMatchObject({
        userId: 'user-001',
        toolId: 'tool-hitl-notify',
        hostname: 'hooks.merchant.com',
        method: 'POST',
      });
    });

    it('5. 暂停后没有为该调用写入 success 或 failed 记录 (TC03-5)', async () => {
      await run([makeNotifyTool()], [notifyCall]);

      const outcomes = prismaAuditCreateMock.mock.calls.map(
        (c) => (c[0] as { data: { outcome: string } }).data.outcome
      );
      expect(outcomes).toEqual(['pending_approval']);
    });

    it('6. 同轮「GET、需审批 POST、GET」：第一个只读调用已出站 1 次 (TC03-6)', async () => {
      await run(
        [makeLookupTool(), makeNotifyTool()],
        [
          { toolCallId: 'call_1', toolName: 'wh_lookup', input: { q: 'a' } },
          notifyCall,
          { toolCallId: 'call_3', toolName: 'wh_lookup', input: { q: 'b' } },
        ]
      );
      expect(networkState.requestCount).toBe(1);
    });

    it('7. 同轮需审批 POST 之后的调用不出站，且流中没有它的 tool_call 事件 (TC03-7)', async () => {
      const { events } = await run(
        [makeLookupTool(), makeNotifyTool()],
        [
          { toolCallId: 'call_1', toolName: 'wh_lookup', input: { q: 'a' } },
          notifyCall,
          { toolCallId: 'call_3', toolName: 'wh_lookup', input: { q: 'b' } },
        ]
      );

      expect(networkState.requestCount).toBe(1);
      const callIds = events
        .filter((e) => e.type === 'tool_call')
        .map((e) => (e as unknown as { call: { id: string } }).call.id);
      expect(callIds).toEqual(['call_1', 'call_n1']);
    });

    it('8. 审批字段关闭的 POST 工具直接出站 1 次，不出现审批事件 (TC03-8)', async () => {
      const { events } = await run([makeNotifyTool({ requiresApproval: false })], [notifyCall]);

      expect(networkState.requestCount).toBe(1);
      expect(events.some((e) => e.type === 'tool_approval_request')).toBe(false);
    });

    it('9. 审批字段关闭的 GET 工具行为与现状一致：出站 1 次、成对事件、无审批事件 (TC03-9)', async () => {
      const { events } = await run(
        [makeLookupTool()],
        [{ toolCallId: 'call_g1', toolName: 'wh_lookup', input: { q: 'a' } }]
      );

      expect(networkState.requestCount).toBe(1);
      expect(events.some((e) => e.type === 'tool_approval_request')).toBe(false);
      expect(events.filter((e) => e.type === 'tool_call')).toHaveLength(1);
      expect(
        events.filter((e) => e.type === 'tool_result' && (e as { status?: string }).status === 'success')
      ).toHaveLength(1);
    });

    it('10. 被会话级停用的需审批工具不在模型工具集中，也不产生审批事件 (TC03-10)', async () => {
      const { events } = await run([makeNotifyTool()], [notifyCall], {
        disabledToolKeys: ['wh_notify'],
      });

      const toolsOfFirstCall = streamTextMock.mock.calls[0][0].tools as Record<string, unknown>;
      expect(Object.keys(toolsOfFirstCall)).not.toContain('wh_notify');
      expect(events.some((e) => e.type === 'tool_approval_request')).toBe(false);
      expect(networkState.requestCount).toBe(0);
    });
  });

  describe('写操作审批恢复（AGENT-HITL-ACTION / ADR-0041）', () => {
    function makeNotifyTool(overrides: Partial<UserWebhookTool> = {}): UserWebhookTool {
      return {
        id: 'tool-hitl-notify',
        userId: 'user-001',
        name: '通知接口',
        callName: 'notify',
        description: '向外部系统发送通知',
        url: 'https://hooks.merchant.com/notify',
        method: 'POST',
        authHeaderName: null,
        authHeaderValueEnc: null,
        params: [{ name: 'message', type: 'string', required: true, description: '通知内容' }],
        enabled: true,
        requiresApproval: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...overrides,
      };
    }

    function makeHandler(tools: UserWebhookTool[] = [makeNotifyTool()]) {
      return createChatHandler({
        getAdapter: () => {
          throw new Error('不应调用 adapter');
        },
        getUserTools: async () => tools,
      });
    }

    /** 先走一遍暂停请求拿到真实凭证，再由用例构造恢复请求 */
    async function obtainApproval(
      scope = 'conv-1',
      userId = 'user-001'
    ): Promise<{ callId: string; toolName: string; params: Record<string, unknown>; token: string }> {
      currentUserMock.mockResolvedValue({ id: userId, role: 'user' });
      let n = 0;
      streamTextMock.mockImplementation(() => {
        n++;
        return n === 1
          ? makeFakeResult({
              toolCalls: [
                { toolCallId: 'call_n1', toolName: 'wh_notify', input: { message: '你好' } },
              ],
            })
          : makeFakeResult({ textParts: ['不应出现'] });
      });
      const response = await makeHandler()(makeAgentRequest({ approvalScope: scope }));
      const events = await readSseEvents(response);
      const approval = (events.find((e) => e.type === 'tool_approval_request') as {
        approval: { callId: string; toolName: string; params: Record<string, unknown>; token: string };
      }).approval;
      // 清理暂停阶段的副作用，让恢复阶段的断言只看恢复本身
      networkState.requestCount = 0;
      prismaAuditCreateMock.mockClear();
      quotaSessionReserveMock.mockClear();
      fakeSession.finalize.mockClear();
      streamTextMock.mockReset();
      currentUserMock.mockResolvedValue({ id: 'user-001', role: 'user' });
      return approval;
    }

    /** 恢复请求：模型在恢复后只做收尾回答 */
    function resumeRequest(
      approval: { callId: string; toolName: string; params: unknown; token: string },
      overrides: Record<string, unknown> = {}
    ) {
      return makeAgentRequest({
        approvalScope: 'conv-1',
        messages: [{ role: 'user', content: '帮我发个通知' }],
        approvalResume: {
          token: approval.token,
          callId: approval.callId,
          toolName: approval.toolName,
          params: approval.params,
        },
        ...overrides,
      });
    }

    function mockResumeModel(text = '通知已发送。') {
      streamTextMock.mockImplementation(() => makeFakeResult({ textParts: [text] }));
    }

    async function errorText(response: Response): Promise<string> {
      const body = await response.text();
      return body;
    }

    // ---------- TC04 ----------
    it('1. 带有效凭证的恢复请求使被批准的调用出站恰好 1 次 (TC04-1)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const response = await makeHandler()(resumeRequest(approval));
      await readSseEvents(response);
      expect(networkState.requestCount).toBe(1);
    });

    it('2. 出站参数与凭证绑定的参数一致，请求体里其他参数不被采用 (TC04-2)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const response = await makeHandler()(
        resumeRequest({ ...approval, params: approval.params }, {
          // 客户端试图夹带别的参数：服务端只认凭证绑定的那一份
          approvalResume: {
            token: approval.token,
            callId: approval.callId,
            toolName: approval.toolName,
            params: approval.params,
            extra: { message: '被替换' },
          },
        })
      );
      await readSseEvents(response);
      expect(networkState.lastReq?.writtenData.join('')).toBe(JSON.stringify({ message: '你好' }));
    });

    it('3. 模型收到合成的「调用 + 结果」工具消息对并继续作答，以 done 结束 (TC04-3)', async () => {
      const approval = await obtainApproval();
      mockResumeModel('通知已发送。');
      const response = await makeHandler()(resumeRequest(approval));
      const events = await readSseEvents(response);

      const sent = streamTextMock.mock.calls[0][0].messages as Array<{
        role: string;
        content: unknown;
      }>;
      const assistantCall = sent.find(
        (m) =>
          m.role === 'assistant' &&
          Array.isArray(m.content) &&
          (m.content as Array<{ type: string }>).some((c) => c.type === 'tool-call')
      );
      const toolResult = sent.find((m) => m.role === 'tool');
      expect(assistantCall).toBeDefined();
      expect(toolResult).toBeDefined();
      expect(JSON.stringify(toolResult?.content)).toContain('call_n1');
      expect(events.map((e) => e.type)).toContain('text-delta');
      expect(events[events.length - 1].type).toBe('done');
    });

    it('4. 恢复请求不调用 Planner，流中没有 plan_created (TC04-4)', async () => {
      const approval = await obtainApproval();
      generateTextMock.mockClear();
      mockResumeModel();
      const response = await makeHandler()(resumeRequest(approval));
      const events = await readSseEvents(response);
      expect(events.some((e) => e.type === 'plan_created')).toBe(false);
      // 规划与质检都走 generateText：恢复请求的规划不应发生
      const plannerCalls = generateTextMock.mock.calls.filter((c) =>
        JSON.stringify(c[0]).includes('任务规划专家')
      );
      expect(plannerCalls).toHaveLength(0);
    });

    it('5. 出站成功后写入 success 审计记录 (TC04-5)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      await readSseEvents(await makeHandler()(resumeRequest(approval)));
      const outcomes = prismaAuditCreateMock.mock.calls.map(
        (c) => (c[0] as { data: { outcome: string } }).data.outcome
      );
      expect(outcomes).toEqual(['success']);
    });

    it('6. 下游返回 500 时，工具结果含失败原因，并写入 failed 审计记录 (TC04-6)', async () => {
      const approval = await obtainApproval();
      networkState.responseConfig = {
        statusCode: 500,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ error: '下游故障' }),
      };
      mockResumeModel('通知发送失败。');
      await readSseEvents(await makeHandler()(resumeRequest(approval)));

      const sent = streamTextMock.mock.calls[0][0].messages as Array<{ role: string; content: unknown }>;
      const toolMsg = sent.find((m) => m.role === 'tool');
      expect(JSON.stringify(toolMsg?.content)).toContain('HTTP 500');
      const outcomes = prismaAuditCreateMock.mock.calls.map(
        (c) => (c[0] as { data: { outcome: string } }).data.outcome
      );
      expect(outcomes).toEqual(['failed']);
    });

    it('7. 恢复执行计入新请求的 Webhook 派发次数：随后第 3 次调用被 skipped (TC04-7)', async () => {
      const approval = await obtainApproval();
      // 恢复后模型连发 3 次 wh_notify：恢复占 1 次，第 2、3 次出站，第 4 次（本请求第 3 次决策调用）被拦
      let n = 0;
      streamTextMock.mockImplementation(() => {
        n++;
        if (n === 1) {
          return makeFakeResult({
            toolCalls: [
              { toolCallId: 'c2', toolName: 'wh_lookup', input: { q: '1' } },
              { toolCallId: 'c3', toolName: 'wh_lookup', input: { q: '2' } },
              { toolCallId: 'c4', toolName: 'wh_lookup', input: { q: '3' } },
            ],
          });
        }
        return makeFakeResult({ textParts: ['完毕'] });
      });
      const lookup = makeNotifyTool({
        id: 'tool-lookup',
        callName: 'lookup',
        method: 'GET',
        url: 'https://api.merchant.com/lookup',
        params: [{ name: 'q', type: 'string', required: true }],
        requiresApproval: false,
      });
      await readSseEvents(await makeHandler([makeNotifyTool(), lookup])(resumeRequest(approval)));

      // 恢复 1 次 + lookup 2 次出站；第 3 次 lookup 被 skipped
      expect(networkState.requestCount).toBe(3);
      const outcomes = prismaAuditCreateMock.mock.calls.map(
        (c) => (c[0] as { data: { outcome: string } }).data.outcome
      );
      expect(outcomes).toContain('skipped');
    });

    // ---------- TC05 ----------
    it('1. 同一凭证第二次提交被拒绝，累计出站仍为 1，提示可读 (TC05-1)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      await readSseEvents(await makeHandler()(resumeRequest(approval)));
      const second = await makeHandler()(resumeRequest(approval));
      const text = await errorText(second);
      expect(second.status).toBe(409);
      expect(text).toContain('该审批已被使用');
      expect(networkState.requestCount).toBe(1);
    });

    it('2. 同一凭证并发提交两次，累计出站为 1 (TC05-2)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const [a, b] = await Promise.all([
        makeHandler()(resumeRequest(approval)),
        makeHandler()(resumeRequest(approval)),
      ]);
      await Promise.all([a.text(), b.text()]);
      expect(networkState.requestCount).toBe(1);
      expect([a.status, b.status].sort()).toEqual([200, 409]);
    });

    it('3. 参数被篡改的恢复请求被拒绝，不出站 (TC05-3)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const res = await makeHandler()(resumeRequest({ ...approval, params: { message: '被篡改' } }));
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('4. 工具被篡改的恢复请求被拒绝，不出站 (TC05-4)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const other = makeNotifyTool({ id: 'tool-other', callName: 'other' });
      const res = await makeHandler([makeNotifyTool(), other])(
        resumeRequest({ ...approval, toolName: 'wh_other' })
      );
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('5. 其他用户持有的凭证被拒绝，不出站 (TC05-5)', async () => {
      const approval = await obtainApproval('conv-1', 'user-001');
      mockResumeModel();
      currentUserMock.mockResolvedValue({ id: 'user-002', role: 'user' });
      const res = await createChatHandler({
        getAdapter: () => {
          throw new Error('不应调用 adapter');
        },
        getUserTools: async () => [makeNotifyTool({ userId: 'user-002' })],
      })(resumeRequest(approval));
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('6. 其他会话持有的凭证被拒绝，不出站 (TC05-6)', async () => {
      const approval = await obtainApproval('conv-1');
      mockResumeModel();
      const res = await makeHandler()(resumeRequest(approval, { approvalScope: 'conv-2' }));
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('7. 签名被改动的伪造凭证被拒绝，不出站 (TC05-7)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const [body, sig] = approval.token.split('.');
      const forged = `${body}.${sig.slice(0, -2)}${sig.endsWith('AA') ? 'BB' : 'AA'}`;
      const res = await makeHandler()(resumeRequest({ ...approval, token: forged }));
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('8. 签发后 9 分 59 秒提交的凭证被接受，出站 1 次 (TC05-8)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-10-30T10:00:00Z'));
        const approval = await obtainApproval();
        mockResumeModel();
        vi.setSystemTime(new Date('2026-10-30T10:09:59Z'));
        const res = await makeHandler()(resumeRequest(approval));
        await res.text();
        expect(res.status).toBe(200);
        expect(networkState.requestCount).toBe(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('9. 签发后 10 分 1 秒提交的凭证被拒绝，不出站，提示重新提出需求 (TC05-9)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-10-30T10:00:00Z'));
        const approval = await obtainApproval();
        mockResumeModel();
        vi.setSystemTime(new Date('2026-10-30T10:10:01Z'));
        const res = await makeHandler()(resumeRequest(approval));
        const text = await res.text();
        expect(res.status).toBe(410);
        expect(text).toContain('重新提出需求');
        expect(networkState.requestCount).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('10. Redis 不可用时恢复请求失败关闭，不出站 (TC05-10)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      redisState.down = true;
      const res = await makeHandler()(resumeRequest(approval));
      await res.text();
      expect(res.status).toBe(503);
      expect(networkState.requestCount).toBe(0);
    });

    it('11. Redis 不可用时响应含稍后重试的中文提示 (TC05-11)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      redisState.down = true;
      const res = await makeHandler()(resumeRequest(approval));
      expect(await res.text()).toContain('请稍后重试');
    });

    it('12. 签发后工具被删除重建（同名新 ID），旧凭证被拒绝，不出站 (TC05-12)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const res = await makeHandler([makeNotifyTool({ id: 'tool-recreated' })])(resumeRequest(approval));
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('13. 签发后工具 URL 改到别的域名，旧凭证被拒绝，不出站 (TC05-13)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const res = await makeHandler([makeNotifyTool({ url: 'https://evil.example.org/notify' })])(
        resumeRequest(approval)
      );
      await res.text();
      expect(res.status).toBe(403);
      expect(networkState.requestCount).toBe(0);
    });

    it('14. 签发后工具被停用，恢复请求返回工具不可用提示，不出站 (TC05-14)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      const res = await makeHandler([makeNotifyTool({ enabled: false })])(resumeRequest(approval));
      const text = await res.text();
      expect(res.status).toBe(409);
      expect(text).toContain('已被停用或删除');
      expect(networkState.requestCount).toBe(0);
    });

    // ---------- TC06 ----------
    it('1. 有效恢复请求按一次新请求预留 1 次、结算 1 次 (TC06-1)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      await readSseEvents(await makeHandler()(resumeRequest(approval)));
      expect(quotaSessionReserveMock).toHaveBeenCalledTimes(1);
      expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    });

    it('2. 凭证过期被拒绝的恢复请求不预留额度 (TC06-2)', async () => {
      vi.useFakeTimers({ toFake: ['Date'] });
      try {
        vi.setSystemTime(new Date('2026-10-30T10:00:00Z'));
        const approval = await obtainApproval();
        mockResumeModel();
        vi.setSystemTime(new Date('2026-10-30T10:10:01Z'));
        const res = await makeHandler()(resumeRequest(approval));
        await res.text();
        expect(quotaSessionReserveMock).not.toHaveBeenCalled();
        expect(fakeSession.finalize).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });

    it('3. 额度不足时返回额度不足提示，被批准的调用不出站 (TC06-3)', async () => {
      const approval = await obtainApproval();
      mockResumeModel();
      getAvailableQuotaMock.mockResolvedValue(0);
      const res = await makeHandler()(resumeRequest(approval));
      const text = await res.text();
      expect(res.status).toBe(402);
      expect(text).toContain('额度不足');
      expect(networkState.requestCount).toBe(0);
    });
  });
});
