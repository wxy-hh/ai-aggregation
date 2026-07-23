/**
 * 将文本上下文换算为保守的 Token 预估值。
 * 该值仅用于预留额度和限制输出上限，最终结算始终以供应商 usage 为准。
 */
export function estimateTextTokens(messages: Array<{ content?: string }>): number {
  const characters = messages.reduce((total, message) => total + (message.content?.length ?? 0), 0);
  const chineseCharacters = messages.reduce(
    (total, message) => total + (message.content?.match(/[\u3400-\u9fff]/g)?.length ?? 0),
    0
  );
  const otherCharacters = Math.max(0, characters - chineseCharacters);
  return Math.max(
    1,
    Math.ceil(chineseCharacters * 1.5 + otherCharacters / 4) + messages.length * 16
  );
}

/**
 * 由已生成的输出文本反推 Token 兜底值。
 * 仅在供应商未返回 usage 时用于结算兜底，口径与各流式路由原有 `ceil(字符数/4)` 保持一致。
 */
export function estimateOutputTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
