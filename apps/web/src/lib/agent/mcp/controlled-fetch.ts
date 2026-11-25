/**
 * MCP 专用受控出站 Fetch（工单 01 / ADR-0064 §6）
 *
 * 为什么不能直接复用 `guardedFetch`：
 * - `guardedFetch` 是 GET/缓冲式网页抓取器，语义与 MCP 所需的 POST/流式请求不同；
 * - MCP 传输层要求可注入的 `fetch` 实现，且每个请求分支（含 GET SSE）都必须受控。
 *
 * 本模块提供的受控 Fetch 保证：
 * 1. HTTPS-only（静态鉴权头与工具参数不得走明文）；
 * 2. 字面量校验拦截私网/回环/云元数据地址；
 * 3. 连接级 DNS 锁定（防重绑定 TOCTOU）：校验的 IP 与连接的 IP 同源；
 * 4. 任意 3xx（含同源）一律失败关闭，不跟随重定向；
 * 5. 响应体按字节累计上限，超限即终止连接；
 * 6. `AbortSignal` 全程贯通，中止在途请求；
 * 7. 返回**标准 Response 且保持流式可读**——MCP 的 GET SSE 分支依赖持续读取，
 *    若在此处缓冲成完整 Buffer，长连接会被提前截断。
 *
 * 受控测试服务（平台自建）通过 `allowedPrivateTargets` 显式放行私网地址，
 * 并可在测试中开启 `allowInsecureHttp` 降级为明文 HTTP（**仅测试**）。
 * 生产路径不设置这些字段，因此用户配置的私网地址与 http 地址仍被无条件拒绝。
 */

import { readFileSync } from 'node:fs';
import { request as httpRequest, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import { validateUrlLiteral, isBlockedIp, SsrfSecurityError } from '@repo/shared/server';
import { isQaAllowedHttpsTarget } from './contracts';

/** 响应体最大累计字节数（200KB） */
export const MCP_MAX_RESPONSE_BYTES = 200 * 1024;

/** 单次连接超时（毫秒） */
export const MCP_CONNECT_TIMEOUT_MS = 5_000;

/** 出站错误码（稳定，供上层分类与审计使用） */
export type McpOutboundErrorCode =
  | 'MCP_OUTBOUND_BLOCKED'
  | 'MCP_OUTBOUND_TOO_LARGE'
  | 'MCP_OUTBOUND_ABORTED'
  | 'MCP_OUTBOUND_FAILED';

/** 受控出站统一错误：文案面向用户与模型，原始原因只进服务端日志 */
export class McpOutboundError extends Error {
  readonly code: McpOutboundErrorCode;

  constructor(code: McpOutboundErrorCode, message: string) {
    super(message);
    this.name = 'McpOutboundError';
    this.code = code;
  }
}

/** DNS 解析回调签名（与 Node `lookup` 一致：all 模式下第二参为地址数组） */
type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | Array<{ address: string; family: number }>,
  family?: number
) => void;

/** 受控 Fetch 的可注入依赖：测试用替身，生产走真实 DNS 与 http/https */
export interface McpFetchDeps {
  /** DNS 解析（默认使用 Node dns.lookup，解析结果逐个过私网判定） */
  lookup?: (
    hostname: string,
    options: unknown,
    callback: LookupCallback
  ) => void;
  /** 实际发请求的实现（默认 Node http/https request） */
  requestImpl?: (
    options: {
      protocol: string;
      hostname: string;
      port: number;
      path: string;
      method: string;
      headers: Record<string, string>;
      /** 请求体（JSON-RPC 报文） */
      body?: string;
      signal?: AbortSignal;
      /** 请求前已校验的连接地址（连接级锁定用） */
      pinnedAddress?: { address: string; family: number };
    },
    callback: (res: McpRawResponse) => void,
    onError?: (error: unknown) => void
  ) => { destroy: () => void };
  /**
   * 受控目标白名单（仅平台自建受控测试服务使用）。
   *
   * 形如 `127.0.0.1:8443`：命中时**仅跳过私网地址判定**，HTTPS、禁重定向、
   * 字节上限与 Abort 仍照常生效。生产路径不设置此字段，因此用户配置的
   * 任何私网地址仍然被无条件拒绝。
   */
  allowedPrivateTargets?: string[];
  /**
   * 允许明文 HTTP（**仅测试降级**，默认关闭）。
   *
   * 只允许与 `allowedPrivateTargets` 中列出的受控目标一起使用；生产路径
   * 不设置该字段，因此平台出站仍是 HTTPS-only。
   */
  allowInsecureHttp?: boolean;
  /**
   * 受控测试证书 CA（仅测试环境与 `allowedPrivateTargets` 共同使用时生效；
   * 证书校验保持开启，仅追加受信 CA，不禁用 rejectUnauthorized）。
   */
  trustedCa?: string;
}

interface McpRawResponse {
  statusCode?: number;
  headers: Record<string, string | string[] | undefined>;
  on: (event: string, handler: (...args: unknown[]) => void) => void;
  destroy?: () => void;
}

export interface McpControlledRequestInit {
  method?: string;
  headers?: Record<string, string>;
  /** 请求体（JSON-RPC 报文） */
  body?: string;
  signal?: AbortSignal;
  /** 单次请求的响应体字节上限，缺省 200KB */
  maxResponseBytes?: number;
}

/** 受控 Fetch 的调用签名：与 SDK `FetchLike` 一致，返回标准 Response */
export type McpControlledFetch = (
  input: string | URL,
  init?: McpControlledRequestInit
) => Promise<Response>;

/** 默认 DNS 解析：解析后逐个地址做私网判定，命中即失败关闭 */
function defaultLookup(
  hostname: string,
  options: unknown,
  callback: LookupCallback
): void {
  dnsLookup(hostname, { all: true }, (err, addresses) => {
    if (err) {
      callback(err, []);
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [addresses];
    for (const entry of list) {
      if (isBlockedIp(entry.address)) {
        callback(
          new SsrfSecurityError('该地址解析指向内部私网，不允许访问'),
          []
        );
        return;
      }
    }
    // `all: true` 时回调只接受 (err, addresses)
    callback(null, list);
  });
}

/** 默认请求实现：Node 原生 http/https，禁重定向，连接级 DNS 锁定 */
function defaultRequestImpl(
  options: {
    protocol: string;
    hostname: string;
    port: number;
    path: string;
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    /** 请求前已校验的连接地址（连接级锁定用） */
    pinnedAddress?: { address: string; family: number };
    /** 受控测试服务 CA 证书 */
    ca?: string;
  },
  callback: (res: McpRawResponse) => void,
  onError?: (error: unknown) => void
): { destroy: () => void } {
  const isHttps = options.protocol === 'https:';
  const requestFn = isHttps ? httpsRequest : httpRequest;

  const req = requestFn(
    {
      protocol: options.protocol,
      hostname: options.hostname,
      port: options.port,
      path: options.path,
      method: options.method,
      headers: options.headers,
      ...(isHttps && options.ca ? { ca: options.ca } : {}),
      timeout: MCP_CONNECT_TIMEOUT_MS,
      // 受控目标：把平台自建受控证书加入本次连接的受信任 CA。
      // 证书校验保持开启（不关闭 rejectUnauthorized），因此只信任这一张证书，
      // 生产路径不设置该参数时，外部服务仍必须通过公共 CA 校验。
      // 连接级 DNS 锁定：直接固定到请求前已校验的地址，杜绝 TOCTOU 重绑定。
      // 私网判定已在受控 Fetch 层完成，此处不再重复判定（否则受控白名单目标会被误杀）。
      lookup: ((
        _hostname: string,
        _lookupOptions: unknown,
        lookupCallback: LookupCallback
      ) => {
        const pinned = options.pinnedAddress;
        if (!pinned) {
          lookupCallback(new Error('受控出站缺少已校验的连接地址'), []);
          return;
        }
        lookupCallback(null, pinned.address, pinned.family);
      }) as unknown as RequestOptions['lookup'],
    },
    (res) => callback(res as unknown as McpRawResponse)
  );

  // 必须监听 req error 与 timeout：销毁超大响应流/中断连接会触发 ECONNRESET (socket hang up)，
  // 若无监听会演变为未捕获异常导致进程崩溃
  req.on('error', (error) => {
    onError?.(error);
  });
  req.on('timeout', () => {
    req.destroy(new McpOutboundError('MCP_OUTBOUND_FAILED', '连接 MCP 服务超时'));
  });

  if (options.body !== undefined) req.write(options.body);
  req.end();

  return { destroy: () => req.destroy() };
}

/** 判定是否为 IPv4 字面量 */
function isIpv4(address: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(address);
}

/** 判定是否为 IP 字面量（裸 IP 不经 DNS） */
function isIpLiteral(hostname: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname) || hostname.includes(':');
}

/** 提取受控目标键：`host:port`（未显式端口时按协议取默认端口） */
function extractTargetKey(raw: string): string {
  try {
    const url = new URL(raw);
    const port = url.port || (url.protocol === 'https:' ? '443' : '80');
    return `${url.hostname}:${port}`;
  } catch {
    return raw;
  }
}

/** 解析主机名到地址列表（依赖注入点，便于测试替换） */
function resolveAddresses(
  lookup: NonNullable<McpFetchDeps['lookup']>,
  hostname: string
): Promise<string[]> {
  // 裸 IP 字面量不经 DNS：直接作为地址返回
  if (isIpLiteral(hostname)) {
    return Promise.resolve([hostname]);
  }
  return new Promise((resolve) => {
    lookup(hostname, { all: true }, (err, address) => {
      if (err) {
        resolve([]);
        return;
      }
      if (typeof address === 'string') {
        resolve([address]);
        return;
      }
      resolve(address.map((entry) => entry.address));
    });
  });
}

/**
 * 创建 MCP 专用受控 Fetch。
 *
 * @param deps 可注入依赖（测试替身）；缺省走真实 DNS 与 http/https
 */
export function createMcpControlledFetch(deps: McpFetchDeps = {}): McpControlledFetch {
  const lookup = deps.lookup ?? defaultLookup;
  const requestImpl = deps.requestImpl ?? defaultRequestImpl;

  return async function mcpControlledFetch(
    input: string | URL,
    init: McpControlledRequestInit = {}
  ): Promise<Response> {
    const raw = typeof input === 'string' ? input : input.toString();

    const targetKey = extractTargetKey(raw);
    const hasExplicitAllowlist = deps.allowedPrivateTargets !== undefined;
    const qaTargetKey = hasExplicitAllowlist ? null : isQaAllowedHttpsTarget(raw);
    const isAllowedPrivateTarget = hasExplicitAllowlist
      ? (deps.allowedPrivateTargets ?? []).includes(targetKey)
      : qaTargetKey !== null;
    let qaTrustedCa: string | undefined;
    if (qaTargetKey && !deps.trustedCa) {
      const caPath = process.env?.['MCP_QA_CA_PATH']?.trim();
      if (caPath) {
        try {
          qaTrustedCa = readFileSync(caPath, 'utf8');
        } catch {
          throw new McpOutboundError(
            'MCP_OUTBOUND_FAILED',
            '受控 QA 证书文件不可读，请检查 MCP_QA_CA_PATH'
          );
        }
      }
    }

    // 1. 字面量校验：协议白名单、私网/回环/元数据字面量
    const guard = validateUrlLiteral(raw);
    if (!guard.ok && !isAllowedPrivateTarget) {
      throw new McpOutboundError('MCP_OUTBOUND_BLOCKED', guard.reason);
    }

    let target: URL;
    if (guard.ok) {
      target = guard.url;
    } else {
      // 白名单目标：仅放宽私网判定，协议仍必须是 https
      try {
        target = new URL(raw);
      } catch {
        throw new McpOutboundError('MCP_OUTBOUND_BLOCKED', '网址格式不正确');
      }
    }

    const isInsecureHttpTarget =
      target.protocol === 'http:' &&
      deps.allowInsecureHttp === true &&
      isAllowedPrivateTarget;
    if (target.protocol !== 'https:' && !isInsecureHttpTarget) {
      throw new McpOutboundError(
        'MCP_OUTBOUND_BLOCKED',
        'MCP 服务器地址仅支持 https 协议'
      );
    }

    const method = (init.method ?? 'GET').toUpperCase();
    const maxBytes = init.maxResponseBytes ?? MCP_MAX_RESPONSE_BYTES;
    const headers: Record<string, string> = { ...(init.headers ?? {}) };

    if (init.signal?.aborted) {
      throw new McpOutboundError('MCP_OUTBOUND_ABORTED', '请求已被取消');
    }

    // 2. 连接级 DNS 锁定：解析结果逐个过私网判定
    const addresses = await resolveAddresses(lookup, target.hostname);
    if (!addresses.length) {
      throw new McpOutboundError(
        'MCP_OUTBOUND_BLOCKED',
        '域名无法解析，请检查网址是否正确'
      );
    }
    if (!isAllowedPrivateTarget) {
      for (const address of addresses) {
        if (isBlockedIp(address)) {
          throw new McpOutboundError(
            'MCP_OUTBOUND_BLOCKED',
            '该地址解析指向内部私网，不允许访问'
          );
        }
      }
    }

    // 解析过程可能跨越 await，中止可能在此期间触发：补一次检查
    if (init.signal?.aborted) {
      throw new McpOutboundError('MCP_OUTBOUND_ABORTED', '请求已被取消');
    }

    // 3. 发起请求（禁重定向：任何 3xx 都在响应处理处失败关闭）
    const requestOptions = {
      protocol: target.protocol,
      hostname: target.hostname.replace(/^\[|\]$/g, ''),
      port: Number(target.port || (target.protocol === 'http:' ? 80 : 443)),
      path: `${target.pathname}${target.search}`,
      method,
      headers,
      ...(init.body !== undefined ? { body: init.body } : {}),
      ...(init.signal ? { signal: init.signal } : {}),
      pinnedAddress: { address: addresses[0], family: isIpv4(addresses[0]) ? 4 : 6 },
      ...((deps.trustedCa ?? qaTrustedCa) && isAllowedPrivateTarget
        ? { ca: deps.trustedCa ?? qaTrustedCa }
        : {}),
    };

    const rawResponse = await new Promise<McpRawResponse>((resolve, reject) => {
      let settled = false;
      const cleanupPreResponse = () => {
        init.signal?.removeEventListener('abort', onAbort);
      };
      const rejectOnce = (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanupPreResponse();
        reject(error);
      };
      const onAbort = () => {
        handle.destroy();
        rejectOnce(new McpOutboundError('MCP_OUTBOUND_ABORTED', '请求已被取消'));
      };
      const handle = requestImpl(
        requestOptions,
        (res) => {
          if (settled) return;
          settled = true;
          cleanupPreResponse();
          resolve(res);
        },
        (err) => {
          if (settled) return;
          handle.destroy();
          if (init.signal?.aborted) {
            rejectOnce(new McpOutboundError('MCP_OUTBOUND_ABORTED', '请求已被取消'));
          } else if (err instanceof McpOutboundError) {
            rejectOnce(err);
          } else {
            rejectOnce(new McpOutboundError('MCP_OUTBOUND_FAILED', '连接 MCP 服务失败'));
          }
        }
      );
      init.signal?.addEventListener('abort', onAbort, { once: true });
    });

    // 4. 重定向一律失败关闭（同源也不跟随）
    const status = rawResponse.statusCode ?? 0;
    if (status >= 300 && status < 400) {
      rawResponse.destroy?.();
      throw new McpOutboundError(
        'MCP_OUTBOUND_BLOCKED',
        '目标地址返回重定向，已拒绝跟随'
      );
    }

    const responseHeaders: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawResponse.headers ?? {})) {
      if (value === undefined) continue;
      responseHeaders[key.toLowerCase()] = Array.isArray(value)
        ? value.join(', ')
        : String(value);
    }

    // 5. 保持流式可读：把原始响应流转成标准 Response，
    //    同时按字节累计施加上限，超限即终止底层连接。
    let onStreamAbort: (() => void) | null = null;
    const cleanupStreamAbort = () => {
      if (onStreamAbort) {
        init.signal?.removeEventListener('abort', onStreamAbort);
        onStreamAbort = null;
      }
    };

    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        let total = 0;
        let closed = false;
        /** 安全关闭：流可能已被取消或已因超限终止，重复 close 会抛 Invalid state */
        const safeClose = () => {
          if (closed) return;
          closed = true;
          cleanupStreamAbort();
          try {
            controller.close();
          } catch {
            // 已关闭或已出错
          }
        };
        const safeError = (error: unknown) => {
          if (closed) return;
          closed = true;
          cleanupStreamAbort();
          try {
            controller.error(
              error instanceof Error
                ? error
                : new McpOutboundError('MCP_OUTBOUND_FAILED', '出站请求失败')
            );
          } catch {
            // 已关闭
          }
        };

        if (init.signal) {
          onStreamAbort = () => {
            safeError(new McpOutboundError('MCP_OUTBOUND_ABORTED', '请求已被取消'));
            rawResponse.destroy?.();
          };
          if (init.signal.aborted) {
            onStreamAbort();
            return;
          }
          init.signal.addEventListener('abort', onStreamAbort, { once: true });
        }

        rawResponse.on('data', (chunk: unknown) => {
          if (closed) return;
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
          // 累加前判定：本块一旦超限即终止（首块超限同样生效）
          if (total + buffer.length > maxBytes) {
            safeError(
              new McpOutboundError(
                'MCP_OUTBOUND_TOO_LARGE',
                `响应超过 ${maxBytes} 字节上限，已终止`
              )
            );
            rawResponse.destroy?.();
            return;
          }
          total += buffer.length;
          try {
            controller.enqueue(new Uint8Array(buffer));
          } catch {
            // 流已被消费方取消
            closed = true;
            cleanupStreamAbort();
          }
        });
        rawResponse.on('end', () => safeClose());
        rawResponse.on('error', (error: unknown) => safeError(error));
      },
      cancel() {
        cleanupStreamAbort();
        rawResponse.destroy?.();
      },
    });

    return new Response(body, { status, headers: responseHeaders });
  };
}
