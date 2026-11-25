/**
 * /api/mcp-servers/[id]/tools 路由单元测试（工单 03 / ADR-0064 §5）
 *
 * 验证目标：
 * - 返回快照中的工具定义与各自的白名单/审批策略
 * - 新发现工具默认停用且默认必须审批
 * - 不受支持的工具（远程 $ref 等）被标记且不可启用
 * - 启用工具时校验全局 8 个上限
 * - 更新策略时可设置「允许自动执行」，并默认拒绝
 * - 越权访问返回 404
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-mcp-tools-tests-32-char!';
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
    serverFindUnique: vi.fn(),
    snapshotFindFirst: vi.fn(),
    policyFindMany: vi.fn(),
    policyUpsert: vi.fn(),
    policyCount: vi.fn(),
    auditCreate: vi.fn(),
    transaction: vi.fn(),
    executeRaw: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    mcpServerConfig: { findUnique: mocks.serverFindUnique },
    mcpToolSnapshot: { findFirst: mocks.snapshotFindFirst },
    mcpToolPolicy: {
      findMany: mocks.policyFindMany,
      upsert: mocks.policyUpsert,
      // count 按查询条件区分：带 serverId+toolName 的是「本工具是否已启用」，
      // 只带 userId+enabled 的是「全局启用数」
      count: mocks.policyCount,
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

import { GET, PATCH } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

function createAuthedRequest(
  method: 'GET' | 'PATCH',
  body?: Record<string, unknown>,
  token: string | null = signAccessToken('user_1', 'user')
) {
  return new NextRequest('http://localhost/api/mcp-servers/srv_1/tools', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.14',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const sampleServer = {
  id: 'srv_1',
  userId: 'user_1',
  name: '代码仓库服务',
  url: 'https://mcp.example.com/mcp',
  authHeaderName: 'Authorization',
  authHeaderValueEnc: null,
  isActive: true,
  discoveryStatus: 'succeeded',
  discoveryError: null,
  snapshotVersion: 2,
  configFingerprint: 'fp_1',
  createdAt: new Date('2026-11-24T00:00:00Z'),
  updatedAt: new Date('2026-11-24T00:00:00Z'),
};

const sampleSnapshot = {
  id: 'snap_1',
  serverId: 'srv_1',
  userId: 'user_1',
  version: 2,
  totalBytes: 256,
  configFingerprint: 'fp_1',
  tools: [
    {
      toolName: 'read_value',
      description: '读取一个受控值',
      inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
      annotations: { readOnlyHint: true },
      modelToolName: 'mcp_srv_1_read_value',
    },
    {
      toolName: 'remote_ref_tool',
      description: '参数含远程引用',
      inputSchema: {
        type: 'object',
        properties: { payload: { $ref: 'https://evil.example.com/s.json' } },
      },
      annotations: null,
      modelToolName: 'mcp_srv_1_remote_ref_tool',
    },
  ],
  createdAt: new Date('2026-11-24T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redis = mocks.createFakeRedis();
  mocks.check.mockResolvedValue({ allowed: true, remaining: 29, reset: 0 });
  mocks.userFindUnique.mockResolvedValue({ id: 'user_1', username: 'u1', role: 'user' });
  mocks.serverFindUnique.mockResolvedValue(sampleServer);
  mocks.snapshotFindFirst.mockResolvedValue(sampleSnapshot);
  mocks.policyFindMany.mockResolvedValue([]);
  mocks.policyUpsert.mockResolvedValue({ id: 'pol_1' });
  mocks.policyCount.mockImplementation(
    async (args: { where?: { serverId?: string; toolName?: string; enabled?: boolean } }) => {
      if (args.where?.toolName) return 0;
      return 1;
    }
  );
  mocks.auditCreate.mockResolvedValue({ id: 'aud_1' });
  mocks.executeRaw.mockResolvedValue(1);
  mocks.transaction.mockImplementation(
    async (callback: (tx: {
      mcpToolPolicy: {
        findMany: typeof mocks.policyFindMany;
        upsert: typeof mocks.policyUpsert;
        count: typeof mocks.policyCount;
      };
      $executeRaw: typeof mocks.executeRaw;
    }) => unknown) =>
      callback({
        mcpToolPolicy: {
          findMany: mocks.policyFindMany,
          upsert: mocks.policyUpsert,
          count: mocks.policyCount,
        },
        $executeRaw: mocks.executeRaw,
      })
  );
});

describe('GET /api/mcp-servers/[id]/tools', () => {
  it('越权访问返回 404', async () => {
    mocks.serverFindUnique.mockResolvedValue(null);

    const response = await GET(createAuthedRequest('GET'), {
      params: Promise.resolve({ id: 'srv_other' }),
    });

    expect(response.status).toBe(404);
  });

  it('返回快照中的工具定义与默认策略', async () => {
    const response = await GET(createAuthedRequest('GET'), {
      params: Promise.resolve({ id: 'srv_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.tools).toHaveLength(2);
    const readTool = payload.data.tools.find(
      (tool: { toolName: string }) => tool.toolName === 'read_value'
    );
    expect(readTool.enabled).toBe(false);
    expect(readTool.allowAutoExecute).toBe(false);
    expect(readTool.description).toBe('读取一个受控值');
  });

  it('不受支持的工具被标记且不可启用', async () => {
    const response = await GET(createAuthedRequest('GET'), {
      params: Promise.resolve({ id: 'srv_1' }),
    });
    const payload = await response.json();

    const unsupported = payload.data.tools.find(
      (tool: { toolName: string }) => tool.toolName === 'remote_ref_tool'
    );
    expect(unsupported.supported).toBe(false);
    expect(unsupported.supportReason).toMatch(/远程引用/);
  });

  it('无快照时返回空工具列表', async () => {
    mocks.snapshotFindFirst.mockResolvedValue(null);

    const response = await GET(createAuthedRequest('GET'), {
      params: Promise.resolve({ id: 'srv_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.tools).toEqual([]);
  });
});

describe('PATCH /api/mcp-servers/[id]/tools', () => {
  it('启用工具时写入白名单策略', async () => {
    const response = await PATCH(
      createAuthedRequest('PATCH', { toolName: 'read_value', enabled: true }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    expect(response.status).toBe(200);
    const policy = mocks.policyUpsert.mock.calls[0][0];
    expect(policy.where.serverId_toolName).toEqual({
      serverId: 'srv_1',
      toolName: 'read_value',
    });
    expect(policy.create.enabled).toBe(true);
    // 默认仍需审批：仅显式允许自动执行才放行
    expect(policy.create.allowAutoExecute).toBe(false);
  });

  it('显式允许自动执行时写入该策略', async () => {
    await PATCH(
      createAuthedRequest('PATCH', {
        toolName: 'read_value',
        enabled: true,
        allowAutoExecute: true,
      }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    expect(mocks.policyUpsert.mock.calls[0][0].create.allowAutoExecute).toBe(true);
  });

  it('启用工具超过 8 个上限时在加锁短事务内拒绝', async () => {
    mocks.policyCount.mockImplementation(
      async (args: { where?: { toolName?: string } }) => {
        if (args.where?.toolName) return 0;
        return 8;
      }
    );

    const response = await PATCH(
      createAuthedRequest('PATCH', { toolName: 'read_value', enabled: true }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );
    const payload = await response.json();

    expect([400, 409]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/8/);
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
    expect(mocks.transaction).toHaveBeenCalled();
    expect(mocks.executeRaw).toHaveBeenCalled();
  });

  it('不受支持的工具无法启用', async () => {
    const response = await PATCH(
      createAuthedRequest('PATCH', { toolName: 'remote_ref_tool', enabled: true }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );
    const payload = await response.json();

    expect([400, 409]).toContain(response.status);
    expect(JSON.stringify(payload)).toMatch(/不受支持/);
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('快照中不存在的工具无法启用', async () => {
    const response = await PATCH(
      createAuthedRequest('PATCH', { toolName: 'not_exist', enabled: true }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    expect([400, 404]).toContain(response.status);
    expect(mocks.policyUpsert).not.toHaveBeenCalled();
  });

  it('越权访问返回 404', async () => {
    mocks.serverFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      createAuthedRequest('PATCH', { toolName: 'read_value', enabled: true }),
      { params: Promise.resolve({ id: 'srv_other' }) }
    );

    expect(response.status).toBe(404);
  });
});
