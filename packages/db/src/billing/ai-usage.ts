import { recordAiUsage } from '../ai-usage';
import type { AiUsageRecordInput } from '@repo/shared';

/**
 * 包一层容错，避免资源统计写入影响主链路。
 * 由 apps/web 的 lib/ai-usage shim 对外暴露，worker 可直接复用。
 */
export async function safeRecordAiUsage(input: AiUsageRecordInput): Promise<void> {
  try {
    await recordAiUsage(input);
  } catch (error) {
    console.error('[ai-usage] 资源消耗写入失败:', error);
  }
}