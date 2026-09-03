/**
 * 模型输出 JSON 抽取工具（AI 输出 → JSON 值的共享接缝）
 *
 * 评审 C2 落地：这三个抽取原语原先在 qimen-analysis.ts 与 web ark-response.ts
 * 各有一份逐字节拷贝，合盘路由又手写第三份。此处收敛为唯一实现，
 * 调用方按需选择原语；「解析失败后如何兜底」属于各报告域的容错策略，
 * 留在各自的 parse/normalize 层处理，不在此硬合并。
 */

/**
 * 去除 Markdown 代码围栏，返回裸 JSON 文本。
 * 有 ```json 围栏时取围栏内的内容，否则原样返回。
 */
export function extractJsonBlock(text: string): string {
  const cleaned = text.trim();
  const fenced = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced?.[1]) return fenced[1].trim();
  return cleaned;
}

/**
 * 抽取最外层 JSON 对象并解析。
 * 从围栏剥离后的文本中定位第一个 '{' 到最后一个 '}' 再 JSON.parse；
 * 解析失败或未找到对象时抛出，由调用方决定兜底策略。
 */
export function extractJsonObject(text: string): unknown {
  const cleaned = extractJsonBlock(text).trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('模型未返回有效 JSON');
  return JSON.parse(cleaned.slice(start, end + 1));
}

/**
 * 从 ARK Responses API 响应中提取首段输出文本。
 * 兼容顶层 output_text 与 output[] 数组两种结构。
 */
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