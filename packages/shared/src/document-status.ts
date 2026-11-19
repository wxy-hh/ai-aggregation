/**
 * 文档生命周期状态纯契约 (ADR-0053, C7)
 *
 * 只描述 Document.status 的四个合法写入值；数据库列本身是字符串，
 * 读取侧必须经 isDocumentStatus 收窄后再进入领域逻辑，不得用类型断言绕过。
 */

/** 文档生命周期四态，顺序与状态机推进一致 */
export const DOCUMENT_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;

export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

/** 运行时收窄：只有四态字符串才进入领域逻辑 */
export function isDocumentStatus(value: unknown): value is DocumentStatus {
  return typeof value === 'string' && (DOCUMENT_STATUSES as readonly string[]).includes(value);
}
