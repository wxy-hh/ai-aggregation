// @vitest-environment node
/**
 * agent 模式个人远程 MCP 扩展 HTTP 级主接缝测试（工单 04 / ADR-0064）
 *
 * 接缝：真实 createChatHandler → AgentRuntimeContext → ToolRegistry →
 * ToolExecutionPipeline → user-mcp → McpClientManager (SDK 1.32.2) →
 * 受控 Fetch → startMcpTestServer。
 * 替身仅限既有 I/O 边界：streamText、认证、限流、QuotaSession、Redis、Prisma。
 */

import {
  setupAiSdkMocks,
  streamTextMock,
} from './testing/mock-ai-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeQuotaSession } from '@/lib/billing/testing/fake-quota-session';
import { startMcpTestServer, type McpTestServerHandle } from '@/lib/agent/mcp/test-server';
import { createMcpClientManager } from '@/lib/agent/mcp/client';
import { computeConfigFingerprint } from '@/lib/agent/mcp/discovery';
import { buildMcpToolName } from '@/lib/agent/mcp/naming';
import { encryptWebhookSecret } from '@/lib/crypto/webhook-secret';
import { BillingError } from '@/lib/billing/billing-errors';
import { createRunRegistry } from './agent/run-registry';
import { createChatHandler } from './chat-handler';
import type { LoadedMcpServerBundle } from './agent/tools/user-mcp';

const APPROVAL_TEST_SECRET = 'approval-test-secret-0123456789abcdef0123456789abcdef';
const TEST_SECRET_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const {
  currentUserMock,
  rateLimiterMock,
  quotaSessionReserveMock,
  getAvailableQuotaMock,
  mcpAuditCreateMock,
  redisState,
} = vi.hoisted(() => {
  const currentUserMock = vi.fn();
  const rateLimiterMock = { check: vi.fn() };
  const quotaSessionReserveMock = vi.fn();
  const getAvailableQuotaMock = vi.fn();
  const mcpAuditCreateMock = vi.fn();

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

  return {
    currentUserMock,
    rateLimiterMock,
    quotaSessionReserveMock,
    getAvailableQuotaMock,
    mcpAuditCreateMock,
    redisState,
  };
});

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
vi.mock('@repo/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/db')>();
  return {
    ...actual,
    prisma: {
      ...actual.prisma,
      mcpAuditRecord: { create: mcpAuditCreateMock },
    },
  };
});

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
    usage: Promise.resolve({ inputTokens: 100, outputTokens: 50, totalTokens: 150 }),
    finishReason: Promise.resolve(opts.finishReason ?? 'stop'),
    response: Promise.resolve({
      id: 'resp-1',
      messages: [{ role: 'assistant', content: 'ok' }],
    }),
  };
}

function makeAgentRequest(bodyOverrides: Record<string, unknown> = {}) {
  return new Request('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', content: '请帮我查询受控服务的值' }],
      agent: true,
      ...bodyOverrides,
    }),
  });
}

async function readSseEvents(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let raw = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  return raw
    .split('\n\n')
    .map((block) => block.trim())
    .filter((block) => block.startsWith('data:'))
    .map((block) => block.replace(/^data:\s*/, ''))
    .filter((data) => data && data !== '[DONE]')
    .map((data) => JSON.parse(data) as Record<string, unknown>);
}

  function buildBundleForServer(
  handle: McpTestServerHandle,
  opts: {
    authHeaderName?: string | null;
    authHeaderValue?: string | null;
    enabledTools?: Array<{ toolName: string; allowAutoExecute: boolean; inputSchema?: unknown }>;
    extraTools?: Array<{ toolName: string; inputSchema: unknown }>;
    readOnlyHintOnWrite?: boolean;
  } = {}
): LoadedMcpServerBundle {
  const authHeaderValueEnc = opts.authHeaderValue
    ? encryptWebhookSecret(opts.authHeaderValue)
    : null;
  const fingerprint = computeConfigFingerprint({
    url: handle.url,
    authHeaderName: opts.authHeaderName ?? null,
    authHeaderValueEnc,
    snapshotVersion: 1,
    isActive: true,
  });

  const enabledList = opts.enabledTools ?? [{ toolName: 'read_value', allowAutoExecute: true }];
  const baseTools = [
    {
      toolName: 'read_value',
      description: '读取一个受控值（只读工具）',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' } },
        required: ['key'],
      },
      annotations: null,
      modelToolName: buildMcpToolName('srv_1', 'read_value'),
    },
    {
      toolName: 'write_value',
      description: '写入一个受控值',
      inputSchema: {
        type: 'object',
        properties: { key: { type: 'string' }, value: { type: 'string' } },
        required: ['key', 'value'],
      },
      annotations: opts.readOnlyHintOnWrite ? { readOnlyHint: true } : null,
      modelToolName: buildMcpToolName('srv_1', 'write_value'),
    },
    {
      toolName: 'failing_tool',
      description: '总是失败的工具',
      inputSchema: { type: 'object', properties: { reason: { type: 'string' } } },
      annotations: null,
      modelToolName: buildMcpToolName('srv_1', 'failing_tool'),
    },
    {
      toolName: 'oversized_tool',
      description: '返回超大文本的工具',
      inputSchema: { type: 'object', properties: { size: { type: 'number' } } },
      annotations: null,
      modelToolName: buildMcpToolName('srv_1', 'oversized_tool'),
    },
    {
      toolName: 'multimodal_tool',
      description: '返回图片内容的工具',
      inputSchema: { type: 'object', properties: {} },
      annotations: null,
      modelToolName: buildMcpToolName('srv_1', 'multimodal_tool'),
    },
    {
      toolName: 'remote_ref_tool',
      description: '远程引用工具',
      inputSchema: {
        type: 'object',
        properties: {
          payload: { $ref: 'https://evil.example.com/s.json' },
        },
      },
      annotations: null,
      modelToolName: buildMcpToolName('srv_1', 'remote_ref_tool'),
    },
    ...(opts.extraTools ?? []).map((t) => ({
      toolName: t.toolName,
      description: t.toolName,
      inputSchema: t.inputSchema,
      annotations: null,
      modelToolName: buildMcpToolName('srv_1', t.toolName),
    })),
  ];

  return {
    server: {
      id: 'srv_1',
      name: '受控测试服务',
      url: handle.url,
      isActive: true,
      snapshotVersion: 1,
      configFingerprint: fingerprint,
      authHeaderName: opts.authHeaderName ?? null,
      authHeaderValueEnc,
    },
    snapshot: {
      serverId: 'srv_1',
      version: 1,
      configFingerprint: fingerprint,
      tools: baseTools,
    },
    policies: enabledList.map((e) => ({
      serverId: 'srv_1',
      toolName: e.toolName,
      enabled: true,
      allowAutoExecute: e.allowAutoExecute,
    })),
  };
}

describe('Agent 模式远程 MCP 主接缝测试（工单 04）', () => {
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;
  let serverHandle: McpTestServerHandle | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    setupAiSdkMocks();
    vi.stubEnv('WEBHOOK_SECRET_KEY', TEST_SECRET_KEY);
    vi.stubEnv('APPROVAL_TOKEN_SECRET', APPROVAL_TEST_SECRET);
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    redisState.used.clear();
    redisState.down = false;

    currentUserMock.mockResolvedValue({ id: 'user-mcp-1', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({ allowed: true, remaining: 10, reset: 60 });
    getAvailableQuotaMock.mockResolvedValue(50_000);
    fakeSession = createFakeQuotaSession({ settlementResult: { settled: true, settledUnits: 30 } });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
    mcpAuditCreateMock.mockResolvedValue({ id: 'audit-1' });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (serverHandle) {
      await serverHandle.close();
      serverHandle = null;
    }
  });

  it('读工具端到端调用：真实服务回注 + [MCP: Server] 事件 + 一口价 mcpCalls + 无载荷审计 + 连接关闭', async () => {
    serverHandle = await startMcpTestServer({
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'secret-xyz-123',
    });
    const bundle = buildBundleForServer(serverHandle, {
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'secret-xyz-123',
      enabledTools: [{ toolName: 'read_value', allowAutoExecute: true }],
    });

    const closeCalls: number[] = [];
    let step = 0;
    let passedToolKeys: string[] = [];
    let reinjectedText = '';

    streamTextMock.mockImplementation((opts: { tools?: Record<string, unknown>; messages?: Array<{ role: string; content: unknown }> }) => {
      step += 1;
      if (step === 1) {
        passedToolKeys = Object.keys(opts.tools ?? {});
        return makeFakeResult({
          textParts: ['正在读取受控值…'],
          toolCalls: [
            {
              toolCallId: 'mcp_call_1',
              toolName: buildMcpToolName('srv_1', 'read_value'),
              input: { key: 'alpha-secret-param' },
            },
          ],
        });
      }
      const toolMsg = opts.messages?.find((m) => m.role === 'tool');
      reinjectedText = JSON.stringify(toolMsg?.content ?? '');
      return makeFakeResult({ textParts: ['查询成功，值为 alpha-secret-param。'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用普通适配器');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
      createMcpClient: () => {
        // 包装真实 McpClientManager 观测 close() 调用次数
        const real = createMcpClientManager();
        return {
          callTool: real.callTool,
          close: async () => {
            closeCalls.push(1);
            await real.close();
          },
        };
      },
    });

    const response = await handler(makeAgentRequest());
    expect(response.status).toBe(200);
    const events = await readSseEvents(response);

    // 1. 白名单挂载校验：只挂载 read_value，未白名单与远程 $ref 工具绝不暴露给模型
    expect(passedToolKeys).toContain(buildMcpToolName('srv_1', 'read_value'));
    expect(passedToolKeys).not.toContain(buildMcpToolName('srv_1', 'write_value'));
    expect(passedToolKeys).not.toContain(buildMcpToolName('srv_1', 'remote_ref_tool'));

    // 2. 成对 SSE 事件携带 serverName
    const toolCallEv = events.find((e) => e.type === 'tool_call') as
      | { call: { id: string; name: string; serverName?: string; argsSummary: string } }
      | undefined;
    expect(toolCallEv?.call.serverName).toBe('受控测试服务');
    expect(toolCallEv?.call.argsSummary).toContain('alpha-secret-param');

    const toolResultEv = events.find((e) => e.type === 'tool_result') as
      | { callId: string; status: string; serverName?: string; summary: string; durationMs?: number }
      | undefined;
    expect(toolResultEv?.status).toBe('success');
    expect(toolResultEv?.serverName).toBe('受控测试服务');
    expect(toolResultEv?.durationMs).toBeTypeOf('number');
    expect(toolResultEv?.summary.length).toBeLessThanOrEqual(240);

    // 3. 回注内容包含受控结果与不可信标注
    expect(reinjectedText).toContain('值:alpha-secret-param');
    expect(reinjectedText).toContain('不可信');

    // 4. 受控服务真实被调用 1 次且参数一致
    expect(serverHandle.counters.toolsCall).toBe(1);
    expect(serverHandle.counters.lastCallArguments).toEqual({ key: 'alpha-secret-param' });

    // 5. 一口价结算：只有 1 次 chat-agent 预留/结算，metadata 携带 mcpCalls=1
    expect(quotaSessionReserveMock).toHaveBeenCalledTimes(1);
    expect(fakeSession.finalize).toHaveBeenCalledTimes(1);
    const [, finalizeCtx] = fakeSession.finalize.mock.calls[0] as [
      string,
      { metadata?: Record<string, unknown> },
    ];
    expect(finalizeCtx.metadata?.mcpCalls).toBe(1);

    // 6. 元数据审计落库且不含原始参数/密钥/结果载荷
    expect(mcpAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-mcp-1',
          serverId: 'srv_1',
          serverName: '受控测试服务',
          toolName: 'read_value',
          hostname: '127.0.0.1',
          eventType: 'call',
          outcome: 'success',
          snapshotVersion: 1,
        }),
      })
    );
    const serializedAudit = JSON.stringify(mcpAuditCreateMock.mock.calls[0]);
    expect(serializedAudit).not.toContain('alpha-secret-param');
    expect(serializedAudit).not.toContain('secret-xyz-123');

    // 7. 运行结束连接关闭 1 次
    expect(closeCalls).toHaveLength(1);
  });

  it('非法参数在服务端拦截不出站，多模态返回「未支持」且超大响应被拒', async () => {
    serverHandle = await startMcpTestServer();
    const bundle = buildBundleForServer(serverHandle, {
      enabledTools: [
        { toolName: 'read_value', allowAutoExecute: true },
        { toolName: 'multimodal_tool', allowAutoExecute: true },
        { toolName: 'oversized_tool', allowAutoExecute: true },
      ],
    });

    let step = 0;
    const toolContents: string[] = [];

    streamTextMock.mockImplementation((opts: { messages?: Array<{ role: string; content: unknown }> }) => {
      step += 1;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [
            // 非法参数：key 应为 string
            { toolCallId: 'c_bad', toolName: buildMcpToolName('srv_1', 'read_value'), input: { key: 999 } },
          ],
        });
      }
      if (step === 2) {
        const msg = opts.messages?.find((m) => m.role === 'tool');
        toolContents.push(JSON.stringify(msg?.content ?? ''));
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'c_img', toolName: buildMcpToolName('srv_1', 'multimodal_tool'), input: {} },
            { toolCallId: 'c_big', toolName: buildMcpToolName('srv_1', 'oversized_tool'), input: { size: 260000 } },
          ],
        });
      }
      const msg = opts.messages?.filter((m) => m.role === 'tool').pop();
      toolContents.push(JSON.stringify(msg?.content ?? ''));
      return makeFakeResult({ textParts: ['处理完成'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用普通适配器');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    const response = await handler(makeAgentRequest());
    const events = await readSseEvents(response);

    // read_value 非法参数未出站，只有 multimodal + oversized 出站
    expect(serverHandle.counters.toolsCall).toBe(2);
    expect(toolContents[0]).toContain('参数校验失败');
    expect(toolContents[1]).toContain('未支持');
    expect(toolContents[1]).toContain('200KB');
    const badResult = events.find((e) => e.type === 'tool_result' && e.callId === 'c_bad');
    expect(badResult?.status).toBe('failed');
  });

  it('连续 3 次失败触发运行级连败熔断终止；普通聊天零加载 MCP 工具', async () => {
    serverHandle = await startMcpTestServer();
    const bundle = buildBundleForServer(serverHandle, {
      enabledTools: [{ toolName: 'failing_tool', allowAutoExecute: true }],
    });

    let step = 0;
    streamTextMock.mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'f1', toolName: buildMcpToolName('srv_1', 'failing_tool'), input: { reason: '1' } },
            { toolCallId: 'f2', toolName: buildMcpToolName('srv_1', 'failing_tool'), input: { reason: '2' } },
            { toolCallId: 'f3', toolName: buildMcpToolName('srv_1', 'failing_tool'), input: { reason: '3' } },
          ],
        });
      }
      // 熔断后仅走不带工具的收尾步
      return makeFakeResult({ textParts: ['连续失败，已结束调用'] });
    });

    const getMcpServersSpy = vi.fn(async () => [bundle]);
    const handler = createChatHandler({
      getAdapter: () => ({
        stream: async () =>
          new ReadableStream({
            start(c) {
              c.enqueue(new TextEncoder().encode('data: {"type":"text-delta","text":"普通"}\n\n'));
              c.enqueue(new TextEncoder().encode('data: {"type":"done"}\n\n'));
              c.close();
            },
          }),
      }),
      getUserTools: async () => [],
      getMcpServers: getMcpServersSpy,
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    const res = await handler(makeAgentRequest());
    const events = await readSseEvents(res);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    // 只有第 1 步决策 + 收尾步（第 2 次 streamText 调用未挂 tools，不会发出第 4 次工具调用）
    expect(serverHandle.counters.toolsCall).toBe(3);

    // 普通聊天（agent=false）不加载 MCP 工具
    getMcpServersSpy.mockClear();
    const normalReq = new Request('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: '你好' }],
        agent: false,
      }),
    });
    const normalRes = await handler(normalReq);
    expect(normalRes.status).toBe(200);
    expect(getMcpServersSpy).not.toHaveBeenCalled();
  });

  it('chat-handler 创建运行时后未进入 runner 的提前退出路径（预留失败/活跃冲突/容量不足）均调用 close 1 次', async () => {
    serverHandle = await startMcpTestServer();
    const bundle = buildBundleForServer(serverHandle);

    // 1. QuotaSession.reserve 抛 BillingError（预留失败 / 额度不足）
    const closeCallsA: number[] = [];
    quotaSessionReserveMock.mockRejectedValueOnce(
      new BillingError('QUOTA_INSUFFICIENT', '额度不足')
    );

    const handlerA = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      createMcpClient: () => ({
        callTool: vi.fn(),
        close: async () => {
          closeCallsA.push(1);
        },
      }),
    });

    const resA = await handlerA(makeAgentRequest());
    expect(resA.status).toBe(402);
    expect(closeCallsA).toHaveLength(1);
    expect(serverHandle.counters.toolsCall).toBe(0);

    // 2. 活跃运行冲突 409 提前返回
    const closeCallsB: number[] = [];
    const runRegistry = createRunRegistry({ limits: { maxActiveRuns: 1 } });
    runRegistry.start({ userId: 'user-mcp-1', conversationId: 'conv-busy' });

    const handlerB = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      runRegistry,
      createMcpClient: () => ({
        callTool: vi.fn(),
        close: async () => {
          closeCallsB.push(1);
        },
      }),
    });

    const resB = await handlerB(makeAgentRequest({ conversationId: 'conv-busy' }));
    expect(resB.status).toBe(409);
    expect(closeCallsB).toHaveLength(1);

    // 3. 运行注册容量不足 503 提前返回
    const closeCallsC: number[] = [];
    const handlerC = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      runRegistry,
      createMcpClient: () => ({
        callTool: vi.fn(),
        close: async () => {
          closeCallsC.push(1);
        },
      }),
    });

    const resC = await handlerC(makeAgentRequest({ conversationId: 'conv-other' }));
    expect(resC.status).toBe(503);
    expect(closeCallsC).toHaveLength(1);

    // 4. 审批恢复验签失败（伪造 token）403 提前返回也必须关闭 MCP 连接
    const closeCallsD: number[] = [];
    const writeBundle = buildBundleForServer(serverHandle, {
      enabledTools: [{ toolName: 'write_value', allowAutoExecute: false }],
    });
    const handlerD = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [writeBundle],
      createMcpClient: () => ({
        callTool: vi.fn(),
        close: async () => {
          closeCallsD.push(1);
        },
      }),
    });

    const resD = await handlerD(
      makeAgentRequest({
        approvalResume: {
          callId: 'approve_call_1',
          toolName: buildMcpToolName('srv_1', 'write_value'),
          params: { key: 'k', value: 'v' },
          token: 'invalid-tampered-token',
        },
      })
    );
    expect(resD.status).toBe(403);
    expect(closeCallsD).toHaveLength(1);
  });

  it('上游工具响应超时被 callTimeoutMs 快速截断，推 failed 且连接仍关闭', async () => {
    serverHandle = await startMcpTestServer({ delayMs: 600 });
    const bundle = buildBundleForServer(serverHandle, {
      extraTools: [
        {
          toolName: 'slow_tool',
          inputSchema: { type: 'object', properties: { waitMs: { type: 'number' } } },
        },
      ],
      enabledTools: [{ toolName: 'slow_tool', allowAutoExecute: true }],
    });

    const closeCalls: number[] = [];
    let step = 0;
    streamTextMock.mockImplementation(() => {
      step += 1;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [
            {
              toolCallId: 'slow_1',
              toolName: buildMcpToolName('srv_1', 'slow_tool'),
              input: { waitMs: 600 },
            },
          ],
        });
      }
      return makeFakeResult({ textParts: ['上游工具超时，未获结果。'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
        callTimeoutMs: 120,
      },
      createMcpClient: () => {
        const real = createMcpClientManager();
        return {
          callTool: real.callTool,
          close: async () => {
            closeCalls.push(1);
            await real.close();
          },
        };
      },
    });

    const res = await handler(makeAgentRequest());
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);
    const toolResultEv = events.find((e) => e.type === 'tool_result' && e.callId === 'slow_1') as
      | { status?: string; summary?: string }
      | undefined;
    expect(toolResultEv?.status).toBe('failed');
    expect(toolResultEv?.summary).toContain('用时过长');
    expect(mcpAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          toolName: 'slow_tool',
          outcome: 'failed',
        }),
      })
    );
    expect(closeCalls).toHaveLength(1);
  });

  it('有界输出 8,001/240、审计故障告警不阻断调用、连败不跨运行继承（TC09-2/5/6 & TC12-4）', async () => {
    serverHandle = await startMcpTestServer();
    const longKey = 'v'.repeat(8050);
    const bundle = buildBundleForServer(serverHandle, {
      enabledTools: [
        { toolName: 'read_value', allowAutoExecute: true },
        { toolName: 'failing_tool', allowAutoExecute: true },
      ],
    });

    // 1. 审计写入抛错时不阻断用户调用且保留 warn 日志；8,001+ 响应入模型 <=8000、摘要 <=240
    mcpAuditCreateMock.mockRejectedValueOnce(new Error('db write transient failure'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let reinjected = '';
    let step = 0;
    streamTextMock.mockImplementation((opts: { messages?: Array<{ role: string; content: unknown }> }) => {
      step += 1;
      if (step === 1) {
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'big_txt', toolName: buildMcpToolName('srv_1', 'read_value'), input: { key: longKey } },
          ],
        });
      }
      const toolMsg = opts.messages?.find((m) => m.role === 'tool');
      reinjected = JSON.stringify(toolMsg?.content ?? '');
      return makeFakeResult({ textParts: ['有界读取完成'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    const res = await handler(makeAgentRequest({ conversationId: 'conv-bound' }));
    expect(res.status).toBe(200);
    const events = await readSseEvents(res);
    const resEv = events.find((e) => e.type === 'tool_result' && e.callId === 'big_txt') as
      | { status?: string; summary?: string }
      | undefined;
    expect(resEv?.status).toBe('success');
    expect((resEv?.summary ?? '').length).toBeLessThanOrEqual(240);
    // 解析 tool-result 内部实际注入文本长度 ≤8000
    const parsedToolMsg = JSON.parse(reinjected) as Array<{ output?: { value?: string } }>;
    expect((parsedToolMsg[0]?.output?.value ?? '').length).toBeLessThanOrEqual(8000);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();

    // 2. 连败熔断后，下一轮新建运行重新清零连败计数，可正常执行（TC09-2）
    let failRunStep = 0;
    streamTextMock.mockImplementation(() => {
      failRunStep += 1;
      if (failRunStep === 1) {
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'x1', toolName: buildMcpToolName('srv_1', 'failing_tool'), input: {} },
            { toolCallId: 'x2', toolName: buildMcpToolName('srv_1', 'failing_tool'), input: {} },
            { toolCallId: 'x3', toolName: buildMcpToolName('srv_1', 'failing_tool'), input: {} },
          ],
        });
      }
      return makeFakeResult({ textParts: ['连败熔断'] });
    });
    const failedRun = await handler(makeAgentRequest({ conversationId: 'conv-fail-streak' }));
    await readSseEvents(failedRun);

    let freshStep = 0;
    streamTextMock.mockImplementation(() => {
      freshStep += 1;
      if (freshStep === 1) {
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'ok_after_halt', toolName: buildMcpToolName('srv_1', 'read_value'), input: { key: 'fresh' } },
          ],
        });
      }
      return makeFakeResult({ textParts: ['新运行成功'] });
    });
    const freshRun = await handler(makeAgentRequest({ conversationId: 'conv-fresh-after-halt' }));
    const freshEvents = await readSseEvents(freshRun);
    const freshResult = freshEvents.find(
      (e) => e.type === 'tool_result' && e.callId === 'ok_after_halt'
    ) as { status?: string } | undefined;
    expect(freshResult?.status).toBe('success');
  });

  it('dispose() 幂等、用户 Abort 释放连接、审批暂停与恢复各用独立连接且 close() 抛错不阻断响应（TC15）', async () => {
    serverHandle = await startMcpTestServer({ delayMs: 250 });
    const bundle = buildBundleForServer(serverHandle, {
      enabledTools: [
        { toolName: 'write_value', allowAutoExecute: false },
        { toolName: 'read_value', allowAutoExecute: true },
      ],
    });

    // 1. 审批暂停与恢复分别创建独立客户端实例，各自 close 1 次（TC15-5）
    const clientInstances: Array<{ id: number; closes: number }> = [];
    const writeTool = buildMcpToolName('srv_1', 'write_value');
    const writeParams = { key: 'p', value: 'q' };

    streamTextMock.mockImplementationOnce(() =>
      makeFakeResult({
        toolCalls: [{ toolCallId: 'w_conn_1', toolName: writeTool, input: writeParams }],
      })
    );

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
      createMcpClient: () => {
        const real = createMcpClientManager();
        const tracker = { id: clientInstances.length + 1, closes: 0 };
        clientInstances.push(tracker);
        return {
          callTool: real.callTool,
          close: async () => {
            tracker.closes += 1;
            await real.close();
          },
        };
      },
    });

    const pauseRes = await handler(makeAgentRequest({ conversationId: 'conv-inst' }));
    const pauseEvents = await readSseEvents(pauseRes);
    const issued = (
      pauseEvents.find((e) => e.type === 'tool_approval_request') as {
        approval: { token: string };
      }
    ).approval;

    let stepR = 0;
    streamTextMock.mockImplementation(() => {
      stepR += 1;
      return makeFakeResult({ textParts: [stepR === 1 ? '小节' : '写完了'] });
    });
    const resumeRes = await handler(
      makeAgentRequest({
        conversationId: 'conv-inst',
        approvalResume: {
          callId: 'w_conn_1',
          toolName: writeTool,
          params: writeParams,
          token: issued.token,
        },
      })
    );
    await readSseEvents(resumeRes);

    expect(clientInstances).toHaveLength(2);
    expect(clientInstances[0].closes).toBe(1);
    expect(clientInstances[1].closes).toBe(1);

    // 2. close() 抛错时，用户 SSE 响应照常完成且不崩溃（TC15-10）
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    let throwCloseCount = 0;
    let stepT = 0;
    streamTextMock.mockImplementation(() => {
      stepT += 1;
      if (stepT === 1) {
        return makeFakeResult({
          toolCalls: [
            { toolCallId: 'r_throw_close', toolName: buildMcpToolName('srv_1', 'read_value'), input: { key: 'k' } },
          ],
        });
      }
      return makeFakeResult({ textParts: ['正常回答'] });
    });

    const throwCloseHandler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
      createMcpClient: () => {
        const real = createMcpClientManager();
        return {
          callTool: real.callTool,
          close: async () => {
            throwCloseCount += 1;
            await real.close();
            throw new Error('simulated close error');
          },
        };
      },
    });
    const tc10Res = await throwCloseHandler(makeAgentRequest({ conversationId: 'conv-throw-close' }));
    expect(tc10Res.status).toBe(200);
    const tc10Events = await readSseEvents(tc10Res);
    expect(tc10Events.some((e) => e.type === 'done')).toBe(true);
    expect(throwCloseCount).toBe(1);
    warnSpy.mockRestore();

    // 3. Abort 中止终止运行仍关闭连接 1 次（TC15-3）
    const abortController = new AbortController();
    let abortCloseCount = 0;
    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', text: '正在开始…' };
        abortController.abort();
      })(),
      toolCalls: Promise.resolve([]),
      usage: Promise.resolve({ inputTokens: 10, outputTokens: 5, totalTokens: 15 }),
      finishReason: Promise.resolve('stop'),
      response: Promise.resolve({ id: 'resp-abort', messages: [] }),
    }));

    const abortHandler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      createMcpClient: () => ({
        callTool: vi.fn(),
        close: async () => {
          abortCloseCount += 1;
        },
      }),
    });
    const abortReq = new Request('http://localhost/api/chat', {
      method: 'POST',
      signal: abortController.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'abort me' }],
        agent: true,
      }),
    });
    const abortRes = await abortHandler(abortReq);
    await readSseEvents(abortRes);
    expect(abortCloseCount).toBe(1);
  });
});

describe('写操作审批与配置指纹失效闭环（工单 05 / TC08）', () => {
  let fakeSession: ReturnType<typeof createFakeQuotaSession>;
  let serverHandle: McpTestServerHandle | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    setupAiSdkMocks();
    vi.stubEnv('WEBHOOK_SECRET_KEY', TEST_SECRET_KEY);
    vi.stubEnv('APPROVAL_TOKEN_SECRET', APPROVAL_TEST_SECRET);
    vi.stubEnv('DEEPSEEK_API_KEY', 'test-deepseek-key');
    redisState.used.clear();
    redisState.down = false;

    currentUserMock.mockResolvedValue({ id: 'user-mcp-1', role: 'user' });
    rateLimiterMock.check.mockResolvedValue({ allowed: true, remaining: 10, reset: 60 });
    getAvailableQuotaMock.mockResolvedValue(50_000);
    fakeSession = createFakeQuotaSession({ settlementResult: { settled: true, settledUnits: 30 } });
    quotaSessionReserveMock.mockResolvedValue(fakeSession);
    mcpAuditCreateMock.mockResolvedValue({ id: 'audit-approval-1' });
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    if (serverHandle) {
      await serverHandle.close();
      serverHandle = null;
    }
  });

  it('默认必须审批（含 readOnlyHint=true）先发 tool_approval_request 不出站；确认恢复严格按参执行且一次性消费（replay 409）', async () => {
    serverHandle = await startMcpTestServer();
    const bundle = buildBundleForServer(serverHandle, {
      enabledTools: [{ toolName: 'write_value', allowAutoExecute: false }],
      readOnlyHintOnWrite: true,
    });

    const writeToolName = buildMcpToolName('srv_1', 'write_value');
    const writeParams = { key: 'cfg-key', value: 'cfg-val-42' };

    streamTextMock.mockImplementationOnce(() =>
      makeFakeResult({
        toolCalls: [{ toolCallId: 'w_call_1', toolName: writeToolName, input: writeParams }],
      })
    );

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    // 1. 首次触发：暂停审批，不出站，audit 写入 pending_approval
    const res1 = await handler(makeAgentRequest({ conversationId: 'conv-approval-1' }));
    expect(res1.status).toBe(200);
    const events1 = await readSseEvents(res1);
    const approvalEv = events1.find((e) => e.type === 'tool_approval_request') as
      | {
          approval?: {
            callId: string;
            toolName: string;
            serverName?: string;
            host: string;
            params: Record<string, unknown>;
            token: string;
            expiresAt: number;
          };
        }
      | undefined;

    expect(approvalEv?.approval).toBeDefined();
    expect(approvalEv?.approval?.serverName).toBe('受控测试服务');
    expect(approvalEv?.approval?.toolName).toBe(writeToolName);
    expect(approvalEv?.approval?.params).toEqual(writeParams);
    expect(serverHandle.counters.toolsCall).toBe(0);
    expect(mcpAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'pending_approval',
          outcome: 'pending_approval',
        }),
      })
    );

    const issuedToken = approvalEv!.approval!.token;

    // 2. 确认恢复：执行 1 次写工具且参数逐字段一致，mcpCalls=1
    mcpAuditCreateMock.mockClear();
    let res2Step = 0;
    streamTextMock.mockImplementation((opts: { messages?: Array<{ role: string; content: unknown }> }) => {
      res2Step += 1;
      if (res2Step === 1) {
        const toolMsg = opts.messages?.find((m) => m.role === 'tool');
        expect(JSON.stringify(toolMsg?.content ?? '')).toContain('已写入:cfg-key');
        return makeFakeResult({ textParts: ['阶段小结'] });
      }
      return makeFakeResult({ textParts: ['已完成写入。'] });
    });

    const res2 = await handler(
      makeAgentRequest({
        conversationId: 'conv-approval-1',
        approvalResume: {
          callId: 'w_call_1',
          toolName: writeToolName,
          params: writeParams,
          token: issuedToken,
        },
      })
    );
    expect(res2.status).toBe(200);
    await readSseEvents(res2);

    expect(serverHandle.counters.toolsCall).toBe(1);
    expect(serverHandle.counters.lastCallArguments).toEqual(writeParams);
    expect(fakeSession.finalize).toHaveBeenLastCalledWith(
      'success',
      expect.objectContaining({
        metadata: expect.objectContaining({ mcpCalls: 1 }),
      })
    );

    // 3. 重放同一凭证返回 409，受控服务出站次数不增加
    const resReplay = await handler(
      makeAgentRequest({
        conversationId: 'conv-approval-1',
        approvalResume: {
          callId: 'w_call_1',
          toolName: writeToolName,
          params: writeParams,
          token: issuedToken,
        },
      })
    );
    expect(resReplay.status).toBe(409);
    expect(serverHandle.counters.toolsCall).toBe(1);
  });

  it('审批签发后修改 URL / 鉴权头 / 刷新快照 / 停用 Server / 修改审批策略，旧凭证一律拒绝（TC08-6..10）', async () => {
    serverHandle = await startMcpTestServer();
    let currentBundle = buildBundleForServer(serverHandle, {
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'v1-secret',
      enabledTools: [{ toolName: 'write_value', allowAutoExecute: false }],
    });
    const writeToolName = buildMcpToolName('srv_1', 'write_value');
    const writeParams = { key: 'k', value: 'v' };

    streamTextMock.mockImplementationOnce(() =>
      makeFakeResult({
        toolCalls: [{ toolCallId: 'w_cfg_1', toolName: writeToolName, input: writeParams }],
      })
    );

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [currentBundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    const issueRes = await handler(makeAgentRequest({ conversationId: 'conv-cfg' }));
    const issueEvents = await readSseEvents(issueRes);
    const issuedToken = (
      issueEvents.find((e) => e.type === 'tool_approval_request') as {
        approval: { token: string };
      }
    ).approval.token;

    const tryResume = () =>
      handler(
        makeAgentRequest({
          conversationId: 'conv-cfg',
          approvalResume: {
            callId: 'w_cfg_1',
            toolName: writeToolName,
            params: writeParams,
            token: issuedToken,
          },
        })
      );

    // 1. 修改 URL（重新推导服务端配置）
    const baseBundle = buildBundleForServer(serverHandle, {
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'v1-secret',
      enabledTools: [{ toolName: 'write_value', allowAutoExecute: false }],
    });
    const urlChangedFp = computeConfigFingerprint({
      url: 'https://other.example.com/mcp',
      authHeaderName: baseBundle.server.authHeaderName,
      authHeaderValueEnc: baseBundle.server.authHeaderValueEnc,
      snapshotVersion: 1,
      isActive: true,
    });
    currentBundle = {
      ...baseBundle,
      server: { ...baseBundle.server, url: 'https://other.example.com/mcp', configFingerprint: urlChangedFp },
      snapshot: baseBundle.snapshot ? { ...baseBundle.snapshot, configFingerprint: urlChangedFp } : null,
    };
    expect([403, 409, 410]).toContain((await tryResume()).status);

    // 2. 修改鉴权头取值/名称
    const newEnc = encryptWebhookSecret('v2-rotated');
    const authChangedFp = computeConfigFingerprint({
      url: serverHandle.url,
      authHeaderName: 'X-Api-Key',
      authHeaderValueEnc: newEnc,
      snapshotVersion: 1,
      isActive: true,
    });
    currentBundle = {
      ...baseBundle,
      server: { ...baseBundle.server, authHeaderValueEnc: newEnc, configFingerprint: authChangedFp },
      snapshot: baseBundle.snapshot ? { ...baseBundle.snapshot, configFingerprint: authChangedFp } : null,
    };
    expect([403, 409, 410]).toContain((await tryResume()).status);

    // 3. 刷新 Schema（snapshotVersion 1 -> 2）
    const refreshedFp = computeConfigFingerprint({
      url: serverHandle.url,
      authHeaderName: baseBundle.server.authHeaderName,
      authHeaderValueEnc: baseBundle.server.authHeaderValueEnc,
      snapshotVersion: 2,
      isActive: true,
    });
    currentBundle = {
      ...baseBundle,
      server: { ...baseBundle.server, snapshotVersion: 2, configFingerprint: refreshedFp },
      snapshot: baseBundle.snapshot
        ? { ...baseBundle.snapshot, version: 2, configFingerprint: refreshedFp }
        : null,
    };
    expect([403, 409, 410]).toContain((await tryResume()).status);

    // 4. 停用 Server（isActive: false）
    currentBundle = {
      ...baseBundle,
      server: { ...baseBundle.server, isActive: false },
    };
    expect([403, 409, 410]).toContain((await tryResume()).status);

    // 5. 修改审批策略（allowAutoExecute 改为 true -> 不再需审批 -> tool_unavailable 409）
    currentBundle = buildBundleForServer(serverHandle, {
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'v1-secret',
      enabledTools: [{ toolName: 'write_value', allowAutoExecute: true }],
    });
    expect([403, 409, 410]).toContain((await tryResume()).status);

    // 修改同服另一条策略即使 allowAutoExecute 仍为 false，服务端配置指纹变化也拒绝
    currentBundle = buildBundleForServer(serverHandle, {
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'v1-secret',
      enabledTools: [
        { toolName: 'write_value', allowAutoExecute: false },
        { toolName: 'read_value', allowAutoExecute: true },
      ],
    });
    expect([403, 409, 410]).toContain((await tryResume()).status);

    // 全程零出站调用
    expect(serverHandle.counters.toolsCall).toBe(0);
  });

  it('密钥缺失与 Redis 不可用均失败关闭（503），且超过 8,000 字符的审批参数不签发凭证（TC08-11..12）', async () => {
    serverHandle = await startMcpTestServer();
    const bundle = buildBundleForServer(serverHandle, {
      enabledTools: [{ toolName: 'write_value', allowAutoExecute: false }],
    });
    const writeToolName = buildMcpToolName('srv_1', 'write_value');

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    // 1. 超过 8,000 字符参数（规范化 {"key":"k","value":"..."} 为 8001 字符）拒绝签发审批
    const prefix = '{"key":"k","value":""}';
    const overVal = 'z'.repeat(8001 - prefix.length);
    let stepOver = 0;
    streamTextMock.mockImplementation(() => {
      stepOver += 1;
      if (stepOver === 1) {
        return makeFakeResult({
          toolCalls: [{ toolCallId: 'w_big', toolName: writeToolName, input: { key: 'k', value: overVal } }],
        });
      }
      return makeFakeResult({ textParts: ['参数过长，未发起审批。'] });
    });

    const overRes = await handler(makeAgentRequest({ conversationId: 'conv-over' }));
    const overEvents = await readSseEvents(overRes);
    expect(overEvents.some((e) => e.type === 'tool_approval_request')).toBe(false);
    const overResult = overEvents.find((e) => e.type === 'tool_result' && e.callId === 'w_big') as
      | { summary?: string }
      | undefined;
    expect(overResult?.summary).toContain('8,000');
    expect(serverHandle.counters.toolsCall).toBe(0);

    // 2. 正常签发后再测试 Redis 故障 & 缺密钥
    streamTextMock.mockImplementationOnce(() =>
      makeFakeResult({
        toolCalls: [{ toolCallId: 'w_fail_closed', toolName: writeToolName, input: { key: 'k', value: 'v' } }],
      })
    );
    const okIssueRes = await handler(makeAgentRequest({ conversationId: 'conv-fc' }));
    const okIssueEv = (await readSseEvents(okIssueRes)).find(
      (e) => e.type === 'tool_approval_request'
    ) as { approval: { token: string } };

    redisState.down = true;
    const redisDownRes = await handler(
      makeAgentRequest({
        conversationId: 'conv-fc',
        approvalResume: {
          callId: 'w_fail_closed',
          toolName: writeToolName,
          params: { key: 'k', value: 'v' },
          token: okIssueEv.approval.token,
        },
      })
    );
    expect(redisDownRes.status).toBe(503);

    redisState.down = false;
    vi.stubEnv('APPROVAL_TOKEN_SECRET', '');
    const noSecretRes = await handler(
      makeAgentRequest({
        conversationId: 'conv-fc',
        approvalResume: {
          callId: 'w_fail_closed',
          toolName: writeToolName,
          params: { key: 'k', value: 'v' },
          token: okIssueEv.approval.token,
        },
      })
    );
    expect(noSecretRes.status).toBe(503);
    expect(serverHandle.counters.toolsCall).toBe(0);
  });

  it('越权传参试图重启用未白名单工具无效；安全拦截（blocked）产生审计且零泄漏参数/响应/鉴权/查询串（TC07-6 & TC12-1..3）', async () => {
    serverHandle = await startMcpTestServer({
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'secret-hdr-leak-check',
    });
    const blockedUrl = 'https://192.168.1.50/mcp?secretQuery=qs-leak-check';
    const bundle = buildBundleForServer(serverHandle, {
      authHeaderName: 'X-Api-Key',
      authHeaderValue: 'secret-hdr-leak-check',
      enabledTools: [{ toolName: 'read_value', allowAutoExecute: true }],
    });
    bundle.server.url = blockedUrl;
    const newFp = computeConfigFingerprint({
      url: blockedUrl,
      authHeaderName: 'X-Api-Key',
      authHeaderValueEnc: bundle.server.authHeaderValueEnc,
      snapshotVersion: 1,
      isActive: true,
    });
    bundle.server.configFingerprint = newFp;
    if (bundle.snapshot) bundle.snapshot.configFingerprint = newFp;

    let passedToolKeys: string[] = [];
    let step = 0;
    streamTextMock.mockImplementation((opts: { tools?: Record<string, unknown> }) => {
      step += 1;
      if (step === 1) {
        passedToolKeys = Object.keys(opts.tools ?? {});
        return makeFakeResult({
          toolCalls: [
            {
              toolCallId: 'blocked_call_1',
              toolName: buildMcpToolName('srv_1', 'read_value'),
              input: { key: 'secret-param-leak-check' },
            },
          ],
        });
      }
      return makeFakeResult({ textParts: ['已被拦截'] });
    });

    const handler = createChatHandler({
      getAdapter: () => {
        throw new Error('不应调用');
      },
      getUserTools: async () => [],
      getMcpServers: async () => [bundle],
      mcpClientOptions: {
        allowedPrivateTargets: [`127.0.0.1:${serverHandle.port}`],
        allowInsecureHttp: true,
      },
    });

    const unlistedTool = buildMcpToolName('srv_1', 'write_value');
    const res = await handler(
      makeAgentRequest({
        conversationId: 'conv-blocked-audit',
        enabledToolKeys: [unlistedTool],
        toolOverrides: { [unlistedTool]: true },
      })
    );
    expect(res.status).toBe(200);
    await readSseEvents(res);

    expect(passedToolKeys).not.toContain(unlistedTool);
    expect(mcpAuditCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'user-mcp-1',
          serverId: 'srv_1',
          serverName: '受控测试服务',
          toolName: 'read_value',
          hostname: '192.168.1.50',
          eventType: 'blocked',
          outcome: 'blocked',
          snapshotVersion: 1,
          errorKind: 'outbound_blocked',
        }),
      })
    );
    const auditSerialized = JSON.stringify(mcpAuditCreateMock.mock.calls);
    expect(auditSerialized).not.toContain('secret-param-leak-check');
    expect(auditSerialized).not.toContain('secret-hdr-leak-check');
    expect(auditSerialized).not.toContain('qs-leak-check');
  });
});
