/**
 * RAG 文档解析、切块与应用层分词器
 *
 * 核心设计契约：
 * 1. 解析器选择：调用方按显式 SourceFormat 分流；fileName 只保留 Word/表格标题、工作簿上下文与错误语义
 * 2. PDF：提取各页文本并记录实际页码（pageNumber，1-based），若文件损坏抛出明确的致命中文异常
 * 3. Markdown：扫描标题结构并维护标题栈，产出 headingPath（例如「一级标题 > 二级标题」）
 * 4. TXT：按自然段落与语义切块
 * 5. 语义切块器：基于 RecursiveCharacterTextSplitter（500~800 tokens，约 10% 重叠）
 * 6. 应用层中文分词：基于 @node-rs/jieba 预载词典，空格分隔写入 contentSegmented
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Jieba } from '@node-rs/jieba';
import { dict } from '@node-rs/jieba/dict';
import { PDFParse } from 'pdf-parse';
import {
  RAG_CHUNK_CONFIG,
  estimateTokenCount,
  type DocumentOutline,
  type SourceFormat,
} from '@repo/shared';
import { parseDocxBuffer } from './docx-parser';
import { parseTableBuffer, parseCsvString } from './table-parser';
import { buildDocumentOutline } from './outline-extractor';

// 中英混合 Token 估算的唯一事实源已迁入 @repo/shared (C1)，此处转出口保持既有引用路径不变
export { estimateTokenCount };

/**
 * 带有可选完整 Markdown 提纯快照与层级大纲树的切片集合 (ADR-0036)
 */
export type ParsedDocumentChunks = ParsedChunk[] & { fullMarkdown?: string; outline?: DocumentOutline };

/**
 * 文档解析与切块产生的切片结构
 */
export interface ParsedChunk {
  chunkIndex: number;
  content: string;
  contentSegmented: string;
  headingPath: string | null;
  pageNumber: number | null;
  tokenCount: number;
}

/**
 * 文档解析错误，isFatal 表示确定性不可重试的致命错误（如文件损坏、空内容）
 */
export class DocumentParseError extends Error {
  constructor(
    message: string,
    public readonly isFatal: boolean = true
  ) {
    super(message);
    this.name = 'DocumentParseError';
  }
}

// 结巴分词全局单例（带默认词典）
let jiebaInstance: Jieba | null = null;

function getJieba(): Jieba {
  if (!jiebaInstance) {
    jiebaInstance = Jieba.withDict(dict);
  }
  return jiebaInstance;
}

/**
 * 应用层中文分词函数，输出为空格分隔的词串
 */
export function segmentChinese(text: string): string {
  if (!text || !text.trim()) {
    return '';
  }
  const jieba = getJieba();
  const words = jieba.cut(text, false);
  return words
    .map((w) => w.trim())
    .filter(Boolean)
    .join(' ');
}


/**
 * Markdown 章节扫描与标题层级提取
 */
export interface MarkdownSection {
  headingPath: string | null;
  text: string;
}

export function extractMarkdownSections(markdown: string): MarkdownSection[] {
  const lines = markdown.split(/\r?\n/);
  const sections: MarkdownSection[] = [];
  const headingStack: Array<{ level: number; text: string }> = [];
  let currentLines: string[] = [];

  function getHeadingPath(): string | null {
    if (headingStack.length === 0) return null;
    return headingStack.map((h) => h.text).join(' > ');
  }

  function flushCurrent() {
    const text = currentLines.join('\n').trim();
    if (text) {
      sections.push({
        headingPath: getHeadingPath(),
        text,
      });
    }
    currentLines = [];
  }

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushCurrent();
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      while (headingStack.length > 0 && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text: headingText });
    } else {
      currentLines.push(line);
    }
  }

  flushCurrent();
  return sections;
}

/**
 * 默认文本切块器单例
 */
const textSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: RAG_CHUNK_CONFIG.chunkSize, // 800
  chunkOverlap: RAG_CHUNK_CONFIG.chunkOverlap, // 80 (~10%)
  separators: ['\n\n', '\n', '。', '！', '？', '；', ' ', ''],
});

/**
 * 解析并切分 PDF 缓冲区
 */
export async function parsePdfBuffer(buffer: Buffer): Promise<ParsedChunk[]> {
  let result;
  try {
    const parser = new PDFParse({ data: buffer });
    result = await parser.getText();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(`PDF 文件损坏或格式不正确，无法解析: ${msg}`, true);
  }

  if (!result || !result.pages || result.pages.length === 0) {
    throw new DocumentParseError('PDF 文件未包含任何有效页面', true);
  }

  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;

  for (const page of result.pages) {
    const pageText = (page.text || '').trim();
    if (!pageText) continue;

    // 对单页文本执行切块
    const splitTexts = await textSplitter.splitText(pageText);
    for (const piece of splitTexts) {
      const trimmed = piece.trim();
      if (!trimmed) continue;

      chunks.push({
        chunkIndex: chunkIndex++,
        content: trimmed,
        contentSegmented: segmentChinese(trimmed),
        headingPath: null,
        pageNumber: page.num,
        tokenCount: estimateTokenCount(trimmed),
      });
    }
  }

  if (chunks.length === 0) {
    throw new DocumentParseError(
      'PDF 未包含有效文本内容（可能为纯图片扫描件，暂不支持 OCR）',
      true
    );
  }

  return chunks;
}

/**
 * 解析并切分 Markdown 字符串
 */
export async function parseMarkdownString(content: string): Promise<ParsedChunk[]> {
  const trimmedAll = content.trim();
  if (!trimmedAll) {
    throw new DocumentParseError('Markdown 文档内容为空', true);
  }

  const sections = extractMarkdownSections(content);
  if (sections.length === 0) {
    throw new DocumentParseError('Markdown 文档未提取到有效内容', true);
  }

  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;

  for (const section of sections) {
    const splitTexts = await textSplitter.splitText(section.text);
    for (const piece of splitTexts) {
      const trimmed = piece.trim();
      if (!trimmed) continue;

      chunks.push({
        chunkIndex: chunkIndex++,
        content: trimmed,
        contentSegmented: segmentChinese(trimmed),
        headingPath: section.headingPath,
        pageNumber: null,
        tokenCount: estimateTokenCount(trimmed),
      });
    }
  }

  if (chunks.length === 0) {
    throw new DocumentParseError('Markdown 文档切块后结果为空', true);
  }

  return chunks;
}

/**
 * 解析并切分 TXT 字符串
 */
export async function parseTxtString(content: string): Promise<ParsedChunk[]> {
  const trimmedAll = content.trim();
  if (!trimmedAll) {
    throw new DocumentParseError('TXT 文档内容为空', true);
  }

  const splitTexts = await textSplitter.splitText(content);
  const chunks: ParsedChunk[] = [];
  let chunkIndex = 0;

  for (const piece of splitTexts) {
    const trimmed = piece.trim();
    if (!trimmed) continue;

    chunks.push({
      chunkIndex: chunkIndex++,
      content: trimmed,
      contentSegmented: segmentChinese(trimmed),
      headingPath: null,
      pageNumber: null,
      tokenCount: estimateTokenCount(trimmed),
    });
  }

  if (chunks.length === 0) {
    throw new DocumentParseError('TXT 文档切块后结果为空', true);
  }

  return chunks;
}

/**
 * 统一文档解析入口：只按显式 SourceFormat 分流到对应解析器。
 * fileName 仅作为 Word/表格的标题、工作簿上下文与错误语义，绝不参与解析器选择。
 */
export async function parseDocument(
  buffer: Buffer,
  fileName: string,
  sourceFormat: SourceFormat
): Promise<ParsedDocumentChunks> {
  switch (sourceFormat) {
    case 'pdf': {
      const chunks = await parsePdfBuffer(buffer);
      return Object.assign(chunks, { fullMarkdown: undefined, outline: undefined });
    }

    case 'docx': {
      const { chunks, fullMarkdown } = await parseDocxBuffer(buffer, fileName);
      const outline = buildDocumentOutline(fullMarkdown, chunks);
      return Object.assign(chunks, { fullMarkdown, outline });
    }

    case 'xlsx': {
      const { chunks, fullMarkdown } = await parseTableBuffer(buffer, fileName);
      return Object.assign(chunks, { fullMarkdown, outline: undefined });
    }

    case 'csv': {
      const { chunks, fullMarkdown } = await parseCsvString(buffer.toString('utf-8'), fileName);
      return Object.assign(chunks, { fullMarkdown, outline: undefined });
    }

    case 'md': {
      const textContent = buffer.toString('utf-8');
      const chunks = await parseMarkdownString(textContent);
      const outline = buildDocumentOutline(textContent, chunks);
      return Object.assign(chunks, { fullMarkdown: textContent, outline });
    }

    case 'txt': {
      const textContent = buffer.toString('utf-8');
      const chunks = await parseTxtString(textContent);
      return Object.assign(chunks, { fullMarkdown: textContent, outline: undefined });
    }

    case 'unknown':
      throw new DocumentParseError(
        `不支持的文件格式: ${fileName}，仅支持 PDF、Markdown、TXT、Word 与表格文件`,
        true
      );
  }
}
