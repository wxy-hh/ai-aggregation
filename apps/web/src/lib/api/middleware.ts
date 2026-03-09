/**
 * API 中间件工具函数
 *
 * 提供认证、权限检查等中间件功能
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from './responses';

/**
 * 认证检查函数类型（需要从实际的认证模块导入）
 */
type RequireAuthFn = (req: NextRequest) => Promise<string>;

/**
 * 权限检查函数类型
 */
type CheckResourceAccessFn = (userId: string, resourceUserId: string) => boolean;

/**
 * 带认证的请求处理器
 */
export async function withAuth(
  req: NextRequest,
  requireAuth: RequireAuthFn,
  handler: (userId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  try {
    const userId = await requireAuth(req);
    console.log('✓ 用户认证成功:', userId);
    return await handler(userId);
  } catch (error) {
    console.error('✗ 用户未认证:', error);
    return ApiError.unauthorized();
  }
}

/**
 * 带资源权限检查的请求处理器
 */
export async function withResourceAccess(
  req: NextRequest,
  requireAuth: RequireAuthFn,
  checkResourceAccess: CheckResourceAccessFn,
  resourceUserId: string,
  handler: (userId: string) => Promise<NextResponse>
): Promise<NextResponse> {
  return withAuth(req, requireAuth, async (userId) => {
    if (!checkResourceAccess(userId, resourceUserId)) {
      console.error('✗ 无权访问该资源');
      return ApiError.forbidden();
    }
    return await handler(userId);
  });
}

/**
 * 数据库可用性检查
 */
export function checkDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * 带数据库检查的中间件
 */
export async function withDatabase(handler: () => Promise<NextResponse>): Promise<NextResponse> {
  if (!checkDatabaseAvailable()) {
    console.error('✗ 数据库未配置');
    return ApiError.serviceUnavailable();
  }
  return await handler();
}

/**
 * 解析 JSON 请求体
 */
export async function parseJsonBody<T = unknown>(
  req: NextRequest
): Promise<{ success: true; data: T } | { success: false; response: NextResponse }> {
  try {
    const data = await req.json();
    return { success: true, data };
  } catch (error) {
    console.error('✗ 请求体解析失败:', error);
    return {
      success: false,
      response: ApiError.badRequest(
        '请求体格式错误',
        'INVALID_REQUEST_BODY',
        error instanceof Error ? error.message : '未知错误'
      ),
    };
  }
}

/**
 * 通用错误处理包装器
 */
export async function withErrorHandling(
  handler: () => Promise<NextResponse>,
  context: string = 'API'
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    console.error(`✗ ${context} 处理失败:`, error);
    return ApiError.internalError(
      '服务器内部错误',
      error instanceof Error ? error.message : '未知错误'
    );
  }
}
