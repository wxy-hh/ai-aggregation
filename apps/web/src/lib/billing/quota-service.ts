/**
 * 配额服务 shim — 实现已下沉 @repo/db（评审 C3），此处 re-export 保持 web 旧路径不变。
 */
export {
  reserveAiQuota,
  reserveAiQuotaBatch,
  reserveChatQuota,
  reserveChatQuotaBatch,
  useExistingAiQuota,
  settleAiQuota,
  recordMediaTask,
  releaseAiQuota,
} from '@repo/db';
export type { ReserveAiQuotaInput } from '@repo/db';