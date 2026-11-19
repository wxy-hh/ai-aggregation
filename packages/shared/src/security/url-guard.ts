/**
 * SSRF 安全防线 — 纯函数层 (ADR-0028)
 *
 * 本文件保持客户端可打包，不引用任何 Node.js 原生模块（如 node:net, node:http）。
 */

export class SsrfSecurityError extends Error {
  readonly code: string;
  constructor(message: string, code = 'SSRF_BLOCKED') {
    super(message);
    this.name = 'SsrfSecurityError';
    this.code = code;
  }
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

function isIpv4Literal(ip: string): boolean {
  const parts = ip.split('.');
  return (
    parts.length === 4 &&
    parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255)
  );
}

function isIpLiteral(ip: string): boolean {
  return isIpv4Literal(ip) || ip.includes(':');
}

export type UrlGuardResult =
  | { ok: true; url: URL; hostname: string }
  | { ok: false; reason: string };

/**
 * 校验 URL 字面量：协议白名单 + 危险主机名 + 内网 IP 字面量
 */
export function validateUrlLiteral(raw: string): UrlGuardResult {
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  if (!trimmed) {
    return { ok: false, reason: '网址不能为空' };
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
    return { ok: false, reason: '该地址属于内部私有网络，不允许访问' };
  }

  const bare = hostname.replace(/^\[|\]$/g, '');
  if (isIpLiteral(bare) && isBlockedIp(bare)) {
    return { ok: false, reason: '该地址属于内部私有网络，不允许访问' };
  }

  return { ok: true, url, hostname };
}

/** 判定 IP 是否落在私有保留段 */
export function isBlockedIp(ip: string): boolean {
  if (isIpv4Literal(ip)) return isBlockedIpv4(ip);
  if (ip.includes(':')) return isBlockedIpv6(ip);
  return true;
}

function isBlockedIpv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 127) return true; // 127.0.0.0/8
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (云元数据)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a >= 224) return true; // 组播与保留
  return false;
}

function isBlockedIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mappedDotted) return isBlockedIpv4(mappedDotted[1]);

  const groups = expandIpv6(lower);
  if (!groups) return true;

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

  if (groups.every((g) => g === 0)) return true; // ::
  if (groups.slice(0, 7).every((g) => g === 0) && groups[7] === 1) return true; // ::1
  if (groups.slice(0, 6).every((g) => g === 0)) return true; // ::/96

  if (groups[0] === 0x64 && groups[1] === 0xff9b) return true;
  if (groups[0] === 0x2002) return true;
  if (groups[0] === 0x2001 && groups[1] === 0) return true;

  const top = groups[0];
  if ((top & 0xfe00) === 0xfc00) return true; // fc00::/7
  if ((top & 0xffc0) === 0xfe80) return true; // fe80::/10
  return false;
}

function expandIpv6(ip: string): number[] | null {
  let s = ip;
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

export interface ResolvedAddress {
  address: string;
  family?: number;
}

export type AddressGuardResult =
  | { ok: true; addresses: ResolvedAddress[] }
  | { ok: false; reason: string };

/**
 * DNS 解析结果放行判定 —— 防重绑定核心
 */
export function guardResolvedAddresses(addresses: ResolvedAddress[]): AddressGuardResult {
  if (!addresses || addresses.length === 0) {
    return { ok: false, reason: '域名无法解析，请检查网址是否正确' };
  }
  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      return { ok: false, reason: '该地址解析指向内部私网，不允许访问' };
    }
  }
  return { ok: true, addresses };
}
