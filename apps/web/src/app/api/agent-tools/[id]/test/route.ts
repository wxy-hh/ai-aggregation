/**
 * Webhook 工具连通性探测路由（spec §4.3 / §0 D-三期-8）
 *
 * 接口契约：
 * - POST /api/agent-tools/[id]/test：对指定工具登记的 URL 进行握手级连通性探测
 * - 鉴权要求：必须登录，且仅允许探测属于自己的工具（越权或不存在返回 404）
 * - 限流控制：AUTH_RATE_LIMITS.agentToolsTest（每用户每分钟 10 次）
 * - 连通性判据：
 *   - 任何 HTTP 响应（含 4xx/5xx）均判定为可达，返回 { reachable: true, statusCode, durationMs }
 *   - 网络层失败返回 { reachable: false, reason }（DNS 解析失败/连接超时/TLS 错误/命中黑名单/重定向被拒）
 * - 纪律：握手探测不落审计表（不是 agent 真实调用）
 */

import { NextRequest } from 'next/server';
import { prisma } from '@repo/db';
import { getCurrentUser } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { ApiError, createSuccessResponse, handleAuthError } from '@/lib/api/responses';
import { AUTH_RATE_LIMITS, enforceAuthRateLimit } from '@/lib/auth/rate-limit';
import { probeWebhookConnection } from '@/lib/webhook/executor';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * 发起 Webhook 工具握手级连通性探测。
 */
export async function POST(req: NextRequest, context: RouteContext) {
  try {
    const user = await getCurrentUser(req);

    // 用户级限流（fail-closed：限流设施故障拒绝访问）
    const limited = await enforceAuthRateLimit(req, AUTH_RATE_LIMITS.agentToolsTest, user.id);
    if (limited) {
      return limited;
    }

    const { id } = await context.params;

    // 校验工具存在性与归属权：不存在或越权访问他人工具一律返回 404
    const tool = await prisma.userWebhookTool.findUnique({
      where: { id },
    });
    if (!tool || tool.userId !== user.id) {
      return ApiError.notFound('工具不存在');
    }

    // 执行握手级探测（完整安全校验 + 5s 超时 GET + 禁重定向 + 不带 secret 不带 body）
    const probeResult = await probeWebhookConnection(tool.url);

    return createSuccessResponse(probeResult);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }
    console.error('测试 Webhook 连接失败:', error);
    return ApiError.internalError('测试连接失败，请稍后重试');
  }
}
