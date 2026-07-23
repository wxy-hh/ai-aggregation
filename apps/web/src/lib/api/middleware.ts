/**
 * API 中间件工具函数
 *
 * 提供数据库检查、请求体解析、通用错误处理等辅助功能。
 * 认证逻辑请使用 lib/api/with-auth.ts 中的 withAuth。
 */

import { NextRequest, NextResponse } from 'next/server';
import { ApiError } from './responses';

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
        { error: error instanceof Error ? error.message : '未知错误' }
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
      { error: error instanceof Error ? error.message : '未知错误' }
    );
  }
}
