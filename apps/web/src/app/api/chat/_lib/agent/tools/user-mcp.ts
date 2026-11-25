/**
 * 用户远程 MCP 工具到 AgentToolSpec 适配器（工单 04 / ADR-0064 §2、§4、§5、§8）
 *
 * 核心职责：
 * 1. 基于当前用户的启用 Server、有效快照与白名单策略，经 `selectMountableMcpTools` 守卫挂载；
 * 2. 遵循信任边界：默认必须审批（名称关键词与 `readOnlyHint` 等注解不参与放行）；
 * 3. `execute` 经单次运行内复用的 `McpRunClient` 调用上游 `tools/call`，
 *    结果经 `projectMcpToolResult` 做 200KB / 8,000 / 240 有界投影与不可信标注；
 * 4. 每次调用（含待审批、拦截、成功、失败）写入 `McpAuditRecord` 元数据审计（不含载荷与密钥），
 *    审计写库失败仅 warn，绝不阻断用户调用；
 * 5. 暴露 `getMcpCallsCount()` 供 `finishMetadata()` 随一口价结算留痕。
 */

import { prisma } from '@repo/db';
import { decryptWebhookSecret } from '@/lib/crypto/webhook-secret';
import type {
  AgentToolSpec,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolRegistry,
} from '@/lib/agent/registry';
import { DEFAULT_TOOL_POLICY } from '@/lib/agent/tool-policy';
import type { McpCallToolResult, McpDiscoverOptions } from '@/lib/agent/mcp/client';
import { formatMcpToolDescription, formatMcpToolError, projectMcpToolResult } from '@/lib/agent/mcp/call-result';
import { computeConfigFingerprint } from '@/lib/agent/mcp/discovery';
import {
  MCP_MAX_ENABLED_TOOLS,
  type McpAuditRecordShape,
  type McpToolDefinition,
} from '@/lib/agent/mcp/contracts';
import {
  selectMountableMcpTools,
  type MountableMcpPolicy,
  type MountableMcpServer,
  type MountableMcpSnapshot,
} from '@/lib/agent/mcp/mount';

/** 运行内复用且可幂等关闭的 MCP 客户端窄契约 */
export interface McpRunClient {
  callTool(
    url: string,
    toolName: string,
    args: unknown,
    options?: McpDiscoverOptions & { timeoutMs?: number; signal?: AbortSignal }
  ): Promise<McpCallToolResult>;
  close(): Promise<void>;
}

/** 单个 Server 及其当前快照与策略包 */
export interface LoadedMcpServerBundle {
  server: MountableMcpServer & {
    authHeaderName?: string | null;
    authHeaderValueEnc?: string | null;
  };
  snapshot: MountableMcpSnapshot | null;
  policies: Array<MountableMcpPolicy & { allowAutoExecute: boolean }>;
}

/** 审计写入注入签名 */
export type McpAuditWriter = (record: Omit<McpAuditRecordShape, 'createdAt'>) => Promise<void>;

/** 运行期 MCP 客户端调用选项（仅受控测试服务注入，生产路径不设置私有目标白名单） */
export type McpRuntimeClientOptions = Pick<
  McpDiscoverOptions,
  'fetchImpl' | 'allowedPrivateTargets' | 'allowInsecureHttp' | 'trustedCa'
> & {
  /** 可选单次调用超时覆盖（缺省沿用 DEFAULT_TOOL_POLICY.timeoutMs = 20s） */
  callTimeoutMs?: number;
};

/** 用户 MCP 工具快照输出 */
export interface UserMcpToolsSnapshot {
  registry: ToolRegistry;
  getMcpCallsCount: () => number;
  hasMountedTools: boolean;
}

/** 安全提取主机名（不含路径与查询串） */
function extractHostname(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname;
  } catch {
    return 'unknown-host';
  }
}

/** 从静态鉴权配置解密请求头；解密失败直接抛错（失败关闭，不降级为无鉴权） */
function resolveServerAuthHeaders(server: LoadedMcpServerBundle['server']): Record<string, string> {
  if (!server.authHeaderName || !server.authHeaderValueEnc) return {};
  const plain = decryptWebhookSecret(server.authHeaderValueEnc);
  return { [server.authHeaderName]: plain };
}

/** 默认审计落库：容错降级，只告警不阻断调用 */
export async function defaultWriteMcpAudit(
  record: Omit<McpAuditRecordShape, 'createdAt'>
): Promise<void> {
  await prisma.mcpAuditRecord.create({
    data: {
      userId: record.userId,
      serverId: record.serverId,
      serverName: record.serverName,
      toolName: record.toolName,
      hostname: record.hostname,
      eventType: record.eventType,
      outcome: record.outcome,
      snapshotVersion: record.snapshotVersion,
      statusCode: record.statusCode,
      durationMs: record.durationMs,
      responseBytes: record.responseBytes,
      errorKind: record.errorKind,
    },
  });
}

/** 安全调用审计写入器（包裹注入替身，确保写库抛错只 warn） */
async function safeWriteAudit(
  writer: McpAuditWriter,
  record: Omit<McpAuditRecordShape, 'createdAt'>
): Promise<void> {
  try {
    await writer(record);
  } catch (error) {
    console.warn('[mcp] 写入调用审计失败，不阻断用户操作:', error);
  }
}

/**
 * 默认从数据库加载当前用户的活跃 MCP 服务器、对应版本快照与已启用策略。
 */
export async function defaultLoadMcpServers(userId: string): Promise<LoadedMcpServerBundle[]> {
  const servers = await prisma.mcpServerConfig.findMany({
    where: {
      userId,
      isActive: true,
      snapshotVersion: { not: null },
    },
  });

  if (servers.length === 0) return [];

  const serverIds = servers.map((s) => s.id);
  const [snapshots, policies] = await Promise.all([
    prisma.mcpToolSnapshot.findMany({
      where: { userId, serverId: { in: serverIds } },
    }),
    prisma.mcpToolPolicy.findMany({
      where: { userId, serverId: { in: serverIds } },
    }),
  ]);

  const snapshotsByServer = new Map<string, typeof snapshots>();
  for (const snap of snapshots) {
    const list = snapshotsByServer.get(snap.serverId) ?? [];
    list.push(snap);
    snapshotsByServer.set(snap.serverId, list);
  }

  const policiesByServer = new Map<string, typeof policies>();
  for (const policy of policies) {
    const list = policiesByServer.get(policy.serverId) ?? [];
    list.push(policy);
    policiesByServer.set(policy.serverId, list);
  }

  return servers.map((server) => {
    const matchingSnapshot = (snapshotsByServer.get(server.id) ?? []).find(
      (snap) => snap.version === server.snapshotVersion
    );
    const serverPolicies = policiesByServer.get(server.id) ?? [];

    return {
      server: {
        id: server.id,
        name: server.name,
        url: server.url,
        isActive: server.isActive,
        snapshotVersion: server.snapshotVersion,
        configFingerprint: server.configFingerprint,
        authHeaderName: server.authHeaderName,
        authHeaderValueEnc: server.authHeaderValueEnc,
      },
      snapshot: matchingSnapshot
        ? {
            serverId: matchingSnapshot.serverId,
            version: matchingSnapshot.version,
            configFingerprint: matchingSnapshot.configFingerprint,
            tools: (matchingSnapshot.tools as unknown as McpToolDefinition[]) ?? [],
          }
        : null,
      policies: serverPolicies.map((p) => ({
        serverId: p.serverId,
        toolName: p.toolName,
        enabled: p.enabled,
        allowAutoExecute: p.allowAutoExecute,
      })),
    };
  });
}

/**
 * 构建运行期可复用的用户 MCP 工具注册表快照。
 */
export function createUserMcpToolsSnapshot(
  bundles: LoadedMcpServerBundle[],
  baseRegistry: ToolRegistry,
  options: {
    disabledKeys?: Set<string>;
    mcpClient: McpRunClient;
    mcpClientOptions?: McpRuntimeClientOptions;
    writeAudit?: McpAuditWriter;
  }
): UserMcpToolsSnapshot {
  const writeAudit = options.writeAudit ?? defaultWriteMcpAudit;
  const disabledKeys = options.disabledKeys ?? new Set<string>();

  if (bundles.length === 0) {
    return {
      registry: baseRegistry,
      getMcpCallsCount: () => 0,
      hasMountedTools: false,
    };
  }

  const servers = bundles.map((b) => b.server);
  const snapshots = bundles
    .map((b) => b.snapshot)
    .filter((s): s is MountableMcpSnapshot => s !== null);
  const policies = bundles.flatMap((b) => b.policies);

  // 挂载守卫：Server 启用 + 有效快照 + 指纹一致 + 白名单启用 + 受支持工具
  const mountable = selectMountableMcpTools(servers, snapshots, policies).slice(
    0,
    MCP_MAX_ENABLED_TOOLS
  );

  // 二次过滤：应用会话级临时收窄（只收窄，不扩大）
  const effectiveMountable = mountable.filter(
    (tool) =>
      !disabledKeys.has(tool.modelToolName) &&
      !disabledKeys.has(`${tool.serverId}:${tool.toolName}`)
  );

  if (effectiveMountable.length === 0) {
    return {
      registry: baseRegistry,
      getMcpCallsCount: () => 0,
      hasMountedTools: false,
    };
  }

  const bundleByServer = new Map(bundles.map((b) => [b.server.id, b]));
  const policyByKey = new Map(
    policies.map((p) => [`${p.serverId}:${p.toolName}`, p])
  );

  let mcpCallsCount = 0;
  const mcpSpecs: AgentToolSpec[] = [];

  for (const tool of effectiveMountable) {
    const bundle = bundleByServer.get(tool.serverId);
    const policy = policyByKey.get(`${tool.serverId}:${tool.toolName}`);
    if (!bundle || !bundle.snapshot || !policy) continue;

    const { server, snapshot } = bundle;
    const hostname = extractHostname(server.url);
    // 只有用户显式设为 allowAutoExecute=true 才放行；工具名与注解不参与安全判定
    const requiresApproval = policy.allowAutoExecute !== true;
    const approvalConfigFingerprint = requiresApproval
      ? computeConfigFingerprint({
          url: server.url,
          authHeaderName: server.authHeaderName,
          authHeaderValueEnc: server.authHeaderValueEnc,
          snapshotVersion: snapshot.version,
          isActive: server.isActive,
          toolPolicies: bundle.policies,
        })
      : null;

    const spec: AgentToolSpec = {
      name: tool.modelToolName,
      serverName: server.name,
      description: formatMcpToolDescription(server.name, tool.description),
      parameters:
        tool.inputSchema && typeof tool.inputSchema === 'object'
          ? (tool.inputSchema as Record<string, unknown>)
          : { type: 'object', properties: {} },
      ...(requiresApproval && approvalConfigFingerprint
        ? {
            approval: {
              toolId: `${server.id}:${tool.toolName}`,
              host: hostname,
              mcp: {
                serverId: server.id,
                serverName: server.name,
                snapshotVersion: snapshot.version,
                configFingerprint: approvalConfigFingerprint,
              },
              onPending: async (ctx: ToolExecutionContext) => {
                await safeWriteAudit(writeAudit, {
                  userId: ctx.userId,
                  serverId: server.id,
                  serverName: server.name,
                  toolName: tool.toolName,
                  hostname,
                  eventType: 'pending_approval',
                  outcome: 'pending_approval',
                  snapshotVersion: snapshot.version,
                  statusCode: null,
                  durationMs: 0,
                  responseBytes: 0,
                  errorKind: null,
                });
              },
            },
          }
        : {}),
      execute: async (args: unknown, ctx: ToolExecutionContext): Promise<ToolExecutionResult> => {
        const startedAt = Date.now();
        let authHeaders: Record<string, string>;
        try {
          authHeaders = resolveServerAuthHeaders(server);
        } catch {
          await safeWriteAudit(writeAudit, {
            userId: ctx.userId,
            serverId: server.id,
            serverName: server.name,
            toolName: tool.toolName,
            hostname,
            eventType: 'blocked',
            outcome: 'failed',
            snapshotVersion: snapshot.version,
            statusCode: null,
            durationMs: Date.now() - startedAt,
            responseBytes: 0,
            errorKind: 'auth_decrypt_failed',
          });
          return {
            ok: false,
            contentForModel: `外部 MCP 工具「${tool.toolName}」鉴权凭证解密失败，未发起调用。请在回答中如实告知用户，不要凭既有知识冒充结果。`,
            summaryForDisplay: '未执行：鉴权凭证解密失败',
          };
        }

        mcpCallsCount += 1;

        const callTimeoutMs = options.mcpClientOptions?.callTimeoutMs ?? DEFAULT_TOOL_POLICY.timeoutMs;
        const callResult = await options.mcpClient.callTool(server.url, tool.toolName, args, {
          ...(options.mcpClientOptions ?? {}),
          ...(Object.keys(authHeaders).length > 0 ? { authHeaders } : {}),
          signal: ctx.signal,
          timeoutMs: callTimeoutMs,
        });

        const durationMs = Math.max(0, Date.now() - startedAt);

        if (!callResult.ok) {
          const isBlocked = callResult.errorCode === 'MCP_OUTBOUND_BLOCKED';
          const isTooLarge = callResult.errorCode === 'MCP_OUTBOUND_TOO_LARGE';
          const isTimeout = callResult.errorCode === 'MCP_OUTBOUND_TIMEOUT';
          const errorKind = isBlocked
            ? 'outbound_blocked'
            : isTooLarge
              ? 'response_too_large'
              : isTimeout
                ? 'timeout_or_aborted'
                : callResult.errorCode ?? (ctx.signal.aborted ? 'timeout_or_aborted' : 'call_failed');

          await safeWriteAudit(writeAudit, {
            userId: ctx.userId,
            serverId: server.id,
            serverName: server.name,
            toolName: tool.toolName,
            hostname,
            eventType: isBlocked ? 'blocked' : 'call',
            outcome: isBlocked ? 'blocked' : 'failed',
            snapshotVersion: snapshot.version,
            statusCode: callResult.statusCode ?? null,
            durationMs,
            responseBytes: callResult.responseBytes ?? 0,
            errorKind,
          });

          const reasonText = isTooLarge
            ? '响应体超过 200KB 上限'
            : isTimeout
              ? '上游工具响应超时（用时过长），请重试'
              : callResult.reason || '工具调用失败';

          const projectedError = formatMcpToolError(
            { serverName: server.name, toolName: tool.toolName },
            reasonText,
            { summaryPrefix: isBlocked ? '已被安全策略拦截：' : '执行失败：' }
          );

          return {
            ok: false,
            contentForModel: projectedError.contentForModel,
            summaryForDisplay: projectedError.summaryForDisplay,
          };
        }

        const projected = projectMcpToolResult(callResult.content, {
          serverName: server.name,
          toolName: tool.toolName,
        });

        await safeWriteAudit(writeAudit, {
          userId: ctx.userId,
          serverId: server.id,
          serverName: server.name,
          toolName: tool.toolName,
          hostname,
          eventType: 'call',
          outcome: projected.ok ? 'success' : 'failed',
          snapshotVersion: snapshot.version,
          statusCode: callResult.statusCode ?? null,
          durationMs,
          responseBytes: callResult.responseBytes ?? projected.responseBytes,
          errorKind: projected.errorKind ?? null,
        });

        return {
          ok: projected.ok,
          contentForModel: projected.contentForModel,
          summaryForDisplay: projected.summaryForDisplay,
        };
      },
    };

    mcpSpecs.push(spec);
  }

  const mcpMap = new Map<string, AgentToolSpec>(mcpSpecs.map((spec) => [spec.name, spec]));
  const mergedRegistry: ToolRegistry = {
    get: (name: string) => mcpMap.get(name) ?? baseRegistry.get(name),
    list: () => [...baseRegistry.list(), ...mcpSpecs],
    has: (name: string) => mcpMap.has(name) || baseRegistry.has(name),
  };

  return {
    registry: mergedRegistry,
    getMcpCallsCount: () => mcpCallsCount,
    hasMountedTools: mcpSpecs.length > 0,
  };
}
