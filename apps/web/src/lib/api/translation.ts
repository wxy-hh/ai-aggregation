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
      const error = await response.json();
      throw new Error(error.error || 'Translation failed');
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
