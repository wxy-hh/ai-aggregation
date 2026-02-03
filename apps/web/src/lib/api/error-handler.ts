/**
 * API Error Handler with Retry Mechanism
 *
 * This module provides error handling utilities for API calls,
 * including automatic retry with exponential backoff.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  onRetry?: (attempt: number, error: Error) => void;
}

export interface ApiErrorDetails {
  message: string;
  code?: string;
  statusCode?: number;
  isNetworkError: boolean;
  isRetryable: boolean;
}

/**
 * Parse error into structured format
 */
export function parseApiError(error: unknown): ApiErrorDetails {
  // Network errors
  if (error instanceof TypeError && error.message.includes('fetch')) {
    return {
      message: '网络连接失败，请检查网络状态',
      isNetworkError: true,
      isRetryable: true,
    };
  }

  // HTTP errors
  if (error instanceof Response) {
    const statusCode = error.status;
    let message = `请求失败 (${statusCode})`;
    let isRetryable = false;

    if (statusCode >= 500) {
      message = '服务器错误，请稍后重试';
      isRetryable = true;
    } else if (statusCode === 429) {
      message = '请求过于频繁，请稍后重试';
      isRetryable = true;
    } else if (statusCode === 408) {
      message = '请求超时，请重试';
      isRetryable = true;
    } else if (statusCode === 401) {
      message = 'API 认证失败，请检查配置';
      isRetryable = false;
    } else if (statusCode === 403) {
      message = '无权访问，请检查 API Key';
      isRetryable = false;
    } else if (statusCode === 404) {
      message = 'API 端点不存在';
      isRetryable = false;
    }

    return {
      message,
      statusCode,
      isNetworkError: false,
      isRetryable,
    };
  }

  // Error objects
  if (error instanceof Error) {
    // Timeout errors
    if (error.message.includes('timeout') || error.message.includes('timed out')) {
      return {
        message: '请求超时，请重试',
        isNetworkError: true,
        isRetryable: true,
      };
    }

    // Abort errors
    if (error.name === 'AbortError') {
      return {
        message: '请求已取消',
        isNetworkError: false,
        isRetryable: false,
      };
    }

    return {
      message: error.message,
      isNetworkError: false,
      isRetryable: false,
    };
  }

  // Unknown errors
  return {
    message: '未知错误，请重试',
    isNetworkError: false,
    isRetryable: true,
  };
}

/**
 * Execute operation with automatic retry
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    backoffMultiplier = 2,
    onRetry,
  } = options;

  let lastError: unknown;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      const errorDetails = parseApiError(error);

      if (!errorDetails.isRetryable || attempt === maxRetries) {
        throw error;
      }

      // Notify about retry
      if (onRetry) {
        onRetry(attempt + 1, error instanceof Error ? error : new Error(String(error)));
      }

      // Wait before retry with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Increase delay for next retry
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Create user-friendly error message
 */
export function formatErrorMessage(error: unknown, context: string): string {
  const details = parseApiError(error);

  let message = `${context}失败\n\n`;
  message += `错误信息：${details.message}\n\n`;

  if (details.isNetworkError) {
    message += '请检查：\n';
    message += '1. 网络连接是否正常\n';
    message += '2. 是否使用了代理或 VPN\n';
    message += '3. 防火墙是否阻止了连接';
  } else if (details.statusCode === 401 || details.statusCode === 403) {
    message += '请检查：\n';
    message += '1. API Key 是否配置正确\n';
    message += '2. API Key 是否有效\n';
    message += '3. 是否有足够的权限';
  } else if (details.statusCode && details.statusCode >= 500) {
    message += '服务器暂时不可用，请稍后重试';
  } else {
    message += '请检查：\n';
    message += '1. 文件格式是否正确\n';
    message += '2. 文件大小是否符合要求\n';
    message += '3. API 配置是否正确';
  }

  return message;
}

/**
 * Retry progress tracker
 */
export class RetryProgressTracker {
  private listeners: Array<(progress: RetryProgress) => void> = [];

  subscribe(listener: (progress: RetryProgress) => void): () => void {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  notify(progress: RetryProgress): void {
    this.listeners.forEach((listener) => listener(progress));
  }
}

export interface RetryProgress {
  attempt: number;
  maxAttempts: number;
  error: Error;
  nextRetryIn?: number;
}
