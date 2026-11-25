/**
 * MCP 客户端管理器（工单 01 / ADR-0064 §3、§6）
 *
 * 职责边界：
 * - 只负责**单次生命周期**内的 MCP 会话：发现工具、调用工具、关闭连接；
 * - 不持有跨请求缓存，不做长连接池，不缓存 Server 凭证；
 * - 所有出站必须经过 MCP 专用受控 Fetch（注入点），任何 SDK 绕路都视为不可用。
 *
 * 协议事实（SDK 1.32.2 已验证）：
 * - `listTools()` 在 1.32.2 是**显式分页**，需用 `cursor`/`nextCursor` 循环；
 * - `callTool` 支持 `timeout` 与 `signal`；
 * - `client.close()` 幂等；
 * - 有状态模式下 `sessionId` 在 initialize 处理之后才生成。
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import type { FetchLike } from '@modelcontextprotocol/sdk/shared/transport.js';
import { createMcpControlledFetch, McpOutboundError, type McpControlledFetch } from './controlled-fetch';
import { buildMcpToolName } from './naming';
import {
  MCP_DISCOVERY_TIMEOUT_MS,
  MCP_MAX_DISCOVERY_PAGES,
  MCP_MAX_DISCOVERED_TOOLS,
  type McpToolDefinition,
} from './contracts';

/** 会话关闭超时（毫秒）：GET SSE 长连接可能让 close 等待 */
const MCP_CLOSE_TIMEOUT_MS = 2_000;

/** 可注入的发现与调用选项 */
export interface McpDiscoverOptions {
  /** 注入的 Fetch（测试替身或受控 Fetch） */
  fetchImpl?: FetchLike;
  /** 发现总超时（毫秒） */
  discoveryTimeoutMs?: number;
  /** 静态鉴权头 */
  authHeaders?: Record<string, string>;
  /** Server 稳定标识（用于派生模型侧工具名） */
  serverKey?: string;
  /** 外部中止信号（贯穿所有出站请求） */
  signal?: AbortSignal;
  /**
   * 受控私网目标白名单（仅平台自建受控测试服务使用）。
   * 生产路径不设置，用户配置的私网地址仍被无条件拒绝。
   */
  allowedPrivateTargets?: string[];
  /**
   * 允许受控测试目标使用明文 HTTP（**仅测试降级**，默认关闭）。
   * 生产路径不设置，平台出站仍是 HTTPS-only。
   */
  allowInsecureHttp?: boolean;
  /** 受控测试服务自签 CA 证书（仅测试与 allowedPrivateTargets 搭配） */
  trustedCa?: string;
}

/** 发现结果 */
export type McpDiscoverResult =
  | { ok: true; tools: McpToolDefinition[] }
  | { ok: false; reason: string };

/** 工具调用结果（含可选 HTTP 遥测字段供审计留痕） */
export type McpCallToolResult =
  | {
      ok: true;
      content: unknown;
      statusCode?: number;
      responseBytes?: number;
    }
  | {
      ok: false;
      reason: string;
      statusCode?: number;
      responseBytes?: number;
      errorCode?: string;
    };

/** 客户端管理器：按需建连、运行内复用、用后关闭 */
export interface McpClientManager {
  /** 发现工具：显式分页循环，超限与失败一律失败关闭 */
  discover(url: string, options?: McpDiscoverOptions): Promise<McpDiscoverResult>;
  /** 调用工具：在同一管理器生命周期内复用已建会话，受超时与信号约束 */
  callTool(
    url: string,
    toolName: string,
    args: unknown,
    options?: McpDiscoverOptions & { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<McpCallToolResult>;
  /** 幂等关闭全部已建连接 */
  dispose(): Promise<void>;
  /** 关闭别名（与 dispose 等价，供运行时客户端契约共用） */
  close(): Promise<void>;
}

/**
 * 把受控 Fetch 适配为 SDK 期望的 FetchLike 签名。
 *
 * 受控 Fetch 与标准 Fetch 一样返回 `Response`，这里只做请求头与中止信号的对齐。
 */
function toFetchLike(controlled: McpControlledFetch) {
  return (async (input: string | URL, init?: RequestInit) => {
    return controlled(input, {
      method: init?.method ?? 'GET',
      headers: normalizeHeaders(init?.headers),
      ...(init?.body !== undefined ? { body: String(init.body) } : {}),
      ...(init?.signal ? { signal: init.signal } : {}),
    });
  }) as FetchLike;
}

/** 把各种 HeadersInit 归一为普通对象 */
function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  if (!headers) return {};
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers.map(([key, value]) => [key, value]));
  }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }
  return { ...(headers as Record<string, string>) };
}

/** 内部会话遥测记录（仅采集 HTTP 状态、字节数与错误码，不记录任何载荷） */
interface SessionTelemetry {
  lastStatusCode?: number;
  lastResponseBytes?: number;
  lastErrorCode?: string;
  lastErrorMessage?: string;
  injectedFetchCalls: number;
  onPostStreamError?: (error: unknown) => void;
}

/** 已打开的运行内 MCP 会话 */
interface OpenSession {
  client: Client;
  transport: StreamableHTTPClientTransport;
  telemetry: SessionTelemetry;
}

/** 根据错误对象和遥测推断出站错误码 */
function extractOutboundErrorCode(error: unknown, telemetry?: SessionTelemetry): string | undefined {
  if (error instanceof McpOutboundError) return error.code;
  if (error && typeof error === 'object' && typeof (error as { code?: unknown }).code === 'string') {
    const code = (error as { code: string }).code;
    if (code.startsWith('MCP_OUTBOUND_')) return code;
  }
  if (telemetry?.lastErrorCode) return telemetry.lastErrorCode;
  if (
    error &&
    typeof error === 'object' &&
    (error as { code?: unknown }).code === -32001
  ) {
    return 'MCP_OUTBOUND_TIMEOUT';
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('重定向') || message.includes('内部私网') || message.includes('https')) {
    return 'MCP_OUTBOUND_BLOCKED';
  }
  if (message.includes('字节上限')) {
    return 'MCP_OUTBOUND_TOO_LARGE';
  }
  if (/timed out|超时/i.test(message)) {
    return 'MCP_OUTBOUND_TIMEOUT';
  }
  return undefined;
}

/** 构造用于复用索引的稳定会话键（绑定地址与鉴权头，避免串用） */
function buildSessionKey(url: string, authHeaders?: Record<string, string>): string {
  const sortedHeaders = Object.entries(authHeaders ?? {}).sort(([a], [b]) => a.localeCompare(b));
  return `${url}\n${JSON.stringify(sortedHeaders)}`;
}

/**
 * 创建 MCP 客户端管理器。
 *
 * @param defaults 默认选项（发现超时等）
 */
export function createMcpClientManager(
  defaults: { discoveryTimeoutMs?: number } = {}
): McpClientManager {
  const transports: StreamableHTTPClientTransport[] = [];
  const sessions = new Map<string, OpenSession>();
  const pendingSessions = new Map<string, Promise<OpenSession>>();
  let disposed = false;
  let disposePromise: Promise<void> | null = null;

  /** 建立一次受控会话（用后由调用方或 dispose 关闭） */
  async function openSession(
    url: string,
    options: McpDiscoverOptions = {},
    bindRequestSignal = true
  ): Promise<OpenSession> {
    if (disposed) {
      throw new Error('MCP 客户端管理器已关闭');
    }

    const telemetry: SessionTelemetry = { injectedFetchCalls: 0 };
    // 注入替身时直接透传（替身已是标准 FetchLike）；未注入时使用受控 Fetch
    const baseFetch: FetchLike = options.fetchImpl
      ? options.fetchImpl
      : (toFetchLike(
          createMcpControlledFetch({
            ...(options.allowedPrivateTargets
              ? {
                  allowedPrivateTargets: options.allowedPrivateTargets,
                  ...(options.allowInsecureHttp
                    ? { allowInsecureHttp: true }
                    : {}),
                  ...(options.trustedCa
                    ? { trustedCa: options.trustedCa }
                    : {}),
                }
              : {}),
          })
        ) as FetchLike);

    // 包装 Fetch 记录非载荷遥测（不缓冲 Response 流，保持 GET SSE 流式可读；
    // POST SSE 读取出错时保留真实出站错误码并通知在途调用立即中止）
    const fetchImpl: FetchLike = (async (input: string | URL, init?: RequestInit) => {
      telemetry.injectedFetchCalls += 1;
      try {
        const response = await baseFetch(input, init);
        if ((init?.method ?? 'GET').toUpperCase() === 'POST') {
          telemetry.lastStatusCode = response.status;
          const lengthHeader = response.headers.get('content-length');
          if (lengthHeader) {
            const parsed = Number(lengthHeader);
            if (Number.isFinite(parsed) && parsed >= 0) {
              telemetry.lastResponseBytes = parsed;
            }
          }
          if (response.body) {
            const reader = response.body.getReader();
            const wrappedBody = new ReadableStream<Uint8Array>({
              async pull(controller) {
                try {
                  const { value, done } = await reader.read();
                  if (done) {
                    controller.close();
                    return;
                  }
                  controller.enqueue(value);
                } catch (streamError) {
                  const code = extractOutboundErrorCode(streamError);
                  if (code) telemetry.lastErrorCode = code;
                  if (streamError instanceof Error && !telemetry.lastErrorMessage) {
                    telemetry.lastErrorMessage = streamError.message;
                  }
                  telemetry.onPostStreamError?.(streamError);
                  controller.error(streamError);
                }
              },
              cancel(reason) {
                return reader.cancel(reason);
              },
            });
            return new Response(wrappedBody, {
              status: response.status,
              statusText: response.statusText,
              headers: response.headers,
            });
          }
        }
        return response;
      } catch (error) {
        const isPost = (init?.method ?? 'GET').toUpperCase() === 'POST';
        const code = extractOutboundErrorCode(error);
        if (isPost) {
          if (code) telemetry.lastErrorCode = code;
          if (error instanceof Error && !telemetry.lastErrorMessage) {
            telemetry.lastErrorMessage = error.message;
          }
        } else if (code && !telemetry.lastErrorCode) {
          telemetry.lastErrorCode = code;
        }
        throw error;
      }
    }) as FetchLike;

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      fetch: fetchImpl as never,
      requestInit: {
        headers: {
          ...(options.authHeaders ?? {}),
          accept: 'application/json, text/event-stream',
        },
        ...(bindRequestSignal && options.signal ? { signal: options.signal } : {}),
      },
    });
    transports.push(transport);

    const client = new Client({ name: 'ai-aggregation-mcp-client', version: '1.0.0' });
    try {
      await client.connect(transport);
      if (telemetry.injectedFetchCalls === 0) {
        await closeSession(transport);
        throw new McpOutboundError(
          'MCP_OUTBOUND_BLOCKED',
          'MCP 客户端未经过受控出站拦截，已按失败关闭判定不可用'
        );
      }
      if (disposed) {
        await closeSession(transport);
        throw new Error('MCP 客户端管理器已关闭');
      }
      return { client, transport, telemetry };
    } catch (error) {
      await closeSession(transport);
      if (telemetry.lastErrorCode && !(error instanceof McpOutboundError)) {
        const wrapped = new Error(error instanceof Error ? error.message : '连接 MCP 服务失败');
        (wrapped as { code?: string }).code = telemetry.lastErrorCode;
        throw wrapped;
      }
      throw error;
    }
  }

  /**
   * 关闭单个会话（幂等）。
   *
   * SDK 的 GET SSE 是长连接，`close()` 可能等待该连接结束；因此这里加超时兜底，
   * 关闭失败只留痕不抛出——连接泄漏由运行时的 dispose 兜底清理。
   */
  async function closeSession(transport: StreamableHTTPClientTransport): Promise<void> {
    const index = transports.indexOf(transport);
    if (index >= 0) transports.splice(index, 1);
    try {
      await Promise.race([
        (async () => {
          if (transport.sessionId) {
            await Promise.race([
              transport.terminateSession().catch(() => {}),
              new Promise<void>((resolve) => setTimeout(resolve, 200)),
            ]);
          }
          await transport.close();
        })(),
        new Promise<void>((resolve) => setTimeout(resolve, MCP_CLOSE_TIMEOUT_MS)),
      ]);
    } catch (error) {
      // 关闭异常只告警不阻断，且决不留存可复用连接
      console.warn('[mcp] 关闭传输会话异常（已清理）:', error);
    }
  }

  /** 获取或建立运行内复用的会话 */
  async function acquireSession(url: string, options: McpDiscoverOptions): Promise<OpenSession> {
    if (disposed) {
      throw new McpOutboundError('MCP_OUTBOUND_ABORTED', 'MCP 客户端管理器已关闭');
    }
    const key = buildSessionKey(url, options.authHeaders);
    const cached = sessions.get(key);
    if (cached) return cached;

    let pending = pendingSessions.get(key);
    if (!pending) {
      pending = openSession(url, options, false).then(
        (session) => {
          pendingSessions.delete(key);
          if (disposed) {
            void closeSession(session.transport);
            throw new McpOutboundError('MCP_OUTBOUND_ABORTED', 'MCP 客户端管理器已关闭');
          }
          sessions.set(key, session);
          return session;
        },
        (error) => {
          pendingSessions.delete(key);
          throw error;
        }
      );
      pendingSessions.set(key, pending);
    }
    return pending;
  }

  const manager: McpClientManager = {
    async discover(url: string, options: McpDiscoverOptions = {}): Promise<McpDiscoverResult> {
      const timeoutMs = options.discoveryTimeoutMs ?? defaults.discoveryTimeoutMs ?? MCP_DISCOVERY_TIMEOUT_MS;
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      let transport: StreamableHTTPClientTransport | null = null;
      try {
        // 建连同样受超时约束：连接阶段挂起也必须失败关闭，而不是无限等待
        const session = await Promise.race([
          openSession(url, {
            ...options,
            discoveryTimeoutMs: timeoutMs,
            signal: controller.signal,
          }),
          new Promise<never>((_resolve, reject) => {
            const timer = setTimeout(
              () => reject(new Error('工具发现用时过长，请稍后重试')),
              Math.max(1, timeoutMs - (Date.now() - startedAt))
            );
            controller.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(new Error('工具发现用时过长，请稍后重试'));
              },
              { once: true }
            );
          }),
        ]);
        transport = session.transport;
        session.telemetry.onPostStreamError = (streamError) => {
          controller.abort(streamError);
        };

        const tools: McpToolDefinition[] = [];
        let cursor: string | undefined;
        let pages = 0;

        // 显式分页循环：1.32.2 不做自动聚页
        do {
          pages += 1;
          if (pages > MCP_MAX_DISCOVERY_PAGES) {
            return { ok: false, reason: `工具发现分页超过 ${MCP_MAX_DISCOVERY_PAGES} 页上限` };
          }

          // 超时由本层兜底：SDK 不保证把外部 abort 传播到每个请求，
          // 因此用竞速保证「发现用时过长」可被观察，而不是无限等待。
          const result = await Promise.race([
            session.client.listTools(cursor ? { cursor } : undefined),
            new Promise<never>((_resolve, reject) => {
              const timer = setTimeout(
                () => reject(new Error('工具发现用时过长，请稍后重试')),
                Math.max(1, timeoutMs - (Date.now() - startedAt))
              );
              controller.signal.addEventListener(
                'abort',
                () => {
                  clearTimeout(timer);
                  reject(new Error('工具发现用时过长，请稍后重试'));
                },
                { once: true }
              );
            }),
          ]);
          for (const tool of result.tools) {
            if (tools.length >= MCP_MAX_DISCOVERED_TOOLS) {
              return {
                ok: false,
                reason: `工具数量超过 ${MCP_MAX_DISCOVERED_TOOLS} 个上限`,
              };
            }
            tools.push({
              toolName: tool.name,
              description: tool.description ?? '',
              inputSchema: tool.inputSchema,
              annotations: (tool.annotations as Record<string, unknown> | undefined) ?? null,
              modelToolName: buildMcpToolName(options.serverKey ?? 'server', tool.name),
            });
          }
          cursor = result.nextCursor;
        } while (cursor);

        return { ok: true, tools };
      } catch (error) {
        if (controller.signal.aborted) {
          const abortReason = controller.signal.reason;
          if (abortReason instanceof McpOutboundError) {
            return { ok: false, reason: abortReason.message };
          }
          return { ok: false, reason: '工具发现用时过长，请稍后重试' };
        }
        return {
          ok: false,
          reason: error instanceof Error ? error.message : '工具发现失败',
        };
      } finally {
        clearTimeout(timer);
        if (transport) await closeSession(transport);
      }
    },

    async callTool(
      url: string,
      toolName: string,
      args: unknown,
      options: McpDiscoverOptions & { timeoutMs?: number; signal?: AbortSignal } = {}
    ): Promise<McpCallToolResult> {
      if (disposed) {
        return {
          ok: false,
          reason: 'MCP 客户端已关闭',
          errorCode: 'client_disposed',
        };
      }

      const key = buildSessionKey(url, options.authHeaders);
      let session: OpenSession | null = null;
      const callAbortController = new AbortController();
      const onCallerAbort = () => callAbortController.abort(options.signal?.reason);
      if (options.signal) {
        if (options.signal.aborted) {
          callAbortController.abort(options.signal.reason);
        } else {
          options.signal.addEventListener('abort', onCallerAbort, { once: true });
        }
      }

      try {
        session = await acquireSession(url, options);
        session.telemetry.lastStatusCode = undefined;
        session.telemetry.lastResponseBytes = undefined;
        session.telemetry.lastErrorCode = undefined;
        session.telemetry.lastErrorMessage = undefined;
        session.telemetry.onPostStreamError = (streamError) => {
          callAbortController.abort(streamError);
        };
        const fetchCallsBefore = session.telemetry.injectedFetchCalls;

        const result = await session.client.callTool(
          { name: toolName, arguments: (args ?? {}) as Record<string, unknown> },
          CallToolResultSchema,
          {
            ...(options.timeoutMs ? { timeout: options.timeoutMs } : {}),
            signal: callAbortController.signal,
          }
        );
        if (session.telemetry.injectedFetchCalls === fetchCallsBefore) {
          throw new McpOutboundError(
            'MCP_OUTBOUND_BLOCKED',
            'MCP 工具调用未经过受控出站拦截，已按失败关闭拒绝'
          );
        }
        const computedBytes =
          session.telemetry.lastResponseBytes ??
          Buffer.byteLength(JSON.stringify(result ?? null), 'utf8');
        return {
          ok: true,
          content: result,
          ...(session.telemetry.lastStatusCode !== undefined
            ? { statusCode: session.telemetry.lastStatusCode }
            : {}),
          responseBytes: computedBytes,
        };
      } catch (error) {
        // 先读取遥测与错误码再关闭传输：closeSession 会触发 GET SSE 中止，
        // 若先关闭会用 MCP_OUTBOUND_ABORTED 覆盖真实的 TOO_LARGE/BLOCKED 错误码。
        const errorCode = extractOutboundErrorCode(error, session?.telemetry);
        const reason =
          session?.telemetry.lastErrorMessage ??
          (error instanceof Error ? error.message : '工具调用失败');
        const statusCode = session?.telemetry.lastStatusCode;
        const responseBytes = session?.telemetry.lastResponseBytes;

        // 调用期间传输失败或超时：立即摘除并关闭该会话，绝不复用受损连接
        if (session && sessions.get(key) === session) {
          sessions.delete(key);
          await closeSession(session.transport);
        }
        return {
          ok: false,
          reason,
          ...(statusCode !== undefined ? { statusCode } : {}),
          ...(responseBytes !== undefined ? { responseBytes } : {}),
          ...(errorCode ? { errorCode } : {}),
        };
      } finally {
        options.signal?.removeEventListener('abort', onCallerAbort);
        if (session) {
          session.telemetry.onPostStreamError = undefined;
        }
      }
    },

    async dispose(): Promise<void> {
      if (disposePromise) return disposePromise;
      disposed = true;
      disposePromise = (async () => {
        sessions.clear();
        pendingSessions.clear();
        const pending = [...transports];
        transports.length = 0;
        for (const transport of pending) {
          await closeSession(transport);
        }
      })();
      return disposePromise;
    },

    async close(): Promise<void> {
      return manager.dispose();
    },
  };

  return manager;
}
