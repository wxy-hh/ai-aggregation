import { normalizeUsage, recordAiUsage } from '@repo/db';
import type { AiUsageRecordInput } from '@repo/shared';

/**
 * 包一层容错，避免资源统计写入影响主链路。
 */
export async function safeRecordAiUsage(input: AiUsageRecordInput): Promise<void> {
  try {
    await recordAiUsage(input);
  } catch (error) {
    console.error('[ai-usage] 资源消耗写入失败:', error);
  }
}

export { normalizeUsage };
