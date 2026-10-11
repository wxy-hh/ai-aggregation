/**
 * Webhook 工具调用观测与审计解析助手（spec §4.4 / 工单 03）
 */

export interface ErrorSummaryInput {
  errorKind?: string | null;
  statusCode?: number | null;
  outcome?: string;
}

/**
 * 将 Webhook 调用审计记录的失败信息转换为用户可读的中文摘要
 */
export function formatToolCallErrorSummary(input: ErrorSummaryInput): string {
  if (input.errorKind === 'timeout') {
    return '连接超时';
  }
  if (input.errorKind === 'tls') {
    return '证书校验失败';
  }
  if (input.errorKind === 'dns') {
    return '域名无法解析';
  }
  if (input.errorKind === 'blocked') {
    return '安全策略拦截';
  }
  if (input.errorKind === 'auth_error') {
    return '鉴权凭证错误';
  }
  if (input.statusCode && input.statusCode >= 400) {
    return `HTTP ${input.statusCode} 错误`;
  }
  if (input.errorKind === 'http_error') {
    return '接口响应异常';
  }
  return '调用失败';
}
