/**
 * MCP 服务器工具列表与策略更新路由（工单 03 / ADR-0064 §5）
 *
 * 接口契约：
 * - GET   /api/mcp-servers/[id]/tools：返回该 Server 当前快照中的工具定义与各自策略
 * - PATCH /api/mcp-servers/[id]/tools：更新单个工具的白名单与审批策略
 *
 * 信任纪律：
 * - 新发现工具默认停用且默认必须审批；
 * - 「允许自动执行」表示用户信任模型生成的参数出站到该服务，**不表示只读或无泄漏风险**；
 * - 工具名称与上游注解不参与安全判定；不受支持的工具不可启用。
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { evaluateMcpToolSupport } from '@/lib/agent/mcp/snapshot';
import { MCP_MAX_ENABLED_TOOLS, type McpToolDefinition } from '@/lib/agent/mcp/contracts';
import { withMcpUserLimitLock } from '@/lib/agent/mcp/limit-transaction';
import { z } from 'zod';

/** 路由上下文（Next.js 动态路由参数） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/** 用户可见的工具条目 */
export interface McpToolItemView {
  toolName: string;
  description: string;
  /** 入参契约摘要（参数名与类型），供用户判断这个工具做什么 */
  inputSummary: Array<{ name: string; type: string; required: boolean }>;
  annotations: Record<string, unknown> | null;
  modelToolName: string;
  /** 是否受平台支持 */
  supported: boolean;
  /** 不支持原因（中文） */
  supportReason?: string;
  /** 是否加入白名单 */
  enabled: boolean;
  /** 是否允许自动执行 */
  allowAutoExecute: boolean;
}

/** 更新策略入参 */
const updateToolPolicySchema = z.object({
  toolName: z.string().trim().min(1, '工具名不能为空').max(128, '工具名过长'),
  enabled: z.boolean().optional(),
  allowAutoExecute: z.boolean().optional(),
});

/** 加锁事务内的策略更新结果：超限不写库，由路由层投影为 400 */
type PatchOutcome =
  | { kind: 'limit_exceeded' }
  | { kind: 'ok'; toolName: string; enabled: boolean; allowAutoExecute: boolean };

/** 从 JSON Schema 抽取参数摘要（只取属性名、类型与是否必填） */
function summarizeInputSchema(schema: unknown): McpToolItemView['inputSummary'] {
  if (typeof schema !== 'object' || schema === null) return [];
  const properties = (schema as Record<string, unknown>).properties;
  if (typeof properties !== 'object' || properties === null) return [];
  const required = new Set(
    Array.isArray((schema as Record<string, unknown>).required)
      ? ((schema as Record<string, unknown>).required as unknown[]).map(String)
      : []
  );
  return Object.entries(properties as Record<string, unknown>).map(([name, definition]) => {
    const type =
      typeof definition === 'object' && definition !== null
        ? String((definition as Record<string, unknown>).type ?? 'unknown')
        : 'unknown';
    return { name, type, required: required.has(name) };
  });
}

/** 读取当前用户拥有的 Server；不存在或不属于当前用户返回 null（越权即 404） */
async function findOwnedServer(userId: string, id: string) {
  const server = await prisma.mcpServerConfig.findUnique({ where: { id } });
  if (!server || server.userId !== userId) return null;
  return server;
}

/**
 * 获取该 Server 当前快照中的工具列表与各自策略。
 */
export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.mcpServersCrud, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;
    const server = await findOwnedServer(user.id, id);
    if (!server) {
      return ApiError.notFound('MCP 服务器不存在或无权访问');
    }

    const snapshot = server.snapshotVersion
      ? await prisma.mcpToolSnapshot.findFirst({
          where: { serverId: server.id, version: server.snapshotVersion },
        })
      : null;

    const policies = await prisma.mcpToolPolicy.findMany({ where: { serverId: server.id } });
    const policyByName = new Map(policies.map((policy) => [policy.toolName, policy]));

    const tools = ((snapshot?.tools as McpToolDefinition[] | undefined) ?? []).map((tool) => {
      const support = evaluateMcpToolSupport(tool);
      const policy = policyByName.get(tool.toolName);
      return {
        toolName: tool.toolName,
        description: tool.description ?? '',
        inputSummary: summarizeInputSchema(tool.inputSchema),
        annotations: tool.annotations ?? null,
        modelToolName: tool.modelToolName,
        supported: support.supported,
        ...(support.reason ? { supportReason: support.reason } : {}),
        enabled: policy?.enabled ?? false,
        allowAutoExecute: policy?.allowAutoExecute ?? false,
      } satisfies McpToolItemView;
    });

    return createSuccessResponse({ tools });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('获取 MCP 工具列表失败:', error);
    return ApiError.internalError('获取工具列表失败，请稍后重试');
  }
}

/**
 * 更新单个工具的白名单与审批策略。
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.mcpServersCrud, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;
    const server = await findOwnedServer(user.id, id);
    if (!server) {
      return ApiError.notFound('MCP 服务器不存在或无权访问');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = updateToolPolicySchema.safeParse(body);
    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const input = parsed.data;

    // 工具必须存在于当前快照
    const snapshot = server.snapshotVersion
      ? await prisma.mcpToolSnapshot.findFirst({
          where: { serverId: server.id, version: server.snapshotVersion },
        })
      : null;
    const tools = (snapshot?.tools as McpToolDefinition[] | undefined) ?? [];
    const tool = tools.find((item) => item.toolName === input.toolName);
    if (!tool) {
      return ApiError.badRequest(
        '该工具不在当前快照中，请先刷新工具',
        'INVALID_REQUEST'
      );
    }

    // 不受支持的工具不可启用
    const support = evaluateMcpToolSupport(tool);
    if (input.enabled && !support.supported) {
      return ApiError.badRequest(
        support.reason ?? '该工具不受支持，无法启用',
        'INVALID_REQUEST'
      );
    }

    // 启用数量复核、现有策略读取与写入统一放进用户级加锁短事务，关闭并发「先查后写」超额
    const outcome = await withMcpUserLimitLock<PatchOutcome>(
      user.id,
      async (tx): Promise<PatchOutcome> => {
        const current = await tx.mcpToolPolicy.findMany({
          where: { serverId: server.id },
        });
        const existingPolicy = current.find((policy) => policy.toolName === input.toolName);

        const nextEnabled = input.enabled ?? existingPolicy?.enabled ?? false;
        const nextAutoExecute = input.allowAutoExecute ?? existingPolicy?.allowAutoExecute ?? false;

        // 只有「从停用变为启用」才占新名额；本来已启用的工具仅切换策略不重复计数
        const willNewlyEnable = nextEnabled && existingPolicy?.enabled !== true;
        if (willNewlyEnable) {
          const enabledCount = await tx.mcpToolPolicy.count({
            where: { userId: user.id, enabled: true },
          });
          if (enabledCount >= MCP_MAX_ENABLED_TOOLS) {
            return { kind: 'limit_exceeded' };
          }
        }

        await tx.mcpToolPolicy.upsert({
          where: { serverId_toolName: { serverId: server.id, toolName: input.toolName } },
          create: {
            serverId: server.id,
            userId: user.id,
            toolName: input.toolName,
            enabled: nextEnabled,
            allowAutoExecute: nextAutoExecute,
          },
          update: {
            enabled: nextEnabled,
            allowAutoExecute: nextAutoExecute,
          },
        });

        return {
          kind: 'ok',
          toolName: input.toolName,
          enabled: nextEnabled,
          allowAutoExecute: nextAutoExecute,
        };
      }
    );

    if (outcome.kind === 'limit_exceeded') {
      return ApiError.badRequest(
        `启用的 MCP 工具已达 ${MCP_MAX_ENABLED_TOOLS} 个上限，请先停用部分工具`,
        'INVALID_REQUEST'
      );
    }

    return createSuccessResponse({
      toolName: outcome.toolName,
      enabled: outcome.enabled,
      allowAutoExecute: outcome.allowAutoExecute,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('更新 MCP 工具策略失败:', error);
    return ApiError.internalError('更新工具策略失败，请稍后重试');
  }
}
