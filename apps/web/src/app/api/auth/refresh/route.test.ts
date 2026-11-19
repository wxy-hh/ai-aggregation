import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-refresh-route-tests-32-chars!!';
  return {
    cookieJar: new Map<string, string>(),
    refreshTokenFindUnique: vi.fn(),
    refreshTokenDelete: vi.fn(),
    refreshTokenCreate: vi.fn(),
    userFindUnique: vi.fn(),
    transaction: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    refreshToken: {
      findUnique: mocks.refreshTokenFindUnique,
      delete: mocks.refreshTokenDelete,
      create: mocks.refreshTokenCreate,
    },
    user: { findUnique: mocks.userFindUnique },
    $transaction: mocks.transaction,
  },
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

function refreshRequest() {
  return new NextRequest('http://localhost/api/auth/refresh', { method: 'POST' });
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('POST /api/auth/refresh', () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    for (const mock of [
      mocks.refreshTokenFindUnique,
      mocks.refreshTokenDelete,
      mocks.refreshTokenCreate,
      mocks.userFindUnique,
      mocks.transaction,
    ]) {
      mock.mockReset();
    }

    mocks.cookieJar.set('refresh_token', 'plain-refresh-token');
    mocks.refreshTokenFindUnique.mockResolvedValue({
      id: 'token_1',
      userId: 'user_1',
      expiresAt: new Date(Date.now() + 60_000),
      user: { role: 'user' },
    });
    mocks.userFindUnique.mockResolvedValue({ status: 'active' });
    mocks.transaction.mockResolvedValue([]);
    mocks.refreshTokenCreate.mockResolvedValue({ id: 'token_2' });
    mocks.refreshTokenDelete.mockReturnValue({ 标记: 'refreshToken.delete' });
  });

  it('用 cookie 明文的 SHA-256 摘要查库（库中不存明文）', async () => {
    const response = await POST(refreshRequest());

    expect(response.status).toBe(200);
    expect(mocks.refreshTokenFindUnique).toHaveBeenCalledWith({
      where: { token: sha256('plain-refresh-token') },
      include: { user: { select: { role: true } } },
    });
  });

  it('轮换后的新 refresh token 同样只存摘要', async () => {
    await POST(refreshRequest());

    const plainNewToken = mocks.cookieJar.get('refresh_token');
    expect(plainNewToken).not.toBe('plain-refresh-token');

    const created = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(created).not.toBe(plainNewToken);
    expect(created).toBe(sha256(plainNewToken!));
  });

  it('没有 cookie 时返回 401 且不查库', async () => {
    mocks.cookieJar.clear();

    const response = await POST(refreshRequest());

    expect(response.status).toBe(401);
    expect(mocks.refreshTokenFindUnique).not.toHaveBeenCalled();
  });

  it('token 不存在时返回 401 并清除失效 Cookie', async () => {
    mocks.refreshTokenFindUnique.mockResolvedValue(null);

    const response = await POST(refreshRequest());

    expect(response.status).toBe(401);
    expect(mocks.cookieJar.get('refresh_token')).toBe('');
  });

  it('内部异常不得清除可能仍有效的 Cookie', async () => {
    mocks.refreshTokenFindUnique.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(refreshRequest());

    expect(response.status).toBe(500);
    expect(mocks.cookieJar.get('refresh_token')).toBe('plain-refresh-token');
  });
});
