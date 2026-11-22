export const SPEC_REVIEW_CHECKLIST_VERSION = 1;
export const SPEC_REVIEW_CHECKLIST_FILE = '_qa/spec-review-checklist.json';

const COVERAGE_HEADING = /^## 对账覆盖\s*$/;
const CASE_ASSERTION_ID = /^TC\d+-\d+$/;

/** 由对账表内部行生成稳定、可移植的 Spec 审查清单 */
export function specReviewChecklistDocument(table) {
  const rows = table.map((row) => ({
    id: row.id,
    status: row.status,
    assertion: row.assertion,
    actual: row.actual,
    seam: row.seam,
    sourceCandidates: [...(row.sourceCandidates ?? [])],
    changed: Boolean(row.changed),
  }));
  return `${JSON.stringify({ version: SPEC_REVIEW_CHECKLIST_VERSION, rows }, null, 2)}\n`;
}

export function parseSpecReviewChecklist(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('无效 Spec 审查清单：不是有效 JSON');
  }
  if (value?.version !== SPEC_REVIEW_CHECKLIST_VERSION || !Array.isArray(value.rows)) {
    throw new Error('无效 Spec 审查清单：version 必须为 1 且 rows 必须为数组');
  }
  for (const row of value.rows) {
    if (!row || !CASE_ASSERTION_ID.test(row.id) || typeof row.actual !== 'string'
      || typeof row.assertion !== 'string' || typeof row.seam !== 'string'
      || !Array.isArray(row.sourceCandidates) || row.sourceCandidates.some((item) => typeof item !== 'string')
      || typeof row.changed !== 'boolean') {
      throw new Error(`无效 Spec 审查清单行：${row?.id ?? '未知 ID'}`);
    }
  }
  return value;
}

/** Markdown 表格行拆列：只转义管道符 \|，其他反斜杠原样保留，兼容可选首尾管道符 */
export function splitMarkdownRow(line) {
  let input = line.trim();
  if (input.startsWith('|')) input = input.slice(1);
  const cells = [];
  let value = '';
  let escaped = false;
  for (const character of input) {
    if (escaped) {
      value += character === '|' ? '|' : `\\${character}`;
      escaped = false;
    } else if (character === '\\') {
      escaped = true;
    } else if (character === '|') {
      cells.push(value.trim());
      value = '';
    } else {
      value += character;
    }
  }
  if (escaped) value += '\\';
  value = value.trim();
  // 行尾为未转义管道符时末尾空段是表格边界而非多余列；若行尾为 \| 则仍计入末列内容
  const endsWithUnescapedPipe = /(?:^|[^\\])(?:\\\\)*\|$/.test(input);
  if (value || !endsWithUnescapedPipe) cells.push(value);
  return cells;
}

/** 对账覆盖行拆分：要求必须以管道符开头 */
function splitCoverageRow(line) {
  if (!line.trim().startsWith('|')) return null;
  return splitMarkdownRow(line);
}

function coverageSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => COVERAGE_HEADING.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end);
}

/** 解析 Spec 原文的结构化响应；语义判断仍由审查者与人工终审完成 */
export function parseSpecReviewCoverage(markdown) {
  const rows = [];
  for (const line of coverageSection(markdown)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitCoverageRow(line);
    if (!cells?.length || cells[0] === '审查项' || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.length !== 5) throw new Error('对账覆盖表必须恰好为五列');
    const ids = cells[0].split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
    if (!ids.length || ids.some((id) => !CASE_ASSERTION_ID.test(id))) {
      throw new Error(`对账覆盖表含非法 TC-断言 ID：${cells[0]}`);
    }
    rows.push({ ids, actual: cells[1], verdict: cells[2], source: cells[3], change: cells[4] });
  }
  return { rows };
}
