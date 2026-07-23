export function extractArkOutputText(result: unknown): string {
  if (!result || typeof result !== 'object') {
    throw new Error('ARK 响应为空');
  }

  const payload = result as Record<string, unknown>;
  const topLevelText = payload.output_text;
  if (typeof topLevelText === 'string' && topLevelText.trim()) {
    return topLevelText.trim();
  }

  const output = payload.output;

  if (!Array.isArray(output)) {
    throw new Error('ARK 响应格式不合法');
  }

  for (const item of output) {
    if (!item || typeof item !== 'object') continue;
    const typed = item as Record<string, unknown>;
    if (typed.type !== 'message') continue;

    if (typeof typed.content === 'string' && typed.content.trim()) {
      return typed.content.trim();
    }

    if (!Array.isArray(typed.content)) continue;

    for (const content of typed.content) {
      if (!content || typeof content !== 'object') continue;
      const part = content as Record<string, unknown>;
      const partType = part.type;
      const text = part.text;
      if ((partType === 'output_text' || partType === 'text') && typeof text === 'string') {
        const trimmed = text.trim();
        if (trimmed) return trimmed;
      }

      if (partType === 'output_json' && part.json && typeof part.json === 'object') {
        return JSON.stringify(part.json);
      }
    }
  }

  throw new Error('ARK 未返回有效文本');
}

export function extractJsonBlock(text: string): string {
  const cleaned = text.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return cleaned;
}

export function extractArkUsage(result: unknown): unknown {
  if (!result || typeof result !== 'object') {
    return null;
  }

  const payload = result as Record<string, unknown>;
  return payload.usage ?? (payload.response as Record<string, unknown> | undefined)?.usage ?? null;
}
