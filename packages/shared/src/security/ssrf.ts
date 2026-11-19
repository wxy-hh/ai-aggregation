/**
 * SSRF 安全防线与安全出站网络客户端 (ADR-0028)
 *
 * 服务端 Node.js 专用模块，包含受控 Socket lookup 与 HTTP 请求客户端。
 */

import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { lookup as dnsLookup } from 'node:dns';
import type { ClientRequestArgs } from 'node:http';
import {
  validateUrlLiteral,
  guardResolvedAddresses,
  SsrfSecurityError,
} from './url-guard';

export * from './url-guard';

/** 连接超时（毫秒） */
export const SSRF_CONNECT_TIMEOUT_MS = 5_000;
/** 请求总超时（毫秒） */
export const SSRF_TOTAL_TIMEOUT_MS = 15_000;
/** 响应体最大截断上限（2MB） */
export const SSRF_MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
/** 最大重定向跳数 */
export const SSRF_MAX_REDIRECTS = 5;

/** 伪装真实 Chrome 桌面标头 */
export const BROWSER_FETCH_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,application/json,text/plain;q=0.8,*/*;q=0.5',
  'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Upgrade-Insecure-Requests': '1',
};

/** Node 原生 ClientRequestArgs 的安全 lookup 回调 */
export const guardedLookup = ((
  hostname: string,
  options: unknown,
  callback: (...args: unknown[]) => void
) => {
  const opts = (typeof options === 'number' ? { family: options } : (options ?? {})) as {
    all?: boolean;
    family?: number;
  };
  dnsLookup(hostname, { ...opts, all: true }, (err, addresses) => {
    if (err) {
      callback(err);
      return;
    }
    const list = Array.isArray(addresses) ? addresses : [addresses];
    const guard = guardResolvedAddresses(list);
    if (!guard.ok) {
      callback(new SsrfSecurityError(guard.reason));
      return;
    }
    if (opts.all) {
      callback(null, guard.addresses);
    } else {
      callback(null, guard.addresses[0].address, guard.addresses[0].family);
    }
  });
}) as unknown as ClientRequestArgs['lookup'];

export interface GuardedFetchResponse {
  status: number;
  finalUrl: string;
  contentType: string;
  text: string;
  buffer: Buffer;
  isTruncated: boolean;
}

interface RawResponse {
  status: number;
  location?: string;
  contentType: string;
  body: Buffer;
  isTruncated: boolean;
}

function requestOnce(target: URL, signal?: AbortSignal): Promise<RawResponse> {
  return new Promise<RawResponse>((resolve, reject) => {
    const isHttps = target.protocol === 'https:';
    const requestFn = isHttps ? httpsRequest : httpRequest;

    const req = requestFn(
      {
        protocol: target.protocol,
        hostname: target.hostname.replace(/^\[|\]$/g, ''),
        port: target.port || (isHttps ? 443 : 80),
        path: `${target.pathname}${target.search}`,
        method: 'GET',
        headers: BROWSER_FETCH_HEADERS,
        lookup: guardedLookup,
        timeout: SSRF_CONNECT_TIMEOUT_MS,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume();
          resolve({
            status,
            location: res.headers.location,
            contentType: '',
            body: Buffer.alloc(0),
            isTruncated: false,
          });
          return;
        }

        const chunks: Buffer[] = [];
        let total = 0;
        let reachedMax = false;

        res.on('data', (chunk: Buffer) => {
          if (reachedMax) return;
          total += chunk.length;
          chunks.push(chunk);

          if (total >= SSRF_MAX_RESPONSE_BYTES) {
            reachedMax = true;
            req.destroy();
            resolve({
              status,
              contentType: res.headers['content-type'] ?? '',
              body: Buffer.concat(chunks).subarray(0, SSRF_MAX_RESPONSE_BYTES),
              isTruncated: true,
            });
          }
        });

        res.on('end', () => {
          if (!reachedMax) {
            resolve({
              status,
              contentType: res.headers['content-type'] ?? '',
              body: Buffer.concat(chunks),
              isTruncated: false,
            });
          }
        });

        res.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('连接目标站点超时'));
    });

    req.on('error', reject);

    if (signal) {
      if (signal.aborted) {
        req.destroy();
        reject(new Error('请求已被取消'));
        return;
      }
      signal.addEventListener('abort', () => {
        req.destroy();
        reject(new Error('请求已被取消'));
      });
    }

    req.end();
  });
}

/**
 * 安全的出站网络获取客户端 (GuardedWebFetch)
 * 具备连接级 DNS 锁定与逐跳重定向复核
 */
export async function guardedFetch(
  rawUrl: string,
  options: { signal?: AbortSignal; maxRedirects?: number } = {}
): Promise<GuardedFetchResponse> {
  const maxRedirects = options.maxRedirects ?? SSRF_MAX_REDIRECTS;
  let currentTarget = rawUrl;
  let redirectsRemaining = maxRedirects;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, SSRF_TOTAL_TIMEOUT_MS);

  if (options.signal) {
    options.signal.addEventListener('abort', () => controller.abort());
  }

  try {
    while (true) {
      const guard = validateUrlLiteral(currentTarget);
      if (!guard.ok) {
        throw new SsrfSecurityError(guard.reason);
      }

      const res = await requestOnce(guard.url, controller.signal);

      // 重定向逐跳重新走完整校验
      if (res.status >= 300 && res.status < 400 && res.location) {
        if (redirectsRemaining <= 0) {
          throw new SsrfSecurityError('重定向次数过多，已终止请求');
        }
        redirectsRemaining -= 1;
        currentTarget = new URL(res.location, guard.url).toString();
        continue;
      }

      return {
        status: res.status,
        finalUrl: guard.url.toString(),
        contentType: res.contentType,
        text: res.body.toString('utf8'),
        buffer: res.body,
        isTruncated: res.isTruncated,
      };
    }
  } finally {
    clearTimeout(timeoutId);
  }
}
