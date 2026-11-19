import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-profile-email-tests-32-characters!!';

  /** 内存版 Redis 假实现：覆盖验证码读取/删除与限流计数用到的命令子集 */
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
    userFindFirst: vi.fn(),
    userUpdate: vi.fn(),
    check: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: {
      findUnique: mocks.userFindUnique,
      findFirst: mocks.userFindFirst,
      update: mocks.userUpdate,
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

function bindEmailRequest(
  body: Record<string, unknown>,
  accessToken: string | null = signAccessToken('user_1', 'user')
) {
  return new NextRequest('http://localhost/api/profile/email', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.7',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function seedCode(purpose: string, email: string, code: string) {
  mocks.redis.entries.set(`verify:${purpose}:${email}`, {
    value: sha256(code),
    expireAt: Date.now() + 10 * 60 * 1000,
  });
}

describe('POST /api/profile/email（绑定/更换邮箱）', () => {
  beforeEach(() => {
    mocks.redis = mocks.createFakeRedis();
    for (const mock of [
      mocks.userFindUnique,
      mocks.userFindFirst,
      mocks.userUpdate,
      mocks.check,
    ]) {
      mock.mockReset();
    }

    mocks.check.mockResolvedValue({ allowed: true, remaining: 9, reset: 0, limit: 10 });
    mocks.userFindUnique.mockImplementation((args: { where?: { id?: string } }) =>
      Promise.resolve(
        args?.where?.id
          ? { id: args.where.id, status: 'active', role: 'user', tokens: 20000 }
          : null
      )
    );
    mocks.userFindFirst.mockResolvedValue(null);
    mocks.userUpdate.mockImplementation((args: { data: Record<string, unknown> }) =>
      Promise.resolve({
        id: 'user_1',
        username: 'alice',
        email: args.data.email,
        emailVerified: args.data.emailVerified,
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('未登录返回 401，且不更新邮箱', async () => {
    const response = await POST(bindEmailRequest({ email: 'new@example.com', code: '123456' }, null));

    expect(response.status).toBe(401);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('验证码错误返回 400，且验证码保留（只有验证通过才作废）', async () => {
    seedCode('bind', 'new@example.com', '123456');

    const response = await POST(bindEmailRequest({ email: 'new@example.com', code: '000000' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'INVALID_EMAIL_CODE' });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.redis.entries.has('verify:bind:new@example.com')).toBe(true);
  });

  it('邮箱已被其他账号绑定返回 400，且不消费验证码', async () => {
    mocks.userFindFirst.mockResolvedValue({ id: 'user_other' });
    seedCode('bind', 'other@example.com', '123456');

    const response = await POST(bindEmailRequest({ email: 'other@example.com', code: '123456' }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'EMAIL_EXISTS' });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
    expect(mocks.redis.entries.has('verify:bind:other@example.com')).toBe(true);
  });

  it('验证码正确时写入 email 与 emailVerified，并作废验证码', async () => {
    seedCode('bind', 'new@example.com', '123456');

    const response = await POST(bindEmailRequest({ email: 'new@example.com', code: '123456' }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      message: '邮箱绑定成功',
      data: { user: { email: 'new@example.com' } },
    });

    const updateArgs = mocks.userUpdate.mock.calls[0][0];
    expect(updateArgs.where).toEqual({ id: 'user_1' });
    expect(updateArgs.data.email).toBe('new@example.com');
    expect(updateArgs.data.emailVerified).toBeInstanceOf(Date);
    expect(mocks.redis.entries.has('verify:bind:new@example.com')).toBe(false);
  });

  it('支持换绑：已绑定 a@example.com 的账号可改绑 b@example.com', async () => {
    mocks.userFindUnique.mockImplementation((args: { where?: { id?: string } }) =>
      Promise.resolve(
        args?.where?.id
          ? {
              id: args.where.id,
              status: 'active',
              role: 'user',
              tokens: 20000,
              email: 'a@example.com',
            }
          : null
      )
    );
    seedCode('bind', 'b@example.com', '654321');

    const response = await POST(bindEmailRequest({ email: 'b@example.com', code: '654321' }));

    expect(response.status).toBe(200);
    expect(mocks.userFindFirst).toHaveBeenCalledWith({
      where: { email: 'b@example.com', id: { not: 'user_1' } },
    });
    expect(mocks.userUpdate.mock.calls[0][0].data.email).toBe('b@example.com');
  });

  it('邮箱格式非法或验证码格式非法时返回 400 中文提示', async () => {
    const response = await POST(bindEmailRequest({ email: 'not-an-email', code: '12' }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.errorCode).toBe('INVALID_REQUEST');
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('IP 限流命中时返回 429，且不更新邮箱', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 12, limit: 10 });

    const response = await POST(bindEmailRequest({ email: 'new@example.com', code: '123456' }));

    expect(response.status).toBe(429);
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });

  it('验证码存储设施故障时 fail-closed 返回 503', async () => {
    mocks.redis.unavailable = true;

    const response = await POST(bindEmailRequest({ email: 'new@example.com', code: '123456' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ errorCode: 'SERVICE_UNAVAILABLE' });
    expect(mocks.userUpdate).not.toHaveBeenCalled();
  });
});
