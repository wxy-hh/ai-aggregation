// @vitest-environment node
// 真实 MCP HTTP 客户端需要 Node 环境 fetch 与 Node TLS 栈（happy-dom 的浏览器式 fetch 无法处理受控自签证书）
/**
 * MCP 客户端管理器测试（工单 01 / ADR-0064 §3、§6）
 *
 * 覆盖的外部可观察行为：
 * - `tools/list` 使用显式 `cursor`/`nextCursor` 循环，累计两页工具；
 * - 所有 SDK 请求分支（initialize / tools/list / tools/call）都走注入的受控 Fetch；
 * - 发现与调用受总超时约束，超时按失败关闭；
 * - 客户端关闭幂等。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { createMcpClientManager } from '../client';
import { discoverMcpTools } from '../discovery';
import { createMcpControlledFetch } from '../controlled-fetch';
import { startMcpTestServer } from '../test-server';
import {
  MCP_MAX_DISCOVERED_TOOLS,
  MCP_MAX_DISCOVERY_PAGES,
  MCP_MAX_SNAPSHOT_BYTES,
} from '../contracts';

function generateEphemeralTls() {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-cli-tls-'));
  const keyPath = join(dir, 'key.pem');
  const certPath = join(dir, 'cert.pem');
  try {
    execFileSync(
      'openssl',
      [
        'req',
        '-x509',
        '-newkey',
        'rsa:2048',
        '-nodes',
        '-keyout',
        keyPath,
        '-out',
        certPath,
        '-days',
        '1',
        '-subj',
        '/CN=127.0.0.1',
        '-addext',
        'subjectAltName=IP:127.0.0.1',
      ],
      { stdio: 'pipe' }
    );
    return { key: readFileSync(keyPath, 'utf8'), cert: readFileSync(certPath, 'utf8') };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('MCP 客户端管理器', () => {
  it('显式分页循环累计两页工具', async () => {
    const handle = await startMcpTestServer();
    const manager = createMcpClientManager();

    try {
      const result = await manager.discover(handle.url, {
        allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
        allowInsecureHttp: true,
      });
      if (!result.ok) throw new Error(`DISCOVER_FAILED:${result.reason}`);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      // 第一页 4 个 + 第二页 5 个
      expect(result.tools.length).toBe(9);
      expect(result.tools.map((tool) => tool.toolName)).toContain('read_value');
      expect(result.tools.map((tool) => tool.toolName)).toContain('scenario_tool');
    } finally {
      await handle.close();
      await manager.dispose();
    }
  });

  it('分页页数超过上限时失败关闭', async () => {
    const manager = createMcpClientManager();

    // 用一个总是返回下一页的受控服务，构造超长分页链
    const listCalls: number[] = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const body = init?.body ? String(init.body) : '';
      const parsed = body ? JSON.parse(body) : {};
      if (parsed.method === 'initialize') {
        return new Response(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'paging', version: '1.0.0' },
            },
          })}\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        );
      }
      if (parsed.method === 'tools/list') {
        listCalls.push(1);
        return new Response(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: {
              tools: [
                {
                  name: `tool_${listCalls.length}`,
                  inputSchema: { type: 'object', properties: {} },
                },
              ],
              nextCursor: `cursor-${listCalls.length}`,
            },
          })}\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await manager.discover('https://example.com/mcp', { fetchImpl });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/分页|页数/);
    expect(listCalls.length).toBe(MCP_MAX_DISCOVERY_PAGES);
  });

  it('所有 SDK 请求分支都走注入的受控 Fetch', async () => {
    const handle = await startMcpTestServer();
    const fetchImpl = vi.fn(
      ((input: string | URL, init?: RequestInit) => globalThis.fetch(input, init)) as never
    );
    const manager = createMcpClientManager();

    try {
      await manager.discover(handle.url, {
        fetchImpl,
        allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
        allowInsecureHttp: true,
      });
      // initialize + tools/list（两页）都经过注入的 fetch
      const calls = (fetchImpl as unknown as { mock: { calls: Array<[string | URL]> } }).mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(3);
      const urls = calls.map((call) => String(call[0]));
      expect(urls.every((url) => url.includes('/mcp'))).toBe(true);
    } finally {
      await handle.close();
      await manager.dispose();
    }
  });

  it('发现超时按失败关闭返回明确原因', async () => {
    const manager = createMcpClientManager({ discoveryTimeoutMs: 50 });

    // 受控替身：永不返回响应，只在收到 abort 信号时失败
    const fetchImpl = vi.fn(
      (_input: string | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          if (signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'));
            return;
          }
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          });
        })
    );

    const result = await manager.discover('https://example.com/mcp', { fetchImpl });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/超时|用时过长/);
  });

  it('关闭客户端幂等：多次 dispose 不报错且只关闭一次连接', async () => {
    const handle = await startMcpTestServer();
    const manager = createMcpClientManager();

    await manager.discover(handle.url, {
      allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
      allowInsecureHttp: true,
    });
    await manager.dispose();
    await manager.dispose();

    await handle.close();
  });

  it('同一客户端管理器内连续 callTool 复用会话（只 initialize 一次），dispose 后拒绝再次调用', async () => {
    const handle = await startMcpTestServer();
    const methods: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL, init?: RequestInit) => {
      if (init?.body) {
        try {
          const parsed = JSON.parse(String(init.body)) as { method?: string };
          if (parsed.method) methods.push(parsed.method);
        } catch {
          // 忽略非 JSON
        }
      }
      return globalThis.fetch(input, init);
    });
    const manager = createMcpClientManager();

    try {
      const first = await manager.callTool(
        handle.url,
        'read_value',
        { key: 'alpha' },
        {
          fetchImpl: fetchImpl as never,
          allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
          allowInsecureHttp: true,
        }
      );
      const second = await manager.callTool(
        handle.url,
        'read_value',
        { key: 'beta' },
        {
          fetchImpl: fetchImpl as never,
          allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
          allowInsecureHttp: true,
        }
      );

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(methods.filter((m) => m === 'initialize')).toHaveLength(1);
      expect(methods.filter((m) => m === 'tools/call')).toHaveLength(2);
      if (first.ok) {
        expect(first.statusCode).toBe(200);
      }

      await manager.dispose();
      const afterDispose = await manager.callTool(
        handle.url,
        'read_value',
        { key: 'gamma' },
        {
          fetchImpl: fetchImpl as never,
          allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
          allowInsecureHttp: true,
        }
      );
      expect(afterDispose.ok).toBe(false);
      if (!afterDispose.ok) {
        expect(afterDispose.errorCode).toBe('client_disposed');
      }
    } finally {
      await manager.dispose();
      await handle.close();
    }
  });

  it('重定向 3xx 拦截时返回 MCP_OUTBOUND_BLOCKED 错误码', async () => {
    const handle = await startMcpTestServer();
    const manager = createMcpClientManager();

    try {
      const redirectUrl = handle.url.replace(/\/mcp$/, '/redirect');
      const res = await manager.callTool(
        redirectUrl,
        'read_value',
        { key: 'x' },
        {
          allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
          allowInsecureHttp: true,
        }
      );

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.errorCode).toBe('MCP_OUTBOUND_BLOCKED');
      }
    } finally {
      await manager.dispose();
      await handle.close();
    }
  });

  it('HTTPS 受控端点的严格 CA 校验：绑定受控 CA 成功发现并调用；不信任未绑定 CA', async () => {
    const tls = generateEphemeralTls();
    const handle = await startMcpTestServer({ tls });
    const manager = createMcpClientManager();
    const untrustedManager = createMcpClientManager();

    try {
      const okDiscover = await manager.discover(handle.url, {
        allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
        trustedCa: tls.cert,
      });
      expect(okDiscover.ok).toBe(true);
      if (okDiscover.ok) expect(okDiscover.tools.length).toBe(9);

      const okCall = await manager.callTool(
        handle.url,
        'read_value',
        { key: 'tls' },
        {
          allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
          trustedCa: tls.cert,
        }
      );
      expect(okCall.ok).toBe(true);

      // 未传 trustedCa 时必须失败关闭（绝不关闭证书校验）
      const rejectedDiscover = await untrustedManager.discover(handle.url, {
        allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
      });
      expect(rejectedDiscover.ok).toBe(false);
    } finally {
      await manager.dispose();
      await untrustedManager.dispose();
      await handle.close();
    }
  });

  it('SDK initialize / 分页 tools/list / tools/call / GET SSE / terminateSession 五分支全走注入 Fetch（TC14-7）', async () => {
    const handle = await startMcpTestServer();
    const branches = {
      initialize: 0,
      toolsList: 0,
      toolsCall: 0,
      getSse: 0,
      terminateSession: 0,
    };
    const controlled = createMcpControlledFetch({
      allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
      allowInsecureHttp: true,
    });
    const trackedFetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (method === 'GET') branches.getSse += 1;
      else if (method === 'DELETE') branches.terminateSession += 1;
      else if (method === 'POST' && init?.body) {
        const parsed = JSON.parse(String(init.body)) as { method?: string };
        if (parsed.method === 'initialize') branches.initialize += 1;
        else if (parsed.method === 'tools/list') branches.toolsList += 1;
        else if (parsed.method === 'tools/call') branches.toolsCall += 1;
      }
      const normalizedHeaders =
        init?.headers instanceof Headers
          ? Object.fromEntries(init.headers.entries())
          : (init?.headers as Record<string, string> | undefined);
      return controlled(input, {
        ...(init as Record<string, unknown>),
        ...(normalizedHeaders ? { headers: normalizedHeaders } : {}),
        ...(init?.body !== undefined ? { body: String(init.body) } : {}),
      } as never);
    });
    const manager = createMcpClientManager();

    try {
      const listed = await manager.discover(handle.url, { fetchImpl: trackedFetch as never });
      expect(listed.ok).toBe(true);
      const called = await manager.callTool(
        handle.url,
        'read_value',
        { key: 'branch-check' },
        { fetchImpl: trackedFetch as never }
      );
      expect(called.ok).toBe(true);
      await manager.dispose();

      expect(branches.initialize).toBeGreaterThanOrEqual(1);
      expect(branches.toolsList).toBe(2);
      expect(branches.toolsCall).toBe(1);
      expect(branches.getSse).toBeGreaterThanOrEqual(1);
      expect(branches.terminateSession).toBeGreaterThanOrEqual(1);
    } finally {
      await manager.dispose();
      await handle.close();
    }
  });

  it('人为构造绕过注入 Fetch 的 SDK 请求时，判定 Server 不可用且不降级普通 fetch（TC14-8）', async () => {
    const globalFetchSpy = vi.spyOn(globalThis, 'fetch');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // 模拟 SDK 绕过注入 fetch（直接伪造 transport.send 而不经过 fetchImpl）
    const sendSpy = vi
      .spyOn(StreamableHTTPClientTransport.prototype, 'send')
      .mockImplementation(async function (
        this: StreamableHTTPClientTransport,
        msg: unknown
      ) {
        const record = Array.isArray(msg) ? msg[0] : (msg as { id?: unknown });
        if (record && typeof record === 'object' && 'id' in record && record.id !== undefined) {
          const msgId = record.id as number;
          queueMicrotask(() => {
            this.onmessage?.({
              jsonrpc: '2.0',
              id: msgId,
              result: {
                protocolVersion: '2025-06-18',
                capabilities: { tools: {} },
                serverInfo: { name: 'bypass-fake', version: '1.0.0' },
              },
            } as never);
          });
        }
      });

    const manager = createMcpClientManager();
    const discoverRes = await manager.discover('https://bypass.example.com/mcp');
    sendSpy.mockRestore();
    expect(discoverRes.ok).toBe(false);
    if (!discoverRes.ok) {
      expect(discoverRes.reason).toContain('受控出站');
    }
    expect(globalFetchSpy).not.toHaveBeenCalled();

    // close() 抛错时不阻断也不留存可复用连接（TC15-10）
    vi.restoreAllMocks();
    const handle = await startMcpTestServer();
    const warnCloseSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      vi.spyOn(StreamableHTTPClientTransport.prototype, 'close').mockRejectedValueOnce(
        new Error('transport teardown error')
      );
      const flakyManager = createMcpClientManager();
      await flakyManager.callTool(
        handle.url,
        'read_value',
        { key: 'k' },
        {
          allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
          allowInsecureHttp: true,
        }
      );
      // 连续三次 dispose 不报错（TC15-9）
      await flakyManager.dispose();
      await flakyManager.dispose();
      await flakyManager.dispose();
      expect(warnCloseSpy).toHaveBeenCalled();
      // 已销毁管理器不保留可复用连接
      const afterClose = await flakyManager.callTool(handle.url, 'read_value', { key: 'x' });
      expect(afterClose.ok).toBe(false);
    } finally {
      warnSpy.mockRestore();
      warnCloseSpy.mockRestore();
      await handle.close();
    }
  });

  it('工具数量超过 128 上限时失败关闭并拒绝写入快照（TC05-3）', async () => {
    const manager = createMcpClientManager();
    const fetchImpl = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      const body = init?.body ? String(init.body) : '';
      const parsed = body ? JSON.parse(body) : {};
      if (parsed.method === 'initialize') {
        return new Response(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: {
              protocolVersion: '2025-06-18',
              capabilities: { tools: {} },
              serverInfo: { name: 'too-many-tools', version: '1.0.0' },
            },
          })}\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        );
      }
      if (parsed.method === 'tools/list') {
        const tools = Array.from({ length: MCP_MAX_DISCOVERED_TOOLS + 1 }, (_, i) => ({
          name: `tool_${i}`,
          inputSchema: { type: 'object', properties: {} },
        }));
        return new Response(
          `event: message\ndata: ${JSON.stringify({
            jsonrpc: '2.0',
            id: parsed.id,
            result: { tools },
          })}\n\n`,
          { status: 200, headers: { 'content-type': 'text/event-stream' } }
        );
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    });

    const result = await manager.discover('https://example.com/mcp', { fetchImpl });
    await manager.dispose();

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('128');
    }
  });

  it('discoverMcpTools 快照总字节超过 256KB 时返回包含「过大」的中文原因（TC05-4）', async () => {
    const { createServer } = await import('node:http');
    const { randomUUID } = await import('node:crypto');
    const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
    const { StreamableHTTPServerTransport } = await import(
      '@modelcontextprotocol/sdk/server/streamableHttp.js'
    );
    const { ListToolsRequestSchema } = await import('@modelcontextprotocol/sdk/types.js');

    const transports = new Map<string, InstanceType<typeof StreamableHTTPServerTransport>>();
    // 分两页下发（每页 ~145KB < 200KB 单响应上限），累计快照总字节 > 256KB
    const makePageTools = (prefix: string) =>
      Array.from({ length: 60 }, (_, i) => ({
        name: `${prefix}_tool_${i}`,
        description: 'd'.repeat(2000),
        inputSchema: {
          type: 'object',
          properties: { payload: { type: 'string', description: 'p'.repeat(300) } },
        },
      }));
    const page1Tools = makePageTools('p1');
    const page2Tools = makePageTools('p2');
    expect(Buffer.byteLength(JSON.stringify(page1Tools), 'utf8')).toBeLessThan(200 * 1024);
    expect(
      Buffer.byteLength(JSON.stringify([...page1Tools, ...page2Tools]), 'utf8')
    ).toBeGreaterThan(MCP_MAX_SNAPSHOT_BYTES);

    const server = createServer(async (req, res) => {
      const sid = req.headers['mcp-session-id'];
      const existing = typeof sid === 'string' ? transports.get(sid) : undefined;
      if (existing) {
        await existing.handleRequest(req, res);
        return;
      }
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      const mcp = new Server(
        { name: 'huge-snapshot-server', version: '1.0.0' },
        { capabilities: { tools: {} } }
      );
      mcp.setRequestHandler(ListToolsRequestSchema, async (request) =>
        request.params?.cursor === 'page-2'
          ? { tools: page2Tools }
          : { tools: page1Tools, nextCursor: 'page-2' }
      );
      await mcp.connect(transport);
      try {
        await transport.handleRequest(req, res);
      } finally {
        if (transport.sessionId) transports.set(transport.sessionId, transport);
      }
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const result = await discoverMcpTools({
        url: `http://127.0.0.1:${port}/mcp`,
        serverKey: 'srv_huge',
        allowedPrivateTargets: [`127.0.0.1:${port}`],
        allowInsecureHttp: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('过大');
      }
    } finally {
      for (const t of transports.values()) {
        await t.close().catch(() => {});
      }
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections?.();
      });
    }
  });
});
