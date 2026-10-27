/**
 * Word (.docx) 语义提纯与大纲解析器 (ADR-0029)
 *
 * 核心设计契约：
 * 1. 语义提取：基于 mammoth 将 Word (.docx) 提纯为富语义 HTML（大纲标题 h1~h6、段落、粗体、有序/无序列表、内嵌表格）
 * 2. 图片剥离防污染：剥离所有内嵌插图二进制与 base64 文本，保护切片纯净度与 Token 预算
 * 3. 结构化 Markdown：基于 Turndown 与 GFM 插件转为规范 Markdown
 * 4. 标题栈复用：复用 parseMarkdownString 体系提取 headingPath 章节大纲路径
 * 5. 产出 fullMarkdown 供全文抽屉直读与原文件下载联动
 */

import mammoth from 'mammoth';
import TurndownService from 'turndown';
// @ts-expect-error turndown-plugin-gfm 缺少显式声明文件
import { gfm } from 'turndown-plugin-gfm';
import {
  ParsedChunk,
  DocumentParseError,
  parseMarkdownString,
} from './parser';

export interface DocxParseResult {
  chunks: ParsedChunk[];
  fullMarkdown: string;
}

/**
 * 创建专用于 Word 转换的 Turndown 实例（剥离图片与无效标签）
 */
function createDocxTurndown(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
  });

  service.use(gfm);

  // 严格剥离图片、脚本与样式，杜绝 base64 污染
  service.remove(['img', 'script', 'style', 'noscript', 'canvas', 'video', 'audio']);

  return service;
}

/**
 * 解析 Word (.docx) 文件缓冲区
 */
export async function parseDocxBuffer(
  buffer: Buffer,
  fileName: string
): Promise<DocxParseResult> {
  let html = '';
  try {
    const result = await mammoth.convertToHtml(
      { buffer },
      {
        // 忽略图片转换以减少内存与 CPU 开销
        convertImage: mammoth.images.inline(() => Promise.resolve({ src: '' })),
      }
    );
    html = result.value || '';
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(`Word 文件损坏或格式不正确，无法解析: ${msg}`, true);
  }

  // 快速检查纯文本内容
  const strippedText = html.replace(/<[^>]+>/g, '').trim();
  if (!strippedText) {
    throw new DocumentParseError(`Word 文档 (${fileName}) 内容为空或未提取到有效文本`, true);
  }

  // 物理剥离所有图片标签，杜绝 base64 与超长链接污染切片
  const cleanHtml = html.replace(/<img[^>]*>/gi, '');

  const turndown = createDocxTurndown();
  let markdown = '';
  try {
    markdown = turndown.turndown(cleanHtml).trim();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(`Word 转换 Markdown 失败: ${msg}`, true);
  }

  if (!markdown) {
    throw new DocumentParseError(`Word 文档 (${fileName}) 转换后内容为空`, true);
  }

  // 复用成熟的 parseMarkdownString 提取大纲层级栈 (headingPath) 并切块
  const chunks = await parseMarkdownString(markdown);

  return {
    chunks,
    fullMarkdown: markdown,
  };
}
