/**
 * 传输层 DNS 防重绑定 lookup 回调
 *
 * 本文件位于 lib 层，禁止 import `@/app/**` 下任何模块（分层守卫）。
 */

import { lookup as dnsLookup } from 'node:dns';
import type { ClientRequestArgs } from 'node:http';
import { guardResolvedAddresses } from './url-guard';
import { ToolError } from './tool-error';

/**
 * 带安全校验的 DNS lookup：解析结果全部落在公网才允许连接。
 * 这是防 DNS 重绑定的关键——连接使用的 IP 就是这里校验过的 IP。
 */
export const guardedLookup = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
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
    // 判定收敛在 url-guard 的纯函数里（可表驱动测）；这里只负责把结论翻译成回调
    const guard = guardResolvedAddresses(list);
    if (!guard.ok) {
      callback(new ToolError(guard.reason, 'ADDRESS_BLOCKED'));
      return;
    }
    if (opts.all) {
      callback(null, guard.addresses);
    } else {
      callback(null, guard.addresses[0].address, guard.addresses[0].family);
    }
  });
}) as unknown as ClientRequestArgs['lookup'];
