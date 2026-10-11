/**
 * parse-curl.ts —— cURL 粘贴导入解析器纯函数模块（工单 06 / spec §4.1 / §E2）
 *
 * 【设计原则与安全红线】
 * 1. 严格安全：禁止 eval/Function/动态脚本执行，纯字符流与分词扫描；
 * 2. 输入上限：单次输入严格限制 8KB（8192 字符），防御巨型恶意文本；
 * 3. 请求方法收敛：仅支持 GET 与 POST。未显式提供 -X 时，按有无 body 推断（有 -d 则 POST，否则 GET）；
 *    显式 PUT/DELETE/PATCH 等直接返回「暂不支持」拒绝，杜绝非预期方法调用；
 * 4. Header 白名单：仅提取 Authorization、X-API-Key 及名称包含 key/token 的鉴权头，
 *    其他头（包括 Cookie 及通用头）全部静默忽略并记录警告提示；
 * 5. 整体降级：任何解析失败整体降级「无法识别，请手动填写」，绝不返回半填表单。
 */

import type { WebhookParamItem, WebhookParamType } from '@/schemas/agent-tool.schema';
import { CALL_NAME_REGEX } from '@/schemas/agent-tool-constants';

/** cURL 输入最大字符数限制（8KB） */
export const MAX_CURL_INPUT_LENGTH = 8192;

/**
 * 从 URL 中派生合规的智能体工具调用名（callName）
 *
 * 优先提取 path 最后一个有效分段（如 /repos/octocat/hello-world -> hello-world）；
 * 其次尝试提取二级域名（如 api.github.com -> github）；
 * 若均不满足 CALL_NAME_REGEX 规范，则回退为 tool_xxxx 随机后缀格式。
 */
export function deriveCallNameFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const lastSegment = segments[segments.length - 1];

    if (lastSegment) {
      const cleaned = lastSegment
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/^[^a-z]+/, '')
        .slice(0, 30);

      if (CALL_NAME_REGEX.test(cleaned)) {
        return cleaned;
      }
    }

    const hostParts = url.hostname.split('.');
    const mainHost =
      hostParts.length >= 2 ? hostParts[hostParts.length - 2] : hostParts[0];

    if (mainHost) {
      const cleaned = mainHost
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/^[^a-z]+/, '')
        .slice(0, 30);

      if (CALL_NAME_REGEX.test(cleaned)) {
        return cleaned;
      }
    }
  } catch {
    // 忽略异常，降级回退
  }

  return `tool_${Math.random().toString(36).substring(2, 6)}`;
}


/** 解析成功后的 DTO 结构 */
export interface ParsedCurlDto {
  name: string;
  callName?: string;
  description: string;
  url: string;
  method: 'GET' | 'POST';
  authHeaderName?: string;
  authHeaderValue?: string;
  params: WebhookParamItem[];
}

/** parseCurl 解析结果联合类型 */
export type ParseCurlResult =
  | {
      ok: true;
      dto: ParsedCurlDto;
      warnings: string[];
    }
  | {
      ok: false;
      reason: string;
    };

/**
 * 命令行字符串安全分词器（纯字符串扫描，不使用 eval/Function）
 *
 * 支持单引号、双引号、反斜杠续行与空格分隔
 */
function tokenizeCommandLine(cmd: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let escapeNext = false;

  for (let i = 0; i < cmd.length; i++) {
    const char = cmd[i];

    if (escapeNext) {
      current += char;
      escapeNext = false;
      continue;
    }

    if (char === '\\' && !inSingleQuote) {
      // 在双引号或无引号中，反斜杠作为转义符
      if (i + 1 < cmd.length && cmd[i + 1] === '\n') {
        // 续行符（\ 后紧随换行），跳过换行
        i++;
        continue;
      }
      escapeNext = true;
      continue;
    }

    if (char === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (/\s/.test(char) && !inSingleQuote && !inDoubleQuote) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

/**
 * 推断字面量值的参数类型
 */
function inferParamType(val: unknown): WebhookParamType | null {
  if (typeof val === 'string') return 'string';
  if (typeof val === 'number') return 'number';
  if (typeof val === 'boolean') return 'boolean';
  return null;
}

/**
 * 推断字符串形式值的参数类型（用于表单编码场景）
 */
function inferStringValueType(raw: string): WebhookParamType {
  const trimmed = raw.trim();
  if (trimmed === 'true' || trimmed === 'false') {
    return 'boolean';
  }
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return 'number';
  }
  return 'string';
}

/**
 * 安全解析请求体，提取参数声明
 *
 * 遵循安全红线与「不半填」原则：
 * - 仅支持 JSON 与 x-www-form-urlencoded；
 * - 若有嵌套对象或数组，不破坏顶层字段，但记录「嵌套」字样警告；
 * - 若非合法 JSON 亦非合法 key=value 键值表单（如 XML、纯二进制），整体降级失败，避免半填表单。
 */
function parseRequestBody(
  rawBody: string,
  warnings: string[]
): { ok: true; params: WebhookParamItem[] } | { ok: false; reason: string } {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return { ok: true, params: [] };
  }

  // 1. 尝试作为 JSON 解析
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) || typeof parsed !== 'object' || parsed === null) {
        return {
          ok: false,
          reason: '无法识别请求体格式（暂不支持 JSON 根数组或基本值），请手动填写',
        };
      }

      const params: WebhookParamItem[] = [];
      let hasNested = false;

      for (const [key, value] of Object.entries(parsed)) {
        if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
          // 参数名不符合规范时忽略并提示
          warnings.push(`已忽略非标准字符参数名「${key}」`);
          continue;
        }

        if (value !== null && typeof value === 'object') {
          // 嵌套对象或嵌套数组
          hasNested = true;
          continue;
        }

        const paramType = inferParamType(value) || 'string';
        params.push({
          name: key,
          type: paramType,
          required: true,
          description: '',
        });
      }

      if (hasNested) {
        warnings.push('已忽略请求体中的嵌套对象或数组字段');
      }

      return { ok: true, params };
    } catch {
      return {
        ok: false,
        reason: '无法识别 JSON 请求体格式，请手动填写',
      };
    }
  }

  // 2. 尝试作为 x-www-form-urlencoded 解析
  // 必须形如 key1=val1&key2=val2，且 key 必须符合标准命名规范
  if (trimmed.includes('=') && !trimmed.startsWith('<')) {
    const pairs = trimmed.split('&');
    const params: WebhookParamItem[] = [];
    let isValidForm = true;

    for (const pair of pairs) {
      if (!pair) continue;
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) {
        isValidForm = false;
        break;
      }
      // 畸形百分号序列会让 decodeURIComponent 抛 URIError：按无法识别处理，绝不上抛
      let rawKey: string;
      let rawVal: string;
      try {
        rawKey = decodeURIComponent(pair.slice(0, eqIdx).trim());
        rawVal = decodeURIComponent(pair.slice(eqIdx + 1).trim());
      } catch {
        isValidForm = false;
        break;
      }

      if (!/^[a-zA-Z0-9_-]+$/.test(rawKey)) {
        isValidForm = false;
        break;
      }

      params.push({
        name: rawKey,
        type: inferStringValueType(rawVal),
        required: true,
        description: '',
      });
    }

    if (isValidForm && params.length > 0) {
      return { ok: true, params };
    }
  }

  // 3. 其他非结构化内容（如 XML、纯文本、未识别格式）：根据「不半填」原则直接拒绝
  return {
    ok: false,
    reason: '无法识别请求体格式（仅支持 JSON 与表单键值对），请手动填写',
  };
}

/**
 * 解析用户粘贴的 cURL 命令行文本
 *
 * @param text 用户输入的命令行内容
 * @returns 解析结果对象或失败原因
 */
export function parseCurl(text: string): ParseCurlResult {
  const trimmed = text.trim();

  // 1. 安全红线 1：输入上限 8KB
  if (trimmed.length > MAX_CURL_INPUT_LENGTH) {
    return {
      ok: false,
      reason: '输入内容超出上限（最大支持 8KB），请精简或手动填写',
    };
  }

  if (!trimmed) {
    return {
      ok: false,
      reason: '无法识别，请手动填写',
    };
  }

  // 2. 将换行续行符标准化并进行初步校验
  const normalized = trimmed.replace(/\\\r?\n/g, ' ');

  // 检查是否以 curl 开头
  if (!/^curl(?:\s+|$)/i.test(normalized)) {
    return {
      ok: false,
      reason: '无法识别，请手动填写',
    };
  }

  // 3. 安全分词
  const tokens = tokenizeCommandLine(normalized);
  if (tokens.length === 0 || tokens[0].toLowerCase() !== 'curl') {
    return {
      ok: false,
      reason: '无法识别，请手动填写',
    };
  }

  let explicitMethod: string | null = null;
  let rawUrl: string | null = null;
  const rawHeaders: string[] = [];
  const rawDataBodies: string[] = [];
  const warnings: string[] = [];

  // 4. 扫描命令行参数
  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];

    if (token === '-X' || token === '--request') {
      if (i + 1 < tokens.length) {
        explicitMethod = tokens[++i].toUpperCase();
      }
    } else if (token.startsWith('-X')) {
      explicitMethod = token.slice(2).toUpperCase();
    } else if (token === '-H' || token === '--header') {
      if (i + 1 < tokens.length) {
        rawHeaders.push(tokens[++i]);
      }
    } else if (token === '-d' || token === '--data' || token === '--data-raw' || token === '--data-binary') {
      if (i + 1 < tokens.length) {
        rawDataBodies.push(tokens[++i]);
      }
    } else if (token === '--url') {
      if (i + 1 < tokens.length) {
        rawUrl = tokens[++i];
      }
    } else if (!token.startsWith('-')) {
      // 可能是 URL
      if (!rawUrl && (token.startsWith('http://') || token.startsWith('https://') || token.includes('://') || token.startsWith('//'))) {
        rawUrl = token;
      }
    }
  }

  // 5. 解析并白名单过滤请求头
  let authHeaderName: string | undefined;
  let authHeaderValue: string | undefined;
  let ignoredHeaderCount = 0;

  for (const h of rawHeaders) {
    const colonIndex = h.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const hName = h.slice(0, colonIndex).trim();
    const hValue = h.slice(colonIndex + 1).trim();

    // 检查是否为 Cookie（强制忽略）
    if (/^cookie$/i.test(hName)) {
      ignoredHeaderCount++;
      continue;
    }

    // 白名单判定：Authorization / X-API-Key / 名称含 key 或 token（不区分大小写）
    const isAuthHeader =
      /^authorization$/i.test(hName) ||
      /^x-api-key$/i.test(hName) ||
      /key/i.test(hName) ||
      /token/i.test(hName);

    if (isAuthHeader) {
      if (!authHeaderName) {
        authHeaderName = hName;
        authHeaderValue = hValue;
      } else {
        // 若已提取过一个鉴权头，多余的作为被忽略处理
        ignoredHeaderCount++;
      }
    } else {
      // 非鉴权头静默忽略并计数
      ignoredHeaderCount++;
    }
  }

  if (ignoredHeaderCount > 0) {
    warnings.push(`已忽略 ${ignoredHeaderCount} 个非鉴权请求头`);
  }

  // 6. 校验请求方法
  if (explicitMethod) {
    if (explicitMethod !== 'GET' && explicitMethod !== 'POST') {
      return {
        ok: false,
        reason: `请求方法 ${explicitMethod} 暂不支持（仅支持 GET 与 POST）`,
      };
    }
  }

  const finalMethod: 'GET' | 'POST' = explicitMethod === 'GET'
    ? 'GET'
    : explicitMethod === 'POST'
      ? 'POST'
      : rawDataBodies.length > 0
        ? 'POST'
        : 'GET';

  if (!rawUrl) {
    return {
      ok: false,
      reason: '无法识别，请手动填写',
    };
  }

  // 7. 解析请求体数据（如果有）
  let parsedParams: WebhookParamItem[] = [];
  if (rawDataBodies.length > 0) {
    // 多个 -d 连接为一个（cURL 默认语义是 & 拼接，这里取最新或拼接）
    const combinedBody = rawDataBodies.join('&');
    const bodyResult = parseRequestBody(combinedBody, warnings);
    if (!bodyResult.ok) {
      return {
        ok: false,
        reason: bodyResult.reason,
      };
    }
    parsedParams = bodyResult.params;
  }

  return {
    ok: true,
    dto: {
      name: 'cURL 导入工具',
      callName: deriveCallNameFromUrl(rawUrl),
      description: '由 cURL 命令导入自动生成',
      url: rawUrl,
      method: finalMethod,
      authHeaderName,
      authHeaderValue,
      params: parsedParams,
    },
    warnings,
  };
}
