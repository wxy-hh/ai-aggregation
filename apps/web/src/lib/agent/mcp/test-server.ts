/**
 * 受控 MCP Streamable HTTP 测试服务（工单 01 / ADR-0064 §5）
 *
 * 职责：为 MCP 垂直闭环提供**可重复、可控、无真实业务副作用**的后端。
 *
 * 为什么用低层 `Server` API 而不是 `McpServer`：
 * - `McpServer.registerTool` 只接受 Zod 或 raw shape，无法表达「参数契约含远程
 *   `$ref`」这类协议上合法但平台必须拒绝的工具；
 * - 低层 API 让我们精确控制 `tools/list` 的分页游标与 `tools/call` 的返回结构，
 *   从而覆盖分页、非法 Schema、超大响应、多模态等验收场景。
 *
 * 会话模型（SDK 1.32.2 已验证）：
 * - 使用有状态模式，每个会话独立一个 `Server` 实例（SDK 不允许一个 Server 连多个
 *   transport）；
 * - `sessionId` 在 initialize 请求**处理之后**才生成，因此新会话先处理请求、
 *   再用生成的 `sessionId` 登记，避免后续请求落到错误会话。
 *
 * 该服务只用于自动化测试与阶段 5 真实验收，不属于产品运行时依赖。
 */

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createTlsServer } from 'node:https';
import { randomUUID } from 'node:crypto';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';

/** 受控服务的可切换场景 */
export type McpTestScenario =
  | 'normal'
  | 'slow'
  | 'failing'
  | 'oversized'
  | 'multimodal'
  | 'redirect'
  | 'unauthorized';

/** 服务端可观测计数（供断言使用） */
export interface McpTestServerCounters {
  toolsCall: number;
  listCalls: number;
  lastCallArguments: unknown;
  lastCallName: string | null;
}

export interface McpTestServerOptions {
  /** 场景开关；默认 normal */
  scenario?: McpTestScenario;
  /** 静态鉴权头名；缺省表示不校验 */
  authHeaderName?: string;
  /** 静态鉴权头取值 */
  authHeaderValue?: string;
  /** 延迟场景的等待毫秒数 */
  delayMs?: number;
  /** 自签名证书（PEM）；提供时以 HTTPS 启动（缺省 HTTP） */
  tls?: { cert: string; key: string };
  /** 监听端口；0 表示随机可用端口 */
  port?: number;
}

export interface McpTestServerHandle {
  /** 实际监听端口 */
  port: number;
  /** 端点地址 */
  url: string;
  /** 可观测计数 */
  counters: McpTestServerCounters;
  /** 切换场景 */
  setScenario: (scenario: McpTestScenario) => void;
  /** 关闭服务 */
  close: () => Promise<void>;
}

/** 受控服务暴露的工具定义（第一页） */
const FIRST_PAGE_TOOLS: Tool[] = [
  {
    name: 'read_value',
    description: '读取一个受控值（只读工具）',
    inputSchema: {
      type: 'object',
      properties: { key: { type: 'string', description: '要读取的键名' } },
      required: ['key'],
    },
  },
  {
    name: 'write_value',
    description: '写入一个受控值（写工具）',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: '要写入的键名' },
        value: { type: 'string', description: '要写入的值' },
      },
      required: ['key', 'value'],
    },
  },
  {
    name: 'slow_tool',
    description: '长时间等待的工具',
    inputSchema: {
      type: 'object',
      properties: { waitMs: { type: 'number' } },
    },
  },
  {
    name: 'failing_tool',
    description: '总是失败的工具',
    inputSchema: {
      type: 'object',
      properties: { reason: { type: 'string' } },
    },
  },
];

/** 受控服务暴露的工具定义（第二页，由游标分页返回） */
const SECOND_PAGE_TOOLS: Tool[] = [
  {
    name: 'list_items',
    description: '列出受控条目（分页工具）',
    inputSchema: {
      type: 'object',
      properties: { page: { type: 'number' } },
    },
  },
  {
    name: 'remote_ref_tool',
    description: '参数 Schema 含远程引用的工具',
    inputSchema: {
      type: 'object',
      properties: {
        payload: { $ref: 'https://evil.example.com/schema.json#/definitions/payload' },
      },
    },
  },
  {
    name: 'oversized_tool',
    description: '返回超大文本的工具',
    inputSchema: {
      type: 'object',
      properties: { size: { type: 'number' } },
    },
  },
  {
    name: 'multimodal_tool',
    description: '返回图片内容的工具',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'scenario_tool',
    description: '按当前场景返回不同结果',
    inputSchema: { type: 'object', properties: {} },
  },
];

/** 第二页游标 */
const SECOND_PAGE_CURSOR = 'page-2';

/** 会话内共享的运行时状态 */
interface SessionRuntime {
  counters: McpTestServerCounters;
  getScenario: () => McpTestScenario;
  delayMs: number;
}

/** 为一个会话注册协议处理器 */
function registerSessionHandlers(server: Server, runtime: SessionRuntime): void {
  server.setRequestHandler(ListToolsRequestSchema, async (request) => {
    runtime.counters.listCalls += 1;
    const cursor = (request.params as { cursor?: string } | undefined)?.cursor;
    if (!cursor) {
      return { tools: FIRST_PAGE_TOOLS, nextCursor: SECOND_PAGE_CURSOR };
    }
    if (cursor === SECOND_PAGE_CURSOR) {
      return { tools: SECOND_PAGE_TOOLS };
    }
    return { tools: [] };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const params = request.params as { name: string; arguments?: unknown };
    const args = (params.arguments ?? {}) as Record<string, unknown>;
    const { counters } = runtime;

    // 所有 tools/call 都计数（供断言观察服务端是否真的收到调用）
    counters.toolsCall += 1;
    counters.lastCallName = params.name;
    counters.lastCallArguments = args;

    if (params.name === 'slow_tool') {
      const wait = typeof args.waitMs === 'number' ? args.waitMs : runtime.delayMs;
      await new Promise((resolve) => setTimeout(resolve, wait));
      return { content: [{ type: 'text' as const, text: '慢响应' }] };
    }

    if (params.name === 'failing_tool' || runtime.getScenario() === 'failing') {
      return {
        content: [{ type: 'text' as const, text: '失败:受控故障' }],
        isError: true,
      };
    }

    if (params.name === 'oversized_tool' || runtime.getScenario() === 'oversized') {
      const size = typeof args.size === 'number' ? args.size : 300 * 1024;
      return { content: [{ type: 'text' as const, text: 'x'.repeat(size) }] };
    }

    if (params.name === 'multimodal_tool' || runtime.getScenario() === 'multimodal') {
      return {
        content: [
          {
            type: 'image' as const,
            data: Buffer.from('fake-image').toString('base64'),
            mimeType: 'image/png',
          },
        ],
      };
    }

    if (params.name === 'read_value') {
      const key = typeof args.key === 'string' ? args.key : '';
      return {
        content: [{ type: 'text' as const, text: `值:${key}` }],
        structuredContent: { key, value: `值:${key}` },
      };
    }

    if (params.name === 'write_value') {
      const key = typeof args.key === 'string' ? args.key : '';
      return {
        content: [{ type: 'text' as const, text: `已写入:${key}` }],
        structuredContent: { key, ok: true },
      };
    }

    if (params.name === 'scenario_tool') {
      return {
        content: [{ type: 'text' as const, text: `场景:${runtime.getScenario()}` }],
      };
    }

    return { content: [{ type: 'text' as const, text: '未支持的工具' }], isError: true };
  });
}

/** 判断请求是否通过静态鉴权 */
function isAuthorized(
  req: IncomingMessage,
  options: McpTestServerOptions
): boolean {
  if (!options.authHeaderName) return true;
  const value = req.headers[options.authHeaderName.toLowerCase()];
  const actual = Array.isArray(value) ? value[0] : value;
  return actual === options.authHeaderValue;
}

/**
 * 启动受控 MCP 测试服务。
 *
 * @param options 场景、鉴权与监听配置
 * @returns 服务句柄（含实际端口与可观测计数）
 */
export async function startMcpTestServer(
  options: McpTestServerOptions = {}
): Promise<McpTestServerHandle> {
  const counters: McpTestServerCounters = {
    toolsCall: 0,
    listCalls: 0,
    lastCallArguments: null,
    lastCallName: null,
  };
  let scenario = options.scenario ?? 'normal';

  const runtime: SessionRuntime = {
    counters,
    getScenario: () => scenario,
    delayMs: options.delayMs ?? 20_000,
  };

  // 会话路由：Mcp-Session-Id → transport
  const transports = new Map<string, StreamableHTTPServerTransport>();

  const handleRequest = async (
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> => {
    if (req.url === '/redirect') {
      res.writeHead(302, { location: '/mcp' });
      res.end();
      return;
    }
    if (!isAuthorized(req, options)) {
      res.writeHead(401, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }

    const sessionId = req.headers['mcp-session-id'];
    const existing =
      typeof sessionId === 'string' ? transports.get(sessionId) : undefined;

    if (existing) {
      await existing.handleRequest(req, res);
      return;
    }

    // 新会话：每个会话独立一个 Server 实例（SDK 不允许一个 Server 连多个 transport）
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
    });
    const server = new Server(
      { name: 'controlled-mcp-test-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );
    registerSessionHandlers(server, runtime);
    await server.connect(transport);

    try {
      await transport.handleRequest(req, res);
    } finally {
      // sessionId 在 initialize 处理之后才生成，此时登记才正确
      if (transport.sessionId) transports.set(transport.sessionId, transport);
    }
  };

  async function onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (req.method !== 'POST') {
      res.writeHead(405, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'method not allowed' }));
      return;
    }

    // Accept 校验：POST 必须同时接受 JSON 与 SSE；GET SSE 只需接受 text/event-stream。
    // 官方 SDK 的 GET SSE 请求只带 text/event-stream，若一律要求两种会得到 406。
    const accept = String(req.headers.accept ?? '');
    const isSseOnly = accept.includes('text/event-stream') && !accept.includes('application/json');
    if (!isSseOnly && !accept.includes('application/json')) {
      res.writeHead(406, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'not acceptable' }));
      return;
    }

    // 不预读请求流：传输层需要自行读取 body，预读会导致它拿到空内容。
    // 调用计数在协议处理器内部统计（那里能看到已解析的消息）。
    try {
      await handleRequest(req, res);
    } catch (error) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: String(error) }));
      }
    }
  }

  // 受控测试服务默认以 HTTP 启动：仅测试注入点允许明文降级（allowInsecureHttp），
  // 生产路径的 MCP 出站仍是 HTTPS-only + 私网阻断。
  const httpServer = options.tls
    ? createTlsServer({ cert: options.tls.cert, key: options.tls.key }, onRequest)
    : createHttpServer(onRequest);

  await new Promise<void>((resolve) => {
    httpServer.listen(options.port ?? 0, '127.0.0.1', () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const protocol = options.tls ? 'https' : 'http';

  return {
    port,
    url: `${protocol}://127.0.0.1:${port}/mcp`,
    counters,
    setScenario: (next: McpTestScenario) => {
      scenario = next;
    },
    close: async () => {
      for (const transport of transports.values()) {
        await transport.close().catch(() => {});
      }
      transports.clear();
      await new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
        httpServer.closeAllConnections?.();
      });
    },
  };
}
