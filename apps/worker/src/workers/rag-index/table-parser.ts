/**
 * 结构化表格 (.xlsx / .csv) 解析与表头上下文注入器 (ADR-0029)
 *
 * 核心设计契约：
 * 1. 多工作表 (Multi-Sheet) 分治：跳过空表，按有效工作表独立组织切块，headingPath 格式化为「工作簿 > 工作表」
 * 2. 表头上下文注入 (Header Context Injection)：每个切片均为独立合法的 Markdown 表格，首部注入工作簿、工作表及完整表头
 * 3. 严格防线截断保护：单 Sheet 截断至前 500 行，单文件切片上限 50 个，宽表裁剪保留前 15 列
 * 4. 单元格清洗：单元格内换行转空格，竖线字符转义，全空行列自动剔除
 * 5. 生成 fullMarkdown 供全文抽屉极速直读
 */

import * as XLSX from 'xlsx';
import { RAG_TABLE_CONFIG, estimateTokenCount } from '@repo/shared';
import { segmentForIndex } from '@repo/text';
import { ParsedChunk, DocumentParseError } from './parser';

export interface TableParseResult {
  chunks: ParsedChunk[];
  fullMarkdown: string;
}

/**
 * 清洗单元格文本，防止破坏 Markdown 表格的行列对齐
 */
function sanitizeCell(val: unknown): string {
  if (val === null || val === undefined) return '';
  const str = String(val).trim();
  if (!str) return '';
  // 替换换行符为空格，转义管道符 |
  return str.replace(/\r?\n+/g, ' ').replace(/\|/g, '\\|');
}

/**
 * 格式化单行数组为 Markdown 表格行
 */
function toMarkdownRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

/**
 * 生成 Markdown 表头对齐分隔行
 */
function toSeparatorRow(columnCount: number): string {
  const seps = Array.from({ length: columnCount }, () => ':---');
  return `| ${seps.join(' | ')} |`;
}

/**
 * 针对单个二维数据表进行自包含切块与表头注入
 */
function processSingleSheetData(
  sheetName: string,
  rawRows: unknown[][],
  fileName: string,
  startChunkIndex: number,
  globalChunkCount: { count: number }
): { chunks: ParsedChunk[]; sheetMarkdown: string } {
  // 1. 基础空表检查
  if (!rawRows || rawRows.length === 0) {
    return { chunks: [], sheetMarkdown: '' };
  }

  // 2. 清洗每一行并过滤全空行
  const cleanedRows: string[][] = [];
  for (const row of rawRows) {
    if (!Array.isArray(row)) continue;
    const cleaned = row.map(sanitizeCell);
    // 裁剪前 N 列
    const trimmed = cleaned.slice(0, RAG_TABLE_CONFIG.maxColumns);
    if (trimmed.some((cell) => cell.length > 0)) {
      cleanedRows.push(trimmed);
    }
  }

  // 至少需要一行表头和一行数据
  if (cleanedRows.length <= 1) {
    return { chunks: [], sheetMarkdown: '' };
  }

  // 统一列数对齐
  const headers = cleanedRows[0]!;
  const columnCount = headers.length;
  const separator = toSeparatorRow(columnCount);
  const headerRowStr = toMarkdownRow(headers);

  // 3. 数据行截断防线（最大 500 行有效数据）
  let dataRows = cleanedRows.slice(1);
  let isRowTruncated = false;
  if (dataRows.length > RAG_TABLE_CONFIG.maxRowsPerSheet) {
    dataRows = dataRows.slice(0, RAG_TABLE_CONFIG.maxRowsPerSheet);
    isRowTruncated = true;
  }

  // 4. 组装当前 Sheet 的完整 Markdown（供全文抽屉呈现）
  const fullRowsMarkdown = [
    `### 表格: ${fileName} (工作表: ${sheetName})`,
    headerRowStr,
    separator,
    ...dataRows.map((r) => {
      // 补齐列数
      const padded = [...r];
      while (padded.length < columnCount) padded.push('');
      return toMarkdownRow(padded);
    }),
  ];
  if (isRowTruncated) {
    fullRowsMarkdown.push(
      `\n> 提示: 该表格数据量已达上限，仅收录前 ${RAG_TABLE_CONFIG.maxRowsPerSheet} 行核心数据。`
    );
  }
  const sheetMarkdown = fullRowsMarkdown.join('\n');

  // 5. 自包含动态切块 (Chunk-as-Table + HeaderContextInjection)
  const chunks: ParsedChunk[] = [];
  let currentGroupRows: string[][] = [];
  let currentGroupTokens = 0;
  let groupStartRow = 1;

  const headingPath = sheetName ? `${fileName} > ${sheetName}` : fileName;

  function flushGroup(endRow: number, isLastChunk: boolean) {
    if (currentGroupRows.length === 0) return;
    if (globalChunkCount.count >= RAG_TABLE_CONFIG.maxChunksPerDocument) {
      return;
    }

    const contextPrefix = sheetName
      ? `> 工作簿: ${fileName} | 工作表: ${sheetName} | 记录 ${groupStartRow}~${endRow}`
      : `> 工作簿: ${fileName} | 记录 ${groupStartRow}~${endRow}`;

    const tableLines = [
      contextPrefix,
      '',
      headerRowStr,
      separator,
      ...currentGroupRows.map((r) => {
        const padded = [...r];
        while (padded.length < columnCount) padded.push('');
        return toMarkdownRow(padded);
      }),
    ];

    if (isLastChunk && isRowTruncated) {
      tableLines.push(
        '',
        `> 提示: 该表格数据量已达上限，仅收录前 ${RAG_TABLE_CONFIG.maxRowsPerSheet} 行核心数据。`
      );
    }

    const chunkContent = tableLines.join('\n');
    chunks.push({
      chunkIndex: startChunkIndex + chunks.length,
      content: chunkContent,
      contentSegmented: segmentForIndex(chunkContent),
      headingPath,
      pageNumber: null,
      tokenCount: estimateTokenCount(chunkContent),
    });

    globalChunkCount.count++;
    currentGroupRows = [];
    currentGroupTokens = 0;
    groupStartRow = endRow + 1;
  }

  for (let i = 0; i < dataRows.length; i++) {
    if (globalChunkCount.count >= RAG_TABLE_CONFIG.maxChunksPerDocument) {
      break;
    }

    const row = dataRows[i]!;
    const rowTokens = estimateTokenCount(row.join(' '));

    // 如果加入这一行会导致超出单切片目标 token 且当前组已有数据，则切块
    if (
      currentGroupRows.length > 0 &&
      currentGroupTokens + rowTokens > RAG_TABLE_CONFIG.chunkTargetTokens
    ) {
      flushGroup(i, false);
    }

    currentGroupRows.push(row);
    currentGroupTokens += rowTokens;
  }

  if (currentGroupRows.length > 0) {
    flushGroup(dataRows.length, true);
  }

  return { chunks, sheetMarkdown };
}

/**
 * 解析 Excel (.xlsx) 缓冲区
 */
export async function parseTableBuffer(
  buffer: Buffer,
  fileName: string
): Promise<TableParseResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellDates: true,
      dense: true,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(`Excel 文件损坏或格式不正确，无法解析: ${msg}`, true);
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new DocumentParseError('Excel 文件未包含任何有效工作表', true);
  }

  const allChunks: ParsedChunk[] = [];
  const allSheetMarkdowns: string[] = [];
  const globalChunkCount = { count: 0 };

  for (const sheetName of workbook.SheetNames) {
    if (globalChunkCount.count >= RAG_TABLE_CONFIG.maxChunksPerDocument) {
      break;
    }

    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) continue;

    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: false,
      defval: '',
    });

    const { chunks, sheetMarkdown } = processSingleSheetData(
      sheetName,
      rawRows,
      fileName,
      allChunks.length,
      globalChunkCount
    );

    if (chunks.length > 0) {
      allChunks.push(...chunks);
      allSheetMarkdowns.push(sheetMarkdown);
    }
  }

  if (allChunks.length === 0) {
    throw new DocumentParseError('Excel 文档未提取到有效数据行', true);
  }

  return {
    chunks: allChunks,
    fullMarkdown: allSheetMarkdowns.join('\n\n---\n\n'),
  };
}

/**
 * 解析 CSV 字符串
 */
export async function parseCsvString(
  csvContent: string,
  fileName: string
): Promise<TableParseResult> {
  const trimmed = csvContent.trim();
  if (!trimmed) {
    throw new DocumentParseError('CSV 文件内容为空', true);
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(csvContent, { type: 'string', raw: false });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new DocumentParseError(`CSV 文件解析异常: ${msg}`, true);
  }

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName || !workbook.Sheets[firstSheetName]) {
    throw new DocumentParseError('CSV 文件未包含有效内容', true);
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName]!, {
    header: 1,
    raw: false,
    defval: '',
  });

  const globalChunkCount = { count: 0 };
  const { chunks, sheetMarkdown } = processSingleSheetData(
    '',
    rawRows,
    fileName,
    0,
    globalChunkCount
  );

  if (chunks.length === 0) {
    throw new DocumentParseError('CSV 文档未提取到有效数据行', true);
  }

  return {
    chunks,
    fullMarkdown: sheetMarkdown,
  };
}
