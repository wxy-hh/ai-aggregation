/**
 * astrology-qa-answer.ts —— 星语问答 · 模型输出解析（04 工单）
 *
 * 问答是一次流式调用，模型输出固定为 `{"text":"…","citations":["…"]}` 的 JSON 对象：
 * - 正文扫描器从流里增量提取 text 字段的正文（其余字段一律跳过），界面据此逐字浮现；
 *   转义序列与 \uXXXX 编码可能被网络分块切开，逐字符状态机保证跨块还原。
 * - 终局解析（parseAnswerJson）容忍模型在 JSON 前后带说明文字或代码围栏，正文缺失或整体
 *   不是 JSON 时诚实报错——问答绝不用任何模板文案兜底（失败即失败卡）。
 */

import { z } from 'zod';

/** 模型输出无法还原为回答（消息可直接展示给用户） */
export class AstrologyQaAnswerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AstrologyQaAnswerError';
  }
}

type ScanState =
  | 'seek-object'
  | 'key-or-end'
  | 'key'
  | 'colon'
  | 'value'
  | 'target-text'
  | 'target-unicode'
  | 'skip-string'
  | 'skip-structure'
  | 'skip-scalar'
  | 'finished';

const ESCAPES: Record<string, string> = {
  '"': '"',
  '\\': '\\',
  '/': '/',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
};

export interface AnswerTextScanner {
  /** 推进一个分块，返回本块新增的正文（无新增为空串） */
  push(chunk: string): string;
  /** 累计原始输出（用量估算兜底用） */
  raw(): string;
}

/**
 * JSON 文本字段扫描器：只提取根对象上指定字段的字符串值，其余结构按 JSON 语法跳过。
 * 结构一旦不符合 JSON 语法即停止扫描（不猜测式修补；终局解析会如实报错）。
 */
export function createAnswerTextScanner(field: string = 'text'): AnswerTextScanner {
  let state: ScanState = 'seek-object';
  let key = '';
  let escaped = false;
  let unicode = '';
  let depth = 0;
  let inString = false;
  let raw = '';
  let pending = '';

  return {
    push(chunk: string): string {
      raw += chunk;
      pending = '';

      for (let i = 0; i < chunk.length; i += 1) {
        const ch = chunk[i];
        switch (state) {
          case 'seek-object':
            if (ch === '{') state = 'key-or-end';
            break;
          case 'key-or-end':
            if (ch === '}' || /\s/.test(ch) || ch === ',') break;
            if (ch === '"') {
              key = '';
              escaped = false;
              state = 'key';
              break;
            }
            state = 'finished';
            break;
          case 'key':
            if (escaped) {
              key += ch;
              escaped = false;
              break;
            }
            if (ch === '\\') {
              escaped = true;
              break;
            }
            if (ch === '"') {
              state = 'colon';
              break;
            }
            key += ch;
            break;
          case 'colon':
            if (/\s/.test(ch)) break;
            if (ch === ':') {
              state = 'value';
              break;
            }
            state = 'finished';
            break;
          case 'value':
            if (/\s/.test(ch)) break;
            if (ch === '"') {
              escaped = false;
              state = key === field ? 'target-text' : 'skip-string';
              break;
            }
            if (ch === '{' || ch === '[') {
              depth = 1;
              inString = false;
              escaped = false;
              state = 'skip-structure';
              break;
            }
            state = 'skip-scalar';
            break;
          case 'target-text':
            if (escaped) {
              escaped = false;
              if (ch === 'u') {
                unicode = '';
                state = 'target-unicode';
                break;
              }
              pending += ESCAPES[ch] ?? ch;
              break;
            }
            if (ch === '\\') {
              escaped = true;
              break;
            }
            if (ch === '"') {
              state = 'finished';
              break;
            }
            pending += ch;
            break;
          case 'target-unicode':
            if (!/[0-9a-fA-F]/.test(ch)) {
              state = 'finished';
              break;
            }
            unicode += ch;
            if (unicode.length === 4) {
              pending += String.fromCharCode(Number.parseInt(unicode, 16));
              state = 'target-text';
            }
            break;
          case 'skip-string':
            if (escaped) escaped = false;
            else if (ch === '\\') escaped = true;
            else if (ch === '"') state = 'key-or-end';
            break;
          case 'skip-structure':
            if (inString) {
              if (escaped) escaped = false;
              else if (ch === '\\') escaped = true;
              else if (ch === '"') inString = false;
              break;
            }
            if (ch === '"') inString = true;
            else if (ch === '{' || ch === '[') depth += 1;
            else if (ch === '}' || ch === ']') {
              depth -= 1;
              if (depth <= 0) state = 'key-or-end';
            }
            break;
          case 'skip-scalar':
            if (ch === ',') state = 'key-or-end';
            else if (ch === '}') state = 'finished';
            break;
          case 'finished':
            break;
        }
      }

      return pending;
    },
    raw: () => raw,
  };
}

const AnswerSchema = z.object({
  text: z.string().trim().min(1, '模型未给出回答正文'),
  citations: z.array(z.string()).default([]),
});

export interface ParsedQaAnswer {
  text: string;
  /** 模型给出的事实键 / 模块引用键（尚未过白名单，路由按事实层收敛） */
  citations: string[];
}

/** 从原始输出里切出根 JSON 对象文本（容忍前后说明文字与代码围栏） */
function extractRootObject(raw: string): string | null {
  const start = raw.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
}

/** 终局解析：从累计输出里还原回答正文与引用键；不合法即抛错（不做任何兜底拼装） */
export function parseAnswerJson(raw: string): ParsedQaAnswer {
  const slice = extractRootObject(raw);
  if (!slice) throw new AstrologyQaAnswerError('回答未能送达，请稍后重试');

  let parsed: unknown;
  try {
    parsed = JSON.parse(slice) as unknown;
  } catch {
    throw new AstrologyQaAnswerError('回答未能送达，请稍后重试');
  }

  const result = AnswerSchema.safeParse(parsed);
  if (!result.success) throw new AstrologyQaAnswerError('回答未能送达，请稍后重试');
  return result.data;
}
