import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  parseMarkdownString,
  parseTxtString,
  segmentChinese,
  extractMarkdownSections,
  DocumentParseError,
} from '../parser';

describe('RAG 文档解析器单元测试 (parser)', () => {
  describe('中文分词 (segmentChinese)', () => {
    it('正确执行结巴分词并以空格分隔输出', () => {
      const text = '南京市长江大桥';
      const result = segmentChinese(text);
      expect(result).toBe('南京市 长江大桥');
    });

    it('空字符串或全空格返回空字符串', () => {
      expect(segmentChinese('')).toBe('');
      expect(segmentChinese('   ')).toBe('');
    });
  });

  describe('Markdown 标题层级提取 (extractMarkdownSections)', () => {
    it('保留标题层级嵌套路径并在平级时正确回退', () => {
      const markdown = `
前言介绍内容

# 一级标题 A
一级标题下的正文

## 二级标题 A1
二级标题下的正文

### 三级标题 A1a
三级正文

# 一级标题 B
新的一级正文
`;

      const sections = extractMarkdownSections(markdown);
      expect(sections.length).toBe(5);

      expect(sections[0].headingPath).toBeNull();
      expect(sections[0].text).toContain('前言介绍内容');

      expect(sections[1].headingPath).toBe('一级标题 A');
      expect(sections[1].text).toContain('一级标题下的正文');

      expect(sections[2].headingPath).toBe('一级标题 A > 二级标题 A1');
      expect(sections[2].text).toContain('二级标题下的正文');

      expect(sections[3].headingPath).toBe('一级标题 A > 二级标题 A1 > 三级标题 A1a');
      expect(sections[3].text).toContain('三级正文');

      expect(sections[4].headingPath).toBe('一级标题 B');
      expect(sections[4].text).toContain('新的一级正文');
    });
  });

  describe('Markdown 解析 (parseMarkdownString)', () => {
    it('切块结果保留 headingPath 定位信息，分词列内容为空格分隔，pageNumber 为 null', async () => {
      const markdown = `
# 系统设计
本项目是基于 Next.js 与 BullMQ 的 AI 聚合平台。

## 检索增强架构
检索层采用混合检索技术，包含稠密向量检索与词法检索。
`;

      const chunks = await parseMarkdownString(markdown);
      expect(chunks.length).toBeGreaterThan(0);

      // 第一块
      expect(chunks[0].chunkIndex).toBe(0);
      expect(chunks[0].headingPath).toBe('系统设计');
      expect(chunks[0].pageNumber).toBeNull();
      expect(chunks[0].contentSegmented).toContain('聚合 平台');
      expect(chunks[0].contentSegmented).toMatch(/\s+/); // 空格分隔
      expect(chunks[0].tokenCount).toBeGreaterThan(0);

      // 第二块
      expect(chunks[1].chunkIndex).toBe(1);
      expect(chunks[1].headingPath).toBe('系统设计 > 检索增强架构');
      expect(chunks[1].content).toContain('混合检索');
    });

    it('空 Markdown 文档抛出致命 DocumentParseError', async () => {
      await expect(parseMarkdownString('   \n\n  ')).rejects.toThrow(DocumentParseError);
    });
  });

  describe('TXT 解析 (parseTxtString)', () => {
    it('按自然段与字符切块，headingPath 与 pageNumber 均为 null', async () => {
      const text = '第一段普通文本内容。\n\n第二段自然段内容。';
      const chunks = await parseTxtString(text);

      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[0].headingPath).toBeNull();
      expect(chunks[0].pageNumber).toBeNull();
      expect(chunks[0].contentSegmented).toMatch(/\s+/);
    });

    it('空 TXT 文档抛出致命 DocumentParseError', async () => {
      await expect(parseTxtString('')).rejects.toThrow(DocumentParseError);
    });
  });

  describe('损坏 PDF 处理 (parsePdfBuffer 与 parseDocument)', () => {
    it('损坏的 PDF 文件抛出致命 DocumentParseError，中文错误原因明确且 isFatal=true', async () => {
      const corruptedPdfBuffer = Buffer.from('not-a-valid-pdf-header-content');

      try {
        await parseDocument(corruptedPdfBuffer, 'test.pdf');
        expect.unreachable('应当抛出 DocumentParseError');
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentParseError);
        const parseErr = err as DocumentParseError;
        expect(parseErr.isFatal).toBe(true);
        expect(parseErr.message).toContain('PDF 文件损坏或格式不正确');
      }
    });
  });

  describe('不支持的文件扩展名', () => {
    it('传入不支持的文件格式抛出致命异常', async () => {
      await expect(
        parseDocument(Buffer.from('dummy'), 'document.exe')
      ).rejects.toThrow(/不支持的文件格式/);
    });
  });
});
