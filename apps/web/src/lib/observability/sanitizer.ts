/**
 * 观测追踪脱敏深模块（Sanitizer）
 *
 * 职责：
 * 1. 深度遍历追踪数据中的输入、输出与元数据，剔除明文 API Key、Token、密码、Webhook 凭证等敏感信息；
 * 2. 避免明文凭据落盘到 Langfuse 看板，防御链路越权与凭证泄漏风险（QA-014 场景预演）；
 * 3. 容错安全：内置循环引用侦测与类型守卫，处理复杂嵌套结构绝不崩溃。
 */

/** 命中即判定为敏感凭证的键名模式（不区分大小写） */
const SENSITIVE_KEY_REGEX =
  /(?:^key$|api[_-]?key|token|secret|password|passwd|auth|authorization|credential|private[_-]?key|webhook)/i;

/** API Key 模式（如 sk-proj-xxx, sk-xxx） */
const SK_KEY_REGEX = /\bsk-[a-zA-Z0-9_\-]{16,}\b/g;

/** Bearer Token 模式 */
const BEARER_TOKEN_REGEX = /Bearer\s+[a-zA-Z0-9_\-\.]{16,}/g;

/** URL 查询参数中的敏感 token/key/secret 模式 */
const URL_SENSITIVE_PARAM_REGEX = /([?&](?:token|key|secret|apiKey|api_key|password)=)[^&#\s]+/gi;

/**
 * 字符串内容脱敏：
 * 消除字符串中显式暴露的 sk- 密钥、Bearer Token 与 URL 敏感查询参数。
 */
export function sanitizeString(value: string): string {
  if (!value || typeof value !== 'string') {
    return value;
  }

  let result = value;

  // 1. 替换 sk- 凭证为 sk-***
  result = result.replace(SK_KEY_REGEX, 'sk-***');

  // 2. 替换 Bearer 凭证为 Bearer [MASKED]
  result = result.replace(BEARER_TOKEN_REGEX, 'Bearer [MASKED]');

  // 3. 替换 URL 敏感参数为 key=[MASKED]
  result = result.replace(URL_SENSITIVE_PARAM_REGEX, '$1[MASKED]');

  return result;
}

/**
 * 深度脱敏任意输入（对象、数组、字符串或原始值），供 Langfuse Trace / Generation / Span 安全记录。
 *
 * @param value 任意输入
 * @param seen 循环引用集合
 * @param depth 当前遍历深度（最大深度 12，防止超长深层遍历）
 */
export function sanitizeForTrace(
  value: unknown,
  seen = new WeakSet<object>(),
  depth = 0
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === 'string') {
    return sanitizeString(value);
  }

  if (typeof value !== 'object') {
    return value;
  }

  // 深度熔断保护
  if (depth > 12) {
    return '[TRUNCATED_DEPTH]';
  }

  // 循环引用保护
  if (seen.has(value)) {
    return '[CIRCULAR]';
  }
  seen.add(value);

  // 数组递归脱敏
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForTrace(item, seen, depth + 1));
  }

  // 过滤非纯对象（如 Date, RegExp, Error 等）
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof RegExp) {
    return value.toString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: sanitizeString(value.message),
      stack: value.stack ? sanitizeString(value.stack) : undefined,
    };
  }

  // 普通对象递归脱敏
  const sanitizedRecord: Record<string, unknown> = {};
  const record = value as Record<string, unknown>;

  for (const [key, val] of Object.entries(record)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      // 敏感键名直接掩码
      sanitizedRecord[key] = '[MASKED]';
    } else {
      sanitizedRecord[key] = sanitizeForTrace(val, seen, depth + 1);
    }
  }

  return sanitizedRecord;
}
