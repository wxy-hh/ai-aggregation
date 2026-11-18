import * as XLSX from 'xlsx';
import type { SourceFormat } from '@repo/shared';
import { segmentForIndex } from '@repo/text';
import { describe, expect, it } from 'vitest';
import {
  parseDocument,
  parseMarkdownString,
  parseTxtString,
  extractMarkdownSections,
  DocumentParseError,
} from '../parser';

/**
 * 构造最小合法 PDF（单页、Helvetica、ASCII 文本），用于验证按 SourceFormat 选择 PDF 解析器
 */
function buildMinimalPdfBuffer(text: string): Buffer {
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
  ];
  const stream = `BT /F1 18 Tf 72 720 Td (${text}) Tj ET`;
  objects.push(
    `5 0 obj\n<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream\nendobj\n`
  );

  let body = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(body, 'binary'));
    body += obj;
  }
  const xrefOffset = Buffer.byteLength(body, 'binary');
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  body += xref;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, 'binary');
}

/**
 * ZIP 条目校验和（避免测试依赖 Node 小版本的 zlib.crc32 可用性）
 */
function calculateCrc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 构造仅存储（不压缩）的 ZIP，用于生成最小合法 docx 夹具
 */
function buildStoredZip(entries: Array<{ name: string; data: string }>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf-8');
    const data = Buffer.from(entry.data, 'utf-8');
    const checksum = calculateCrc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const localEntry = Buffer.concat([local, name, data]);
    localParts.push(localEntry);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(Buffer.concat([central, name]));

    offset += localEntry.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralDirectory.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...localParts, centralDirectory, eocd]);
}

/**
 * 构造包含一级标题与正文的最小合法 docx
 */
function buildMinimalDocxBuffer(): Buffer {
  return buildStoredZip([
    {
      name: '[Content_Types].xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
    },
    {
      name: '_rels/.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    },
    {
      name: 'word/_rels/document.xml.rels',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    },
    {
      name: 'word/styles.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>',
    },
    {
      name: 'word/document.xml',
      data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>最小 Word 标题</w:t></w:r></w:p><w:p><w:r><w:t>最小 Word 正文内容。</w:t></w:r></w:p><w:sectPr/></w:body></w:document>',
    },
  ]);
}

/**
 * 构造包含单个工作表与两行数据的最小合法 xlsx
 */
function buildMinimalXlsxBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ['编号', '名称'],
    ['1', '苹果'],
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, '数据表');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('RAG 文档解析器单元测试 (parser)', () => {
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
        await parseDocument(corruptedPdfBuffer, 'test.pdf', 'pdf');
        expect.unreachable('应当抛出 DocumentParseError');
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentParseError);
        const parseErr = err as DocumentParseError;
        expect(parseErr.isFatal).toBe(true);
        expect(parseErr.message).toContain('PDF 文件损坏或格式不正确');
      }
    });
  });

  describe('SourceFormat 解析器选择 (TC02)', () => {
    it('TC02-1 六类 SourceFormat 合法夹具解析矩阵', async () => {
      const cases: Array<{
        sourceFormat: SourceFormat;
        fileName: string;
        buffer: Buffer;
        assertChunks: (result: Awaited<ReturnType<typeof parseDocument>>) => void;
      }> = [
        {
          sourceFormat: 'pdf',
          fileName: '样例.pdf',
          buffer: buildMinimalPdfBuffer('Hello PDF text'),
          assertChunks: (result) => {
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]!.pageNumber).toBe(1);
            expect(result[0]!.content).toContain('Hello PDF text');
          },
        },
        {
          sourceFormat: 'docx',
          fileName: '样例.docx',
          buffer: buildMinimalDocxBuffer(),
          assertChunks: (result) => {
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]!.headingPath).toBe('最小 Word 标题');
            expect(result[0]!.content).toContain('最小 Word 正文内容');
          },
        },
        {
          sourceFormat: 'xlsx',
          fileName: '样例.xlsx',
          buffer: buildMinimalXlsxBuffer(),
          assertChunks: (result) => {
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]!.headingPath).toBe('样例.xlsx > 数据表');
            expect(result[0]!.content).toContain('| 编号 | 名称 |');
          },
        },
        {
          sourceFormat: 'csv',
          fileName: '样例.csv',
          buffer: Buffer.from('编号,名称\n1,苹果', 'utf-8'),
          assertChunks: (result) => {
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]!.headingPath).toBe('样例.csv');
            expect(result[0]!.content).toContain('| 1 | 苹果 |');
          },
        },
        {
          sourceFormat: 'md',
          fileName: '样例.md',
          buffer: Buffer.from('# 样例标题\n样例正文内容。', 'utf-8'),
          assertChunks: (result) => {
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]!.headingPath).toBe('样例标题');
            expect(result.outline?.tree[0]?.title).toBe('样例标题');
          },
        },
        {
          sourceFormat: 'txt',
          fileName: '样例.txt',
          buffer: Buffer.from('第一段纯文本内容。', 'utf-8'),
          assertChunks: (result) => {
            expect(result.length).toBeGreaterThan(0);
            expect(result[0]!.headingPath).toBeNull();
            expect(result[0]!.pageNumber).toBeNull();
          },
        },
      ];

      for (const testCase of cases) {
        const result = await parseDocument(
          testCase.buffer,
          testCase.fileName,
          testCase.sourceFormat
        );
        testCase.assertChunks(result);
      }
    });

    it('TC02-2 Markdown 格式不受 PDF 文件名误导', async () => {
      const result = await parseDocument(
        Buffer.from('# 真实标题\nMarkdown 正文内容。', 'utf-8'),
        '误导.pdf',
        'md'
      );

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.headingPath).toBe('真实标题');
      expect(result[0]!.content).toContain('Markdown 正文内容');
    });

    it('TC02-3 PDF 格式不受 Markdown 文件名误导', async () => {
      const corruptedPdfBuffer = Buffer.from('not-a-valid-pdf-header-content');

      try {
        await parseDocument(corruptedPdfBuffer, '误导.md', 'pdf');
        expect.unreachable('应当抛出 PDF 解析错误而不是按 Markdown 成功');
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentParseError);
        const parseErr = err as DocumentParseError;
        expect(parseErr.isFatal).toBe(true);
        expect(parseErr.message).toContain('PDF 文件损坏或格式不正确');
      }
    });

    it('TC02-4 unknown 永久失败且不按文本解析', async () => {
      try {
        await parseDocument(
          Buffer.from('# 看似合法\n这段文本不能按 Markdown 解析。', 'utf-8'),
          '看似合法.md',
          'unknown'
        );
        expect.unreachable('unknown 不应默认按文本解析');
      } catch (err) {
        expect(err).toBeInstanceOf(DocumentParseError);
        const parseErr = err as DocumentParseError;
        expect(parseErr.isFatal).toBe(true);
        expect(parseErr.message).toContain('不支持的文件格式');
      }
    });
  });

  describe('不支持的文件扩展名', () => {
    it('传入不支持的文件格式抛出致命异常', async () => {
      await expect(parseDocument(Buffer.from('dummy'), 'document.exe', 'unknown')).rejects.toThrow(
        /不支持的文件格式/
      );
    });
  });

  describe('索引端分词契约 (TC02)', () => {
    it('TC02-1 Markdown 解析切片 contentSegmented 等于 segmentForIndex(content)', async () => {
      const chunks = await parseDocument(
        Buffer.from('# 标题\n连败熔断机制说明。\n\n第二段：工具调用失败。', 'utf-8'),
        'test.md',
        'md'
      );
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.contentSegmented).toBe(segmentForIndex(chunk.content));
      }
    });

    it('TC02-2 表格解析切片 contentSegmented 等于 segmentForIndex(content)', async () => {
      const chunks = await parseDocument(buildMinimalXlsxBuffer(), 'data.xlsx', 'xlsx');
      expect(chunks.length).toBeGreaterThan(0);
      for (const chunk of chunks) {
        expect(chunk.contentSegmented).toBe(segmentForIndex(chunk.content));
      }
    });
  });
});
