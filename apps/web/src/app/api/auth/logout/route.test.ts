import { beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  cookieJar: new Map<string, string>(),
  deleteMany: vi.fn(),
}));

vi.mock('@repo/db', () => ({
  prisma: { refreshToken: { deleteMany: mocks.deleteMany } },
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

import * as route from './route';

function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function logoutRequest() {
  return new NextRequest('http://localhost/api/auth/logout', {
    method: 'POST',
    headers: { host: 'app.example.com' },
  });
}

describe('/api/auth/logout', () => {
  beforeEach(() => {
    mocks.cookieJar.clear();
    mocks.deleteMany.mockReset();
    mocks.deleteMany.mockResolvedValue({ count: 1 });
  });

  it('不再导出 GET handler（第三方页面无法用 GET/图片标签强制登出）', () => {
    expect('GET' in route).toBe(false);
  });

  it('POST 清除会话并按摘要删除 refresh token 记录', async () => {
    mocks.cookieJar.set('refresh_token', 'plain-refresh-token');
    mocks.cookieJar.set('auth_kind', 'user');

    const response = await route.POST(logoutRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ success: true, message: '已退出登录' });
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: { token: sha256('plain-refresh-token') },
    });
    expect(mocks.cookieJar.get('refresh_token')).toBe('');
    expect(mocks.cookieJar.get('auth_kind')).toBe('');
  });

  it('无 cookie 时也返回成功（登出幂等）', async () => {
    const response = await route.POST(logoutRequest());

    expect(response.status).toBe(200);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
  });

  it('数据库清理失败不影响登出', async () => {
    mocks.cookieJar.set('refresh_token', 'plain-refresh-token');
    mocks.deleteMany.mockRejectedValue(new Error('connect ECONNREFUSED 10.0.0.5:5432'));

    const response = await route.POST(logoutRequest());

    expect(response.status).toBe(200);
    expect(mocks.cookieJar.get('refresh_token')).toBe('');
  });
});
