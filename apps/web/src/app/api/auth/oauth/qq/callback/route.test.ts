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
    user: { create: mocks.userCreate, findUnique: vi.fn() },
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

function callbackRequest(query = '?code=code-1&state=state-1', cookieState = 'state-1') {
  const req = new NextRequest(`http://localhost/api/auth/oauth/qq/callback${query}`, {
    method: 'GET',
  });
  if (cookieState) {
    req.cookies.set('oauth_state', cookieState);
  }
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

  it('已绑定账号被停用时拒绝签发会话并向父窗口发送 account_disabled 错误', async () => {
    mocks.oauthFindUnique.mockResolvedValue({
      id: 'oauth_1',
      user: { id: 'user_1', role: 'user', status: 'disabled' },
    });

    const response = await GET(callbackRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('QQ_AUTH_ERROR');
    expect(html).toContain('account_disabled');
    expect(html).toContain('window.opener.postMessage');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
    expect(mocks.oauthUpdate).not.toHaveBeenCalled();
  });

  it('已绑定账号正常时签发会话，返回 QQ_AUTH_SUCCESS 并写入摘要', async () => {
    mocks.oauthFindUnique.mockResolvedValue({
      id: 'oauth_1',
      user: { id: 'user_1', role: 'user', status: 'active' },
    });

    const response = await GET(callbackRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');

    const html = await response.text();
    expect(html).toContain('QQ_AUTH_SUCCESS');
    expect(html).toContain('window.opener.postMessage');

    const plainToken = mocks.cookieJar.get('refresh_token');
    const stored = mocks.refreshTokenCreate.mock.calls[0][0].data.token as string;
    expect(plainToken).toBeTruthy();
    expect(stored).toBe(sha256(plainToken!));
    expect(mocks.cookieJar.get('auth_kind')).toBe('user');
  });

  it('未绑定账号的新用户首次授权时静默建号，升级 https 头像并签发会话', async () => {
    mocks.oauthFindUnique.mockResolvedValue(null);
    mocks.getQQUserInfo.mockResolvedValue({
      nickname: 'QQ 新客',
      figureurl_qq_2: 'http://thirdqq.qlogo.cn/avatar.jpg',
    });
    mocks.userCreate.mockResolvedValue({
      id: 'user_new',
      role: 'user',
      status: 'active',
      tokens: 20000,
    });

    const response = await GET(callbackRequest());

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('QQ_AUTH_SUCCESS');

    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: 'QQ 新客',
          avatar: 'https://thirdqq.qlogo.cn/avatar.jpg',
        }),
      })
    );
  });

  it('state 不匹配时返回 oauth_state_mismatch 错误', async () => {
    const response = await GET(callbackRequest('?code=code-1&state=wrong-state', 'state-1'));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('QQ_AUTH_ERROR');
    expect(html).toContain('oauth_state_mismatch');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('缺少 code 时返回 no_code 错误（用户取消授权）', async () => {
    const response = await GET(callbackRequest('?state=state-1', 'state-1'));

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('QQ_AUTH_ERROR');
    expect(html).toContain('no_code');
    expect(mocks.refreshTokenCreate).not.toHaveBeenCalled();
  });

  it('上游接口异常时返回 oauth_failed 错误', async () => {
    mocks.getQQAccessToken.mockRejectedValue(new Error('QQ 服务不可用'));

    const response = await GET(callbackRequest());

    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain('QQ_AUTH_ERROR');
    expect(html).toContain('oauth_failed');
  });
});
