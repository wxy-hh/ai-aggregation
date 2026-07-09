/**
 * API 路由认证包装器。
 *
 * 统一处理认证、用户上下文获取和 AuthError 响应转换，
 * 让路由 handler 专注于业务逻辑。
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, type UserContext } from '@/lib/auth/get-current-user';
import { AuthError } from '@/lib/auth/errors';
import { handleAuthError } from './responses';

export type WithAuthHandler = (user: UserContext, req: Request) => Promise<NextResponse | Response>;

/**
 * 包装需要认证的 API handler。
 * - 自动从请求中提取并验证用户
 * - 将 `UserContext` 注入 handler
 * - 捕获 `AuthError` 并转换为统一 401/403 响应
 */
export async function withAuth(
  req: Request,
  handler: WithAuthHandler
): Promise<NextResponse | Response> {
  try {
    const user = await getCurrentUser(req);
    return await handler(user, req);
  } catch (error) {
    if (error instanceof AuthError) {
      return handleAuthError(error);
    }

    console.error('✗ withAuth 处理失败:', error);
    return NextResponse.json(
      { success: false, error: '服务器内部错误' },
      { status: 500 }
    );
  }
}
