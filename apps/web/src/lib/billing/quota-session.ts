/**
 * 结算会话 shim — 实现已下沉 @repo/db（评审 C3），此处 re-export 保持 web 旧路径不变。
 */
export { QuotaSession } from '@repo/db';
export type {
  QuotaSessionReserveInput,
  QuotaSessionSettleInput,
  QuotaSessionReleaseInput,
  QuotaFinalizeContext,
  QuotaOutcome,
} from '@repo/db';