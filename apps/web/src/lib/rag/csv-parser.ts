/**
 * 轻量且鲁棒的 CSV 解析与序列化工具 (无三方重型依赖)
 */

export interface ParsedFaqRow {
  question: string;
  answer: string;
  similarQuestions: string[];
  rawLine: number;
}

/**
 * 将 CSV 文本解析为字符串二维数组（正确处理双引号包裹与换行）
 */
export function parseCsvRows(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let insideQuotes = false;

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // 转义的双引号 ""
          currentField += '"';
          i++;
        } else {
          // 引号结束
          insideQuotes = false;
        }
      } else {
        currentField += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentField.trim());
        currentField = '';
      } else if (char === '\r') {
        // 忽略 Windows 换行符 \r
      } else if (char === '\n') {
        currentRow.push(currentField.trim());
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow);
        }
        currentRow = [];
        currentField = '';
      } else {
        currentField += char;
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim());
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

/**
 * 将解析出的二维数组映射为标准化 FAQ 行
 */
export function mapCsvToFaqItems(rows: string[][]): {
  items: ParsedFaqRow[];
  errors: Array<{ line: number; message: string }>;
} {
  if (rows.length === 0) {
    return { items: [], errors: [{ line: 0, message: 'CSV 内容为空' }] };
  }

  const header = rows[0]!.map((col) => col.trim().toLowerCase());
  let questionIdx = -1;
  let answerIdx = -1;
  let similarIdx = -1;

  // 识别表头
  header.forEach((col, index) => {
    if (col === '标准问题' || col === '问题' || col === 'question') {
      questionIdx = index;
    } else if (col === '标准答案' || col === '答案' || col === 'answer') {
      answerIdx = index;
    } else if (col === '相似问' || col === '相似问题' || col === 'similar' || col === 'similar_questions') {
      similarIdx = index;
    }
  });

  // 如果没有显式匹配到表头，默认第 0 列为问题、第 1 列为答案、第 2 列为相似问
  const startIndex = questionIdx !== -1 && answerIdx !== -1 ? 1 : 0;
  if (questionIdx === -1) questionIdx = 0;
  if (answerIdx === -1) answerIdx = 1;
  if (similarIdx === -1) similarIdx = 2;

  const items: ParsedFaqRow[] = [];
  const errors: Array<{ line: number; message: string }> = [];

  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i]!;
    const lineNum = i + 1;
    const question = row[questionIdx]?.trim() || '';
    const answer = row[answerIdx]?.trim() || '';
    const rawSimilar = row[similarIdx]?.trim() || '';

    if (!question) {
      errors.push({ line: lineNum, message: '标准问题不能为空' });
      continue;
    }
    if (!answer) {
      errors.push({ line: lineNum, message: '标准答案不能为空' });
      continue;
    }

    // 相似问支持中文逗号、英文逗号、分号或竖线分隔
    const similarQuestions = rawSimilar
      ? rawSimilar
          .split(/[,，;；|]/)
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s !== question)
      : [];

    items.push({
      question,
      answer,
      similarQuestions,
      rawLine: lineNum,
    });
  }

  return { items, errors };
}

/**
 * 将 FAQ 列表转换为 CSV 文本
 */
export function formatFaqsToCsv(
  faqs: Array<{ question: string; answer: string; similarQuestions?: string[] }>
): string {
  const header = ['标准问题', '标准答案', '相似问(以分号分隔)'];

  const escapeCell = (str: string): string => {
    const text = (str || '').replace(/"/g, '""');
    if (text.includes(',') || text.includes('\n') || text.includes('"') || text.includes(';')) {
      return `"${text}"`;
    }
    return text;
  };

  const lines = [header.join(',')];
  for (const faq of faqs) {
    const q = escapeCell(faq.question);
    const a = escapeCell(faq.answer);
    const s = escapeCell((faq.similarQuestions || []).join('; '));
    lines.push([q, a, s].join(','));
  }

  // 增加 UTF-8 BOM 防 Excel 中文乱码
  return '﻿' + lines.join('\n');
}
