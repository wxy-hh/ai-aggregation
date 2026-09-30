import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  refreshTokenFindUnique: vi.fn(),
  userUpdate: vi.fn(),
  refreshTokenDeleteMany: vi.fn(),
  transaction: vi.fn(),
  hashPassword: vi.fn(),
  check: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: {
    refreshToken: {
      findUnique: mocks.refreshTokenFindUnique,
      deleteMany: mocks.refreshTokenDeleteMany,
    },
    user: { update: mocks.userUpdate },
    $transaction: mocks.transaction,
  },
}));

vi.mock('@/lib/auth/password', () => ({ hashPassword: mocks.hashPassword }));

// 限流接缝：替换限流器实现，保留真实的阈值常量与 fail-closed 响应映射
vi.mock('@repo/redis', () => ({ getRedisClient: () => ({ 标记: '测试用 Redis 连接' }) }));

vi.mock('@repo/shared/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@repo/shared/server')>();
  class FakeRateLimiter {
    check = mocks.check;
  }
  return { ...actual, RateLimiter: FakeRateLimiter };
});

import { POST } from './route';

function resetRequest(
  body: Record<string, unknown> = { token: 'plain-reset-token', newPassword: 'newPassword123' }
) {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
    body: JSON.stringify(body),
  });
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('POST /api/auth/reset-password', () => {
  beforeEach(() => {
    for (const mock of [
      mocks.refreshTokenFindUnique,
      mocks.userUpdate,
      mocks.refreshTokenDeleteMany,
      mocks.transaction,
      mocks.hashPassword,
      mocks.check,
    ]) {
      mock.mockReset();
    }

    mocks.check.mockResolvedValue({ allowed: true, remaining: 9, reset: 0, limit: 10 });
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: 'token_1',
      userId: 'user_1',
      expiresAt: new Date(Date.now() + 60_000),
    });
    mocks.hashPassword.mockResolvedValue('new-bcrypt-hash');
    mocks.userUpdate.mockReturnValue({ 标记: 'user.update' });
    mocks.refreshTokenDeleteMany.mockReturnValue({ 标记: 'refreshToken.deleteMany' });
    mocks.transaction.mockResolvedValue([]);
  });

  it('限流命中时返回 429，且不查询重置令牌', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({ allowed: false, remaining: 0, reset: now + 12, limit: 10 });

    const response = await POST(resetRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      errorCode: 'TOO_MANY_REQUESTS',
      details: { retryAfter: 12 },
    });
    expect(mocks.refreshTokenFindUnique).not.toHaveBeenCalled();
  });

  it('限流设施故障时 fail-closed 返回 503，且不查询重置令牌', async () => {
    const now = Math.floor(Date.now() / 1000);
    mocks.check.mockResolvedValue({
      allowed: false,
      remaining: 0,
      reset: now,
      limit: 10,
      reason: 'limiter-unavailable',
    });

    const response = await POST(resetRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: '服务暂不可用，请稍后再试' });
    expect(mocks.refreshTokenFindUnique).not.toHaveBeenCalled();
  });

  it('按 reset:<sha256> 摘要查询并消费令牌', async () => {
    const response = await POST(resetRequest());

    expect(response.status).toBe(200);
    expect(mocks.refreshTokenFindUnique).toHaveBeenCalledWith({
      where: { token: `reset:${sha256('plain-reset-token')}` },
    });
    expect(mocks.hashPassword).toHaveBeenCalledWith('newPassword123');
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user_1' },
      data: { passwordHash: 'new-bcrypt-hash' },
    });
    // 重置成功后失效该用户所有会话令牌
    expect(mocks.refreshTokenDeleteMany).toHaveBeenCalledWith({ where: { userId: 'user_1' } });
  });

  it('令牌无效或过期时拒绝重置', async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue(null);

    const response = await POST(resetRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: '重置链接已过期或无效' });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it('服务端异常返回 500，且不把内部错误细节透给客户端', async () => {
    mocks.transaction.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const response = await POST(resetRequest());
    const text = await response.text();

    expect(response.status).toBe(500);
    expect(text).not.toContain('ECONNREFUSED');
    await expect(JSON.parse(text)).toMatchObject({ error: '重置密码失败，请稍后重试' });
  });
});
