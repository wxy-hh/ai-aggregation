/**
 * MCP 受控出站 Fetch 表驱动测试（工单 01 / ADR-0064 §6）
 *
 * 覆盖的外部可观察行为：
 * - HTTPS-only 与私网/回环/云元数据字面量拦截；
 * - 连接级 DNS 防护（防重绑定 TOCTOU）；
 * - 任意 3xx（含同源）一律拒绝跟随；
 * - 响应体按字节累计上限；
 * - AbortSignal 中止在途请求；
 * - 注入点可替换：测试用受控 DNS 与传输替身，避免真实外网。
 */

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  createMcpControlledFetch,
  MCP_MAX_RESPONSE_BYTES,
  McpOutboundError,
  type McpFetchDeps,
} from '../controlled-fetch';
import { validateMcpServerUrl } from '@/schemas/mcp-server.schema';

/** 受控 DNS 解析替身：把任意主机名解析到测试指定地址 */
function createDeps(
  overrides: Partial<McpFetchDeps> & { resolvedAddress?: string } = {}
): McpFetchDeps {
  const { resolvedAddress = '93.184.216.34', ...rest } = overrides;
  return {
    lookup: (_hostname: string, _options: unknown, callback: never) => {
      (callback as unknown as (e: null, a: unknown) => void)(
        null,
        [{ address: resolvedAddress, family: 4 }]
      );
    },
    requestImpl: vi.fn((_options, callback) => {
      callback(createFakeResponse({}));
      return { destroy: () => {} };
    }),
    ...rest,
  } as unknown as McpFetchDeps;
}


/** 构造一个可立即回放的受控响应（模拟 HTTP 响应体流） */
function createFakeResponse(options: {
  statusCode?: number;
  body?: Buffer;
  headers?: Record<string, string>;
}) {
  const body = options.body ?? Buffer.from('');
  const handlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const res = {
    statusCode: options.statusCode ?? 200,
    headers: options.headers ?? {},
    on(event: string, handler: (...args: unknown[]) => void) {
      const list = handlers.get(event) ?? [];
      list.push(handler);
      handlers.set(event, list);
      return res;
    },
  };
  // 宏任务触发 data/end，确保调用方已挂好监听
  setTimeout(() => {
    for (const handler of handlers.get('data') ?? []) handler(body);
    for (const handler of handlers.get('end') ?? []) handler();
  });
  return res;
}

describe('MCP 受控出站 Fetch', () => {
  it('拒绝 http 协议的目标地址', async () => {
    const fetchImpl = createMcpControlledFetch(createDeps());

    await expect(fetchImpl('http://example.com/mcp')).rejects.toThrow(
      /仅支持 https/i
    );
  });

  it('拒绝指向回环地址的目标', async () => {
    const fetchImpl = createMcpControlledFetch(createDeps());

    await expect(fetchImpl('https://127.0.0.1/mcp')).rejects.toThrow(
      /内部私有网络/i
    );
  });

  it('拒绝指向云元数据地址的目标', async () => {
    const fetchImpl = createMcpControlledFetch(createDeps());

    await expect(fetchImpl('https://169.254.169.254/mcp')).rejects.toThrow(
      /内部私有网络/i
    );
  });

  it('连接时发现域名解析到私网地址则拒绝建连', async () => {
    const requestImpl = vi.fn();
    const fetchImpl = createMcpControlledFetch(
      createDeps({ resolvedAddress: '10.0.0.5', requestImpl })
    );

    await expect(fetchImpl('https://internal.example.com/mcp')).rejects.toThrow(
      /解析指向内部私网/i
    );
    expect(requestImpl).not.toHaveBeenCalled();
  });

  it('目标返回重定向时拒绝跟随且不发起第二跳（含同源与跨源 302）', async () => {
    const requestImplSame = vi.fn((_options, callback) => {
      callback(createFakeResponse({ statusCode: 302, headers: { location: '/moved' } }));
      return { destroy: () => {} };
    });
    const fetchSame = createMcpControlledFetch(createDeps({ requestImpl: requestImplSame }));

    await expect(
      fetchSame('https://example.com/mcp', { method: 'POST' })
    ).rejects.toThrow(/重定向/i);
    expect(requestImplSame).toHaveBeenCalledTimes(1);

    const requestImplCross = vi.fn((_options, callback) => {
      callback(
        createFakeResponse({ statusCode: 302, headers: { location: 'https://evil.example.org/steal' } })
      );
      return { destroy: () => {} };
    });
    const fetchCross = createMcpControlledFetch(createDeps({ requestImpl: requestImplCross }));

    await expect(
      fetchCross('https://example.com/mcp', { method: 'POST' })
    ).rejects.toThrow(/重定向/i);
    expect(requestImplCross).toHaveBeenCalledTimes(1);
  });

  it('DNS 重绑定防护：第一次公网、第二次解析到 127.0.0.1 时拒绝建连且不发起出站（TC14-1）', async () => {
    let resolveCount = 0;
    const requestImpl = vi.fn((_options, callback) => {
      callback(createFakeResponse({ statusCode: 200 }));
      return { destroy: () => {} };
    });
    const fetchImpl = createMcpControlledFetch({
      lookup: (_hostname, _options, callback) => {
        resolveCount += 1;
        const addr = resolveCount === 1 ? '93.184.216.34' : '127.0.0.1';
        callback(null, [{ address: addr, family: 4 }]);
      },
      requestImpl,
    });

    const okRes = await fetchImpl('https://rebind.example.com/mcp');
    expect(okRes.status).toBe(200);
    expect(requestImpl).toHaveBeenCalledTimes(1);

    await expect(fetchImpl('https://rebind.example.com/mcp')).rejects.toThrow(/内部私网/i);
    expect(requestImpl).toHaveBeenCalledTimes(1);
  });

  it('响应体恰为 200KB 放行，200,001+ 边界（204,801 字节）立即终止并标超限（TC14-5）', async () => {
    const fetchExact = createMcpControlledFetch(
      createDeps({
        requestImpl: vi.fn((_options, callback) => {
          callback(createFakeResponse({ body: Buffer.alloc(MCP_MAX_RESPONSE_BYTES, 0x61) }));
          return { destroy: () => {} };
        }),
      })
    );
    const exactRes = await fetchExact('https://example.com/mcp', { method: 'POST' });
    expect((await exactRes.text()).length).toBe(MCP_MAX_RESPONSE_BYTES);

    const fetchOver = createMcpControlledFetch(
      createDeps({
        requestImpl: vi.fn((_options, callback) => {
          callback(createFakeResponse({ body: Buffer.alloc(MCP_MAX_RESPONSE_BYTES + 1, 0x61) }));
          return { destroy: () => {} };
        }),
      })
    );
    const overRes = await fetchOver('https://example.com/mcp', { method: 'POST' });
    await expect(overRes.text()).rejects.toThrow(/上限/);
  });

  it('响应体超过字节上限时被终止并标记超限', async () => {
    const requestImpl = vi.fn((_options, callback) => {
      callback(createFakeResponse({ body: Buffer.alloc(64, 0x61) }));
      return { destroy: () => {} };
    });
    const fetchImpl = createMcpControlledFetch(createDeps({ requestImpl }));

    const response = await fetchImpl('https://example.com/mcp', {
      method: 'POST',
      maxResponseBytes: 16,
    });

    // 超限时流以错误结束：读取时抛出可识别的超限错误
    await expect(response.text()).rejects.toThrow(/上限/);
  });

  it('默认响应体上限为 200KB', () => {
    expect(MCP_MAX_RESPONSE_BYTES).toBe(200 * 1024);
  });

  it('外部中止信号触发后请求被中止并返回取消原因', async () => {
    const controller = new AbortController();
    const requestImpl = vi.fn();
    const fetchImpl = createMcpControlledFetch(createDeps({ requestImpl }));

    const pending = fetchImpl('https://example.com/mcp', {
      method: 'POST',
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toThrow(/取消/);
  });

  it('出站错误统一为可读中文错误并带稳定错误码', async () => {
    const fetchImpl = createMcpControlledFetch(
      createDeps({
        lookup: (_hostname, _options, callback) => {
          callback(new Error('ENOTFOUND'), []);
        },
      })
    );

    const error = await fetchImpl('https://example.com/mcp').catch((e) => e);

    expect(error).toBeInstanceOf(McpOutboundError);
    expect((error as McpOutboundError).code).toBe('MCP_OUTBOUND_BLOCKED');
  });

  it('响应体以流式方式可读，SSE 长连接不被提前截断', async () => {
    const requestImpl = vi.fn((_options, callback) => {
      callback(createFakeResponse({ body: Buffer.from('event: message\ndata: {}\n\n') }));
      return { destroy: () => {} };
    });
    const fetchImpl = createMcpControlledFetch(createDeps({ requestImpl }));

    const response = await fetchImpl('https://example.com/mcp', { method: 'POST' });

    expect(response.headers.get('content-type')).toBeNull();
    const text = await response.text();
    expect(text).toContain('event: message');
  });

  describe('非生产 QA 受控 HTTPS 靶场白名单', () => {
    const origTarget = process.env.MCP_QA_ALLOWED_TARGET;
    const origCaPath = process.env.MCP_QA_CA_PATH;
    const env = process.env as Record<string, string | undefined>;
    const origNodeEnv = env.NODE_ENV;
    let tempDir: string | null = null;

    afterEach(() => {
      env.NODE_ENV = origNodeEnv;
      if (origTarget === undefined) delete process.env.MCP_QA_ALLOWED_TARGET;
      else process.env.MCP_QA_ALLOWED_TARGET = origTarget;
      if (origCaPath === undefined) delete process.env.MCP_QA_CA_PATH;
      else process.env.MCP_QA_CA_PATH = origCaPath;
      if (tempDir) {
        rmSync(tempDir, { recursive: true, force: true });
        tempDir = null;
      }
    });

    it('非生产环境下仅放行精确匹配的 https 靶场并透传 CA，其它私网与 http 仍被拒绝', async () => {
      tempDir = mkdtempSync(path.join(tmpdir(), 'mcp-qa-ca-'));
      const caFile = path.join(tempDir, 'qa-ca.pem');
      writeFileSync(caFile, 'FAKE-QA-CA-CERT', 'utf8');

      env.NODE_ENV = 'test';
      process.env.MCP_QA_ALLOWED_TARGET = '127.0.0.1:41999';
      process.env.MCP_QA_CA_PATH = caFile;

      expect(validateMcpServerUrl('https://127.0.0.1:41999/mcp')).toEqual({ ok: true });
      expect(validateMcpServerUrl('http://127.0.0.1:41999/mcp').ok).toBe(false);
      expect(validateMcpServerUrl('https://127.0.0.1:42000/mcp').ok).toBe(false);
      expect(validateMcpServerUrl('http://192.168.1.1/mcp').ok).toBe(false);

      const requestImpl = vi.fn((_options, callback) => {
        callback(createFakeResponse({ body: Buffer.from('{}') }));
        return { destroy: () => {} };
      });
      const fetchImpl = createMcpControlledFetch({ requestImpl });
      await fetchImpl('https://127.0.0.1:41999/mcp', { method: 'POST' });

      expect(requestImpl).toHaveBeenCalledTimes(1);
      expect(requestImpl.mock.calls[0]?.[0]?.ca).toBe('FAKE-QA-CA-CERT');
      await expect(fetchImpl('https://127.0.0.1:42000/mcp')).rejects.toThrow(/内部私有网络/);
    });

    it('生产环境无条件忽略 MCP_QA_ALLOWED_TARGET 与 MCP_QA_CA_PATH', async () => {
      env.NODE_ENV = 'production';
      process.env.MCP_QA_ALLOWED_TARGET = '127.0.0.1:41999';

      expect(validateMcpServerUrl('https://127.0.0.1:41999/mcp').ok).toBe(false);
      const requestImpl = vi.fn();
      const fetchImpl = createMcpControlledFetch({ requestImpl });
      await expect(fetchImpl('https://127.0.0.1:41999/mcp')).rejects.toThrow(/内部私有网络/);
      expect(requestImpl).not.toHaveBeenCalled();
    });
  });
});
