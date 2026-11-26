// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

function requestWithSession(pathname: string) {
  return new NextRequest(`http://localhost${pathname}`, {
    headers: { cookie: 'refresh_token=test-session-cookie' },
  });
}

describe('认证页与受保护页路由提示契约', () => {
  it('带 Cookie 的 /login 直接放行', () => {
    const response = middleware(requestWithSession('/login'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });

  it('带 Cookie 的其余认证页直接放行', () => {
    for (const pathname of ['/register', '/forgot-password', '/reset-password']) {
      const response = middleware(requestWithSession(pathname));

      expect(response.status).toBe(200);
      expect(response.headers.get('location')).toBeNull();
    }
  });

  it('无 Cookie 的 /home 仍拦截', () => {
    const response = middleware(new NextRequest('http://localhost/home'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?redirect=%2Fhome');
  });

  it('无 Cookie 的 /tools 拦截到登录页并携带回跳意图', () => {
    const response = middleware(new NextRequest('http://localhost/tools'));

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('http://localhost/login?redirect=%2Ftools');
  });

  it('带 Cookie 的 /tools 直接放行', () => {
    const response = middleware(requestWithSession('/tools'));

    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
  });
});
