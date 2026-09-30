import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => {
  process.env.AUTH_SECRET = 'test-secret-key-for-oauth-callback-tests-32-chars!!';
  return {
    cookieJar: new Map<string, string>(),
    oauthFindUnique: vi.fn(),
    oauthUpdate: vi.fn(),
    userCreate: vi.fn(),
    refreshTokenCreate: vi.fn(),
    getQQAccessToken: vi.fn(),
    getQQOpenId: vi.fn(),
    getQQUserInfo: vi.fn(),
  };
});

vi.mock('@repo/db', () => ({
  prisma: {
    oAuthAccount: { findUnique: mocks.oauthFindUnique, update: mocks.oauthUpdate },
    user: { create: mocks.userCreate },
    refreshToken: { create: mocks.refreshTokenCreate },
  },
}));

vi.mock('@/lib/auth/oauth', () => ({
  getQQAccessToken: mocks.getQQAccessToken,
  getQQOpenId: mocks.getQQOpenId,
  getQQUserInfo: mocks.getQQUserInfo,
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

import { GET } from './route';

function callbackRequest() {
  const req = new NextRequest(
    'http://localhost/api/auth/oauth/qq/callback?code=code-1&state=state-1',
    {
      method: 'GET',
    }
  );
  // happy-dom 的 Request 会过滤 cookie/host 等禁用头，构造后再注入
  req.cookies.set('oauth_state', 'state-1');
  req.headers.set('host', 'app.example.com');
  return req;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('GET /api/auth/oauth/qq/callback', () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    for (const mock of [
      mocks.oauthFindUnique,
      mocks.oauthUpdate,
      mocks.userCreate,
      mocks.refreshTokenCreate,
      mocks.getQQAccessToken,
      mocks.getQQOpenId,
      mocks.getQQUserInfo,
    ]) {
      mock.mockReset();
    }

    mocks.getQQAccessToken.mockResolvedValue({ access_token: 'qq-token', expires_in: '7776000' });
    mocks.getQQOpenId.mockResolvedValue('openid-1');
    mocks.getQQUserInfo.mockResolvedValue({ nickname: 'QQ 用户' });
    mocks.oauthUpdate.mockResolvedValue({ id: 'oauth_1' });
    mocks.refreshTokenCreate.mockResolvedValue({ id: 'token_1' });
  });

  it('已绑定账号被停用时拒绝签发会话并重定向回登录页', async () => {
    mocks.oauthFindUnique.mockResolvedValue({
      id: 'oauth_1',
      user: { id: 'user_1', role: 'user', status: 'disabled' },
    });

    const response = await GET(callbackRequest());

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe(
      'https://app.example.com/login?error=account_disabled'
    );
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
    expect(mocks.oauthUpdate).not.toHaveBeenCalled();
  });

  it('已绑定账号正常时签发会话，refresh token 以摘要落库', async () => {
    mocks.oauthFindUnique.mockResolvedValue({
      id: 'oauth_1',
      user: { id: 'user_1', role: 'user', status: 'active' },
    });

    const response = await GET(callbackRequest());

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('https://app.example.com/home');

    const plainToken = mocks.cookieJar.get('refresh_token');
    const stored = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(plainToken).toBeTruthy();
    expect(stored).toBe(sha256(plainToken!));
  });
});
