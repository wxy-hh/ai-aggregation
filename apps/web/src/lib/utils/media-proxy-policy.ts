/**
 * 媒体代理安全策略（纯函数）
 *
 * 代理接口 `/api/image/proxy`、`/api/video/proxy` 保持免登录（公开资源场景），
 * 因此所有安全约束都集中在这里，由 media-proxy.ts 调用：
 * 1. 仅放行白名单内的目标主机；
 * 2. 仅允许 https，http 只对白名单中显式声明的本机地址（本地 MinIO 开发）开放；
 * 3. 内网 / 保留地址一律拒绝，白名单也无法放行；
 * 4. 仅透传图片、视频或二进制流响应类型。
 */

/**
 * 代码内默认白名单：平台生成结果实际会落到的域名。
 *
 * - storage.googleapis.com：Agnes 图像 / 视频生成结果的返回地址
 *   （依据 docs/agnes-image-21-flash使用文档.md 的 `"url": "https://storage.googleapis.com/agnes-aigc/xxx.png"`
 *   与 docs/agnes-video-v20使用文档.md 的 `"remixed_from_video_id": "https://storage.googleapis.com/agnes-aigc/aigc/videos/..."`
 *   返回示例；前端分别经 apps/web/src/lib/api/agnes.ts 与 video/_components/preview-canvas.tsx 走本代理下载）。
 * - agnes-ai.space：Agnes 产物的**当前**返回域名。上游 `response_format: 'url'` 现在返回
 *   `https://platform-outputs.agnes-ai.space/...`（实测响应头为 `x-goog-*` + `server: UploadServer`，
 *   即 GCS 桶挂在该自定义域下）。按供应商根域放行，覆盖其各产品线可能的其他子域；
 *   不写死 `platform-outputs` 子域，避免上游轮换子域后再次 403。
 * - sfile.chatglm.cn：智谱 CogVideoX 异步结果 `video_result[].url` 的资源域名
 *   （apps/web/src/app/api/video/route.ts 调用 https://open.bigmodel.cn/api/paas/v4/async-result 获取，
 *   智谱官方文档与示例中的结果地址均为 sfile.chatglm.cn 下的 testpath/video/*.mp4）。
 *
 * 注意：Kolors 链路已下线（见 apps/web/src/lib/constants/image-generation.ts），故不再列入其 CDN 域名。
 */
export const DEFAULT_ALLOWED_DOMAINS: readonly string[] = [
  'storage.googleapis.com',
  'agnes-ai.space',
  'sfile.chatglm.cn',
];

/** 白名单环境变量名（逗号分隔，追加在默认白名单之后） */
export const ALLOWED_DOMAINS_ENV_KEY = 'MEDIA_PROXY_ALLOWED_DOMAINS';

/** 允许透传的非图片/视频类型 */
const ALLOWED_BINARY_TYPE = 'application/octet-stream';

/** 会被浏览器当作脚本执行的图片类型，直接访问代理地址即构成同源 XSS，必须拒绝 */
const BLOCKED_IMAGE_TYPES = new Set(['image/svg+xml']);

/** 合法的 MIME 类型（不含参数），同时排除响应头注入 */
const MIME_TYPE_PATTERN = /^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/;

export type ProxyRejectionReason =
  | 'missing-url'
  | 'invalid-url'
  | 'unsupported-protocol'
  | 'insecure-protocol'
  | 'credentials-not-allowed'
  | 'private-address'
  | 'ip-not-allowed'
  | 'domain-not-allowed';

/** 目标主机分类：域名 / 本机回环 / 内网与保留 / 其他 IP 字面量 */
export type HostClass = 'domain' | 'loopback' | 'private' | 'ip-literal';

export interface ProxyTargetAllowed {
  allowed: true;
  /** 归一化后的目标地址 */
  url: URL;
  /** 归一化后的主机名（不含端口） */
  host: string;
}

export interface ProxyTargetRejected {
  allowed: false;
  reason: ProxyRejectionReason;
  /** 建议返回给客户端的 HTTP 状态码 */
  status: 400 | 403;
  /** 中文错误文案 */
  message: string;
}

export type ProxyTargetDecision = ProxyTargetAllowed | ProxyTargetRejected;

/** 解析环境变量里的白名单：逗号分隔，去空白、转小写、去重 */
export function parseAllowedDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];

  const entries = raw
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);

  return Array.from(new Set(entries));
}

/** 最终白名单 = 代码内默认白名单 + 环境变量追加项 */
export function resolveAllowedDomains(raw: string | null | undefined): string[] {
  return Array.from(new Set([...DEFAULT_ALLOWED_DOMAINS, ...parseAllowedDomains(raw)]));
}

/**
 * 判断目标地址是否允许代理。
 *
 * @param rawUrl 查询参数中的目标地址
 * @param allowedDomains 白名单条目，形如 `example.com`（含子域名、任意端口）、
 *   `example.com:8443`（限端口）、`localhost:9000` / `127.0.0.1:9000`（本地开发放行 http）
 */
export function resolveProxyTarget(
  rawUrl: string | null | undefined,
  allowedDomains: readonly string[]
): ProxyTargetDecision {
  const value = (rawUrl ?? '').trim();
  if (!value) {
    return { allowed: false, reason: 'missing-url', status: 400, message: '缺少 url 参数' };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      allowed: false,
      reason: 'invalid-url',
      status: 400,
      message: 'url 参数不是合法的绝对地址',
    };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return {
      allowed: false,
      reason: 'unsupported-protocol',
      status: 403,
      message: '仅允许代理 https 资源',
    };
  }

  if (!url.hostname) {
    return {
      allowed: false,
      reason: 'invalid-url',
      status: 400,
      message: 'url 参数缺少主机名',
    };
  }

  // userinfo 是常见的白名单绕过手法（如 https://allowed.com@169.254.169.254/），一律拒绝
  if (url.username || url.password) {
    return {
      allowed: false,
      reason: 'credentials-not-allowed',
      status: 403,
      message: 'url 中不允许携带用户名或密码',
    };
  }

  const host = normalizeHost(url.hostname);
  const hostClass = classifyHost(host);

  if (hostClass === 'private') {
    return {
      allowed: false,
      reason: 'private-address',
      status: 403,
      message: '不允许代理内网或保留地址',
    };
  }

  if (hostClass === 'ip-literal') {
    return {
      allowed: false,
      reason: 'ip-not-allowed',
      status: 403,
      message: '不允许直接代理 IP 地址',
    };
  }

  const effectivePort = url.port || (url.protocol === 'https:' ? '443' : '80');
  if (!isHostAllowed(host, effectivePort, allowedDomains)) {
    return {
      allowed: false,
      reason: 'domain-not-allowed',
      status: 403,
      message: '该地址不在媒体代理白名单内',
    };
  }

  // 本机地址（localhost / 127.0.0.0/8 / ::1）需显式列入白名单才允许 http，用于本地 MinIO 开发
  if (url.protocol === 'http:' && hostClass !== 'loopback') {
    return {
      allowed: false,
      reason: 'insecure-protocol',
      status: 403,
      message: '仅允许代理 https 资源；http 只对白名单中的本机地址开放',
    };
  }

  return { allowed: true, url, host };
}

/** 主机名归一化：小写、去 IPv6 方括号、去 DNS 根点 */
export function normalizeHost(host: string): string {
  let value = host.trim().toLowerCase();
  if (value.startsWith('[') && value.endsWith(']')) {
    value = value.slice(1, -1);
  }
  while (value.endsWith('.')) {
    value = value.slice(0, -1);
  }
  return value;
}

/** 对主机名分类，用于决定放行还是拦截 */
export function classifyHost(host: string): HostClass {
  const value = normalizeHost(host);

  if (value === 'localhost' || value.endsWith('.localhost')) return 'loopback';

  const ipv4 = parseIPv4(value);
  if (ipv4) return classifyIPv4(ipv4);

  const ipv6 = parseIPv6(value);
  if (ipv6) return classifyIPv6(ipv6);

  return 'domain';
}

/** 判断主机（含端口）是否命中白名单 */
export function isHostAllowed(
  host: string,
  effectivePort: string,
  allowedDomains: readonly string[]
): boolean {
  const normalizedHost = normalizeHost(host);

  return allowedDomains.some((domain) => {
    const entry = parseWhitelistEntry(domain);
    if (!entry) return false;

    // 条目声明了端口时，必须与目标实际端口一致（默认端口已归一化为 443/80）
    if (entry.port && entry.port !== effectivePort) return false;

    if (entry.host === normalizedHost) return true;

    // IP 形式的条目只做全等匹配，避免 1.127.0.0.1 命中 127.0.0.1
    if (classifyHost(entry.host) !== 'domain') return false;

    return normalizedHost.endsWith(`.${entry.host}`);
  });
}

interface WhitelistEntry {
  host: string;
  port: string | null;
}

/** 解析白名单条目，支持 `example.com`、`example.com:8443`、`[::1]:9000` */
function parseWhitelistEntry(raw: string): WhitelistEntry | null {
  const entry = raw.trim().toLowerCase();
  if (!entry) return null;

  if (entry.startsWith('[')) {
    const end = entry.indexOf(']');
    if (end === -1) return null;
    const host = normalizeHost(entry.slice(1, end));
    const rest = entry.slice(end + 1);
    if (!rest) return { host, port: null };
    if (!rest.startsWith(':')) return null;
    const port = normalizePort(rest.slice(1));
    return port ? { host, port } : null;
  }

  const colonCount = entry.split(':').length - 1;
  if (colonCount === 0) return { host: normalizeHost(entry), port: null };
  if (colonCount === 1) {
    const [host, portText] = entry.split(':');
    const port = normalizePort(portText);
    if (!host || !port) return null;
    return { host: normalizeHost(host), port };
  }

  // 多个冒号且未加方括号：按 IPv6 字面量处理
  return { host: normalizeHost(entry), port: null };
}

/** 端口归一化：仅接受 1-65535 的数字 */
function normalizePort(raw: string): string | null {
  const value = raw.trim();
  if (!/^\d{1,5}$/.test(value)) return null;
  const port = Number(value);
  if (port < 1 || port > 65535) return null;
  return String(port);
}

/** 解析点分十进制 IPv4，非法返回 null */
function parseIPv4(host: string): number[] | null {
  const parts = host.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    octets.push(value);
  }
  return octets;
}

/** IPv4 分类：回环 / 内网与保留 / 公网字面量 */
function classifyIPv4(octets: number[]): HostClass {
  const [a, b] = octets;

  if (a === 127) return 'loopback';

  const isPrivate =
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 169 && b === 254) || // 169.254.0.0/16（含云元数据 169.254.169.254）
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10（运营商 NAT）
    (a === 192 && b === 0) || // 192.0.0.0/24
    (a === 192 && b === 88) || // 192.88.99.0/24（6to4 中继）
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15（基准测试）
    (a === 198 && b === 51) || // 198.51.100.0/24（文档用）
    (a === 203 && b === 0) || // 203.0.113.0/24（文档用）
    a >= 224; // 224.0.0.0/4 组播与 240.0.0.0/4 保留（含 255.255.255.255）

  return isPrivate ? 'private' : 'ip-literal';
}

/** 解析 IPv6 为 8 组 16 位整数，非法返回 null */
function parseIPv6(host: string): number[] | null {
  if (!host.includes(':')) return null;

  let text = host;

  // 内嵌 IPv4 尾部（如 ::ffff:169.254.169.254）先转成两段十六进制
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const ipv4 = parseIPv4(tail);
    if (!ipv4) return null;
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(':') : [];
  const tailGroups = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : null;

  const groups: number[] = [];
  for (const part of head) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    groups.push(parseInt(part, 16));
  }

  if (tailGroups === null) {
    if (groups.length !== 8) return null;
    return groups;
  }

  const tailValues: number[] = [];
  for (const part of tailGroups) {
    if (!/^[0-9a-f]{1,4}$/.test(part)) return null;
    tailValues.push(parseInt(part, 16));
  }

  const missing = 8 - groups.length - tailValues.length;
  if (missing < 1) return null;

  return [...groups, ...Array.from({ length: missing }, () => 0), ...tailValues];
}

/** IPv6 分类：回环 / 内网与保留 / 公网字面量（含内嵌 IPv4 的过渡形式） */
function classifyIPv6(groups: number[]): HostClass {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;

  const isZeroHead5 = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  const isZeroHead6 = isZeroHead5 && g5 === 0;

  // ::1 回环
  if (isZeroHead6 && g6 === 0 && g7 === 1) return 'loopback';

  // :: 未指定地址
  if (isZeroHead6 && g6 === 0 && g7 === 0) return 'private';

  // ::ffff:0:0/96 IPv4 映射地址、64:ff9b::/96 NAT64 地址：按内嵌 IPv4 判定
  const isNat64 = g0 === 0x0064 && g1 === 0xff9b && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0;
  if ((isZeroHead5 && g5 === 0xffff) || isNat64) {
    return classifyIPv4([g6 >> 8, g6 & 0xff, g7 >> 8, g7 & 0xff]);
  }

  // 2002::/16 6to4：内嵌 IPv4 位于第 2、3 组
  if (g0 === 0x2002) {
    return classifyIPv4([g1 >> 8, g1 & 0xff, g2 >> 8, g2 & 0xff]);
  }

  const isPrivate =
    (g0 & 0xfe00) === 0xfc00 || // fc00::/7 唯一本地地址
    (g0 & 0xffc0) === 0xfe80 || // fe80::/10 链路本地
    (g0 & 0xff00) === 0xff00 || // ff00::/8 组播
    (g0 === 0x2001 && g1 === 0x0db8) || // 2001:db8::/32 文档用
    (g0 === 0x2001 && g1 === 0x0000) || // 2001::/32 Teredo
    (g0 === 0x2001 && g1 === 0x0002) || // 2001:2::/48 基准测试
    (g0 === 0x2001 && g1 >= 0x0010 && g1 <= 0x002f); // 2001:10::/28 与 2001:20::/28（ORCHID）

  return isPrivate ? 'private' : 'ip-literal';
}

export interface ContentTypeDecision {
  allowed: boolean;
  /** 最终写入响应的 Content-Type（拦截时回退到路由默认类型） */
  resolved: string;
  message?: string;
}

/**
 * 判断上游 Content-Type 是否允许透传：
 * 仅放行 image/*（svg 除外）、video/* 与 application/octet-stream；
 * 缺失时回退到路由默认类型（响应头由本服务写入，配合 nosniff 不会被执行）。
 */
export function evaluateContentType(
  contentType: string | null | undefined,
  fallbackMimeType: string
): ContentTypeDecision {
  const mimeType = (contentType ?? '').split(';')[0].trim().toLowerCase();

  if (!mimeType) {
    return { allowed: true, resolved: fallbackMimeType };
  }

  if (!MIME_TYPE_PATTERN.test(mimeType) || BLOCKED_IMAGE_TYPES.has(mimeType)) {
    return {
      allowed: false,
      resolved: fallbackMimeType,
      message: '上游返回的资源类型不允许代理（仅支持图片、视频或二进制流）',
    };
  }

  const allowed =
    mimeType.startsWith('image/') ||
    mimeType.startsWith('video/') ||
    mimeType === ALLOWED_BINARY_TYPE;

  if (!allowed) {
    return {
      allowed: false,
      resolved: fallbackMimeType,
      message: '上游返回的资源类型不允许代理（仅支持图片、视频或二进制流）',
    };
  }

  return { allowed: true, resolved: mimeType };
}
