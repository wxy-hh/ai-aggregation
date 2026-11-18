import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict';

/**
 * 服务端应用层分词器（单例 + 默认词典）
 *
 * 契约：
 * - 索引与查询共用同一分词实现，输出逐字节同构。
 * - 索引侧 fail-closed：分词器不可用时抛错，绝不写入另一套词法。
 * - 查询侧 skip：分词器不可用时返回 null，由调用方跳过词法召回。
 * - 空文本与全空白返回空串，不触发分词器初始化。
 */

export class SegmentationUnavailableError extends Error {
  constructor(message = '中文分词服务不可用', options?: ErrorOptions) {
    super(message, options);
    this.name = 'SegmentationUnavailableError';
  }
}

let jiebaInstance: Jieba | null = null;

function getJieba(): Jieba {
  if (!jiebaInstance) {
    jiebaInstance = Jieba.withDict(dict);
  }
  return jiebaInstance;
}

function segment(text: string): string {
  const jieba = getJieba();
  const words = jieba.cut(text, false);
  return words
    .map((word) => word.trim())
    .filter(Boolean)
    .join(' ');
}

function isBlank(text: string): boolean {
  return !text || !text.trim();
}

/**
 * 索引端分词：分词器不可用时抛出 SegmentationUnavailableError。
 */
export function segmentForIndex(text: string): string {
  if (isBlank(text)) return '';
  try {
    return segment(text);
  } catch (error) {
    throw new SegmentationUnavailableError('中文分词不可用，索引写入终止', {
      cause: error,
    });
  }
}

/**
 * 查询端分词：分词器不可用时返回 null，调用方据此跳过词法召回。
 */
export function segmentForQuery(text: string): string | null {
  if (isBlank(text)) return '';
  try {
    return segment(text);
  } catch {
    return null;
  }
}
