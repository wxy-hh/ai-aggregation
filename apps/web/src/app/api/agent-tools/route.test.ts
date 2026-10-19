/**
 * /api/agent-tools 路由单元测试（spec §4.3 / §5）
 *
 * 验证目标：
 * - 列表与新建接口鉴权与限流
 * - GET 列表永不返回 secret 字段
 * - POST 新建：落库值不含明文 secret、响应无 secret 字段
 * - POST 校验：非 https 拒绝、内网地址拒绝、callName 格式与每用户唯一性拒绝、10 个上限拒绝
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';
import { decryptWebhookSecret } from '@/lib/crypto';

const TEST_SECRET_KEY = crypto.randomBytes(32).toString('hex');

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-agent-tools-tests-32-chars!';
  process.env.WEBHOOK_SECRET_KEY =
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    toolFindMany: vi.fn(),
    toolFindUnique: vi.fn(),
    toolCount: vi.fn(),
    toolCreate: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    userWebhookTool: {
      findMany: mocks.toolFindMany,
      findUnique: mocks.toolFindUnique,
      count: mocks.toolCount,
      create: mocks.toolCreate,
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

import { GET, POST } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

function createAuthedRequest(
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
  token: string | null = signAccessToken('user_1', 'user')
) {
  return new NextRequest('http://localhost/api/agent-tools', {
    method,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.10',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const sampleValidToolInput = {
  name: '查询订单',
  callName: 'query_order',
  description: '查询用户最近的历史订单信息',
  url: 'https://api.example.com/v1/orders',
  method: 'POST' as const,
  authHeaderName: 'Authorization',
  authHeaderValue: 'Bearer secret-api-token-999',
  params: [
    {
      name: 'order_id',
      type: 'string' as const,
      required: true,
      description: '订单 ID',
    },
  ],
  enabled: true,
};

describe('/api/agent-tools 路由测试', () => {
  beforeEach(() => {
    mocks.redis = mocks.createFakeRedis();
    for (const mock of [
      mocks.userFindUnique,
      mocks.toolFindMany,
      mocks.toolFindUnique,
      mocks.toolCount,
      mocks.toolCreate,
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
    mocks.toolCount.mockResolvedValue(0);
    mocks.toolFindUnique.mockResolvedValue(null);
  });

  describe('GET /api/agent-tools', () => {
    it('未登录访问返回 401', async () => {
      const res = await GET(createAuthedRequest('GET', undefined, null));
      expect(res.status).toBe(401);
      expect(mocks.toolFindMany).not.toHaveBeenCalled();
    });

    it('限流命中时返回 429', async () => {
      mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: 12345, limit: 30 });
      const res = await GET(createAuthedRequest('GET'));
      expect(res.status).toBe(429);
      expect(mocks.toolFindMany).not.toHaveBeenCalled();
    });

    it('限流设施故障时 fail-closed 返回 503', async () => {
      mocks.check.mockResolvedValue({
        allowed: false,
        remaining: 0,
        reset: 0,
        limit: 30,
        reason: 'limiter-unavailable',
      });
      const res = await GET(createAuthedRequest('GET'));
      expect(res.status).toBe(503);
    });

    it('返回列表且绝不包含 secret 字段', async () => {
      mocks.toolFindMany.mockResolvedValue([
        {
          id: 'tool_1',
          userId: 'user_1',
          name: '查询订单',
          callName: 'query_order',
          description: '描述',
          url: 'https://api.example.com/orders',
          method: 'POST',
          authHeaderName: 'Authorization',
          authHeaderValueEnc: 'base64-encrypted-secret-content',
          params: [],
          enabled: true,
          createdAt: new Date('2026-10-02T10:00:00Z'),
          updatedAt: new Date('2026-10-02T10:00:00Z'),
        },
      ]);

      const res = await GET(createAuthedRequest('GET'));
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.tools).toHaveLength(1);

      const tool = json.data.tools[0];
      expect(tool.id).toBe('tool_1');
      expect(tool.hasAuthHeaderValue).toBe(true);

      // 安全红线断言：响应中绝对不存在任何密文或明文凭证字段
      expect(tool.authHeaderValueEnc).toBeUndefined();
      expect(tool.authHeaderValue).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain('base64-encrypted-secret-content');
    });
  });

  describe('POST /api/agent-tools', () => {
    it('未登录访问返回 401', async () => {
      const res = await POST(createAuthedRequest('POST', sampleValidToolInput, null));
      expect(res.status).toBe(401);
      expect(mocks.toolCreate).not.toHaveBeenCalled();
    });

    it('创建成功：写库值不含明文 secret，响应中无 secret 字段', async () => {
      mocks.toolCreate.mockImplementation((args: { data: Record<string, unknown> }) => {
        return Promise.resolve({
          id: 'tool_new',
          ...args.data,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      });

      const res = await POST(createAuthedRequest('POST', sampleValidToolInput));
      expect(res.status).toBe(201);

      expect(mocks.toolCreate).toHaveBeenCalledTimes(1);
      const createdData = mocks.toolCreate.mock.calls[0][0].data;

      // 写库断言：authHeaderValueEnc 绝不是明文字符串
      expect(createdData.authHeaderValueEnc).toBeDefined();
      expect(createdData.authHeaderValueEnc).not.toBe(sampleValidToolInput.authHeaderValue);
      // 写库密文能被成功解密还原为原明文
      const decrypted = decryptWebhookSecret(createdData.authHeaderValueEnc as string);
      expect(decrypted).toBe(sampleValidToolInput.authHeaderValue);

      // 响应断言：无 secret 字段
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.tool.id).toBe('tool_new');
      expect(json.data.tool.hasAuthHeaderValue).toBe(true);
      expect(json.data.tool.authHeaderValueEnc).toBeUndefined();
      expect(json.data.tool.authHeaderValue).toBeUndefined();
      expect(JSON.stringify(json)).not.toContain(sampleValidToolInput.authHeaderValue);
    });

    it('非 https 网址拒绝（返回 400 中文提示）', async () => {
      const res = await POST(
        createAuthedRequest('POST', {
          ...sampleValidToolInput,
          url: 'http://api.example.com/orders',
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.details.errors.url[0]).toContain('必须使用 https 协议');
      expect(mocks.toolCreate).not.toHaveBeenCalled();
    });

    it('内网与保留地址拒绝（返回 400 中文提示）', async () => {
      const blockedUrls = [
        'https://127.0.0.1/hook',
        'https://localhost:3000/hook',
        'https://192.168.1.1/hook',
        'https://169.254.169.254/meta',
      ];

      for (const url of blockedUrls) {
        const res = await POST(createAuthedRequest('POST', { ...sampleValidToolInput, url }));
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.details.errors.url[0]).toBe('该地址不允许访问');
      }
      expect(mocks.toolCreate).not.toHaveBeenCalled();
    });

    it('callName 格式非法时拒绝（返回 400 中文提示）', async () => {
      const invalidCallNames = ['123_tool', 'ToolName', 't', '_hook'];

      for (const callName of invalidCallNames) {
        const res = await POST(
          createAuthedRequest('POST', { ...sampleValidToolInput, callName })
        );
        expect(res.status).toBe(400);
        const json = await res.json();
        expect(json.details.errors.callName).toBeDefined();
      }
      expect(mocks.toolCreate).not.toHaveBeenCalled();
    });

    it('callName 在当前用户下重复时拒绝（返回 400 中文提示）', async () => {
      mocks.toolFindUnique.mockResolvedValue({ id: 'tool_existing' });

      const res = await POST(createAuthedRequest('POST', sampleValidToolInput));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.errorCode).toBe('INVALID_REQUEST');
      expect(json.details.errors.callName[0]).toContain('调用名已存在');
      expect(mocks.toolCreate).not.toHaveBeenCalled();
    });

    it('达到每用户 10 个工具上限时拒绝（返回 400 中文提示）', async () => {
      mocks.toolCount.mockResolvedValue(10);

      const res = await POST(createAuthedRequest('POST', sampleValidToolInput));
      expect(res.status).toBe(400);

      const json = await res.json();
      expect(json.error).toContain('最多只能创建 10 个');
      expect(mocks.toolCreate).not.toHaveBeenCalled();
    });
  });
});
