/**
 * web_fetch URL 安全校验 — 表驱动测试（spec §6.2 拦截清单）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 接缝：url-guard 的纯函数（字面量校验 + IP 段判定），不触网络。
 * 先例：chat-safety.test.ts 的纯函数表驱动风格。
 */
import { describe, expect, it } from 'vitest';
import { guardResolvedAddresses, isBlockedIp, validateUrlLiteral } from './url-guard';

describe('validateUrlLiteral — 合法 URL 放行', () => {
  it.each([
    ['https://example.com'],
    ['https://example.com/path?q=1#frag'],
    ['http://example.com'],
    ['https://sub.domain.co.uk/a/b'],
    ['https://1.1.1.1/'], // 公网 IP 字面量
    ['https://[2001:4860:4860::8888]/'], // 公网 IPv6 字面量（URL 规范要求方括号）
    ['https://example.com:8443/x'], // 显式端口
  ])('放行 %s', (raw) => {
    const result = validateUrlLiteral(raw);
    expect(result.ok).toBe(true);
  });
});

describe('validateUrlLiteral — 协议白名单', () => {
  it.each([
    ['ftp://example.com', '协议'],
    ['file:///etc/passwd', '协议'],
    ['data:text/plain,hi', '协议'],
    ['javascript:alert(1)', '协议'],
    ['ws://example.com', '协议'],
  ])('拒绝 %s', (raw) => {
    const result = validateUrlLiteral(raw);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('http');
  });

  it.each([[''], ['   '], ['not-a-url'], ['://missing-scheme']])('拒绝畸形输入 %j', (raw) => {
    expect(validateUrlLiteral(raw).ok).toBe(false);
  });
});

describe('validateUrlLiteral — 内网 IPv4 字面量拦截', () => {
  it.each([
    ['http://127.0.0.1/'],
    ['http://127.1.2.3/'],
    ['http://10.0.0.1/'],
    ['http://10.255.255.255/'],
    ['http://172.16.0.1/'],
    ['http://172.31.255.254/'],
    ['http://192.168.0.1/'],
    ['http://192.168.255.255/'],
    ['http://169.254.169.254/'], // 云元数据服务
    ['http://0.0.0.0/'],
  ])('拒绝 %s', (raw) => {
    expect(validateUrlLiteral(raw).ok).toBe(false);
  });

  it.each([['http://172.15.0.1/'], ['http://172.32.0.1/'], ['http://11.0.0.1/'], ['http://8.8.8.8/']])(
    '相邻公网段放行 %s',
    (raw) => {
      expect(validateUrlLiteral(raw).ok).toBe(true);
    }
  );
});

describe('validateUrlLiteral — 内网 IPv6 字面量拦截', () => {
  it.each([
    ['http://[::1]/'],
    ['http://[fc00::1]/'],
    ['http://[fd12:3456::1]/'],
    ['http://[fe80::1]/'],
    // B-2：IPv6 转换/隧道前缀——地址内嵌 IPv4，可绕过全部 IPv4 判定
    ['http://[::7f00:1]/'], // ::/96 IPv4-compatible（= ::127.0.0.1）
    ['http://[::ffff:7f00:1]/'], // IPv4-mapped 十六进制写法
    ['http://[64:ff9b::7f00:1]/'], // NAT64 well-known（内嵌 127.0.0.1）
    ['http://[64:ff9b:1::7f00:1]/'], // NAT64 local-use /48
    ['http://[2002:7f00:1::]/'], // 6to4（内嵌 127.0.0.1）
    ['http://[2001:0:4136:e378:8000:63bf:3fff:fdd2]/'], // Teredo
  ])('拒绝 %s', (raw) => {
    expect(validateUrlLiteral(raw).ok).toBe(false);
  });
});

describe('validateUrlLiteral — 危险主机名字面量拦截', () => {
  it.each([
    ['http://localhost/'],
    ['http://LOCALHOST/'],
    ['http://localhost:3000/api'],
    ['http://foo.local/'],
    ['http://service.internal/'],
    ['http://metadata.google.internal/'],
    ['http://foo.localhost/'],
  ])('拒绝 %s', (raw) => {
    expect(validateUrlLiteral(raw).ok).toBe(false);
  });

  it.each([['http://localhost.com/'], ['http://notlocal.dev/'], ['http://internal.example.com/']])(
    '相似但合法的域名放行 %s',
    (raw) => {
      expect(validateUrlLiteral(raw).ok).toBe(true);
    }
  );
});

describe('isBlockedIp — IP 段判定（含边界）', () => {
  it.each([
    ['127.0.0.1', true],
    ['127.255.255.255', true],
    ['10.0.0.0', true],
    ['10.255.255.255', true],
    ['172.16.0.0', true],
    ['172.31.255.255', true],
    ['172.15.255.255', false], // 172.16/12 下边界外
    ['172.32.0.0', false], // 172.16/12 上边界外
    ['192.168.0.0', true],
    ['192.169.0.0', false],
    ['169.254.169.254', true],
    ['0.0.0.0', true],
    ['100.64.0.1', true], // CGNAT 保留段
    ['8.8.8.8', false],
    ['1.1.1.1', false],
    ['::1', true],
    ['fc00::1', true],
    ['fdff::1', true],
    ['fe80::1', true],
    ['2001:4860:4860::8888', false],
    ['::ffff:127.0.0.1', true], // IPv4-mapped IPv6 绕过尝试
    ['::ffff:10.0.0.1', true],
    // B-2：IPv6 转换/隧道前缀（内嵌 IPv4，可绕过 IPv4 判定）
    ['::7f00:1', true], // ::/96 IPv4-compatible（= ::127.0.0.1）
    ['64:ff9b::7f00:1', true], // NAT64 well-known
    ['64:ff9b:1::1', true], // NAT64 local-use /48
    ['2002:7f00:1::', true], // 6to4
    ['2001:0:4136:e378:8000:63bf:3fff:fdd2', true], // Teredo
    ['2001:db8::1', false], // 文档前缀：公网侧放行（路由不到，但不属内网判定职责）
    ['not-an-ip', true], // 无法判定即拒绝（fail-closed）
  ])('isBlockedIp(%s) === %s', (ip, expected) => {
    expect(isBlockedIp(ip)).toBe(expected);
  });
});

describe('guardResolvedAddresses — DNS 重绑定防护（连接阶段判定核心）', () => {
  // 重绑定的攻击形状：一个域名先解析到公网（过字面量校验），
  // 紧接着在「连接时的那次解析」返回内网 IP。防护要求连接用的 IP
  // 就是这里校验过的 IP，且**任一条**是内网即整次拒绝。
  it.each([
    // 重绑定的攻击形状：一个域名先解析到公网（过字面量校验），
    // 紧接着在「连接时的那次解析」返回内网 IP。防护要求连接用的 IP
    // 就是这里校验过的 IP，且**任一条**是内网即整次拒绝。
    { name: '单个公网 IPv4', addresses: [{ address: '93.184.216.34' }], expected: true },
    {
      name: '多个公网 IP',
      addresses: [{ address: '93.184.216.34' }, { address: '1.1.1.1' }],
      expected: true,
    },
    { name: '公网 IPv6', addresses: [{ address: '2001:4860:4860::8888' }], expected: true },
    // ↓ 核心攻击用例：混入一条内网即必须整体拒绝，不能因为「还有公网 IP」就放行
    {
      name: '公网 + 内网（127.0.0.1）',
      addresses: [{ address: '93.184.216.34' }, { address: '127.0.0.1' }],
      expected: false,
    },
    {
      name: '公网 + 内网（192.168.1.1）',
      addresses: [{ address: '93.184.216.34' }, { address: '192.168.1.1' }],
      expected: false,
    },
    {
      name: '公网 + 云元数据服务',
      addresses: [{ address: '93.184.216.34' }, { address: '169.254.169.254' }],
      expected: false,
    },
    {
      name: '公网 + 内网 IPv6',
      addresses: [{ address: '93.184.216.34' }, { address: 'fd00::1' }],
      expected: false,
    },
    {
      name: '公网 + IPv4-mapped 内网',
      addresses: [{ address: '93.184.216.34' }, { address: '::ffff:10.0.0.1' }],
      expected: false,
    },
    { name: '纯内网', addresses: [{ address: '10.1.2.3' }], expected: false },
  ])('解析结果「$name」→ 放行=$expected', ({ addresses, expected }) => {
    expect(guardResolvedAddresses(addresses).ok).toBe(expected);
  });

  it('解析结果为空 → fail-closed 拒绝（不给"解析不到就放行"留口子）', () => {
    const result = guardResolvedAddresses([]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('无法解析');
  });

  it('无法判定的地址 → fail-closed 拒绝', () => {
    const result = guardResolvedAddresses([{ address: 'not-an-ip' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('不允许访问');
  });

  it('拒绝理由是用户可读中文（直接用于工具失败文案）', () => {
    const result = guardResolvedAddresses([{ address: '127.0.0.1' }]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('该地址不允许访问');
  });

  it('放行时原样透传解析结果，保证「校验的 IP」= 「连接的 IP」', () => {
    const list = [{ address: '93.184.216.34', family: 4 }, { address: '1.1.1.1', family: 4 }];
    const result = guardResolvedAddresses(list);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.addresses).toEqual(list);
  });
});
