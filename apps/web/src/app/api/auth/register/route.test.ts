import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-register-route-tests-32-chars!!';

  /** 内存版 Redis 假实现：覆盖验证码存储/读取/删除与日计数用到的命令子集 */
  function createFakeRedis() {
    const entries = new Map<string, { value: string; expireAt: number | null }>();
    const now = () => Date.now();
    return {
      entries,
      async set(key: string, value: string, _mode?: string, seconds?: number) {
        entries.set(key, {
          value,
          expireAt: typeof seconds === 'number' ? now() + seconds * 1000 : null,
        });
        return 'OK';
      },
      async get(key: string) {
        const entry = entries.get(key);
        if (!entry) return null;
        if (entry.expireAt !== null && entry.expireAt <= now()) {
          entries.delete(key);
          return null;
        }
        return entry.value;
      },
      async del(key: string) {
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
    cookieJar: new Map<string, string>(),
    createFakeRedis,
    redis: null as unknown as ReturnType<typeof createFakeRedis>,
    userFindUnique: vi.fn(),
    userFindFirst: vi.fn(),
    userCreate: vi.fn(),
    refreshTokenCreate: vi.fn(),
    hashPassword: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      create: mocks.userCreate,
    },
    refreshToken: { create: mocks.refreshTokenCreate },
  },
}));

vi.mock('@/lib/auth/password', () => ({ hashPassword: mocks.hashPassword }));

// 限流接缝：替换限流器实现，保留真实的阈值常量与 fail-closed 响应映射
vi.mock('@repo/redis', () => ({ getRedisClient: () => mocks.redis }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      mocks.cookieJar.has(name) ? { name, value: mocks.cookieJar.get(name) } : undefined,
    set: (name: string, value: string) => {
      mocks.cookieJar.set(name, value);
    },
  }),
}));

import { POST } from './route';

function registerRequest(
  body: Record<string, unknown> = { username: 'newbie', password: 'password123' }
) {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '198.51.100.5, 203.0.113.9' },
    body: JSON.stringify(body),
  });
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function expectChineseError(payload: { error?: string }) {
  expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
}

/** 按验证码存储契约预置一条注册用途验证码 */
function seedRegisterCode(email: string, code: string) {
  mocks.redis.entries.set(`verify:register:${email}`, {
    value: sha256(code),
    expireAt: Date.now() + 10 * 60 * 1000,
  });
}

describe('POST /api/auth/register', () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    mocks.redis = mocks.createFakeRedis();
    for (const mock of [
      mocks.userFindUnique,
      mocks.userFindFirst,
      mocks.userCreate,
      mocks.refreshTokenCreate,
      mocks.hashPassword,
      mocks.check,
    ]) {
      mock.mockReset();
    }

    mocks.check.mockResolvedValue({ allowed: true, remaining: 4, reset: 0, limit: 5 });
    mocks.userFindUnique.mockResolvedValue(null);
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.hashPassword.mockResolvedValue('bcrypt-hash');
    mocks.userCreate.mockResolvedValue({
      id: 'user_9',
      username: 'newbie',
      name: null,
      avatar: null,
      email: null,
      emailVerified: null,
      role: 'user',
    });
    mocks.refreshTokenCreate.mockResolvedValue({ id: 'token_9' });
  });

  it('限流命中时返回 429，且不创建用户', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 17, limit: 5 });

    const response = await POST(registerRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'TOO_MANY_REQUESTS',
      details: { retryAfter: 17 },
    });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('限流设施故障时 fail-closed 返回 503，且不创建用户', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({
      allowed: false,
      remaining: 0,
      reset: now,
      limit: 5,
      reason: 'limiter-unavailable',
    });

    const response = await POST(registerRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: '服务暂不可用，请稍后再试' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('按最右侧可信代理 IP 限流，注册成功后 refresh token 以摘要落库', async () => {
    const response = await POST(registerRequest());

    expect(response.status).toBe(200);
    expect(mocks.check).toHaveBeenCalledWith('203.0.113.9');

    const plainToken = mocks.cookieJar.get('refresh_token');
    const stored = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(stored).not.toBe(plainToken);
    expect(stored).toBe(sha256(plainToken!));
  });

  it('参数非法时返回 400 中文提示', async () => {
    const response = await POST(registerRequest({ username: 'ab', password: '123' }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expectChineseError(payload);
  });

  it('服务端异常返回 500，且不把内部错误细节透给客户端', async () => {
    mocks.userCreate.mockRejectedValue(
      new Error('Unique constraint failed on the fields: (`username`) secret-table-detail')
    );

    const response = await POST(registerRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('Unique constraint');
    expect(text).not.toContain('secret-table-detail');
    await expect(JSON.parse(text)).toMatchObject({ error: '注册失败，请稍后重试' });
  });

  it('不填邮箱时保持原行为：不校验验证码，账号不带 email', async () => {
    const response = await POST(registerRequest());

    expect(response.status).toBe(200);
    expect(mocks.redis.entries.size).toBe(0);
    const created = mocks.userCreate.mock.calls[0][0].data;
    expect(created.email).toBeUndefined();
    expect(created.emailVerified).toBeUndefined();
  });

  it('填写邮箱且验证码正确时写入 email 与 emailVerified，并作废验证码', async () => {
    seedRegisterCode('newbie@example.com', '246810');
    mocks.userCreate.mockResolvedValue({
      id: 'user_9',
      username: 'newbie',
      name: null,
      avatar: null,
      email: 'newbie@example.com',
      emailVerified: new Date('2026-09-29T00:00:00.000Z'),
      role: 'user',
    });

    const response = await POST(
      registerRequest({
        username: 'newbie',
        password: 'password123',
        email: 'Newbie@Example.com',
        emailCode: '246810',
      })
    );

    expect(response.status).toBe(200);
    const created = mocks.userCreate.mock.calls[0][0].data;
    expect(created.email).toBe('newbie@example.com');
    expect(created.emailVerified).toBeInstanceOf(Date);
    // 验证码一次性使用：注册成功后即从存储中删除
    expect(mocks.redis.entries.has('verify:register:newbie@example.com')).toBe(false);
  });

  it('验证码错误时返回 400，且不创建用户、不消费验证码', async () => {
    seedRegisterCode('newbie@example.com', '246810');

    const response = await POST(
      registerRequest({
        username: 'newbie',
        password: 'password123',
        email: 'newbie@example.com',
        emailCode: '000000',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'INVALID_EMAIL_CODE' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.redis.entries.has('verify:register:newbie@example.com')).toBe(true);
  });

  it('同一验证码不能重复使用（第二次注册返回 400）', async () => {
    seedRegisterCode('newbie@example.com', '246810');
    const body = {
      username: 'newbie',
      password: 'password123',
      email: 'newbie@example.com',
      emailCode: '246810',
    };

    const first = await POST(registerRequest(body));
    const second = await POST(registerRequest({ ...body, username: 'newbie2' }));

    expect(first.status).toBe(200);
    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toMatchObject({ errorCode: 'INVALID_EMAIL_CODE' });
  });

  it('邮箱已被占用时返回 400，且不创建用户', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 'user_other' });
    seedRegisterCode('taken@example.com', '246810');

    const response = await POST(
      registerRequest({
        username: 'newbie',
        password: 'password123',
        email: 'taken@example.com',
        emailCode: '246810',
      })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'EMAIL_EXISTS' });
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('填写邮箱但缺少验证码时返回 400 中文提示', async () => {
    const response = await POST(
      registerRequest({
        username: 'newbie',
        password: 'password123',
        email: 'newbie@example.com',
      })
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expectChineseError(payload);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('验证码存储设施故障时 fail-closed 返回 503，且不创建用户', async () => {
    seedRegisterCode('newbie@example.com', '246810');
    // 让后续 Redis 读取失败：直接替换为抛错的 get
    mocks.redis.get = async () => {
      throw new Error('connect ECONNREFUSED 10.0.0.5:6379');
    };

    const response = await POST(
      registerRequest({
        username: 'newbie',
        password: 'password123',
        email: 'newbie@example.com',
        emailCode: '246810',
      })
    );

    expect(response.status).toBe(503);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });
});
