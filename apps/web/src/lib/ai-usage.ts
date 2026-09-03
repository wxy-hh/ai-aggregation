/**
 * 资源用量 shim — 实现已下沉 @repo/db（评审 C3），此处 re-export 保持 web 旧路径不变。
 */
export { safeRecordAiUsage, normalizeUsage } from '@repo/db';