/**
 * 一元配额托管管道 shim — 实现已下沉 @repo/db（ADR-0049 修订 ADR-0002 位置条款），
 * 此处 re-export 保持 web 旧路径与既有调用方不变。
 */
export { withQuotaUnary } from '@repo/db';
export type { WithQuotaUnaryOptions } from '@repo/db';
