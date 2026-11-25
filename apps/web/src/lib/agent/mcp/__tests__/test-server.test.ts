// @vitest-environment node
// 真实 MCP HTTP 客户端需要 Node 环境 fetch（happy-dom 的浏览器 fetch 受同源策略限制）
/**
 * 受控 MCP 测试服务行为测试（工单 01 / ADR-0064 §5）
 *
 * 覆盖的外部可观察行为：
 * - 服务以 Streamable HTTP 暴露标准工具，客户端可完成 `tools/list` 与 `tools/call`；
 * - 鉴权失败、重定向、场景切换等分支各自可观察；
 * - 服务可重复启停，第二次启动后仍能正常调用。
 */

import { describe, it, expect, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startMcpTestServer, type McpTestServerHandle } from '../test-server';
import { createMcpControlledFetch } from '../controlled-fetch';

function generateEphemeralTls() {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-tls-'));
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
    return {
      key: readFileSync(keyPath, 'utf8'),
      cert: readFileSync(certPath, 'utf8'),
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const handles: McpTestServerHandle[] = [];

afterAll(async () => {
  await Promise.all(handles.map((handle) => handle.close()));
});

/** 以受控服务为后端创建标准 MCP 客户端 */
async function createClient(url: string, headers?: Record<string, string>) {
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    ...(headers ? { requestInit: { headers } } : {}),
  });
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport };
}

describe('受控 MCP 测试服务', () => {
  it('客户端可列出受控服务暴露的工具', async () => {
    const handle = await startMcpTestServer();
    handles.push(handle);

    const { client, transport } = await createClient(handle.url);
    const tools = await client.listTools();

    expect(tools.tools.length).toBeGreaterThan(0);
    expect(tools.tools.map((tool) => tool.name)).toContain('read_value');
    await transport.close();
  });

  it('客户端可调用只读工具并得到结构化结果', async () => {
    const handle = await startMcpTestServer();
    handles.push(handle);

    const { client, transport } = await createClient(handle.url);
    const result = await client.callTool({
      name: 'read_value',
      arguments: { key: 'demo' },
    });

    expect(JSON.stringify(result.content)).toContain('值:demo');
    await transport.close();
  });

  it('写工具调用被服务端记录计数', async () => {
    const handle = await startMcpTestServer();
    handles.push(handle);

    const { client, transport } = await createClient(handle.url);
    await client.callTool({ name: 'write_value', arguments: { key: 'a', value: 'b' } });

    expect(handle.counters.toolsCall).toBe(1);
    expect(handle.counters.lastCallName).toBe('write_value');
    await transport.close();
  });

  it('鉴权失败时客户端连接或调用被拒绝', async () => {
    const handle = await startMcpTestServer({
      authHeaderName: 'x-test-token',
      authHeaderValue: 'secret-value',
    });
    handles.push(handle);

    await expect(createClient(handle.url)).rejects.toThrow();
  });

  it('鉴权头正确时可正常调用', async () => {
    const handle = await startMcpTestServer({
      authHeaderName: 'x-test-token',
      authHeaderValue: 'secret-value',
    });
    handles.push(handle);

    const { client, transport } = await createClient(handle.url, {
      'x-test-token': 'secret-value',
    });
    const tools = await client.listTools();

    expect(tools.tools.length).toBeGreaterThan(0);
    await transport.close();
  });

  it('服务可重复启停：第二次启动后仍能完成一次列表与一次调用', async () => {
    const first = await startMcpTestServer();
    await first.close();

    const second = await startMcpTestServer();
    handles.push(second);

    const { client, transport } = await createClient(second.url);
    const tools = await client.listTools();
    await client.callTool({ name: 'read_value', arguments: { key: 'again' } });

    expect(tools.tools.length).toBeGreaterThan(0);
    expect(second.counters.toolsCall).toBe(1);
    await transport.close();
  });

  it('支持 HTTPS Streamable HTTP 端点、显式分页与全部 10 类受控场景（TC13-1..2）', async () => {
    const tls = generateEphemeralTls();
    const handle = await startMcpTestServer({
      tls,
      authHeaderName: 'x-api-key',
      authHeaderValue: 'k-secret',
      delayMs: 30,
    });
    handles.push(handle);
    expect(handle.url.startsWith('https://')).toBe(true);

    const controlledFetch = createMcpControlledFetch({
      allowedPrivateTargets: [`127.0.0.1:${handle.port}`],
      trustedCa: tls.cert,
    });

    const mcpPostHeaders = {
      accept: 'application/json, text/event-stream',
      'content-type': 'application/json',
    };
    // 无鉴权头返回 401；/redirect 返回重定向被拦截
    const unauthRes = await controlledFetch(handle.url, {
      method: 'POST',
      headers: mcpPostHeaders,
      body: '{}',
    });
    expect(unauthRes.status).toBe(401);
    await expect(
      controlledFetch(handle.url.replace(/\/mcp$/, '/redirect'), {
        method: 'POST',
        headers: mcpPostHeaders,
        body: '{}',
      })
    ).rejects.toThrow(/重定向/);

    const transport = new StreamableHTTPClientTransport(new URL(handle.url), {
      fetch: ((input: string | URL, init?: RequestInit) =>
        controlledFetch(input, {
          method: init?.method,
          headers:
            init?.headers instanceof Headers
              ? Object.fromEntries(init.headers.entries())
              : (init?.headers as Record<string, string> | undefined),
          ...(init?.body !== undefined ? { body: String(init.body) } : {}),
          ...(init?.signal ? { signal: init.signal } : {}),
        })) as never,
      requestInit: { headers: { 'x-api-key': 'k-secret' } },
    });
    const client = new Client({ name: 'tls-client', version: '1.0.0' });
    await client.connect(transport);

    // 显式两页分页：第 1 页 + 第 2 页累计工具与 schema 暴露一致
    const page1 = await client.listTools();
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await client.listTools({ cursor: page1.nextCursor });
    expect(page2.nextCursor).toBeUndefined();
    const allNames = [...page1.tools, ...page2.tools].map((t) => t.name);
    expect(allNames).toContain('read_value');
    expect(allNames).toContain('write_value');
    expect(allNames).toContain('slow_tool');
    expect(allNames).toContain('failing_tool');
    expect(allNames).toContain('oversized_tool');
    expect(allNames).toContain('multimodal_tool');
    expect(allNames).toContain('remote_ref_tool');

    const r1 = await client.callTool({ name: 'read_value', arguments: { key: 'x' } });
    expect(JSON.stringify(r1)).toContain('值:x');
    const r2 = await client.callTool({ name: 'write_value', arguments: { key: 'k', value: 'v' } });
    expect(JSON.stringify(r2)).toContain('已写入:k');
    const r3 = await client.callTool({ name: 'slow_tool', arguments: { waitMs: 10 } });
    expect(JSON.stringify(r3)).toContain('慢响应');
    const r4 = await client.callTool({ name: 'failing_tool', arguments: {} });
    expect(r4.isError).toBe(true);
    const r5 = await client.callTool({ name: 'multimodal_tool', arguments: {} });
    expect(JSON.stringify(r5)).toContain('image/png');
    await expect(
      client.callTool({ name: 'oversized_tool', arguments: { size: 260000 } }, undefined, { timeout: 2000 })
    ).rejects.toThrow();

    await transport.close();
  });
});
