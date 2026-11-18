/**
 * FAQ 服务端分词支撑逻辑
 */

import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict';

let jiebaInstance: Jieba | null = null;
function getJieba(): Jieba {
  if (!jiebaInstance) {
    try {
      jiebaInstance = Jieba.withDict(dict);
    } catch {
      jiebaInstance = null;
    }
  }
  return jiebaInstance as Jieba;
}

/**
 * FAQ 默认分词器
 */
export function segmentFaqText(text: string): string {
  if (!text || !text.trim()) return '';
  try {
    const jieba = getJieba();
    if (jieba) {
      const words = jieba.cut(text.trim(), false);
      const cleaned = words.map((w) => w.trim()).filter(Boolean);
      if (cleaned.length > 0) return cleaned.join(' ');
    }
  } catch {
    // 降级为正则分词
  }

  const fallbackTokens = text.match(/[一-龥]+|[a-zA-Z0-9_.-]+/g);
  return fallbackTokens ? fallbackTokens.join(' ') : text.trim();
}
