import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-login-route-tests-32-chars!!';
  return {
    cookieJar: new Map<string, string>(),
    findUnique: vi.fn(),
    refreshTokenCreate: vi.fn(),
    verifyPassword: vi.fn(),
    check: vi.fn(),
    getLock: vi.fn(),
    recordFailure: vi.fn(),
    clear: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    refreshToken: { create: mocks.refreshTokenCreate },
  },
}));

vi.mock('@/lib/auth/password', () => ({ verifyPassword: mocks.verifyPassword }));

// 限流接缝：替换限流器实现，保留真实的阈值常量与 fail-closed 响应映射
vi.mock('@repo/redis', () => ({ getRedisClient: () => ({ 标记: '测试用 Redis 连接' }) }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

vi.mock('@/lib/auth/login-lockout', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/auth/login-lockout')>()),
  getLoginAttemptStore: () => ({
    getLock: mocks.getLock,
    recordFailure: mocks.recordFailure,
    clear: mocks.clear,
  }),
}));

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

function loginRequest(
  body: Record<string, unknown> = { username: 'alice', password: 'password123' }
) {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const activeUser = {
  id: 'user_1',
  username: 'alice',
  name: '爱丽丝',
  avatar: null,
  role: 'user',
  status: 'active',
  tokens: 20000,
  passwordHash: 'bcrypt-hash',
};

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    for (const mock of [
      mocks.findUnique,
      mocks.refreshTokenCreate,
      mocks.verifyPassword,
      mocks.check,
      mocks.getLock,
      mocks.recordFailure,
      mocks.clear,
    ]) {
      mock.mockReset();
    }

    mocks.check.mockResolvedValue({ allowed: true, remaining: 9, reset: 0, limit: 10 });
    mocks.getLock.mockResolvedValue({ failures: 0, lockedUntil: null });
    mocks.recordFailure.mockResolvedValue({ failures: 1, lockedUntil: null, lockSeconds: 0 });
    mocks.refreshTokenCreate.mockResolvedValue({ id: 'token_1' });
    mocks.verifyPassword.mockResolvedValue(true);
    mocks.findUnique.mockResolvedValue(activeUser);
  });

  it('限流命中时返回 429，且不查询用户', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 30, limit: 10 });

    const response = await POST(loginRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'TOO_MANY_REQUESTS',
      details: { retryAfter: 30 },
    });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('限流设施故障时 fail-closed 返回 503，且不查询用户', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({
      allowed: false,
      remaining: 0,
      reset: now,
      limit: 10,
      reason: 'limiter-unavailable',
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBeNull();
    await expect(response.json()).resolves.toMatchObject({ error: '服务暂不可用，请稍后再试' });
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it('登录成功后 refresh token 以 SHA-256 摘要落库，明文只留在 cookie 中', async () => {
    const response = await POST(loginRequest());

    expect(response.status).toBe(200);
    const plainToken = mocks.cookieJar.get('refresh_token');
    expect(plainToken).toBeTruthy();

    const stored = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(stored).not.toBe(plainToken);
    expect(stored).toBe(sha256(plainToken!));
    expect(mocks.clear).toHaveBeenCalledWith('alice:203.0.113.7');
  });

  it('用户不存在也计入失败次数', async () => {
    mocks.findUnique.mockResolvedValue(null);

    const response = await POST(loginRequest());

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({ error: '用户名或密码错误' });
    expect(mocks.recordFailure).toHaveBeenCalledWith('alice:203.0.113.7');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('密码错误同样计入失败次数', async () => {
    mocks.verifyPassword.mockResolvedValue(false);

    const response = await POST(loginRequest());

    expect(response.status).toBe(401);
    expect(mocks.recordFailure).toHaveBeenCalledWith('alice:203.0.113.7');
  });

  it('第 5 次失败触发锁定并返回 423 与剩余分钟数', async () => {
    mocks.verifyPassword.mockResolvedValue(false);
    const now = Math.floor(Date.now() / 1000);
    mocks.recordFailure.mockResolvedValue({
      failures: 5,
      lockedUntil: now + 15 * 60,
      lockSeconds: 15 * 60,
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'ACCOUNT_LOCKED',
      error: '尝试次数过多，账号已临时锁定，请 15 分钟后再试',
      details: { retryAfter: 15 * 60 },
    });
  });

  it('锁定期内重复尝试只拒绝：不累计、不延长锁定，也不校验密码', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.getLock.mockResolvedValue({ failures: 5, lockedUntil: now + 12 * 60 });

    const response = await POST(loginRequest());

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      error: '尝试次数过多，账号已临时锁定，请 12 分钟后再试',
      details: { retryAfter: 12 * 60 },
    });
    // 锁定期内喂养计数器会让攻击者能用周期性尝试把账号永久锁死（锁定 DoS）
    expect(mocks.recordFailure).not.toHaveBeenCalled();
    // 锁定状态下不再校验证密码，避免给出密码正确性的旁路信号
    expect(mocks.verifyPassword).not.toHaveBeenCalled();
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('锁定期满后再次失败从已有计数继续翻倍并提示新的剩余时间', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.getLock.mockResolvedValue({ failures: 5, lockedUntil: now - 1 });
    mocks.verifyPassword.mockResolvedValue(false);
    mocks.recordFailure.mockResolvedValue({
      failures: 6,
      lockedUntil: now + 30 * 60,
      lockSeconds: 30 * 60,
    });

    const response = await POST(loginRequest());

    expect(response.status).toBe(423);
    await expect(response.json()).resolves.toMatchObject({
      error: '尝试次数过多，账号已临时锁定，请 30 分钟后再试',
      details: { retryAfter: 30 * 60 },
    });
    expect(mocks.recordFailure).toHaveBeenCalledWith('alice:203.0.113.7');
  });

  it('账号被停用时拒绝签发会话', async () => {
    mocks.findUnique.mockResolvedValue({ ...activeUser, status: 'disabled' });

    const response = await POST(loginRequest());

    expect(response.status).toBe(403);
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('服务端异常返回 500，且不把内部错误细节透给客户端', async () => {
    mocks.findUnique.mockRejectedValue(
      new Error('connect ECONNREFUSED 10.0.0.5:5432 secret-dsn-detail')
    );

    const response = await POST(loginRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('ECONNREFUSED');
    expect(text).not.toContain('secret-dsn-detail');
    await expect(JSON.parse(text)).toMatchObject({ error: '登录失败，请稍后重试' });
  });
});
