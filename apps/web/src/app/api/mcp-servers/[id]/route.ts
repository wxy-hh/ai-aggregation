/**
 * MCP 服务器配置更新与删除路由（工单 02 / ADR-0064 §2）
 *
 * 接口契约：
 * - PATCH  /api/mcp-servers/[id]：更新名称、地址、鉴权头与启停状态
 * - DELETE /api/mcp-servers/[id]：删除配置（连带清除密文、工具定义与策略）
 *
 * 安全纪律：
 * - 越权访问返回 404（不泄露配置是否存在）；
 * - 修改地址或鉴权立即清空快照并重置发现状态——旧快照与旧审批不再适用；
 * - 鉴权头取值永不下发；显式清空会连带清除密文与头名。
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { encryptWebhookSecret } from '@/lib/crypto/webhook-secret';
import { updateMcpServerSchema, validateMcpServerUrl } from '@/schemas/mcp-server.schema';
import { sanitizeMcpServer } from '../_lib/serializer';

/** 路由上下文（Next.js 动态路由参数） */
interface RouteContext {
  params: Promise<{ id: string }>;
}

/** 读取当前用户拥有的配置；不存在或不属于当前用户一律返回 null（越权即 404） */
async function findOwnedServer(userId: string, id: string) {
  const server = await prisma.mcpServerConfig.findUnique({ where: { id } });
  if (!server || server.userId !== userId) return null;
  return server;
}

/**
 * 更新 MCP 服务器配置。
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

    const parsed = updateMcpServerSchema.safeParse(body);
    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }
    const input = parsed.data;

    // 地址变更：零 I/O 校验（HTTPS-only + 字面量安全），不发起出站请求
    if (input.url !== undefined) {
      const urlCheck = validateMcpServerUrl(input.url);
      if (!urlCheck.ok) {
        return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
          errors: { url: [urlCheck.reason] },
        });
      }
    }

    const data: Record<string, unknown> = {};

    if (input.name !== undefined) {
      data.name = input.name;
    }

    if (input.isActive !== undefined) {
      data.isActive = input.isActive;
    }

    // 地址或鉴权变更 → 清空快照并重置发现状态（旧快照与旧审批不再适用）
    const securityChanged =
      (input.url !== undefined && input.url.trim() !== server.url) ||
      (input.authHeaderName !== undefined &&
        (input.authHeaderName || null) !== server.authHeaderName) ||
      input.authHeaderValue !== undefined;

    if (input.url !== undefined) {
      data.url = input.url.trim();
    }

    if (input.authHeaderValue !== undefined) {
      const trimmed = input.authHeaderValue?.trim() ?? '';
      if (trimmed === '') {
        // 显式清除：密文与头名一并清除，避免密文残留
        data.authHeaderValueEnc = null;
        data.authHeaderName = null;
      } else {
        try {
          data.authHeaderValueEnc = encryptWebhookSecret(trimmed);
        } catch (error) {
          console.error('加密 MCP 鉴权凭证失败:', error);
          return ApiError.internalError('加密凭证失败，请稍后重试');
        }
      }
    } else if (input.authHeaderName !== undefined) {
      data.authHeaderName = input.authHeaderName || null;
      if (!input.authHeaderName) {
        data.authHeaderValueEnc = null;
      }
    }

    if (securityChanged) {
      data.snapshotVersion = null;
      data.configFingerprint = null;
      data.discoveryStatus = 'never';
      data.discoveryError = null;
    }

    const updated = await prisma.mcpServerConfig.update({
      where: { id: server.id },
      data,
    });

    // 安全配置变更后清空旧快照（保留审计痕迹由审计表承担）
    if (securityChanged) {
      await prisma.mcpToolSnapshot.deleteMany({ where: { serverId: server.id } });
    }

    return createSuccessResponse({ server: sanitizeMcpServer(updated) }, 'MCP 服务器已更新');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('更新 MCP 服务器失败:', error);
    return ApiError.internalError('更新 MCP 服务器失败，请稍后重试');
  }
}

/**
 * 删除 MCP 服务器配置。
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
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

    // 先清关联记录再删主记录：快照与策略随主记录级联删除，显式清理保证不留残留
    await prisma.mcpToolSnapshot.deleteMany({ where: { serverId: server.id } });
    await prisma.mcpToolPolicy.deleteMany({ where: { serverId: server.id } });
    await prisma.mcpServerConfig.delete({ where: { id: server.id } });

    return createSuccessResponse({ id: server.id }, 'MCP 服务器已删除');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('删除 MCP 服务器失败:', error);
    return ApiError.internalError('删除 MCP 服务器失败，请稍后重试');
  }
}
