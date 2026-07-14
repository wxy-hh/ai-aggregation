/**
 * 翻译 API 工具函数
 * 使用讯飞Lite模型进行中英文翻译
 */

import { authFetch } from './client';

export interface TranslateOptions {
  text: string;
  sourceLanguage?: string;
  targetLanguage?: string;
}

export interface TranslateResult {
  translatedText: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/** 额度不足错误码（与后端 voice/translate、voice/transcribe 返回的 code 对齐） */
export const QUOTA_ERROR_CODE = 'INSUFFICIENT_TOKENS';

/**
 * 翻译请求错误。
 * 保留后端返回的结构化错误码与 HTTP 状态码，
 * 便于调用方区分「额度不足」等特定错误并做针对性处理。
 */
export class TranslationError extends Error {
  /** 后端返回的结构化错误码，如 INSUFFICIENT_TOKENS */
  code?: string;
  /** HTTP 状态码 */
  statusCode?: number;

  constructor(message: string, options?: { code?: string; statusCode?: number }) {
    super(message);
    this.name = 'TranslationError';
    this.code = options?.code;
    this.statusCode = options?.statusCode;
  }
}

/** 判断错误是否为「Token 额度不足」 */
export function isQuotaError(error: unknown): boolean {
  return error instanceof TranslationError && error.code === QUOTA_ERROR_CODE;
}

/**
 * 使用讯飞Lite模型翻译文本
 */
export async function translateText(options: TranslateOptions): Promise<TranslateResult> {
  const { text, sourceLanguage = 'Chinese', targetLanguage = 'English' } = options;

  try {
    const response = await authFetch('/api/voice/translate', {
      method: 'POST',
      body: JSON.stringify({
        text,
        sourceLanguage,
        targetLanguage,
      }),
    });

    if (!response.ok) {
      // 解析后端错误体（容错非 JSON 响应），保留 code 与 statusCode
      const errorBody: { error?: string; code?: string } = await response
        .json()
        .catch(() => ({}));
      throw new TranslationError(errorBody.error || '翻译失败', {
        code: errorBody.code,
        statusCode: response.status,
      });
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
