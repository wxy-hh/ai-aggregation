/**
 * 自定义 Webhook 工具列表与创建路由（spec §4.3）
 *
 * 接口契约：
 * - GET  /api/agent-tools：获取当前用户的 Webhook 工具列表（永不返回 secret 字段）
 * - POST /api/agent-tools：登记新 Webhook 工具（字面量 guard + https-only + 10 个上限 + callName 每用户唯一）
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { encryptWebhookSecret } from '@/lib/crypto';
import { createAgentToolSchema } from '@/schemas/agent-tool.schema';
import { sanitizeAgentTool } from './_lib/serializer';

/** 单个用户最多允许登记的自定义工具数上限 */
const MAX_TOOLS_PER_USER = 10;

/**
 * 获取当前登录用户的 Webhook 工具列表。
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsCrud, user.id);
    if (limited) {
      return limited;
    }

    const tools = await prisma.userWebhookTool.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
    });

    const sanitizedTools = tools.map(sanitizeAgentTool);

    return createSuccessResponse({ tools: sanitizedTools });
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('获取自定义工具列表失败:', error);
    return ApiError.internalError('获取工具列表失败，请稍后重试');
  }
}

/**
 * 登记新的自定义 Webhook 工具。
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsCrud, user.id);
    if (limited) {
      return limited;
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return ApiError.badRequest('请求体格式不正确');
    }

    const parsed = createAgentToolSchema.safeParse(body);
    if (!parsed.success) {
      return ApiError.badRequest('请求参数错误', 'INVALID_REQUEST', {
        errors: parsed.error.flatten().fieldErrors,
      });
    }

    // 校验每个用户最多 10 个工具的硬上限
    const toolCount = await prisma.userWebhookTool.count({
      where: { userId: user.id },
    });
    if (toolCount >= MAX_TOOLS_PER_USER) {
      return ApiError.badRequest(
        `最多只能创建 ${MAX_TOOLS_PER_USER} 个自定义工具`,
        'INVALID_REQUEST'
      );
    }

    // 校验调用名（callName）在当前用户下的唯一性
    const existing = await prisma.userWebhookTool.findUnique({
      where: {
        userId_callName: {
          userId: user.id,
          callName: parsed.data.callName,
        },
      },
    });
    if (existing) {
      return ApiError.badRequest('该调用名已存在，请更换其他名称', 'INVALID_REQUEST', {
        errors: { callName: ['该调用名已存在，请更换其他名称'] },
      });
    }

    // 凭证加密：若提供了非空鉴权头取值，以 AES-256-GCM 密文落库
    let authHeaderValueEnc: string | null = null;
    if (parsed.data.authHeaderValue && parsed.data.authHeaderValue.trim() !== '') {
      try {
        authHeaderValueEnc = encryptWebhookSecret(parsed.data.authHeaderValue);
      } catch (error) {
        console.error('加密 Webhook 凭证失败:', error);
        return ApiError.internalError('加密凭证失败，请稍后重试');
      }
    }

    const createdTool = await prisma.userWebhookTool.create({
      data: {
        userId: user.id,
        name: parsed.data.name,
        callName: parsed.data.callName,
        description: parsed.data.description,
        url: parsed.data.url,
        method: parsed.data.method,
        authHeaderName: parsed.data.authHeaderName || null,
        authHeaderValueEnc,
        params: parsed.data.params,
        enabled: parsed.data.enabled,
      },
    });

    return createSuccessResponse(
      { tool: sanitizeAgentTool(createdTool) },
      '工具创建成功',
      201
    );
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('创建自定义工具失败:', error);
    return ApiError.internalError('创建工具失败，请稍后重试');
  }
}
