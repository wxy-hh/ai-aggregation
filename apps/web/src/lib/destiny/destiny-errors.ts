/**
 * 命理会话共享错误归一工具
 *
 * HTTP 响应状态码到错误类别（validation / timeout / model / unknown）的映射
 * 是八字、紫微、奇门三学科完全一致的协议归纳逻辑，统一收敛在此，
 * 各学科 session 仅保留专属的提示文案映射（displayError）。
 */

/** 命理会话错误类别（三学科同构） */
export type DestinyErrorKind = 'validation' | 'timeout' | 'model' | 'unknown';

/**
 * 按 HTTP 状态码归类错误类别：
 * - 400/422 → 参数校验错误
 * - 408/504 → 超时错误
 * - 429/5xx → 上游模型/服务错误
 * - 其余 → 未知错误
 */
export function classifyDestinyResponseError(status: number): DestinyErrorKind {
  if (status === 400 || status === 422) return 'validation';
  if (status === 408 || status === 504) return 'timeout';
  if (status === 429 || status >= 500) return 'model';
  return 'unknown';
}
