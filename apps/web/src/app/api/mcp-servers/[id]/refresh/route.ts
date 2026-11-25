/**
 * MCP 服务器工具刷新路由（工单 02 / ADR-0064 §5）
 *
 * 接口契约：
 * - POST /api/mcp-servers/[id]/refresh：重新发现工具并原子写入新快照
 *
 * 失败关闭与原子性：
 * - 刷新失败保留上一份成功快照（版本号不变），只更新失败状态与原因；
 * - 刷新成功才写入新版本快照并更新发现状态；
 * - 审计只写元数据，绝不写密钥。
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { sanitizeMcpServer } from '../../_lib/serializer';
import { computeConfigFingerprint, discoverMcpTools } from '@/lib/agent/mcp/discovery';
import { reconcileMcpToolPolicies } from '@/lib/agent/mcp/snapshot';
import type { McpToolDefinition } from '@/lib/agent/mcp/contracts';

/** 路由上下文（Next.js 动态路由参数） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

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
  serverId: string;
  serverName: string;
  hostname: string;
  outcome: 'success' | 'failed';
  durationMs: number;
}): Promise<void> {
  try {
    await prisma.mcpAuditRecord.create({
      data: {
        userId: data.userId,
        serverId: data.serverId,
        serverName: data.serverName,
        hostname: data.hostname,
        eventType: 'refresh',
        outcome: data.outcome,
        durationMs: data.durationMs,
        errorKind: data.outcome === 'failed' ? 'refresh_failed' : null,
      },
    });
  } catch (error) {
    console.warn('[mcp] 写入刷新审计失败，不阻断用户操作:', error);
  }
}

/**
 * 刷新 MCP 服务器的工具定义。
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.mcpServersCrud, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;
    const server = await prisma.mcpServerConfig.findUnique({ where: { id } });
    if (!server || server.userId !== user.id) {
      return ApiError.notFound('MCP 服务器不存在或无权访问');
    }

    const startedAt = Date.now();
    const hostname = extractHostname(server.url);

    const discovery = await discoverMcpTools({
      url: server.url,
      serverKey: server.id,
      authHeaderName: server.authHeaderName,
      authHeaderValueEnc: server.authHeaderValueEnc,
    });

    if (!discovery.ok) {
      // 失败保留上一份成功快照：只更新失败状态与原因
      const updated = await prisma.mcpServerConfig.update({
        where: { id: server.id },
        data: { discoveryStatus: 'failed', discoveryError: discovery.reason },
      });
      await writeAudit({
        userId: user.id,
        serverId: server.id,
        serverName: server.name,
        hostname,
        outcome: 'failed',
        durationMs: Date.now() - startedAt,
      });
      return createSuccessResponse(
        { server: sanitizeMcpServer(updated) },
        '工具刷新失败，已保留上一次成功结果',
        200
      );
    }

    // 读取上一轮快照与策略，用于重整白名单
    const previousSnapshot = await prisma.mcpToolSnapshot.findFirst({
      where: { serverId: server.id, version: server.snapshotVersion ?? -1 },
    });
    const previousPolicies = await prisma.mcpToolPolicy.findMany({
      where: { serverId: server.id },
    });
    const previousTools = ((previousSnapshot?.tools as McpToolDefinition[] | undefined) ??
      []) as McpToolDefinition[];

    // 重整：仅「仍存在且描述与 Schema 未变」的工具保留原有启停与审批策略；
    // 新增、Schema 变化、描述变化的工具一律回落「停用 + 默认必须审批」；
    // 上游已删除的工具从白名单移除。
    const nextPolicies = reconcileMcpToolPolicies(
      previousPolicies.map((policy) => ({
        toolName: policy.toolName,
        enabled: policy.enabled,
        allowAutoExecute: policy.allowAutoExecute,
      })),
      previousTools,
      discovery.tools
    );

    // 新版本号：上一份成功快照 +1
    const nextVersion = (server.snapshotVersion ?? 0) + 1;
    const fingerprint = computeConfigFingerprint({
      url: server.url,
      authHeaderName: server.authHeaderName,
      authHeaderValueEnc: server.authHeaderValueEnc,
      snapshotVersion: nextVersion,
      isActive: server.isActive,
    });

    await prisma.mcpToolSnapshot.create({
      data: {
        serverId: server.id,
        userId: user.id,
        version: nextVersion,
        totalBytes: discovery.totalBytes,
        tools: discovery.tools as never,
        configFingerprint: fingerprint,
      },
    });

    // 落盘重整后的策略：先清旧策略再写新策略，保证白名单与快照一致
    await prisma.mcpToolPolicy.deleteMany({ where: { serverId: server.id } });
    for (const policy of nextPolicies) {
      await prisma.mcpToolPolicy.create({
        data: {
          serverId: server.id,
          userId: user.id,
          toolName: policy.toolName,
          enabled: policy.enabled,
          allowAutoExecute: policy.allowAutoExecute,
        },
      });
    }

    const updated = await prisma.mcpServerConfig.update({
      where: { id: server.id },
      data: {
        discoveryStatus: 'succeeded',
        discoveryError: null,
        snapshotVersion: nextVersion,
        configFingerprint: fingerprint,
      },
    });

    await writeAudit({
      userId: user.id,
      serverId: server.id,
      serverName: server.name,
      hostname,
      outcome: 'success',
      durationMs: Date.now() - startedAt,
    });

    return createSuccessResponse(
      { server: sanitizeMcpServer(updated), tools: discovery.tools },
      '工具已刷新',
      200
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('刷新 MCP 工具失败:', error);
    return ApiError.internalError('刷新工具失败，请稍后重试');
  }
}
