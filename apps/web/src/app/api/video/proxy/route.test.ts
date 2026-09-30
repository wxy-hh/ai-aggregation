import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';

/** 构造代理请求（默认不带任何登录态，代理接口对匿名用户开放） */
function proxyRequest(target?: string): NextRequest {
  const query = target === undefined ? '' : `?url=${encodeURIComponent(target)}`;
  return new NextRequest(`http://localhost:3030/api/video/proxy${query}`);
}

/** 构造上游响应（TS 的 BodyInit 不接受 Uint8Array，统一转成 ArrayBuffer） */
function upstreamResponse(body: string | Uint8Array, init?: ResponseInit): Response {
  return new Response(typeof body === 'string' ? body : (body.buffer as ArrayBuffer), init);
}

const fetchMock = vi.fn();

describe('/api/video/proxy 的 SSRF 防护', () => {
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

  it('非白名单域名返回 403', async () => {
    const response = await GET(proxyRequest('https://evil.com/x.mp4'));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/[\u4e00-\u9fa5]/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('内网地址、云元数据地址与 http 协议返回 403', async () => {
    for (const target of [
      'https://169.254.169.254/latest/meta-data/',
      'https://10.0.0.5/x.mp4',
      'http://sfile.chatglm.cn/testpath/video/x_0.mp4',
      'https://user:pass@sfile.chatglm.cn/testpath/video/x_0.mp4',
    ]) {
      const response = await GET(proxyRequest(target));
      expect(response.status, target).toBe(403);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('白名单命中且上游返回 text/html 时返回 415，且不转发响应体', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('<html><script>alert(1)</script></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      })
    );

    const response = await GET(
      proxyRequest('https://sfile.chatglm.cn/testpath/video/x_0.mp4')
    );
    const text = await response.text();

    expect(response.status).toBe(415);
    expect(text).not.toContain('<html>');
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('白名单命中且上游返回视频时返回 200，透传类型并保留缓存头', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse(new Uint8Array([5, 6]), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      })
    );

    const response = await GET(
      proxyRequest('https://sfile.chatglm.cn/testpath/video/x_0.mp4')
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=86400');
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([5, 6]));
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://sfile.chatglm.cn/testpath/video/x_0.mp4'
    );
  });

  it('上游未返回 Content-Type 时使用路由默认的 video/mp4', async () => {
    fetchMock.mockResolvedValue(upstreamResponse(new Uint8Array([8]), { status: 200 }));

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/a.mp4'));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
  });

  it('上游返回重定向时返回 502，不跟随跳转', async () => {
    fetchMock.mockResolvedValue(
      upstreamResponse('', {
        status: 301,
        headers: { Location: 'http://127.0.0.1:9000/bucket/video.mp4' },
      })
    );

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/a.mp4'));

    expect(response.status).toBe(502);
  });

  it('上游请求异常时返回 502', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    const response = await GET(proxyRequest('https://storage.googleapis.com/agnes-aigc/a.mp4'));

    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
  });

  it('环境变量 MEDIA_PROXY_ALLOWED_DOMAINS 支持为本地 MinIO 放行 http 回环地址', async () => {
    vi.stubEnv('MEDIA_PROXY_ALLOWED_DOMAINS', 'localhost:9000');
    fetchMock.mockResolvedValue(
      upstreamResponse(new Uint8Array([1]), {
        status: 200,
        headers: { 'Content-Type': 'video/mp4' },
      })
    );

    const local = await GET(
      proxyRequest('http://localhost:9000/ai-aggregation/aigc/videos/v.mp4')
    );
    expect(local.status).toBe(200);

    // 其他端口的本机地址不在白名单内
    const otherPort = await GET(proxyRequest('http://localhost:9001/ai-aggregation/v.mp4'));
    expect(otherPort.status).toBe(403);
  });
});
