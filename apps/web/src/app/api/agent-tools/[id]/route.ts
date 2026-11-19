/**
 * 单个 Webhook 工具更新与删除路由（spec §4.3）
 *
 * 接口契约：
 * - PATCH  /api/agent-tools/[id]：更新指定工具（越权 404，凭证缺省=保持、空串=清除、非空=加密）
 * - DELETE /api/agent-tools/[id]：删除指定工具（越权 404）
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { encryptWebhookSecret } from '@/lib/crypto';
import { updateAgentToolSchema } from '@/schemas/agent-tool.schema';
import { sanitizeAgentTool } from '../_lib/serializer';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 更新指定的 Webhook 工具。
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsCrud, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;

    // 校验工具存在性与归属权：不存在或越权访问他人工具一律返回 404
    const existing = await prisma.userWebhookTool.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== user.id) {
      return ApiError.notFound('工具不存在');
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = updateAgentToolSchema.safeParse(body);
    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    // 若修改了 callName，检查在当前用户下的唯一性
    if (parsed.data.callName && parsed.data.callName !== existing.callName) {
      const conflict = await prisma.userWebhookTool.findUnique({
        where: {
          userId_callName: {
            userId: user.id,
            callName: parsed.data.callName,
          },
        },
      });
      if (conflict) {
        return ApiError.badRequest('该调用名已存在，请更换其他名称', 'INVALID_REQUEST', {
          errors: { callName: ['该调用名已存在，请更换其他名称'] },
        });
      }
    }

    // 鉴权配置配对校验与处理（spec §4.3 / 鉴权配对校验）：
    const isClearingName =
      parsed.data.authHeaderName !== undefined &&
      (parsed.data.authHeaderName === null || parsed.data.authHeaderName.trim() === '');

    const hasNonEmptyValue =
      parsed.data.authHeaderValue !== undefined &&
      parsed.data.authHeaderValue !== null &&
      parsed.data.authHeaderValue.trim() !== '';

    // 合并计算最终生效的鉴权头名称
    const effectiveAuthHeaderName =
      parsed.data.authHeaderName !== undefined
        ? (parsed.data.authHeaderName?.trim() || null)
        : (existing.authHeaderName?.trim() || null);

    // 规则 3：patch 同时「清空名称 + 提供非空 authHeaderValue」→ 400 矛盾请求
    // 规则 2：patch 提供非空 authHeaderValue，但合并后最终名称为空 → 400
    if (hasNonEmptyValue && !effectiveAuthHeaderName) {
      return ApiError.badRequest('设置鉴权密钥前请先填写鉴权头名称', 'INVALID_REQUEST', {
        errors: { authHeaderName: ['设置鉴权密钥前请先填写鉴权头名称'] },
      });
    }

    // 凭证字段处理语义：
    // - undefined（缺省）：保持不变
    // - ""（显式空串）或 null：清除凭证
    // - 非空字符串：加密后更新密文
    let nextAuthHeaderValueEnc: string | null | undefined = undefined;
    if (parsed.data.authHeaderValue !== undefined) {
      if (parsed.data.authHeaderValue === '' || parsed.data.authHeaderValue === null) {
        nextAuthHeaderValueEnc = null;
      } else {
        try {
          nextAuthHeaderValueEnc = encryptWebhookSecret(parsed.data.authHeaderValue);
        } catch (error) {
          console.error('加密 Webhook 凭证失败:', error);
          return ApiError.internalError('加密凭证失败，请稍后重试');
        }
      }
    }

    // 规则 1：显式清空名称且未提供非空新名称 → 连带把 authHeaderValueEnc 置 null
    if (isClearingName) {
      nextAuthHeaderValueEnc = null;
    }

    const updated = await prisma.userWebhookTool.update({
      where: { id },
      data: {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.callName !== undefined ? { callName: parsed.data.callName } : {}),
        ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        ...(parsed.data.url !== undefined ? { url: parsed.data.url } : {}),
        ...(parsed.data.method !== undefined ? { method: parsed.data.method } : {}),
        ...(parsed.data.authHeaderName !== undefined
          ? { authHeaderName: parsed.data.authHeaderName?.trim() || null }
          : {}),
        ...(nextAuthHeaderValueEnc !== undefined
          ? { authHeaderValueEnc: nextAuthHeaderValueEnc }
          : {}),
        ...(parsed.data.params !== undefined ? { params: parsed.data.params } : {}),
        ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}),
        ...(parsed.data.requiresApproval !== undefined
          ? { requiresApproval: parsed.data.requiresApproval }
          : {}),
      },
    });

    return createSuccessResponse(
      { tool: sanitizeAgentTool(updated) },
      '工具更新成功'
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('更新自定义工具失败:', error);
    return ApiError.internalError('更新工具失败，请稍后重试');
  }
}

/**
 * 删除指定的 Webhook 工具。
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsCrud, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;

    // 校验工具存在性与归属权：不存在或越权访问他人工具一律返回 404
    const existing = await prisma.userWebhookTool.findUnique({
      where: { id },
    });
    if (!existing || existing.userId !== user.id) {
      return ApiError.notFound('工具不存在');
    }

    await prisma.userWebhookTool.delete({
      where: { id },
    });

    return createSuccessResponse(null, '工具已删除');
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('删除自定义工具失败:', error);
    return ApiError.internalError('删除工具失败，请稍后重试');
  }
}
