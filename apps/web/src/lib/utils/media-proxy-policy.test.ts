import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ALLOWED_DOMAINS,
  parseAllowedDomains,
  resolveAllowedDomains,
  resolveProxyTarget,
  evaluateContentType,
  type ProxyRejectionReason,
} from './media-proxy-policy';

/** 断言目标 URL 被拒绝，并校验拒绝原因、HTTP 状态码与中文文案 */
function expectRejected(
  rawUrl: string | null,
  reason: ProxyRejectionReason,
  status: number,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_DOMAINS
) {
  const decision = resolveProxyTarget(rawUrl, allowedDomains);
  expect(decision.allowed, `${String(rawUrl)} 应被拒绝`).toBe(false);
  if (decision.allowed) return;
  expect(decision.reason).toBe(reason);
  expect(decision.status).toBe(status);
  // 错误文案必须是给用户看的中文
  expect(decision.message).toMatch(/[\u4e00-\u9fa5]/);
}

/** 断言目标 URL 被放行，并返回归一化后的主机名 */
function expectAllowed(
  rawUrl: string,
  allowedDomains: readonly string[] = DEFAULT_ALLOWED_DOMAINS
): string {
  const decision = resolveProxyTarget(rawUrl, allowedDomains);
  expect(decision.allowed, `${rawUrl} 应被放行`).toBe(true);
  if (!decision.allowed) return '';
  expect(decision.url.protocol === 'https:' || decision.url.protocol === 'http:').toBe(true);
  return decision.host;
}

describe('默认白名单（平台生成结果域名）', () => {
  it('包含 Agnes 生成结果域名 storage.googleapis.com 与智谱视频结果域名 sfile.chatglm.cn', () => {
    expect(DEFAULT_ALLOWED_DOMAINS).toContain('storage.googleapis.com');
    expect(DEFAULT_ALLOWED_DOMAINS).toContain('sfile.chatglm.cn');
  });

  it('默认白名单放行 Agnes 图片与视频结果地址，且不会退化为放行整个 googleapis.com', () => {
    expect(expectAllowed('https://storage.googleapis.com/agnes-aigc/xxx.png')).toBe(
      'storage.googleapis.com'
    );
    expect(expectAllowed('https://storage.googleapis.com/agnes-aigc/aigc/videos/2026/06/03/v.mp4')).toBe(
      'storage.googleapis.com'
    );
    expectRejected('https://evil.googleapis.com/agnes-aigc/xxx.png', 'domain-not-allowed', 403);
    expectRejected('https://storage.googleapis.com.evil.com/xxx.png', 'domain-not-allowed', 403);
  });

  it('默认白名单放行智谱 CogVideoX 的视频结果地址', () => {
    expect(expectAllowed('https://sfile.chatglm.cn/testpath/video/xxx_0.mp4')).toBe(
      'sfile.chatglm.cn'
    );
  });
});

describe('parseAllowedDomains（环境变量解析）', () => {
  it('未配置或为空时返回空数组', () => {
    expect(parseAllowedDomains(undefined)).toEqual([]);
    expect(parseAllowedDomains(null)).toEqual([]);
    expect(parseAllowedDomains('')).toEqual([]);
    expect(parseAllowedDomains('   ')).toEqual([]);
    expect(parseAllowedDomains(',,')).toEqual([]);
  });

  it('按逗号分隔，去除空白、统一小写、去重，并保留端口', () => {
    expect(parseAllowedDomains(' CDN.Example.com , cdn.example.com,localhost:9000 ')).toEqual([
      'cdn.example.com',
      'localhost:9000',
    ]);
  });
});

describe('resolveAllowedDomains（默认 + 环境变量合并）', () => {
  it('未配置环境变量时回退到默认白名单', () => {
    expect(resolveAllowedDomains(undefined)).toEqual([...DEFAULT_ALLOWED_DOMAINS]);
    expect(resolveAllowedDomains('')).toEqual([...DEFAULT_ALLOWED_DOMAINS]);
  });

  it('环境变量在默认白名单基础上追加，且不重复', () => {
    const domains = resolveAllowedDomains('cdn.example.com,storage.googleapis.com');
    expect(domains).toContain('cdn.example.com');
    expect(domains.filter((item) => item === 'storage.googleapis.com')).toHaveLength(1);
  });
});

describe('resolveProxyTarget：URL 参数合法性', () => {
  it('缺少 url 参数返回 400', () => {
    expectRejected(null, 'missing-url', 400);
    expectRejected('', 'missing-url', 400);
    expectRejected('   ', 'missing-url', 400);
  });

  it('非法或相对地址返回 400', () => {
    expectRejected('not-a-url', 'invalid-url', 400);
    expectRejected('/api/files/1.png', 'invalid-url', 400);
    expectRejected('//storage.googleapis.com/x.png', 'invalid-url', 400);
  });

  it('非 http(s) 协议返回 403', () => {
    expectRejected('file:///etc/passwd', 'unsupported-protocol', 403);
    expectRejected('data:text/html,<script>alert(1)</script>', 'unsupported-protocol', 403);
    expectRejected('ftp://storage.googleapis.com/x.png', 'unsupported-protocol', 403);
  });
});

describe('resolveProxyTarget：仅允许 https', () => {
  it('白名单域名的 http 请求一律拒绝', () => {
    expectRejected('http://storage.googleapis.com/x.png', 'insecure-protocol', 403);
    expectRejected('http://sfile.chatglm.cn/x.mp4', 'insecure-protocol', 403);
  });

  it('未在白名单中的本机地址的 http 请求同样拒绝', () => {
    expectRejected('http://localhost:9000/bucket/x.png', 'domain-not-allowed', 403);
    expectRejected('http://127.0.0.1:9000/bucket/x.png', 'domain-not-allowed', 403);
  });

  it('白名单显式声明本机地址时，仅对该地址放行 http（本地 MinIO 开发场景）', () => {
    expect(expectAllowed('http://localhost:9000/ai-aggregation/x.png', ['localhost:9000'])).toBe(
      'localhost'
    );
    expect(expectAllowed('http://127.0.0.1:9000/ai-aggregation/x.png', ['127.0.0.1:9000'])).toBe(
      '127.0.0.1'
    );
    // 白名单里的本机地址同样支持 https
    expect(expectAllowed('https://127.0.0.1:9000/x.png', ['127.0.0.1:9000'])).toBe('127.0.0.1');
  });

  it('白名单声明了本机地址但端口不一致时拒绝', () => {
    expectRejected('http://127.0.0.1:9001/x.png', 'domain-not-allowed', 403, ['127.0.0.1:9000']);
    expectRejected('http://localhost:9001/x.png', 'domain-not-allowed', 403, ['localhost:9000']);
  });
});

describe('resolveProxyTarget：白名单匹配规则', () => {
  const domains = ['cdn.example.com', 'storage.googleapis.com'];

  it('完全匹配与子域名匹配均放行', () => {
    expect(expectAllowed('https://cdn.example.com/a.png', domains)).toBe('cdn.example.com');
    expect(expectAllowed('https://img.cdn.example.com/a.png', domains)).toBe('img.cdn.example.com');
    expect(expectAllowed('https://a.b.cdn.example.com/a.png', domains)).toBe('a.b.cdn.example.com');
  });

  it('大小写与末尾根点归一等价', () => {
    expect(expectAllowed('https://CDN.Example.COM/a.png', domains)).toBe('cdn.example.com');
    expect(expectAllowed('https://cdn.example.com./a.png', domains)).toBe('cdn.example.com');
  });

  it('相似域名、跨域后缀与父域均不放行', () => {
    expectRejected('https://evilcdn.example.com/a.png', 'domain-not-allowed', 403, domains);
    expectRejected('https://cdn.example.com.evil.com/a.png', 'domain-not-allowed', 403, domains);
    expectRejected('https://example.com/a.png', 'domain-not-allowed', 403, domains);
    expectRejected('https://evil.com/?x=cdn.example.com', 'domain-not-allowed', 403, domains);
  });

  it('未声明端口的白名单条目匹配任意端口', () => {
    expect(expectAllowed('https://cdn.example.com:8443/a.png', domains)).toBe('cdn.example.com');
  });

  it('声明端口的白名单条目只匹配该端口', () => {
    expect(expectAllowed('https://cdn.example.com:8443/a.png', ['cdn.example.com:8443'])).toBe(
      'cdn.example.com'
    );
    expectRejected('https://cdn.example.com:9443/a.png', 'domain-not-allowed', 403, [
      'cdn.example.com:8443',
    ]);
    expectRejected('https://cdn.example.com/a.png', 'domain-not-allowed', 403, [
      'cdn.example.com:8443',
    ]);
  });

  it('空白名单不放行任何远程域名', () => {
    expectRejected('https://storage.googleapis.com/x.png', 'domain-not-allowed', 403, []);
  });
});

describe('resolveProxyTarget：内网与保留地址拦截', () => {
  const cases = [
    '169.254.169.254',
    '10.0.0.1',
    '10.255.255.254',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.0.1',
    '192.168.255.255',
    '0.0.0.0',
    '100.64.0.1',
    '192.0.0.1',
    '198.18.0.1',
    '224.0.0.1',
    '255.255.255.255',
  ];

  it.each(cases)('拒绝内网/保留 IPv4 地址 %s', (ip) => {
    expectRejected(`https://${ip}/x.png`, 'private-address', 403);
  });

  it('127/8 回环地址未显式加入白名单时拒绝', () => {
    expectRejected('https://127.0.0.1/x.png', 'domain-not-allowed', 403);
    expectRejected('https://127.9.9.9/x.png', 'domain-not-allowed', 403);
  });

  it('十进制、十六进制、八进制等 IPv4 变体归一化后仍被拦截', () => {
    // 这些写法会被 URL 解析器归一化成 127.0.0.1 / 169.254.169.254
    expectRejected('http://2130706433/x.png', 'domain-not-allowed', 403);
    expectRejected('http://0x7f000001/x.png', 'domain-not-allowed', 403);
    expectRejected('http://0177.0.0.1/x.png', 'domain-not-allowed', 403);
    expectRejected('https://2852039166/x.png', 'private-address', 403);
  });

  it('公网 IP 字面量一律拒绝（避免绕过域名白名单）', () => {
    expectRejected('https://8.8.8.8/x.png', 'ip-not-allowed', 403);
    expectRejected('https://172.32.0.1/x.png', 'ip-not-allowed', 403);
    expectRejected('https://192.169.0.1/x.png', 'ip-not-allowed', 403);
  });

  it('内网 IPv6 地址一律拒绝', () => {
    expectRejected('https://[::1]/x.png', 'domain-not-allowed', 403);
    expectRejected('https://[fc00::1]/x.png', 'private-address', 403);
    expectRejected('https://[fd12:3456::1]/x.png', 'private-address', 403);
    expectRejected('https://[fe80::1]/x.png', 'private-address', 403);
    expectRejected('https://[ff02::1]/x.png', 'private-address', 403);
    expectRejected('https://[2001:db8::1]/x.png', 'private-address', 403);
  });

  it('IPv4 映射 / NAT64 形式的 IPv6 地址按内嵌 IPv4 判定', () => {
    expectRejected('https://[::ffff:169.254.169.254]/x.png', 'private-address', 403);
    expectRejected('https://[::ffff:10.0.0.1]/x.png', 'private-address', 403);
    expectRejected('https://[64:ff9b::a9fe:a9fe]/x.png', 'private-address', 403);
    expectRejected('https://[64:ff9b::808:808]/x.png', 'ip-not-allowed', 403);
  });

  it('本机 IPv6 回环地址需要在白名单中显式声明', () => {
    expectRejected('https://[::1]:9000/x.png', 'domain-not-allowed', 403, ['localhost:9000']);
    expect(expectAllowed('http://[::1]:9000/x.png', ['[::1]:9000'])).toBe('::1');
  });

  it('白名单中写入内网 IP 也不能放行（白名单只对域名与本机地址生效）', () => {
    expectRejected('https://10.0.0.5/x.png', 'private-address', 403, ['10.0.0.5']);
    expectRejected('https://169.254.169.254/x.png', 'private-address', 403, ['169.254.169.254']);
    expectRejected('https://192.168.1.1/x.png', 'private-address', 403, ['192.168.1.1:443']);
  });
});

describe('resolveProxyTarget：userinfo 与主机名绕过', () => {
  it('username 伪造成白名单域名的内网地址被拦截', () => {
    // new URL() 解析后 hostname 为 169.254.169.254、username 为 storage.googleapis.com：
    // 携带 userinfo 与命中内网地址双重拦截
    expectRejected(
      'https://storage.googleapis.com@169.254.169.254/latest/meta-data/',
      'credentials-not-allowed',
      403
    );
  });

  it('任何携带 userinfo 的地址一律拒绝，即使 hostname 命中白名单', () => {
    expectRejected('https://169.254.169.254@storage.googleapis.com/x.png', 'credentials-not-allowed', 403);
    expectRejected('https://user:pass@storage.googleapis.com/x.png', 'credentials-not-allowed', 403);
    expectRejected(
      'https://storage.googleapis.com%2f@storage.googleapis.com/x.png',
      'credentials-not-allowed',
      403
    );
    expectRejected('https://user@cdn.example.com/x.png', 'credentials-not-allowed', 403, [
      'cdn.example.com',
    ]);
  });

  it('查询串中出现白名单域名不会被当作命中', () => {
    expectRejected(
      'https://evil.com/redirect?url=https://storage.googleapis.com/x.png',
      'domain-not-allowed',
      403
    );
  });
});

describe('evaluateContentType（Content-Type 白名单）', () => {
  it('放行 image/* 与 video/*', () => {
    for (const [header, resolved] of [
      ['image/png', 'image/png'],
      ['image/webp', 'image/webp'],
      ['image/jpeg', 'image/jpeg'],
      ['video/mp4', 'video/mp4'],
      ['video/webm', 'video/webm'],
      ['application/octet-stream', 'application/octet-stream'],
    ] as const) {
      const decision = evaluateContentType(header, 'image/png');
      expect(decision.allowed).toBe(true);
      expect(decision.resolved).toBe(resolved);
    }
  });

  it('丢弃 Content-Type 中的参数并统一为小写', () => {
    const decision = evaluateContentType('IMAGE/PNG; charset=binary', 'image/png');
    expect(decision.allowed).toBe(true);
    expect(decision.resolved).toBe('image/png');
  });

  it('拦截 text/html、脚本与 JSON 等主动内容', () => {
    for (const header of [
      'text/html',
      'text/html; charset=utf-8',
      'text/javascript',
      'application/javascript',
      'application/json',
      'text/plain',
      'application/xhtml+xml',
      'multipart/form-data',
    ]) {
      const decision = evaluateContentType(header, 'image/png');
      expect(decision.allowed, `${header} 应被拒绝`).toBe(false);
      expect(decision.message).toMatch(/[\u4e00-\u9fa5]/);
    }
  });

  it('拦截可执行脚本的 image/svg+xml（直接访问会变成同源 XSS）', () => {
    expect(evaluateContentType('image/svg+xml', 'image/png').allowed).toBe(false);
  });

  it('缺失 Content-Type 时回退到路由默认类型', () => {
    for (const header of [null, undefined, '', '   ']) {
      const decision = evaluateContentType(header, 'video/mp4');
      expect(decision.allowed).toBe(true);
      expect(decision.resolved).toBe('video/mp4');
    }
  });

  it('含非法字符的 Content-Type 直接拒绝（防止响应头注入）', () => {
    expect(evaluateContentType('image/png\r\nX-Injected: 1', 'image/png').allowed).toBe(false);
    expect(evaluateContentType('image/png,text/html', 'image/png').allowed).toBe(false);
  });
});
