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
    getWechatAccessToken: vi.fn(),
    getWechatUserInfo: vi.fn(),
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
  getWechatAccessToken: mocks.getWechatAccessToken,
  getWechatUserInfo: mocks.getWechatUserInfo,
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
    'http://localhost/api/auth/oauth/wechat/callback?code=code-1&state=state-1',
    { method: 'GET' }
  );
  // happy-dom 的 Request 会过滤 cookie/host 等禁用头，构造后再注入
  req.cookies.set('oauth_state', 'state-1');
  req.headers.set('host', 'app.example.com');
  return req;
}

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

describe('GET /api/auth/oauth/wechat/callback', () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    for (const mock of [
      mocks.oauthFindUnique,
      mocks.oauthUpdate,
      mocks.userCreate,
      mocks.refreshTokenCreate,
      mocks.getWechatAccessToken,
      mocks.getWechatUserInfo,
    ]) {
      mock.mockReset();
    }

    mocks.getWechatAccessToken.mockResolvedValue({ access_token: 'wx-token', openid: 'openid-1' });
    mocks.getWechatUserInfo.mockResolvedValue({ openid: 'openid-1', nickname: '微信用户' });
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
    expect(mocks.refreshTokenCreate).toHaveBeenCalledTimes(1);

    const plainToken = mocks.cookieJar.get('refresh_token');
    const stored = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(plainToken).toBeTruthy();
    expect(stored).not.toBe(plainToken);
    expect(stored).toBe(sha256(plainToken!));
  });
});
