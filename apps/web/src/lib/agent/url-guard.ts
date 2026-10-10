/**
 * web_fetch URL 安全校验 — 纯函数层（spec §6.2 安全红线）
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 *
 * 职责边界：
 * - 本文件的函数**不做任何网络 IO**，只判定「这个 URL 字面量 / 这个 IP 是否允许访问」，
 *   因此可被表驱动单测完整覆盖（含边界与绕过尝试）。
 * - DNS 解析后的重绑定防护，其**判定部分**在本文件的 `guardResolvedAddresses`（纯函数、可表驱动测）；
 *   连接阶段的 `guardedLookup`（见 guarded-lookup.ts）调用它，保证「校验的 IP」与「连接的 IP」
 *   是同一次解析的结果，杜绝 TOCTOU 漂移。
 *
 * 判定策略为 fail-closed：无法解析、无法判定一律拒绝。
 *
 * 平台约束：本文件必须保持客户端可打包（cURL 导入的即时网址校验在浏览器内调用 validateWebhookUrl
 * 链路），因此不使用 node:net 等 Node 内置模块；IP 字面量判定由下方本地纯函数承担，
 * 与 node:net 的 isIP 在分派语义上等价（无法判定时同样 fail-closed 拒绝）。
 */

/** IPv4 点分字面量判定（node:net isIP=4 的本地纯函数等价物） */
function isIpv4Literal(ip: string): boolean {
  const parts = ip.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

/** IP 字面量（v4 或 v6 候选）判定：域名不可能含冒号（URL hostname 中冒号仅为 IPv6 分隔符） */
function isIpLiteral(ip: string): boolean {
  return isIpv4Literal(ip) || ip.includes(':');
}

/** 允许的协议白名单 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** 危险主机名精确匹配（小写） */
const BLOCKED_HOSTNAMES = new Set(['localhost']);

/** 危险主机名后缀（小写） */
const BLOCKED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.localdomain',
  '.home.arpa',
];

export type UrlGuardResult = { ok: true; url: URL; hostname: string } | { ok: false; reason: string };

/**
 * 校验 URL 字面量：协议白名单 + 危险主机名 + 内网 IP 字面量。
 * 不做 DNS 解析（域名是否指向内网由连接阶段的 lookup 校验负责）。
 */
export function validateUrlLiteral(raw: string): UrlGuardResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { ok: false, reason: '网址为空' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: '网址格式不正确' };
  }

  if (!ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { ok: false, reason: '仅支持 http/https 协议的网址' };
  }

  const hostname = url.hostname.toLowerCase();
  if (!hostname) {
    return { ok: false, reason: '网址缺少主机名' };
  }

  if (
    BLOCKED_HOSTNAMES.has(hostname) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return { ok: false, reason: '该地址不允许访问' };
  }

  // URL.hostname 对 IPv6 字面量保留方括号，判定前剥离
  const bare = hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(bare) && isBlockedIp(bare)) {
    return { ok: false, reason: '该地址不允许访问' };
  }

  return { ok: true, url, hostname };
}

/** 判定 IP（v4/v6）是否落在禁止段；无法解析时 fail-closed 拒绝 */
export function isBlockedIp(ip: string): boolean {
  // 与 node:net isIP 的版本分派语义等价：v4 字面量走 v4 判定；
  // 含冒号者按 v6 候选处理（expandIpv6 严格解析，非法即 fail-closed）；
  // 其余无法判定的输入一律拒绝
  if (isIpv4Literal(ip)) return isBlockedIpv4(ip);
  if (ip.includes(':')) return isBlockedIpv6(ip);
  return true;
}

/** 一条 DNS 解析结果（只取判定所需字段，便于表驱动构造） */
export interface ResolvedAddress {
  address: string;
  family?: number;
}

export type AddressGuardResult =
  | { ok: true; addresses: ResolvedAddress[] }
  | { ok: false; reason: string };

/**
 * DNS 解析结果的放行判定 —— 重绑定防护的判定核心。
 *
 * 由连接阶段的 `guardedLookup`（guarded-lookup.ts）调用：解析出的**每一个** IP 都必须落在公网，
 * 任一条命中禁止段即整次拒绝 —— 不给攻击者留「其中一个是公网 IP 就放行」的缝隙。
 * 空解析结果同样 fail-closed。
 *
 * 纯函数、无网络 IO，因此可被表驱动单测完整覆盖（含混入内网 IP 的解析结果）。
 */
export function guardResolvedAddresses(addresses: ResolvedAddress[]): AddressGuardResult {
  if (addresses.length === 0) {
    return { ok: false, reason: '域名无法解析，请检查网址是否正确' };
  }
  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      return { ok: false, reason: '该地址不允许访问' };
    }
  }
  return { ok: true, addresses };
}

/** 内网 / 保留 IPv4 段判定 */
function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10（CGNAT）
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16（含云元数据服务）
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // 224.0.0.0/4 组播 + 240.0.0.0/4 保留 + 广播
  return false;
}

/** 内网 / 保留 IPv6 段判定（含 IPv4-mapped 绕过防护） */
function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();

  // ::ffff:a.b.c.d —— IPv4-mapped，剥离后按 IPv4 规则判定（防绕过）
  const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isBlockedIpv4(mappedDotted[1]);

  const groups = expandIpv6(lower);
  if (!groups) return true; // 无法解析 → fail-closed

  // ::ffff:xxxx:xxxx —— IPv4-mapped 的十六进制写法
  if (
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff
  ) {
    const v4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return isBlockedIpv4(v4);
  }

  // :: 未指定地址
  if (groups.every((g) => g === 0)) return true;
  // ::1 回环
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true;

  // ::/96（IPv4-compatible，如 ::127.0.0.1 = ::7f00:1）：前 6 组全 0。
  // 已废弃但部分栈仍接受；注意 mapped（::ffff:）已在上面单独处理，不会走到这里
  if (groups.slice(0, 6).every((g) => g === 0)) return true;

  // NAT64 前缀 64:ff9b::/96（well-known）与 64:ff9b:1::/48（local-use）：
  // IPv6-only + DNS64 集群里网关会把地址内嵌的 IPv4 翻译出来——可借此绕过全部 IPv4 判定
  if (groups[0] === 0x64 && groups[1] === 0xff9b) return true;
  // 6to4 隧道 2002::/16 / Teredo 隧道 2001:0000::/32：地址内嵌 IPv4，同属转换绕过面
  if (groups[0] === 0x2002) return true;
  if (groups[0] === 0x2001 && groups[1] === 0) return true;

  const top = groups[0];
  if ((top & 0xfe00) === 0xfc00) return true; // fc00::/7 唯一本地地址
  if ((top & 0xffc0) === 0xfe80) return true; // fe80::/10 链路本地
  return false;
}

/** 将 IPv6 字面量展开为 8 组 16 位数值；非法返回 null */
function expandIpv6(ip: string): number[] | null {
  let s = ip;

  // 嵌入的 IPv4 尾巴（如 2001:db8::1.2.3.4）→ 折算为两组十六进制
  const lastColon = s.lastIndexOf(':');
  if (lastColon === -1) return null;
  const tail = s.slice(lastColon + 1);
  if (tail.includes('.')) {
    const v4 = tail.split('.').map(Number);
    if (v4.length !== 4 || v4.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    s = `${s.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;

  const parseGroups = (part: string): number[] =>
    part ? part.split(':').map((g) => (g === '' ? NaN : parseInt(g, 16))) : [];

  const head = parseGroups(halves[0] ?? '');
  const tailGroups = halves.length === 2 ? parseGroups(halves[1] ?? '') : [];

  const isValidGroup = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffff;

  if (halves.length === 1) {
    return head.length === 8 && head.every(isValidGroup) ? head : null;
  }

  const missing = 8 - head.length - tailGroups.length;
  if (missing < 0) return null;
  const all = [...head, ...Array<number>(missing).fill(0), ...tailGroups];
  return all.length === 8 && all.every(isValidGroup) ? all : null;
}
