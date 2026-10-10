/**
 * /api/events 埋点事件上报路由测试（ADR-0013 / P0a 工单 03）
 *
 * 验证目标：
 * - 401：未登录请求返回 401
 * - 429：用户级节流超限返回 429
 * - 503：限流设施故障 fail-closed 返回 503
 * - 400：非 JSON 请求体返回 400
 * - 400：事件名不在白名单拒绝
 * - 400：props 缺少必填字段（signal）拒绝
 * - 400：props 包含白名单外多余字段（违反隐私红线）严格拒绝
 * - 400：顶层请求体包含多余字段严格拒绝
 * - 200/201：合法请求落库成功，入库字段与 props 完整匹配
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-product-events-tests!';

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
    productEventCreate: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
    },
    productEvent: {
      create: mocks.productEventCreate,
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

import { POST } from './route';
import { signAccessToken } from '@/lib/auth/jwt';

function createEventRequest(
  body?: unknown,
  token: string | null = signAccessToken('user_test_123', 'user')
) {
  return new NextRequest('http://localhost/api/events', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.199',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

describe('/api/events 埋点上报路由测试', () => {
  beforeEach(() => {
    mocks.redis = mocks.createFakeRedis();
    mocks.userFindUnique.mockReset();
    mocks.productEventCreate.mockReset();
    mocks.check.mockReset();

    mocks.check.mockResolvedValue({ allowed: true, remaining: 59, reset: 0, limit: 60 });
    mocks.userFindUnique.mockImplementation((args: { where?: { id?: string } }) =>
      Promise.resolve(
        args?.where?.id
          ? { id: args.where.id, status: 'active', role: 'user', isAnonymous: false, tokens: 20000 }
          : null
      )
    );
  });

  describe('鉴权与限流', () => {
    it('未登录请求返回 401', async () => {
      const res = await POST(
        createEventRequest(
          {
            event: 'agent_intent_chip.impression',
            props: { signal: 'keyword', keyword: '搜索' },
          },
          null
        )
      );
      expect(res.status).toBe(401);
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });

    it('用户级节流超限返回 429', async () => {
      mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: 12345, limit: 60 });
      const res = await POST(
        createEventRequest({
          event: 'agent_intent_chip.click',
          props: { signal: 'url' },
        })
      );
      expect(res.status).toBe(429);
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });

    it('限流设施故障时 fail-closed 返回 503', async () => {
      mocks.check.mockResolvedValue({
        allowed: false,
        remaining: 0,
        reset: 0,
        limit: 60,
        reason: 'limiter-unavailable',
      });
      const res = await POST(
        createEventRequest({
          event: 'agent_intent_chip.dismiss',
          props: { signal: 'keyword' },
        })
      );
      expect(res.status).toBe(503);
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });
  });

  describe('请求体与白名单校验', () => {
    it('非 JSON 请求体返回 400', async () => {
      const req = new NextRequest('http://localhost/api/events', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${signAccessToken('user_test_123', 'user')}`,
        },
        body: 'invalid-json-string{',
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });

    it('未在白名单登记的事件名返回 400', async () => {
      const res = await POST(
        createEventRequest({
          event: 'unknown_surface.some_action',
          props: { signal: 'keyword' },
        })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.errorCode).toBe('INVALID_REQUEST');
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });

    it('props 缺少必填 signal 字段返回 400', async () => {
      const res = await POST(
        createEventRequest({
          event: 'agent_intent_chip.impression',
          props: { keyword: '测试' },
        })
      );
      expect(res.status).toBe(400);
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });

    it('隐私红线：props 包含多余字段（如 url 原文、消息内容）被 strict 模式拒绝返回 400', async () => {
      const forbiddenPayloads = [
        {
          event: 'agent_intent_chip.click',
          props: { signal: 'url', url: 'https://example.com/secret-document' },
        },
        {
          event: 'agent_intent_chip.click',
          props: { signal: 'keyword', keyword: '天气', messageText: '查询明天上海的天气' },
        },
        {
          event: 'agent_intent_chip.impression',
          props: { signal: 'url', rawContent: '用户敏感输入' },
        },
      ];

      for (const payload of forbiddenPayloads) {
        const res = await POST(createEventRequest(payload));
        expect(res.status).toBe(400);
        expect(mocks.productEventCreate).not.toHaveBeenCalled();
      }
    });

    it('请求体根对象包含多余未知字段被 strict 模式拒绝返回 400', async () => {
      const res = await POST(
        createEventRequest({
          event: 'agent_intent_chip.impression',
          props: { signal: 'url' },
          extraField: 'not-allowed',
        })
      );
      expect(res.status).toBe(400);
      expect(mocks.productEventCreate).not.toHaveBeenCalled();
    });
  });

  describe('合法落库', () => {
    it('合法芯片曝光事件正确落库并返回成功', async () => {
      mocks.productEventCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'event_cuid_1',
          ...args.data,
          createdAt: new Date('2026-10-10T12:00:00Z'),
        })
      );

      const payload = {
        event: 'agent_intent_chip.impression',
        props: { signal: 'keyword', keyword: '深度研究' },
      };

      const res = await POST(createEventRequest(payload));
      expect(res.status).toBe(200);

      expect(mocks.productEventCreate).toHaveBeenCalledTimes(1);
      const createArgs = mocks.productEventCreate.mock.calls[0][0];
      expect(createArgs.data).toEqual({
        userId: 'user_test_123',
        event: 'agent_intent_chip.impression',
        props: { signal: 'keyword', keyword: '深度研究' },
      });

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.id).toBe('event_cuid_1');
    });

    it('合法芯片点击事件（无 keyword）正确落库', async () => {
      mocks.productEventCreate.mockImplementation((args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'event_cuid_2',
          ...args.data,
          createdAt: new Date('2026-10-10T12:05:00Z'),
        })
      );

      const payload = {
        event: 'agent_intent_chip.click',
        props: { signal: 'url' },
      };

      const res = await POST(createEventRequest(payload));
      expect(res.status).toBe(200);

      expect(mocks.productEventCreate).toHaveBeenCalledTimes(1);
      const createArgs = mocks.productEventCreate.mock.calls[0][0];
      expect(createArgs.data).toEqual({
        userId: 'user_test_123',
        event: 'agent_intent_chip.click',
        props: { signal: 'url' },
      });
    });
  });
});
