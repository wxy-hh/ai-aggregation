import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';

/** 构造代理请求（默认不带任何登录态，代理接口对匿名用户开放） */
function proxyRequest(target?: string, path = '/api/image/proxy'): NextRequest {
  const query = target === undefined ? '' : `?url=${encodeURIComponent(target)}`;
  return new NextRequest(`http://localhost:3030${path}${query}`);
}

/** 构造上游响应（TS 的 BodyInit 不接受 Uint8Array，统一转成 ArrayBuffer） */
function upstreamResponse(body: string | Uint8Array, init?: ResponseInit): Response {
  return new Response(typeof body === 'string' ? body : (body.buffer as ArrayBuffer), init);
}

const fetchMock = vi.fn();

describe('/api/image/proxy 的 SSRF 防护', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('缺少 url 参数时返回 400 中文提示，且不发起上游请求', async () => {
    const response = await GET(proxyRequest());
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toMatch(/url/);
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('url 参数非法时返回 400', async () => {
    const response = await GET(proxyRequest('not-a-url'));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('非白名单域名返回 403，且不发起上游请求', async () => {
    const response = await GET(proxyRequest('https://evil.com/x.png'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('内网地址与云元数据地址返回 403', async () => {
    for (const target of [
      'http://169.254.169.254/latest/meta-data/',
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/x.png',
      'https://192.168.1.1:8080/x.png',
      'https://storage.googleapis.com@169.254.169.254/latest/meta-data/',
    ]) {
      const response = await GET(proxyRequest(target));
      expect(response.status, target).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('白名单域名的 http 地址返回 403（仅允许 https）', async () => {
    const response = await GET(proxyRequest('http://storage.googleapis.com/x.png'));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('白名单命中且上游返回 text/html 时返回 415，且不转发响应体', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('<html><script>alert(1)</script></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    );

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.html'));
    const text = await response.text();

    expect(response.status).toBe(415);
    expect(text).not.toContain('<html>');
    expect(text).toMatch(/[\u4e00-\u9fa5]/);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('白名单命中且上游返回 application/json 时返回 415', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('{"token":"secret"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.png'));
    const text = await response.text();

    expect(response.status).toBe(415);
    expect(text).not.toContain('secret');
  });

  it('白名单命中且上游返回图片时返回 200，透传类型并保留缓存头', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    );

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.png'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://storage.googleapis.com/agnes-aigc/x.png');
  });

  it('上游未返回 Content-Type 时使用路由默认的 image/png', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(new Uint8Array([9]), { status: 200 }));

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/png');
  });

  it('上游返回重定向时返回 502，不跟随跳转（防止用 302 绕过白名单）', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('', {
        status: 302,
        headers: { Location: 'http://169.254.169.254/latest/meta-data/' },
      })
    );

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.png'));
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
  });

  it('上游返回 404 时透传状态码并给出中文错误', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('Not Found', { status: 404, headers: { 'Content-Type': 'text/plain' } })
    );

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.png'));
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
  });

  it('上游请求异常时返回 502', async () => {
    fetchMock.mockRejectedValue(new Error('socket hang up'));

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.png'));

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('环境变量 MEDIA_PROXY_ALLOWED_DOMAINS 追加的白名单域名生效，默认白名单仍可用', async () => {
    vi.stubEnv('MEDIA_PROXY_ALLOWED_DOMAINS', 'cdn.example.com');
    // 每次调用返回新的 Response（响应体只能被读取一次）
    fetchMock.mockImplementation(() =>
      Promise.resolve(
        upstreamResponse(new Uint8Array([7]), {
          status: 200,
          headers: { 'Content-Type': 'image/webp' },
        })
      )
    );

    const custom = await GET(proxyRequest('https://cdn.example.com/x.webp'));
    expect(custom.status).toBe(200);
    expect(custom.headers.get('Content-Type')).toBe('image/webp');

    const fallback = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/x.png'));
    expect(fallback.status).toBe(200);

    const rejected = await GET(proxyRequest('https://other.example.com/x.png'));
    expect(rejected.status).toBe(403);
  });
});
