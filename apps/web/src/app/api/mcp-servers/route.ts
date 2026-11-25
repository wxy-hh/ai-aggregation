/**
 * MCP 服务器配置列表与创建路由（工单 02 / ADR-0064 §2）
 *
 * 接口契约：
 * - GET  /api/mcp-servers：当前用户的 MCP 服务器列表（永不返回鉴权头取值密文）
 * - POST /api/mcp-servers：登记新的 MCP 服务器（HTTPS-only 零 I/O 校验 + 10 个上限
 *   + 首次自动发现；发现失败保留配置并返回失败状态）
 *
 * 安全纪律：
 * - 保存前的校验不发起出站请求；真正的出站只发生在受控发现中；
 * - 发现失败不阻断配置保存——用户可稍后重试；
 * - 审计只写元数据，绝不写密钥、原始参数或 URL 查询串。
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { encryptWebhookSecret } from '@/lib/crypto/webhook-secret';
import {
  createMcpServerSchema,
  updateMcpServerSchema,
  validateMcpServerUrl,
  type UpdateMcpServerInput,
} from '@/schemas/mcp-server.schema';
import { sanitizeMcpServer } from './_lib/serializer';
import { discoverMcpTools } from '@/lib/agent/mcp/discovery';
import { computeConfigFingerprint } from '@/lib/agent/mcp/discovery';
import { selectMountableMcpTools } from '@/lib/agent/mcp/mount';
import { evaluateMcpToolSupport } from '@/lib/agent/mcp/snapshot';
import { withMcpUserLimitLock } from '@/lib/agent/mcp/limit-transaction';
import {
  MCP_MAX_ENABLED_TOOLS,
  MCP_MAX_SERVERS_PER_USER,
  type McpToolDefinition,
} from '@/lib/agent/mcp/contracts';

/** 提取地址中的主机名（审计只存域名，不含路径与查询串） */
function extractHostname(raw: string): string {
  try {
    return new URL(raw).hostname;
  } catch {
    return '';
  }
}

/** 写入 MCP 元数据审计；写库失败只告警、不阻断用户操作 */
async function writeAudit(data: {
  userId: string;
  serverId?: string | null;
  serverName?: string | null;
  hostname: string;
  eventType: 'discover' | 'refresh' | 'call' | 'pending_approval' | 'blocked';
  outcome: 'success' | 'failed' | 'skipped' | 'blocked' | 'pending_approval';
  durationMs?: number;
  errorKind?: string | null;
}): Promise<void> {
  try {
    await prisma.mcpAuditRecord.create({
      data: {
        userId: data.userId,
        serverId: data.serverId ?? null,
        serverName: data.serverName ?? null,
        hostname: data.hostname,
        eventType: data.eventType,
        outcome: data.outcome,
        durationMs: data.durationMs ?? 0,
        errorKind: data.errorKind ?? null,
      },
    });
  } catch (error) {
    console.warn('[mcp] 写入审计失败，不阻断用户操作:', error);
  }
}

/**
 * 获取当前登录用户的 MCP 服务器列表。
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.mcpServersCrud, user.id);
    if (limited) {
      return limited;
    }

    const servers = await prisma.mcpServerConfig.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    const sanitizedServers = servers.map(sanitizeMcpServer);
    const includeEnabledTools = req.nextUrl?.searchParams?.get('includeEnabledTools') === '1';

    if (!includeEnabledTools) {
      return createSuccessResponse({ servers: sanitizedServers });
    }

    const activeServers = servers.filter((s) => s.isActive && s.snapshotVersion !== null);
    if (activeServers.length === 0) {
      return createSuccessResponse({ servers: sanitizedServers, enabledTools: [] });
    }

    const serverIds = activeServers.map((s) => s.id);
    const [snapshots, policies] = await Promise.all([
      prisma.mcpToolSnapshot.findMany({
        where: { userId: user.id, serverId: { in: serverIds } },
      }),
      prisma.mcpToolPolicy.findMany({
        where: { userId: user.id, serverId: { in: serverIds }, enabled: true },
      }),
    ]);

    const snapshotMap = new Map<string, typeof snapshots[number]>();
    for (const snap of snapshots) {
      const server = activeServers.find((s) => s.id === snap.serverId);
      if (server && snap.version === server.snapshotVersion) {
        snapshotMap.set(snap.serverId, snap);
      }
    }

    const mountableSnapshots = Array.from(snapshotMap.values()).map((snap) => ({
      serverId: snap.serverId,
      version: snap.version,
      configFingerprint: snap.configFingerprint,
      tools: (snap.tools as unknown as McpToolDefinition[]) ?? [],
    }));
    const policyMap = new Map(policies.map((p) => [`${p.serverId}:${p.toolName}`, p]));
    const serverNameMap = new Map(activeServers.map((s) => [s.id, s.name]));

    const mountable = selectMountableMcpTools(activeServers, mountableSnapshots, policies).slice(
      0,
      MCP_MAX_ENABLED_TOOLS
    );

    const enabledTools = mountable.map((tool) => ({
      serverId: tool.serverId,
      serverName: serverNameMap.get(tool.serverId) ?? '',
      toolName: tool.toolName,
      description: tool.description,
      modelToolName: tool.modelToolName,
      allowAutoExecute: policyMap.get(`${tool.serverId}:${tool.toolName}`)?.allowAutoExecute === true,
    }));

    return createSuccessResponse({ servers: sanitizedServers, enabledTools });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('获取 MCP 服务器列表失败:', error);
    return ApiError.internalError('获取 MCP 服务器列表失败，请稍后重试');
  }
}

/**
 * 登记新的 MCP 服务器。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.mcpServersCrud, user.id);
    if (limited) {
      return limited;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    // 传输形态语义校验放在形状校验之前：旧版 SSE 的拒绝原因必须是中文，
    // 不能让 Zod 的英文字面量错误泄露给用户。
    const rawTransport = (body as { transport?: unknown }).transport;
    if (typeof rawTransport === 'string' && rawTransport.trim() !== '' && rawTransport !== 'http') {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: { transport: ['不支持该传输形态，本期仅支持 Streamable HTTP'] },
      });
    }

    const parsed = createMcpServerSchema.safeParse(body);
    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const input = parsed.data;

    // 零 I/O 校验：地址合法性与 HTTPS-only（不发起任何出站请求）
    const urlCheck = validateMcpServerUrl(input.url);
    if (!urlCheck.ok) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: { url: [urlCheck.reason] },
      });
    }

    // 启用工具数上限（全局启用 ≤ 8）
    if (input.enableTool) {
      const enabledCount = await prisma.mcpToolPolicy.count({
        where: { userId: user.id, enabled: true },
      });
      if (enabledCount >= MCP_MAX_ENABLED_TOOLS) {
        return ApiError.badRequest(
          `启用的 MCP 工具已达 ${MCP_MAX_ENABLED_TOOLS} 个上限，请先停用部分工具`,
          'INVALID_REQUEST'
        );
      }
    }

    // 鉴权头取值加密落库（永不回显）
    let authHeaderValueEnc: string | null = null;
    if (input.authHeaderValue && input.authHeaderValue.trim() !== '') {
      try {
        authHeaderValueEnc = encryptWebhookSecret(input.authHeaderValue);
      } catch (error) {
        console.error('加密 MCP 鉴权凭证失败:', error);
        return ApiError.internalError('加密凭证失败，请稍后重试');
      }
    }

    // 每用户 10 个上限：计数与创建在同一短事务内串行化，避免并发「先查后写」超额
    const created = await withMcpUserLimitLock(user.id, async (tx) => {
      const count = await tx.mcpServerConfig.count({ where: { userId: user.id } });
      if (count >= MCP_MAX_SERVERS_PER_USER) return null;
      return tx.mcpServerConfig.create({
        data: {
          userId: user.id,
          name: input.name,
          url: input.url.trim(),
          authHeaderName: input.authHeaderName || null,
          authHeaderValueEnc,
          isActive: true,
          discoveryStatus: 'never',
        },
      });
    });
    if (!created) {
      return ApiError.badRequest(
        `最多只能创建 ${MCP_MAX_SERVERS_PER_USER} 个 MCP 服务器`,
        'INVALID_REQUEST'
      );
    }

    // 首次自动发现（失败不阻断保存：配置保留为可重试状态）
    const startedAt = Date.now();
    const discovery = await discoverMcpTools({
      url: created.url,
      serverKey: created.id,
      authHeaderName: created.authHeaderName,
      authHeaderValueEnc: created.authHeaderValueEnc,
    });

    const hostname = extractHostname(created.url);
    if (!discovery.ok) {
      const updated = await prisma.mcpServerConfig.update({
        where: { id: created.id },
        data: { discoveryStatus: 'failed', discoveryError: discovery.reason },
      });
      await writeAudit({
        userId: user.id,
        serverId: created.id,
        serverName: created.name,
        hostname,
        eventType: 'discover',
        outcome: 'failed',
        durationMs: Date.now() - startedAt,
        errorKind: 'discovery_failed',
      });
      return createSuccessResponse(
        { server: sanitizeMcpServer(updated) },
        '已保存，但工具发现失败，可稍后重试',
        201
      );
    }

    // 发现成功：写入首个快照并更新发现状态
    const fingerprint = computeConfigFingerprint({
      url: created.url,
      authHeaderName: created.authHeaderName,
      authHeaderValueEnc: created.authHeaderValueEnc,
      snapshotVersion: 1,
      isActive: true,
    });

    const { updated, policySkipReason } = await withMcpUserLimitLock(user.id, async (tx) => {
      await tx.mcpToolSnapshot.create({
        data: {
          serverId: created.id,
          userId: user.id,
          version: 1,
          totalBytes: discovery.totalBytes,
          tools: discovery.tools as never,
          configFingerprint: fingerprint,
        },
      });

      const updated = await tx.mcpServerConfig.update({
        where: { id: created.id },
        data: {
          discoveryStatus: 'succeeded',
          discoveryError: null,
          snapshotVersion: 1,
          configFingerprint: fingerprint,
        },
      });

      let policySkipReason: string | null = null;
      // 创建时可立即启用一个真实存在且受支持的工具；否则不白占全局启用名额
      if (input.enableTool) {
        const requestedTool = discovery.tools.find((tool) => tool.toolName === input.enableTool);
        if (!requestedTool) {
          policySkipReason = '指定工具不在本次发现快照中';
        } else {
          const support = evaluateMcpToolSupport(requestedTool);
          if (!support.supported) {
            policySkipReason = support.reason ?? '指定工具不受支持';
          } else {
            // 首次预检后仍可能被并发请求占额，必须在锁内再次复核
            const enabledCount = await tx.mcpToolPolicy.count({
              where: { userId: user.id, enabled: true },
            });
            if (enabledCount >= MCP_MAX_ENABLED_TOOLS) {
              policySkipReason = `启用的 MCP 工具已达 ${MCP_MAX_ENABLED_TOOLS} 个上限`;
            } else {
              await tx.mcpToolPolicy.create({
                data: {
                  serverId: created.id,
                  userId: user.id,
                  toolName: input.enableTool,
                  enabled: true,
                  allowAutoExecute: false,
                },
              });
            }
          }
        }
      }

      return { updated, policySkipReason };
    });

    await writeAudit({
      userId: user.id,
      serverId: created.id,
      serverName: created.name,
      hostname,
      eventType: 'discover',
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    return createSuccessResponse(
      { server: sanitizeMcpServer(updated) },
      policySkipReason
        ? `MCP 服务器创建成功，但指定工具未启用：${policySkipReason}`
        : 'MCP 服务器创建成功',
      201
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('创建 MCP 服务器失败:', error);
    return ApiError.internalError('创建 MCP 服务器失败，请稍后重试');
  }
}
