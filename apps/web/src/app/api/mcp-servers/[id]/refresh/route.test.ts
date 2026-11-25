/**
 * /api/mcp-servers/[id]/refresh 路由单元测试（工单 02 / ADR-0064 §5）
 *
 * 验证目标：
 * - 刷新成功时写入新版本快照并更新发现状态
 * - 刷新失败时保留上一份成功快照（版本号不变）
 * - 刷新受发现页数与工具数上限约束
 * - 越权访问返回 404
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-mcp-refresh-tests-32-char!';
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
    serverUpdate: vi.fn(),
    snapshotCreate: vi.fn(),
    snapshotDeleteMany: vi.fn(),
    snapshotFindFirst: vi.fn(),
    policyCreate: vi.fn(),
    policyDeleteMany: vi.fn(),
    policyFindMany: vi.fn(),
    auditCreate: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: { findUnique: mocks.userFindUnique },
    mcpServerConfig: {
      findUnique: mocks.serverFindUnique,
      update: mocks.serverUpdate,
    },
    mcpToolSnapshot: {
      create: mocks.snapshotCreate,
      deleteMany: mocks.snapshotDeleteMany,
      findFirst: mocks.snapshotFindFirst,
    },
    mcpToolPolicy: {
      create: mocks.policyCreate,
      deleteMany: mocks.policyDeleteMany,
      findMany: mocks.policyFindMany,
    },
    mcpAuditRecord: { create: mocks.auditCreate },
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

const discovery = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'fail',
  calls: 0,
}));

vi.mock('@/lib/agent/mcp/discovery', () => ({
  computeConfigFingerprint: vi.fn(() => 'fp_refresh'),
  discoverMcpTools: vi.fn(async () => {
    discovery.calls += 1;
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
          modelToolName: 'mcp_srv_1_read_value',
        },
      ],
      totalBytes: 128,
    };
  }),
}));

import { POST } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

function createAuthedRequest(token: string | null = signAccessToken('user_1', 'user')) {
  return new NextRequest('http://localhost/api/mcp-servers/srv_1/refresh', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.13',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
}

const sampleServer = {
  id: 'srv_1',
  userId: 'user_1',
  name: '受控 MCP 服务',
  url: 'https://mcp.example.com/mcp',
  authHeaderName: 'Authorization',
  authHeaderValueEnc: null,
  isActive: true,
  discoveryStatus: 'failed',
  discoveryError: '连接超时，请稍后重试',
  snapshotVersion: 2,
  configFingerprint: 'fp_old',
  createdAt: new Date('2026-11-24T00:00:00Z'),
  updatedAt: new Date('2026-11-24T00:00:00Z'),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.redis = mocks.createFakeRedis();
  mocks.check.mockResolvedValue({ allowed: true, remaining: 29, reset: 0 });
  discovery.mode = 'success';
  discovery.calls = 0;
  mocks.userFindUnique.mockResolvedValue({ id: 'user_1', username: 'u1', role: 'user' });
  mocks.serverFindUnique.mockResolvedValue(sampleServer);
  mocks.serverUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...sampleServer,
    ...data,
  }));
  mocks.snapshotCreate.mockResolvedValue({ id: 'snap_3' });
  mocks.snapshotDeleteMany.mockResolvedValue({ count: 1 });
  mocks.snapshotFindFirst.mockResolvedValue(null);
  mocks.policyCreate.mockResolvedValue({ id: 'pol_1' });
  mocks.policyDeleteMany.mockResolvedValue({ count: 0 });
  mocks.policyFindMany.mockResolvedValue([]);
  mocks.snapshotFindFirst.mockResolvedValue(null);
  mocks.policyFindMany.mockResolvedValue([]);
  mocks.auditCreate.mockResolvedValue({ id: 'aud_1' });
});

describe('POST /api/mcp-servers/[id]/refresh', () => {
  it('越权访问返回 404', async () => {
    mocks.serverFindUnique.mockResolvedValue(null);

    const response = await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_other' }),
    });

    expect(response.status).toBe(404);
    expect(discovery.calls).toBe(0);
  });

  it('刷新成功时写入新版本快照并更新发现状态', async () => {
    const response = await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.snapshotCreate).toHaveBeenCalled();
    expect(mocks.snapshotCreate.mock.calls[0][0].data.version).toBe(3);
    const updateArgs = mocks.serverUpdate.mock.calls.at(-1)?.[0];
    expect(updateArgs.data).toMatchObject({
      discoveryStatus: 'succeeded',
      discoveryError: null,
      snapshotVersion: 3,
    });
  });

  it('刷新失败时保留上一份成功快照版本号', async () => {
    discovery.mode = 'fail';

    const response = await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.server.discoveryStatus).toBe('failed');
    expect(mocks.snapshotCreate).not.toHaveBeenCalled();
    const updateArgs = mocks.serverUpdate.mock.calls.at(-1)?.[0];
    // 保留上一份成功快照 = 失败分支不触碰 snapshotVersion 字段
    expect(updateArgs.data.snapshotVersion).toBeUndefined();
  });

  it('刷新后为新快照中的每个工具写入策略', async () => {
    await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_1' }),
    });

    expect(mocks.policyCreate).toHaveBeenCalled();
    const policy = mocks.policyCreate.mock.calls[0][0].data;
    expect(policy.toolName).toBe('read_value');
    // 新发现工具默认停用 + 默认必须审批
    expect(policy.enabled).toBe(false);
    expect(policy.allowAutoExecute).toBe(false);
  });

  it('刷新时读取上一轮快照与策略用于重整', async () => {
    mocks.snapshotFindFirst.mockResolvedValue({
      serverId: 'srv_1',
      version: 2,
      configFingerprint: 'fp_old',
      tools: [
        {
          toolName: 'read_value',
          description: '读取一个受控值',
          inputSchema: { type: 'object', properties: { key: { type: 'string' } } },
          annotations: null,
          modelToolName: 'mcp_srv_1_read_value',
        },
      ],
    });
    mocks.policyFindMany.mockResolvedValue([
      { serverId: 'srv_1', toolName: 'read_value', enabled: true, allowAutoExecute: true },
    ]);

    await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_1' }),
    });

    expect(mocks.snapshotFindFirst).toHaveBeenCalled();
    expect(mocks.policyFindMany).toHaveBeenCalled();
    // 未变化的工具保留原有策略
    const policy = mocks.policyCreate.mock.calls[0][0].data;
    expect(policy.enabled).toBe(true);
    expect(policy.allowAutoExecute).toBe(true);
  });

  it('刷新写入元数据审计且不含密钥', async () => {
    await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_1' }),
    });

    expect(mocks.auditCreate).toHaveBeenCalled();
    const audit = mocks.auditCreate.mock.calls[0][0].data;
    expect(audit.eventType).toBe('refresh');
    expect(JSON.stringify(audit)).not.toContain('Y2lwaGVy');
  });

  it('刷新因快照过大或中途失败终止时，不覆盖上次成功快照且保留原有启用白名单（TC05-4 & TC06-1）', async () => {
    const { discoverMcpTools } = await import('@/lib/agent/mcp/discovery');
    vi.mocked(discoverMcpTools).mockResolvedValueOnce({
      ok: false,
      reason: '工具定义快照过大（超过 262144 字节上限），已拒绝保存',
    });

    const response = await POST(createAuthedRequest(), {
      params: Promise.resolve({ id: 'srv_1' }),
    });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.data.server.discoveryStatus).toBe('failed');
    expect(payload.data.server.discoveryError).toContain('过大');
    expect(payload.data.server.snapshotVersion).toBe(2);
    expect(mocks.snapshotCreate).not.toHaveBeenCalled();
    expect(mocks.policyDeleteMany).not.toHaveBeenCalled();
    expect(mocks.policyCreate).not.toHaveBeenCalled();
  });
});
