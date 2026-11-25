// @vitest-environment node
/**
 * MCP 工具发现命名冲突测试（加固修复）
 *
 * - 原始工具名完全重复时失败关闭，避免策略无法一一对应；
 * - 不同原始工具名归一化后重名时，以原始名哈希稳定消歧，不依赖上游返回顺序。
 */

import { describe, expect, it, vi } from 'vitest';
import { discoverMcpTools } from '../discovery';

interface StubTool {
  name: string;
  inputSchema?: Record<string, unknown>;
}

/** 构造最小可用的 MCP initialize / tools/list 受控 Fetch 替身 */
function createToolsListFetch(tools: StubTool[]) {
  return vi.fn(async (_input: string | URL, init?: RequestInit) => {
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
            serverInfo: { name: 'naming-conflict-server', version: '1.0.0' },
          },
        })}\n\n`,
        { status: 200, headers: { 'content-type': 'text/event-stream' } }
      );
    }
    if (parsed.method === 'tools/list') {
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
}

describe('MCP 工具发现命名冲突', () => {
  it('原始工具名完全重复时拒绝发现结果并给出中文原因', async () => {
    const result = await discoverMcpTools({
      url: 'https://mcp.example.com/mcp',
      serverKey: 'srv_1',
      fetchImpl: createToolsListFetch([
        { name: 'read_value', inputSchema: { type: 'object' } },
        { name: 'read_value', inputSchema: { type: 'object' } },
      ]),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('重复工具名');
  });

  it('归一化后重名的不同工具获得稳定唯一名称，且不依赖上游返回顺序', async () => {
    const first = await discoverMcpTools({
      url: 'https://mcp.example.com/mcp',
      serverKey: 'srv_1',
      fetchImpl: createToolsListFetch([
        { name: 'get-file', inputSchema: { type: 'object' } },
        { name: 'get_file', inputSchema: { type: 'object' } },
      ]),
    });
    const reversed = await discoverMcpTools({
      url: 'https://mcp.example.com/mcp',
      serverKey: 'srv_1',
      fetchImpl: createToolsListFetch([
        { name: 'get_file', inputSchema: { type: 'object' } },
        { name: 'get-file', inputSchema: { type: 'object' } },
      ]),
    });

    expect(first.ok).toBe(true);
    expect(reversed.ok).toBe(true);
    if (!first.ok || !reversed.ok) return;

    const names = first.tools.map((tool) => tool.modelToolName);
    expect(new Set(names).size).toBe(2);
    expect(names.every((name) => /^[a-z0-9_]{1,64}$/.test(name))).toBe(true);

    const project = (tools: typeof first.tools) =>
      Object.fromEntries(tools.map((tool) => [tool.toolName, tool.modelToolName]));
    expect(project(first.tools)).toEqual(project(reversed.tools));
  });
});
