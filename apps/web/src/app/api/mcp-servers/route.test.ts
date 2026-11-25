/**
 * /api/mcp-servers 路由单元测试（工单 02 / ADR-0064 §2）
 *
 * 验证目标：
 * - 列表与创建接口鉴权与限流
 * - GET 列表永不返回鉴权头取值密文或明文
 * - POST 新建：落库值不含明文密钥、响应无密钥字段
 * - POST 校验：非 https 拒绝、内网地址拒绝、旧版 SSE 提示、10 个上限拒绝
 * - 越权访问他人配置返回 404；删除后密文与工具定义记录清零
 * - 启用工具数达上限时拒绝新增第 9 个
 * - 限流触发后返回 429
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-mcp-server-tests-32-chars!';
  process.env.WEBHOOK_SECRET_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  function createFakeRedis() {
    const entries = new Map<string, string>();
    const expiresAt = new Map<string, number>();
    const now = () => Date.now();
    return {
      entries,
      unavailable: false,
      async get(key: string) {
        if (this.unavailable) throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
        const value = entries.get(key);
        if (value === undefined) return null;
        const expireAt = expiresAt.get(key);
        if (expireAt !== undefined && expireAt <= now()) {
          entries.delete(key);
          expiresAt.delete(key);
          return null;
        }
        return value;
      },
      async del(key: string) {
        if (this.unavailable) throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
        expiresAt.delete(key);
        return entries.delete(key) ? 1 : 0;
      },
      async incr(key: string) {
        const current = entries.get(key);
        const next = (current ? Number(current) : 0) + 1;
        entries.set(key, String(next));
        return next;
      },
      async expire(key: string, seconds: number) {
        if (!entries.has(key)) return 0;
        expiresAt.set(key, now() + seconds * 1000);
        return 1;
      },
    };
  }

  return {
    createFakeRedis,
    redis: null as unknown as ReturnType<typeof createFakeRedis>,
    userFindUnique: vi.fn(),
    serverFindMany: vi.fn(),
    serverFindUnique: vi.fn(),
    serverCount: vi.fn(),
    serverCreate: vi.fn(),
    serverUpdate: vi.fn(),
    serverDelete: vi.fn(),
    snapshotDeleteMany: vi.fn(),
    snapshotCreate: vi.fn(),
    snapshotFindFirst: vi.fn(),
    snapshotFindMany: vi.fn(),
    policyDeleteMany: vi.fn(),
    policyCount: vi.fn(),
    policyCreate: vi.fn(),
    policyFindMany: vi.fn(),
    auditCreate: vi.fn(),
    transaction: vi.fn(),
    executeRaw: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    mcpServerConfig: {
      findMany: mocks.serverFindMany,
      findUnique: mocks.serverFindUnique,
      count: mocks.serverCount,
      create: mocks.serverCreate,
      update: mocks.serverUpdate,
      delete: mocks.serverDelete,
    },
    mcpToolSnapshot: {
      deleteMany: mocks.snapshotDeleteMany,
      create: mocks.snapshotCreate,
      findFirst: mocks.snapshotFindFirst,
      findMany: mocks.snapshotFindMany,
    },
    mcpToolPolicy: {
      deleteMany: mocks.policyDeleteMany,
      count: mocks.policyCount,
      create: mocks.policyCreate,
      findMany: mocks.policyFindMany,
    },
    mcpAuditRecord: { create: mocks.auditCreate },
    $transaction: mocks.transaction,
    $executeRaw: mocks.executeRaw,
  },
}));

vi.mock('@repo/redis', () => ({ getRedisClient: () => mocks.redis }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

// 工具发现替身：默认成功；用例可切换为失败
const discovery = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'fail',
  calls: [] as Array<{ url: string; headers: Record<string, string> }>,
}));

vi.mock('@/lib/agent/mcp/discovery', () => ({
  computeConfigFingerprint: vi.fn(() => 'fp_test'),
  discoverMcpTools: vi.fn(
    async (input: {
      url: string;
      authHeaderName?: string | null;
      authHeaderValueEnc?: string | null;
    }) => {
    discovery.calls.push({
      url: input.url,
      headers: input.authHeaderValueEnc
        ? { [input.authHeaderName ?? 'Authorization']: 'Bearer super-secret-token' }
        : {},
    });
    if (discovery.mode === 'fail') {
      return { ok: false as const, reason: '连接超时，请稍后重试' };
    }
    return {
      ok: true as const,
      tools: [
        {
          toolName: 'read_value',
          description: '读取一个受控值',
          inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
          annotations: null,
          modelToolName: 'mcp_test_read_value',
        },
      ],
    };
  }),
}));

import { GET, POST } from './route';
import { signAccessToken } from '@/lib/auth/jwt';
import { encryptWebhookSecret } from '@/lib/crypto/webhook-secret';

function createAuthedRequest(
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  token: string | null = signAccessToken('user_1', 'user')
) {
  return new NextRequest('http://localhost/api/mcp-servers', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.11',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const sampleValidServerInput = {
  name: '受控 MCP 服务',
  url: 'https://mcp.example.com/mcp',
  authHeaderName: 'Authorization',
  authHeaderValue: 'Bearer super-secret-token',
};

const sampleServerRecord = {
  id: 'srv_1',
  userId: 'user_1',
  name: '受控 MCP 服务',
  url: 'https://mcp.example.com/mcp',
  authHeaderName: 'Authorization',
  authHeaderValueEnc: 'Y2lwaGVy',
  isActive: true,
  discoveryStatus: 'succeeded',
  discoveryError: null,
  snapshotVersion: 1,
  configFingerprint: 'fp_1',
  createdAt: new Date('2026-11-24T00:00:00Z'),
  updatedAt: new Date('2026-11-24T00:00:00Z'),
};

/** 模拟当前已保存的服务记录：update 返回整行，避免把基线字段误带入本次请求 */
let storedServer: typeof sampleServerRecord;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redis = mocks.createFakeRedis();
  mocks.check.mockResolvedValue({ allowed: true, remaining: 29, reset: 0 });
  discovery.mode = 'success';
  discovery.calls = [];
  mocks.userFindUnique.mockResolvedValue({ id: 'user_1', username: 'u1', role: 'user' });
  storedServer = { ...sampleServerRecord };
  mocks.serverFindMany.mockResolvedValue([sampleServerRecord]);
  mocks.serverFindUnique.mockResolvedValue(sampleServerRecord);
  mocks.serverCount.mockResolvedValue(1);
  mocks.serverCreate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    storedServer = {
      ...sampleServerRecord,
      ...data,
      id: 'srv_created',
      // 真实密文：发现阶段需要解密出鉴权头
      authHeaderValueEnc: (data.authHeaderValueEnc as string | null) ?? null,
    } as typeof sampleServerRecord;
    return storedServer;
  });
  mocks.serverUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    // 数据库 update 返回整行：沿用本次 create 写入的字段，不回退到基线记录
    storedServer = { ...storedServer, ...data } as typeof sampleServerRecord;
    return storedServer;
  });
  mocks.serverDelete.mockResolvedValue(sampleServerRecord);
  mocks.snapshotDeleteMany.mockResolvedValue({ count: 2 });
  mocks.snapshotCreate.mockResolvedValue({ id: 'snap_1' });
  mocks.snapshotFindFirst.mockResolvedValue(null);
  mocks.snapshotFindMany.mockResolvedValue([]);
  mocks.policyDeleteMany.mockResolvedValue({ count: 1 });
  mocks.policyCount.mockResolvedValue(1);
  mocks.policyCreate.mockResolvedValue({ id: 'pol_1' });
  mocks.policyFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({ id: 'aud_1' });
  mocks.executeRaw.mockResolvedValue(1);
  mocks.transaction.mockImplementation(
    async (callback: (tx: {
      mcpServerConfig: {
        count: typeof mocks.serverCount;
        create: typeof mocks.serverCreate;
        update: typeof mocks.serverUpdate;
      };
      mcpToolSnapshot: { create: typeof mocks.snapshotCreate };
      mcpToolPolicy: {
        count: typeof mocks.policyCount;
        create: typeof mocks.policyCreate;
      };
      $executeRaw: typeof mocks.executeRaw;
    }) => unknown) =>
      callback({
        mcpServerConfig: {
          count: mocks.serverCount,
          create: mocks.serverCreate,
          update: mocks.serverUpdate,
        },
        mcpToolSnapshot: { create: mocks.snapshotCreate },
        mcpToolPolicy: {
          count: mocks.policyCount,
          create: mocks.policyCreate,
        },
        $executeRaw: mocks.executeRaw,
      })
  );
});

describe('GET /api/mcp-servers', () => {
  it('未登录请求返回 401', async () => {
    const response = await GET(createAuthedRequest('GET', undefined, null));

    expect(response.status).toBe(401);
  });

  it('列表响应不含鉴权头取值明文或密文', async () => {
    const response = await GET(createAuthedRequest('GET'));
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(200);
    expect(serialized).not.toContain('super-secret-token');
    expect(serialized).not.toContain('Y2lwaGVy');
    expect(serialized).toContain('hasAuthHeaderValue');
  });

  it('列表按当前用户收敛查询', async () => {
    await GET(createAuthedRequest('GET'));

    expect(mocks.serverFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user_1' } })
    );
  });

  it('带 includeEnabledTools=1 时仅返回经快照指纹与白名单守卫的可挂载 MCP 工具', async () => {
    mocks.snapshotFindMany.mockResolvedValueOnce([
      {
        serverId: 'srv_1',
        version: 1,
        configFingerprint: 'fp_1',
        tools: [
          {
            toolName: 'read_value',
            description: '读取值',
            inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
            annotations: null,
            modelToolName: 'mcp_srv_1_read_value',
          },
          {
            toolName: 'write_value',
            description: '未加入白名单写工具',
            inputSchema: { type: 'object', properties: {} },
            annotations: null,
            modelToolName: 'mcp_srv_1_write_value',
          },
          {
            toolName: 'ref_tool',
            description: '非法 $ref 工具',
            inputSchema: { type: 'object', properties: { a: { $ref: 'https://evil.test/s.json' } } },
            annotations: null,
            modelToolName: 'mcp_srv_1_ref_tool',
          },
        ],
      },
    ]);
    mocks.policyFindMany.mockResolvedValueOnce([
      {
        serverId: 'srv_1',
        toolName: 'read_value',
        enabled: true,
        allowAutoExecute: true,
      },
      {
        serverId: 'srv_1',
        toolName: 'ref_tool',
        enabled: true,
        allowAutoExecute: false,
      },
    ]);

    const req = new NextRequest('http://localhost/api/mcp-servers?includeEnabledTools=1', {
      method: 'GET',
      headers: {
        authorization: `Bearer ${signAccessToken('user_1', 'user')}`,
      },
    });
    const response = await GET(req);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.enabledTools).toEqual([
      {
        serverId: 'srv_1',
        serverName: '受控 MCP 服务',
        toolName: 'read_value',
        description: '读取值',
        modelToolName: 'mcp_srv_1_read_value',
        allowAutoExecute: true,
      },
    ]);
  });
});

describe('POST /api/mcp-servers', () => {
  it('创建成功时落库值不含明文密钥', async () => {
    const response = await POST(createAuthedRequest('POST', sampleValidServerInput));
    const payload = await response.json();

    expect(response.status).toBe(201);
    const created = mocks.serverCreate.mock.calls[0][0].data;
    expect(created.authHeaderValueEnc).toBeTruthy();
    expect(created.authHeaderValueEnc).not.toContain('super-secret-token');
    expect(JSON.stringify(payload)).not.toContain('super-secret-token');
  });

  it('创建时未提供鉴权头取值则不落密文', async () => {
    await POST(
      createAuthedRequest('POST', {
        name: '无鉴权服务',
        url: 'https://mcp.example.com/mcp',
      })
    );

    const created = mocks.serverCreate.mock.calls[0][0].data;
    expect(created.authHeaderValueEnc).toBeNull();
  });

  it('非 https 地址被拒绝并给出中文原因', async () => {
    const response = await POST(
      createAuthedRequest('POST', { name: '不安全', url: 'http://mcp.example.com/mcp' })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(payload)).toMatch(/https/);
    expect(mocks.serverCreate).not.toHaveBeenCalled();
  });

  it('内网地址被拒绝并给出中文原因', async () => {
    const response = await POST(
      createAuthedRequest('POST', { name: '内网', url: 'https://192.168.1.1/mcp' })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(payload)).toMatch(/私有网络|不允许/);
    expect(mocks.serverCreate).not.toHaveBeenCalled();
  });

  it('旧版 HTTP+SSE 形态地址被拒绝并提示不支持', async () => {
    const response = await POST(
      createAuthedRequest('POST', {
        name: '旧版 SSE',
        url: 'https://mcp.example.com/sse',
        transport: 'sse',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(JSON.stringify(payload)).toMatch(/不支持/);
    expect(mocks.serverCreate).not.toHaveBeenCalled();
  });

  it('超过 10 个上限时被拒绝', async () => {
    mocks.serverCount.mockResolvedValue(10);

    const response = await POST(createAuthedRequest('POST', sampleValidServerInput));
    const payload = await response.json();

    expect([400, 409]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/10/);
    expect(mocks.serverCreate).not.toHaveBeenCalled();
  });

  it('保存成功后自动尝试首次发现', async () => {
    await POST(createAuthedRequest('POST', sampleValidServerInput));

    expect(discovery.calls.length).toBe(1);
    expect(discovery.calls[0].url).toBe('https://mcp.example.com/mcp');
  });

  it('发现时注入的鉴权头来自解密后的密文而非明文入参', async () => {
    await POST(createAuthedRequest('POST', sampleValidServerInput));

    const headers = discovery.calls[0].headers;
    expect(headers.Authorization).toBe('Bearer super-secret-token');
  });

  it('发现失败时保留配置并返回失败状态与原因', async () => {
    discovery.mode = 'fail';

    const response = await POST(createAuthedRequest('POST', sampleValidServerInput));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.data.server.discoveryStatus).toBe('failed');
    expect(payload.data.server.discoveryError).toMatch(/超时/);
    expect(mocks.serverCreate).toHaveBeenCalled();
  });

  it('发现失败也写入元数据审计且不含密钥', async () => {
    discovery.mode = 'fail';

    await POST(createAuthedRequest('POST', sampleValidServerInput));

    expect(mocks.auditCreate).toHaveBeenCalled();
    const audit = mocks.auditCreate.mock.calls[0][0].data;
    expect(audit.eventType).toBe('discover');
    expect(audit.outcome).toBe('failed');
    expect(JSON.stringify(audit)).not.toContain('super-secret-token');
  });

  it('启用工具数达到 8 个上限时拒绝再启用', async () => {
    mocks.policyCount.mockResolvedValue(8);

    const response = await POST(
      createAuthedRequest('POST', {
        ...sampleValidServerInput,
        enableTool: 'read_value',
      })
    );
    const payload = await response.json();

    expect([400, 409]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/8/);
  });

  it('enableTool 不在发现快照中时不创建策略，并返回中文未启用原因', async () => {
    const response = await POST(
      createAuthedRequest('POST', {
        ...sampleValidServerInput,
        enableTool: 'not_in_snapshot',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.message).toContain('未启用');
    expect(mocks.policyCreate).not.toHaveBeenCalled();
  });

  it('创建配置与启用工具在短事务内加锁复核，首次检查后的并发占额不会写入第 9 个工具', async () => {
    mocks.policyCount.mockResolvedValueOnce(1).mockResolvedValueOnce(8);

    const response = await POST(
      createAuthedRequest('POST', {
        ...sampleValidServerInput,
        enableTool: 'read_value',
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.message).toContain('未启用');
    expect(mocks.policyCreate).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.executeRaw).toHaveBeenCalled();
  });

  it('触发限流时返回 429', async () => {
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: 60 });

    const response = await GET(createAuthedRequest('GET'));

    expect(response.status).toBe(429);
  });

  it('发现超时时返回明确中文原因且响应体不含 Authorization、Bearer 或鉴权头取值（TC05-1）', async () => {
    discovery.mode = 'fail';

    const response = await POST(
      createAuthedRequest('POST', {
        name: '超时服务',
        url: 'https://mcp.example.com/mcp',
        authHeaderName: 'X-Api-Key',
        authHeaderValue: 'Bearer super-secret-token',
      })
    );
    const payload = await response.json();
    const serialized = JSON.stringify(payload);

    expect(response.status).toBe(201);
    expect(payload.data.server.discoveryStatus).toBe('failed');
    expect(payload.data.server.discoveryError).toMatch(/超时|用时过长/);
    expect(serialized).not.toMatch(/Authorization|Bearer|super-secret-token/i);
  });
});
