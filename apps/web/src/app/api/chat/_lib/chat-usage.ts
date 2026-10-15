import type { ChatStreamUsage } from '@repo/shared';
import { estimateTextTokens, estimateOutputTokens } from '@repo/shared';
import type { NormalizedAiUsage } from '@repo/shared';

/**
 * 解析聊天流式正常结束时的 token 用量信息。
 * - 若上游返回了有效 totalTokens（非 null），标记 estimated: false；
 * - 若未返回有效 totalTokens，按结算同口径估算（input: estimateTextTokens, output: estimateOutputTokens），标记 estimated: true。
 */
export function resolveChatStreamUsage(
  usage: NormalizedAiUsage | null,
  messages: Array<{ content?: string }>,
  outputText: string
): ChatStreamUsage {
  if (usage && usage.totalTokens !== null) {
    return {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.totalTokens,
      estimated: false,
    };
  }

  const inputTokens = estimateTextTokens(messages);
  const outputTokens = estimateOutputTokens(outputText);
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    estimated: true,
  };
}
