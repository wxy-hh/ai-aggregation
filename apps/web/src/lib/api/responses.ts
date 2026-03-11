/**
 * API 响应工具函数
 *
 * 提供统一的 API 响应格式,确保所有 API 返回一致的错误和成功响应
 */

import { NextResponse } from 'next/server';

/**
 * 错误代码枚举
 */
export const ErrorCode = {
  // 认证相关
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',

  // 资源相关
  NOT_FOUND: 'NOT_FOUND',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  IMPORT_NOT_FOUND: 'IMPORT_NOT_FOUND',

  // 请求相关
  INVALID_REQUEST: 'INVALID_REQUEST',
  INVALID_REQUEST_BODY: 'INVALID_REQUEST_BODY',
  MISSING_FILE: 'MISSING_FILE',
  INVALID_FILE: 'INVALID_FILE',

  // 服务相关
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
  DATABASE_ERROR: 'DATABASE_ERROR',
  INTERNAL_ERROR: 'INTERNAL_ERROR',

  // 业务相关
  PARSE_FAILED: 'PARSE_FAILED',
  CONVERSION_FAILED: 'CONVERSION_FAILED',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * 错误响应接口
 */
interface ErrorResponse {
  error: string;
  errorCode: ErrorCodeType;
  details?: unknown;
}

/**
 * 成功响应接口
 */
interface SuccessResponse<T = unknown> {
  data?: T;
  message?: string;
}

/**
 * 创建错误响应
 */
export function createErrorResponse(
  message: string,
  code: ErrorCodeType,
  status: number,
  details?: Record<string, unknown>
): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: message,
      errorCode: code,
      ...(details && { details }),
    },
    { status }
  );
}

/**
 * 创建成功响应
 */
export function createSuccessResponse<T = unknown>(
  data?: T,
  message?: string,
  status: number = 200
): NextResponse<SuccessResponse<T>> {
  return NextResponse.json(
    {
      ...(data !== undefined && { data }),
      ...(message && { message }),
    },
    { status }
  );
}

/**
 * 常用错误响应快捷方法
 */
export const ApiError = {
  unauthorized: (message = '未授权访问') =>
    createErrorResponse(message, ErrorCode.UNAUTHORIZED, 401),

  forbidden: (message = '无权访问该资源') => createErrorResponse(message, ErrorCode.FORBIDDEN, 403),

  notFound: (message = '资源不存在', code: ErrorCodeType = ErrorCode.NOT_FOUND) =>
    createErrorResponse(message, code, 404),

  badRequest: (
    message: string,
    code: ErrorCodeType = ErrorCode.INVALID_REQUEST,
    details?: Record<string, unknown>
  ) => createErrorResponse(message, code, 400, details),

  serviceUnavailable: (message = '服务暂时不可用') =>
    createErrorResponse(message, ErrorCode.SERVICE_UNAVAILABLE, 503),

  internalError: (message = '服务器内部错误', details?: Record<string, unknown>) =>
    createErrorResponse(message, ErrorCode.INTERNAL_ERROR, 500, details),
};
