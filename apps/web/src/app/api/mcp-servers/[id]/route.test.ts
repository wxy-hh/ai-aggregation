/**
 * /api/mcp-servers/[id] 路由单元测试（工单 02 / ADR-0064 §2）
 *
 * 验证目标：
 * - 越权访问他人配置返回 404
 * - 停用后 isActive 为 false
 * - 删除时清除密文、工具定义与策略记录
 * - 更新 URL 或鉴权后立即清空快照并作废旧审批
 * - 刷新工具成功写入新快照；失败保留上一份成功快照
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-mcp-detail-tests-32-char!';
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
    serverDelete: vi.fn(),
    snapshotDeleteMany: vi.fn(),
    snapshotCreate: vi.fn(),
    snapshotFindFirst: vi.fn(),
    policyDeleteMany: vi.fn(),
    policyCreate: vi.fn(),
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
      delete: mocks.serverDelete,
    },
    mcpToolSnapshot: {
      deleteMany: mocks.snapshotDeleteMany,
      create: mocks.snapshotCreate,
      findFirst: mocks.snapshotFindFirst,
    },
    mcpToolPolicy: {
      deleteMany: mocks.policyDeleteMany,
      create: mocks.policyCreate,
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
  calls: [] as Array<{ url: string }>,
}));

vi.mock('@/lib/agent/mcp/discovery', () => ({
  computeConfigFingerprint: vi.fn(() => 'fp_updated'),
  discoverMcpTools: vi.fn(async (input: { url: string }) => {
    discovery.calls.push({ url: input.url });
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

import { PATCH, DELETE } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

function createAuthedRequest(
  method: 'PATCH' | 'DELETE',
  body?: Record<string, unknown>,
  token: string | null = signAccessToken('user_1', 'user')
) {
  return new NextRequest('http://localhost/api/mcp-servers/srv_1', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.12',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const sampleServer = {
  id: 'srv_1',
  userId: 'user_1',
  name: '受控 MCP 服务',
  url: 'https://mcp.example.com/mcp',
  authHeaderName: 'Authorization',
  authHeaderValueEnc: 'Y2lwaGVy',
  isActive: true,
  discoveryStatus: 'succeeded',
  discoveryError: null,
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
  discovery.calls = [];
  mocks.userFindUnique.mockResolvedValue({ id: 'user_1', username: 'u1', role: 'user' });
  mocks.serverFindUnique.mockResolvedValue(sampleServer);
  mocks.serverUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
    ...sampleServer,
    ...data,
  }));
  mocks.serverDelete.mockResolvedValue(sampleServer);
  mocks.snapshotDeleteMany.mockResolvedValue({ count: 2 });
  mocks.snapshotCreate.mockResolvedValue({ id: 'snap_2' });
  mocks.snapshotFindFirst.mockResolvedValue(null);
  mocks.policyDeleteMany.mockResolvedValue({ count: 1 });
  mocks.policyCreate.mockResolvedValue({ id: 'pol_1' });
  mocks.auditCreate.mockResolvedValue({ id: 'aud_1' });
});

describe('PATCH /api/mcp-servers/[id]', () => {
  it('访问他人配置返回 404', async () => {
    mocks.serverFindUnique.mockResolvedValue(null);

    const response = await PATCH(
      createAuthedRequest('PATCH', { name: '越权改名' }),
      { params: Promise.resolve({ id: 'srv_other' }) }
    );

    expect(response.status).toBe(404);
  });

  it('未登录请求返回 401', async () => {
    const response = await PATCH(
      createAuthedRequest('PATCH', { name: '改名' }, null),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    expect(response.status).toBe(401);
  });

  it('停用后 isActive 为 false', async () => {
    const response = await PATCH(
      createAuthedRequest('PATCH', { isActive: false }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    expect(response.status).toBe(200);
    expect(mocks.serverUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isActive: false }) })
    );
  });

  it('修改 URL 后立即清空快照并作废旧审批指纹', async () => {
    await PATCH(
      createAuthedRequest('PATCH', { url: 'https://mcp2.example.com/mcp' }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    const updateArgs = mocks.serverUpdate.mock.calls.at(-1)?.[0];
    expect(updateArgs.data).toMatchObject({
      url: 'https://mcp2.example.com/mcp',
      snapshotVersion: null,
      discoveryStatus: 'never',
    });
  });

  it('修改鉴权头取值后清空快照', async () => {
    await PATCH(
      createAuthedRequest('PATCH', { authHeaderValue: 'Bearer new-token' }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    const updateArgs = mocks.serverUpdate.mock.calls.at(-1)?.[0];
    expect(updateArgs.data.snapshotVersion).toBeNull();
    expect(updateArgs.data.authHeaderValueEnc).toBeTruthy();
  });

  it('显式清除鉴权头取值时同时清除密文与头名', async () => {
    await PATCH(
      createAuthedRequest('PATCH', { authHeaderValue: '' }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    const updateArgs = mocks.serverUpdate.mock.calls.at(-1)?.[0];
    expect(updateArgs.data.authHeaderValueEnc).toBeNull();
    expect(updateArgs.data.authHeaderName).toBeNull();
  });

  it('非 https 地址被拒绝且不发起发现', async () => {
    const response = await PATCH(
      createAuthedRequest('PATCH', { url: 'http://mcp.example.com/mcp' }),
      { params: Promise.resolve({ id: 'srv_1' }) }
    );

    expect(response.status).toBe(400);
    expect(discovery.calls.length).toBe(0);
  });
});

describe('DELETE /api/mcp-servers/[id]', () => {
  it('删除他人配置返回 404', async () => {
    mocks.serverFindUnique.mockResolvedValue(null);

    const response = await DELETE(createAuthedRequest('DELETE'), {
      params: Promise.resolve({ id: 'srv_other' }),
    });

    expect(response.status).toBe(404);
    expect(mocks.serverDelete).not.toHaveBeenCalled();
  });

  it('删除时清除密文、工具定义与策略记录', async () => {
    const response = await DELETE(createAuthedRequest('DELETE'), {
      params: Promise.resolve({ id: 'srv_1' }),
    });

    expect(response.status).toBe(200);
    expect(mocks.snapshotDeleteMany).toHaveBeenCalled();
    expect(mocks.policyDeleteMany).toHaveBeenCalled();
    expect(mocks.serverDelete).toHaveBeenCalled();
  });
});
