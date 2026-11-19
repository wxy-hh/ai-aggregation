/**
 * /api/agent-tools/[id] 路由单元测试（spec §4.3 / §5）
 *
 * 验证目标：
 * - PATCH 与 DELETE 的鉴权与限流
 * - 越权访问他人工具返回 404
 * - 工具不存在返回 404
 * - PATCH 凭证更新语义：缺省保持、空串清除、新串加密落库
 * - DELETE 正常删除
 * - 响应中绝无 secret 字段
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { decryptWebhookSecret } from '@/lib/crypto';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-agent-tools-id-tests-32-c!';
  process.env.WEBHOOK_SECRET_KEY =
    'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

  function createFakeRedis() {
    const entries = new Map<string, { value: string; expireAt: number | null }>();
    const now = () => Date.now();
    return {
      entries,
      unavailable: false,
      async get(key: string) {
        if (this.unavailable) throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
        const entry = entries.get(key);
        if (!entry) return null;
        if (entry.expireAt !== null && entry.expireAt <= now()) {
          entries.delete(key);
          return null;
        }
        return entry.value;
      },
      async del(key: string) {
        if (this.unavailable) throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
        return entries.delete(key) ? 1 : 0;
      },
      async incr(key: string) {
        const entry = entries.get(key);
        const next = (entry ? Number(entry.value) : 0) + 1;
        entries.set(key, { value: String(next), expireAt: entry?.expireAt ?? null });
        return next;
      },
      async expire(key: string, seconds: number) {
        const entry = entries.get(key);
        if (!entry) return 0;
        entry.expireAt = now() + seconds * 1000;
        return 1;
      },
    };
  }

  return {
    createFakeRedis,
    redis: null as unknown as ReturnType<typeof createFakeRedis>,
    userFindUnique: vi.fn(),
    toolFindUnique: vi.fn(),
    toolUpdate: vi.fn(),
    toolDelete: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    userWebhookTool: {
      findUnique: mocks.toolFindUnique,
      update: mocks.toolUpdate,
      delete: mocks.toolDelete,
    },
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

import { PATCH, DELETE } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

function createRequest(
  method: 'PATCH' | 'DELETE',
  id: string,
  body?: Record<string, unknown>,
  token: string | null = signAccessToken('user_1', 'user')
) {
  const req = new NextRequest(`http://localhost/api/agent-tools/${id}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.11',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const context = {
    params: Promise.resolve({ id }),
  };

  return { req, context };
}

const existingTool = {
  id: 'tool_1',
  userId: 'user_1',
  name: '原有工具',
  callName: 'original_tool',
  description: '原有描述',
  url: 'https://api.example.com/original',
  method: 'POST',
  authHeaderName: 'X-API-Key',
  authHeaderValueEnc: 'old-encrypted-secret-value',
  params: [],
  enabled: true,
  requiresApproval: true,
  createdAt: new Date('2026-10-02T10:00:00Z'),
  updatedAt: new Date('2026-10-02T10:00:00Z'),
};

describe('/api/agent-tools/[id] 路由测试', () => {
  beforeEach(() => {
    mocks.redis = mocks.createFakeRedis();
    for (const mock of [
      mocks.userFindUnique,
      mocks.toolFindUnique,
      mocks.toolUpdate,
      mocks.toolDelete,
      mocks.check,
    ]) {
      mock.mockReset();
    }

    mocks.check.mockResolvedValue({ allowed: true, remaining: 29, reset: 0, limit: 30 });
    mocks.userFindUnique.mockImplementation((args: { where?: { id?: string } }) =>
      Promise.resolve(
        args?.where?.id
          ? { id: args.where.id, status: 'active', role: 'user', tokens: 20000 }
          : null
      )
    );
    mocks.toolFindUnique.mockImplementation((args: { where?: { id?: string } }) => {
      if (args?.where?.id === 'tool_1') {
        return Promise.resolve(existingTool);
      }
      return Promise.resolve(null);
    });
  });

  describe('PATCH /api/agent-tools/[id]', () => {
    it('未登录访问返回 401', async () => {
      const { req, context } = createRequest('PATCH', 'tool_1', { name: '新名' }, null);
      const res = await PATCH(req, context);
      expect(res.status).toBe(401);
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });

    it('限流命中时返回 429', async () => {
      mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: 12345, limit: 30 });
      const { req, context } = createRequest('PATCH', 'tool_1', { name: '新名' });
      const res = await PATCH(req, context);
      expect(res.status).toBe(429);
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });

    it('工具不存在时返回 404', async () => {
      const { req, context } = createRequest('PATCH', 'tool_not_found', { name: '新名' });
      const res = await PATCH(req, context);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('工具不存在');
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });

    it('越权访问他人工具返回 404（防信息探测）', async () => {
      mocks.toolFindUnique.mockImplementation((args: { where?: { id?: string } }) => {
        if (args?.where?.id === 'tool_other') {
          return Promise.resolve({
            ...existingTool,
            id: 'tool_other',
            userId: 'user_other', // 归属他人
          });
        }
        return Promise.resolve(null);
      });

      const { req, context } = createRequest('PATCH', 'tool_other', { name: '尝试修改他人工具' });
      const res = await PATCH(req, context);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toBe('工具不存在');
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });

    it('修改 callName 重复时返回 400', async () => {
      mocks.toolFindUnique.mockImplementation(
        (args: { where?: { id?: string; userId_callName?: { userId: string; callName: string } } }) => {
          if (args?.where?.id === 'tool_1') {
            return Promise.resolve(existingTool);
          }
          if (args?.where?.userId_callName?.callName === 'conflict_name') {
            return Promise.resolve({ id: 'tool_2', callName: 'conflict_name' });
          }
          return Promise.resolve(null);
        }
      );

      const { req, context } = createRequest('PATCH', 'tool_1', { callName: 'conflict_name' });
      const res = await PATCH(req, context);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.details.errors.callName[0]).toContain('调用名已存在');
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });

    it('更新审批字段：写库为新值，响应中的工具含该字段 (TC10-2, TC10-4)', async () => {
      mocks.toolUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...existingTool, ...args.data, updatedAt: new Date() })
      );

      const { req, context } = createRequest('PATCH', 'tool_1', { requiresApproval: false });
      const res = await PATCH(req, context);

      expect(res.status).toBe(200);
      expect(mocks.toolUpdate.mock.calls[0][0].data.requiresApproval).toBe(false);
      const json = await res.json();
      expect(json.data.tool.requiresApproval).toBe(false);
    });

    it('未传审批字段时不改动该字段 (TC10-2)', async () => {
      mocks.toolUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...existingTool, ...args.data, updatedAt: new Date() })
      );

      const { req, context } = createRequest('PATCH', 'tool_1', { name: '仅改名' });
      await PATCH(req, context);

      expect(mocks.toolUpdate.mock.calls[0][0].data).not.toHaveProperty('requiresApproval');
    });

    it('凭证缺省（undefined）时保持旧密文不变', async () => {
      mocks.toolUpdate.mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({
          ...existingTool,
          ...args.data,
          updatedAt: new Date(),
        });
      });

      const { req, context } = createRequest('PATCH', 'tool_1', { name: '仅改名' });
      const res = await PATCH(req, context);

      expect(res.status).toBe(200);
      const updateData = mocks.toolUpdate.mock.calls[0][0].data;
      // 确认未向 update 传 authHeaderValueEnc 字段
      expect(updateData.authHeaderValueEnc).toBeUndefined();
      expect(updateData.name).toBe('仅改名');
    });

    it('凭证传显式空串时清除密文（写库为 null）', async () => {
      mocks.toolUpdate.mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({
          ...existingTool,
          ...args.data,
          authHeaderValueEnc: null,
          updatedAt: new Date(),
        });
      });

      const { req, context } = createRequest('PATCH', 'tool_1', { authHeaderValue: '' });
      const res = await PATCH(req, context);

      expect(res.status).toBe(200);
      const updateData = mocks.toolUpdate.mock.calls[0][0].data;
      expect(updateData.authHeaderValueEnc).toBeNull();

      const json = await res.json();
      expect(json.data.tool.hasAuthHeaderValue).toBe(false);
      expect(json.data.tool.authHeaderValueEnc).toBeUndefined();
    });

    it('凭证传非空串时加密落库为新密文，响应中无 secret 字段', async () => {
      mocks.toolUpdate.mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({
          ...existingTool,
          ...args.data,
          updatedAt: new Date(),
        });
      });

      const newSecret = 'new-api-token-value-888';
      const { req, context } = createRequest('PATCH', 'tool_1', { authHeaderValue: newSecret });
      const res = await PATCH(req, context);

      expect(res.status).toBe(200);
      const updateData = mocks.toolUpdate.mock.calls[0][0].data;
      expect(updateData.authHeaderValueEnc).toBeDefined();
      expect(updateData.authHeaderValueEnc).not.toBe(newSecret);

      // 解密验证
      const decrypted = decryptWebhookSecret(updateData.authHeaderValueEnc as string);
      expect(decrypted).toBe(newSecret);

      // 响应验证
      const json = await res.json();
      expect(json.data.tool.hasAuthHeaderValue).toBe(true);
      expect(json.data.tool.authHeaderValueEnc).toBeUndefined();
      expect(json.data.tool.authHeaderValue).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain(newSecret);
    });

    it('显式清空名称且未传凭证时，连带清除凭证密文（写库为 null）', async () => {
      mocks.toolUpdate.mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({
          ...existingTool,
          ...args.data,
          updatedAt: new Date(),
        });
      });

      const { req, context } = createRequest('PATCH', 'tool_1', { authHeaderName: null });
      const res = await PATCH(req, context);

      expect(res.status).toBe(200);
      const updateData = mocks.toolUpdate.mock.calls[0][0].data;
      expect(updateData.authHeaderName).toBeNull();
      expect(updateData.authHeaderValueEnc).toBeNull();

      const json = await res.json();
      expect(json.data.tool.authHeaderName).toBeNull();
      expect(json.data.tool.hasAuthHeaderValue).toBe(false);
    });

    it('原工具未配置鉴权头名称且 patch 未提供名称时，提供非空凭证返回 400', async () => {
      mocks.toolFindUnique.mockImplementation((args: { where?: { id?: string } }) => {
        if (args?.where?.id === 'tool_no_auth') {
          return Promise.resolve({
            ...existingTool,
            id: 'tool_no_auth',
            authHeaderName: null,
            authHeaderValueEnc: null,
          });
        }
        return Promise.resolve(null);
      });

      const { req, context } = createRequest('PATCH', 'tool_no_auth', {
        authHeaderValue: 'new-token-123',
      });
      const res = await PATCH(req, context);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('设置鉴权密钥前请先填写鉴权头名称');
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });

    it('同时显式清空名称并提供非空凭证时返回 400（矛盾请求）', async () => {
      const { req, context } = createRequest('PATCH', 'tool_1', {
        authHeaderName: null,
        authHeaderValue: 'new-token-123',
      });
      const res = await PATCH(req, context);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe('设置鉴权密钥前请先填写鉴权头名称');
      expect(mocks.toolUpdate).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /api/agent-tools/[id]', () => {
    it('未登录访问返回 401', async () => {
      const { req, context } = createRequest('DELETE', 'tool_1', undefined, null);
      const res = await DELETE(req, context);
      expect(res.status).toBe(401);
      expect(mocks.toolDelete).not.toHaveBeenCalled();
    });

    it('工具不存在时返回 404', async () => {
      const { req, context } = createRequest('DELETE', 'tool_not_found');
      const res = await DELETE(req, context);
      expect(res.status).toBe(404);
      expect(mocks.toolDelete).not.toHaveBeenCalled();
    });

    it('越权删除他人工具返回 404', async () => {
      mocks.toolFindUnique.mockImplementation((args: { where?: { id?: string } }) => {
        if (args?.where?.id === 'tool_other') {
          return Promise.resolve({
            ...existingTool,
            id: 'tool_other',
            userId: 'user_other',
          });
        }
        return Promise.resolve(null);
      });

      const { req, context } = createRequest('DELETE', 'tool_other');
      const res = await DELETE(req, context);

      expect(res.status).toBe(404);
      expect(mocks.toolDelete).not.toHaveBeenCalled();
    });

    it('正常删除返回 200，并调用数据库 delete', async () => {
      mocks.toolDelete.mockResolvedValue(existingTool);

      const { req, context } = createRequest('DELETE', 'tool_1');
      const res = await DELETE(req, context);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toBe('工具已删除');
      expect(mocks.toolDelete).toHaveBeenCalledWith({ where: { id: 'tool_1' } });
    });
  });
});
