import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const SPEC_REVIEW_CHECKLIST_VERSION = 1;
export const SPEC_REVIEW_CHECKLIST_V2 = 2;
export const SUPPORTED_CHECKLIST_VERSIONS = new Set([SPEC_REVIEW_CHECKLIST_VERSION, SPEC_REVIEW_CHECKLIST_V2]);
export const SPEC_REVIEW_CHECKLIST_FILE = '_qa/spec-review-checklist.json';
export const SPEC_REVIEW_SKELETON_FILE = '_qa/spec-review-skeleton.md';

export const FINDING_ID_PATTERN = /\[((?:S-[HJ]|P-[MWX])\d+)\]/g;
export const HAS_FINDING_ID = new RegExp(FINDING_ID_PATTERN.source);
export const NO_FINDING_AFTER_ID = /^(?:\*\*|`)?\s*[:：]?\s*无(?:新增|新)?(?:审查)?(?:发现|编号)/;
export const PLACEHOLDER_ID_EXAMPLE = /(?:仅作|后续)?(?:真实缺陷的)?编号示例/;
const FINDING_DEFINITION_PATTERNS = [
  /^\s{0,3}#{1,6}\s+(?:\*\*)?\[((?:S-[HJ]|P-[MWX])\d+)\](?:\*\*)?(?=\s|[:：—–-]|$)/,
  /^\s{0,3}#{1,6}\s+(?:\*\*)?((?:S-[HJ]|P-[MWX])\d+)(?:\*\*)?(?=\s|[:：—–-]|$)/,
  /^(?:\*\*)?\[((?:S-[HJ]|P-[MWX])\d+)\](?:\*\*)?(?=\s|[:：—–-]|$)/,
];
const NO_FINDING_PREFIX_SOURCE = '(?:本轮|本次审查)';
const NO_FINDING_CORE = new RegExp(`^(?:${NO_FINDING_PREFIX_SOURCE})?无(?:新增|新)?(?:审查)?(?:发现|编号)$`);
const PLACEHOLDER_NO_FINDING = new RegExp(`${NO_FINDING_PREFIX_SOURCE}无(?:新增|新)?(?:审查)?(?:发现|编号)[。．]?\\s*$`);

const COVERAGE_HEADING = /^## 对账覆盖\s*$/;
const CASE_ASSERTION_ID = /^TC\d+-\d+$/;
const SCRIPTED_SEAMS = new Set(['browser', 'api']);
export const PREDICATE_KEYWORDS = /\b(?:check|expect|it|test|describe|strictEqual|deepStrictEqual|notEqual|toBe|toEqual|toMatch|toContain|toBeVisible|toHaveText|toHaveCount)\s*(?:\(|\.)|\bassert\s*(?:\.\s*\w+|\()|\bprocess\.exitCode\s*=(?!\s*0\b)|\bprocess\.exit\s*\((?!\s*0\b)|\bthrow\s+new\b/i;
export const REREVIEW_STATUS_PATTERN = /(?:已修|未修|修错|改档成立|改档不成立|维持)/;

/** 判断源码或测试文本中是否包含除注释与 import 外的有效断言谓词 */
export function hasPredicateInText(text) {
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^(?:\/\/|\/\*|\*|\*\/|#)/.test(trimmed)) continue;
    if (/^import\b/.test(trimmed)) continue;
    if (PREDICATE_KEYWORDS.test(trimmed)) return true;
  }
  return false;
}

/** 只提取标题主编号与历史行首方括号定义，不把正文引用或示例登记为发现 */
export function parseFindingDefinitions(markdown) {
  const findings = [];
  const lines = String(markdown ?? '').split(/\r?\n/);
  for (const [lineIndex, line] of lines.entries()) {
    for (const pattern of FINDING_DEFINITION_PATTERNS) {
      const match = line.match(pattern);
      if (!match) continue;
      const tail = line.slice(match[0].length);
      if (NO_FINDING_AFTER_ID.test(tail) || PLACEHOLDER_ID_EXAMPLE.test(tail)) break;
      findings.push({ id: match[1], line: line.trim(), lineIndex, index: match.index, tail });
      break;
    }
  }
  return findings;
}

/** 复审响应兼容历史方括号引用，但不把这些引用用于新发现登记或撞号 */
export function parseFindingResponses(markdown) {
  const responses = parseFindingDefinitions(markdown);
  const seen = new Set(responses.map((finding) => `${finding.lineIndex}:${finding.id}`));
  for (const [lineIndex, line] of String(markdown ?? '').split(/\r?\n/).entries()) {
    for (const match of line.matchAll(FINDING_ID_PATTERN)) {
      if (seen.has(`${lineIndex}:${match[1]}`)) continue;
      const tail = line.slice(match.index + match[0].length);
      if (NO_FINDING_AFTER_ID.test(tail) || PLACEHOLDER_ID_EXAMPLE.test(tail)) continue;
      responses.push({ id: match[1], line: line.trim(), lineIndex, index: match.index, tail });
    }
  }
  return responses;
}

function isWholeNoFindingLine(line) {
  const normalized = line.trim()
    .replace(/^\s{0,3}#{1,6}\s+/, '')
    .replace(/^(?:规范轴|需求轴|本次审查)[:：]\s*/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^(?:\*\*|`|<|>)\s*/, '')
    .replace(/(?:\*\*|`|>)[。．]?$/, '')
    .replace(/[。．]$/, '');
  return NO_FINDING_CORE.test(normalized);
}

/** 判断审查原文是否表达「无发现」及其常见中文否定变体 */
export function hasNoFinding(text) {
  if (parseFindingDefinitions(text).length > 0) return false;
  return String(text ?? '').split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    return isWholeNoFindingLine(trimmed)
      || (PLACEHOLDER_ID_EXAMPLE.test(trimmed) && PLACEHOLDER_NO_FINDING.test(trimmed));
  });
}

/** 校验原文是否含规范编号或「无发现」语义 */
export function rawHasFindingOrNoFinding(markdown) {
  return parseFindingResponses(markdown).length > 0 || hasNoFinding(markdown);
}

/** 根据编号前缀推断所属审查轴 */
export function axisOfFinding(id) {
  if (id.startsWith('S-')) return 'standards';
  if (id.startsWith('P-')) return 'spec';
  return null;
}

/** 剥离路径前缀并统一为 POSIX 风格：移除前导 ./ 与特性目录前缀 */
export function normalizeCitationPath(rawPath, featureRelDir = '') {
  let normalized = path.posix.normalize(String(rawPath ?? '').trim().replaceAll('\\', '/'));
  normalized = normalized.replace(/^\.\//, '');
  const cleanFeature = path.posix.normalize(String(featureRelDir ?? '').trim().replaceAll('\\', '/')).replace(/^\.\//, '').replace(/\/$/, '');
  if (cleanFeature && cleanFeature !== '.' && normalized.startsWith(`${cleanFeature}/`)) {
    normalized = normalized.slice(cleanFeature.length + 1);
  }
  return normalized;
}

/** 判断一条断言在 v2 协议下是否属于必审（required）行 */
export function isRequiredSpecRow(row) {
  return Boolean(
    row?.changed
    || SCRIPTED_SEAMS.has(row?.seam)
    || row?.status !== 'PASS'
    || String(row?.priority ?? '').toUpperCase() === 'P0',
  );
}

const UNIT_STATUS_VALUES = new Set(['required', 'sampled', 'inherited']);

/** 由对账表内部行生成稳定、可移植的 Spec 审查清单（支持 v1 与 v2，并可选附加分组 reviewUnits） */
export function specReviewChecklistDocument(
  table,
  { version = SPEC_REVIEW_CHECKLIST_VERSION, reviewUnits } = {},
) {
  if (!SUPPORTED_CHECKLIST_VERSIONS.has(version)) {
    throw new Error(`不支持的 Spec 审查清单版本：${version}`);
  }
  const rows = table.map((row) => {
    const base = {
      id: row.id,
      status: row.status,
      assertion: row.assertion,
      actual: row.actual,
      seam: row.seam,
      sourceCandidates: [...(row.sourceCandidates ?? [])],
      changed: Boolean(row.changed),
    };
    if (version === SPEC_REVIEW_CHECKLIST_V2) {
      return {
        ...base,
        priority: String(row.priority ?? 'P1'),
        required: typeof row.required === 'boolean' ? row.required : isRequiredSpecRow(row),
        ...(row.samplingReason ? { samplingReason: String(row.samplingReason) } : {}),
      };
    }
    return base;
  });
  const payload = Array.isArray(reviewUnits) ? { version, rows, reviewUnits } : { version, rows };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

/** 生成 v2 预填 Markdown 骨架，按 reviewUnits 与 changed 分组必审行并拆分抽检与继承项 */
export function specReviewSkeletonDocument(checklist) {
  const rowMap = new Map(checklist.rows.map((row) => [row.id, row]));
  const units = Array.isArray(checklist.reviewUnits) && checklist.reviewUnits.length ? checklist.reviewUnits : null;
  const requiredUnits = units
    ? units.filter((unit) => unit.verificationStatus === 'required')
    : checklist.rows
        .filter((row) => (checklist.version === SPEC_REVIEW_CHECKLIST_V2 ? row.required : true))
        .map((row) => ({
          rowIds: [row.id],
          sourceCandidates: row.sourceCandidates,
          changed: row.changed,
        }));
  const inheritedUnits = units ? units.filter((unit) => unit.verificationStatus === 'inherited') : [];
  const sampledIds = units
    ? new Set(units.filter((unit) => unit.verificationStatus === 'sampled').flatMap((unit) => unit.rowIds))
    : new Set(checklist.rows.filter((row) => checklist.version === SPEC_REVIEW_CHECKLIST_V2 && !row.required).map((row) => row.id));
  const optionalRows = checklist.rows.filter((row) => sampledIds.has(row.id));
  const lines = [
    '# Spec 审查对账骨架（由 acceptance 预生成）',
    '',
    '请把以下 `## 对账覆盖` 段落与（如有）`## 抽检范围` 复制进 `review/r<n>-spec-axis.md`，逐项核实源码叶子谓词并补全引用位置与结论。',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
  ];
  for (const unit of requiredUnits) {
    const groups = [
      { changed: true, rowIds: unit.rowIds.filter((id) => rowMap.get(id)?.changed) },
      { changed: false, rowIds: unit.rowIds.filter((id) => !rowMap.get(id)?.changed) },
    ].filter((group) => group.rowIds.length > 0);
    for (const group of groups) {
      const unitRows = group.rowIds.map((id) => rowMap.get(id)).filter(Boolean);
      const sourceCandidates = unit.sourceCandidates?.length
        ? unit.sourceCandidates
        : [...new Set(unitRows.flatMap((row) => row.sourceCandidates))];
      const sourceHint = sourceCandidates.length ? `\`${sourceCandidates[0]}:<行号>\` 待核对真实谓词` : '待填写源码位置与谓词摘要';
      const changeHint = group.changed ? '待判（变更成立/变更不成立）' : '不适用';
      lines.push(`| ${group.rowIds.join('、')} | 待判（已核实/未核实） | ${sourceHint} | ${changeHint} |`);
    }
  }
  if (optionalRows.length) {
    const files = [...new Set(optionalRows.flatMap((row) => row.sourceCandidates))];
    lines.push(
      '',
      '## 抽检范围',
      `- 本轮共 ${optionalRows.length} 条常规或未改动存量通过项无需逐行填表：${optionalRows.map((row) => row.id).join('、')}`,
      `- 候选文件：${files.length ? files.map((file) => `\`${file}\``).join('、') : '按执行记录抽检对应测试文件'}`,
      '- 抽检结果：<请写出实际抽检的文件、用例及发现；无异常写无发现>',
    );
  }
  if (inheritedUnits.length) {
    lines.push('', '## 继承未变单元（无需重填，自动沿用上轮已核实结论）');
    for (const unit of inheritedUnits) {
      lines.push(`- ${unit.rowIds.join('、')}（沿用 ${unit.inheritedFrom ?? '上轮已核实基线'}）`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

export function parseSpecReviewChecklist(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('无效 Spec 审查清单：不是有效 JSON');
  }
  if (!SUPPORTED_CHECKLIST_VERSIONS.has(value?.version) || !Array.isArray(value.rows)) {
    throw new Error('无效 Spec 审查清单：version 必须为 1 或 2 且 rows 必须为数组');
  }
  for (const row of value.rows) {
    if (!row || !CASE_ASSERTION_ID.test(row.id) || typeof row.actual !== 'string'
      || typeof row.assertion !== 'string' || typeof row.seam !== 'string'
      || !Array.isArray(row.sourceCandidates) || row.sourceCandidates.some((item) => typeof item !== 'string')
      || typeof row.changed !== 'boolean') {
      throw new Error(`无效 Spec 审查清单行：${row?.id ?? '未知 ID'}`);
    }
    if (value.version === SPEC_REVIEW_CHECKLIST_V2 && typeof row.required !== 'boolean') {
      throw new Error(`无效 v2 Spec 审查清单行（缺少布尔字段 required）：${row?.id ?? '未知 ID'}`);
    }
  }
  if (value.reviewUnits !== undefined) {
    if (!Array.isArray(value.reviewUnits)) {
      throw new Error('无效 Spec 审查清单：reviewUnits 必须为数组');
    }
    for (const unit of value.reviewUnits) {
      if (!unit || typeof unit.unitId !== 'string' || !Array.isArray(unit.rowIds) || !unit.rowIds.length
        || unit.rowIds.some((id) => !CASE_ASSERTION_ID.test(id))
        || !Array.isArray(unit.sourceCandidates)
        || !UNIT_STATUS_VALUES.has(unit.verificationStatus)) {
        throw new Error(`无效 Spec 审查单元：${unit?.unitId ?? '未知 unitId'}`);
      }
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

/** 提取 ## 抽检范围 段落内的非空行，防止空标题绕过检查 */
function samplingSection(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## 抽检范围\s*$/.test(line));
  if (start < 0) return [];
  const end = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  return lines.slice(start + 1, end < 0 ? lines.length : end).filter((line) => line.trim().length > 0);
}

/** 解析 Spec 原文的结构化响应；v1 为五列，v2 为四列（去掉手工抄写实测列） */
export function parseSpecReviewCoverage(markdown, { version = SPEC_REVIEW_CHECKLIST_VERSION } = {}) {
  const expectedCols = version === SPEC_REVIEW_CHECKLIST_V2 ? 4 : 5;
  const rows = [];
  for (const line of coverageSection(markdown)) {
    if (!line.trim().startsWith('|')) continue;
    const cells = splitCoverageRow(line);
    if (!cells?.length || cells[0] === '审查项' || cells.every((cell) => /^:?-{3,}:?$/.test(cell))) continue;
    if (cells.length !== expectedCols) {
      throw new Error(version === SPEC_REVIEW_CHECKLIST_V2 ? 'v2 对账覆盖表必须恰好为四列' : '对账覆盖表必须恰好为五列');
    }
    const ids = cells[0].split(/[、,，\s]+/).map((item) => item.trim()).filter(Boolean);
    if (!ids.length || ids.some((id) => !CASE_ASSERTION_ID.test(id))) {
      throw new Error(`对账覆盖表含非法 TC-断言 ID：${cells[0]}`);
    }
    if (version === SPEC_REVIEW_CHECKLIST_V2) {
      rows.push({ ids, actual: '', verdict: cells[1], source: cells[2], change: cells[3] });
    } else {
      rows.push({ ids, actual: cells[1], verdict: cells[2], source: cells[3], change: cells[4] });
    }
  }
  return { rows };
}

export function coverageCitations(source) {
  return [...String(source ?? '').matchAll(/`([^`\n]+):(\d+)`/g)].map((match) => ({
    path: match[1],
    line: Number(match[2]),
  }));
}

function windowCodeLines(lines, targetLine, { excludeImports = false } = {}) {
  const start = Math.max(0, targetLine - 6);
  const end = Math.min(lines.length, targetLine + 5);
  return lines.slice(start, end).filter((line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    if (/^(?:\/\/|\/\*|\*|\*\/|#)/.test(trimmed)) return false;
    if (excludeImports && /^import\b/.test(trimmed)) return false;
    return true;
  });
}

function hasEffectiveCodeInWindow(lines, targetLine) {
  return windowCodeLines(lines, targetLine).length > 0;
}

function hasPredicateInWindow(lines, targetLine, seam) {
  if (seam === 'static') return hasEffectiveCodeInWindow(lines, targetLine);
  // 排除 import 声明与纯注释行，避免文件名第一行引包声明绕过 :1 谓词检查
  return PREDICATE_KEYWORDS.test(windowCodeLines(lines, targetLine, { excludeImports: true }).join('\n'));
}

/** 校验源码引用路径是否存在，且目标行前后 ±5 行窗口内命中真实测试或断言谓词；有快照时严格仅校验快照文件 */
export async function citationIsValid(root, featureDir, row, citation, cache, { snapshotRoot = null } = {}) {
  const featureRel = root ? path.relative(root, featureDir).split(path.sep).join('/') : '';
  const normalizedCitation = normalizeCitationPath(citation.path, featureRel);
  const hasCandidates = row.sourceCandidates.length > 0;
  if (hasCandidates) {
    const normalizedCandidates = new Set(row.sourceCandidates.map((item) => normalizeCitationPath(item, featureRel)));
    if (!row.sourceCandidates.includes(citation.path) && !normalizedCandidates.has(normalizedCitation)) {
      return false;
    }
  }
  const candidateRelatives = [...new Set([normalizedCitation, citation.path].filter(Boolean))];
  const snapshotBases = snapshotRoot
    ? (hasCandidates
        ? [path.join(snapshotRoot, SCRIPTED_SEAMS.has(row.seam) ? 'feature' : 'repo')]
        : [path.join(snapshotRoot, 'feature'), path.join(snapshotRoot, 'repo')])
    : null;
  const bases = snapshotBases ?? (hasCandidates
    ? [SCRIPTED_SEAMS.has(row.seam) ? featureDir : root]
    : [featureDir, root]);

  for (const base of bases) {
    if (!base || !Number.isInteger(citation.line) || citation.line < 1) continue;
    for (const candidateRel of candidateRelatives) {
      const absolute = path.resolve(base, candidateRel);
      const relative = path.relative(base, absolute);
      if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
      try {
        if (!(await stat(absolute)).isFile()) continue;
        if (!cache.has(absolute)) {
          cache.set(absolute, (await readFile(absolute, 'utf8')).split(/\r?\n/));
        }
        const lines = cache.get(absolute);
        if (citation.line <= lines.length && hasPredicateInWindow(lines, citation.line, row.seam)) {
          return true;
        }
        // 快照文件存在但校验未通过时，严禁回退到工作区活文件
        if (snapshotBases) return false;
      } catch {
        // 尝试下一个允许的来源根目录或路径形式
      }
    }
  }
  return false;
}

function makeIssue(code, level, message, hint = '') {
  return hint ? { code, level, message, hint } : { code, level, message };
}

/** 核对 Spec 审查原文对账覆盖完整性、谓词窗口引用真实性与抽检范围 */
export async function specReviewCoverageIssues(root, featureDir, checklist, markdown, { snapshotRoot = null } = {}) {
  const version = checklist.version ?? SPEC_REVIEW_CHECKLIST_VERSION;
  const issues = [];
  let coverage;
  try {
    coverage = parseSpecReviewCoverage(markdown, { version });
  } catch (error) {
    return [makeIssue('SPEC_REVIEW_COVERAGE_INVALID', 'FAIL', `对账覆盖表无法解析：${error.message}`)];
  }
  const expected = new Map(checklist.rows.map((row) => [row.id, row]));
  const seen = new Set();
  const cache = new Map();

  for (const response of coverage.rows) {
    if (!['已核实', '未核实'].includes(response.verdict)) {
      issues.push(makeIssue('SPEC_REVIEW_COVERAGE_INVALID', 'FAIL', `${response.ids.join('、')} 的结论只能是已核实或未核实`));
    }
    if (!['不适用', '变更成立', '变更不成立'].includes(response.change)) {
      issues.push(makeIssue('SPEC_PLAN_CHANGE_REVIEW_MISSING', 'BLOCKED', `${response.ids.join('、')} 的计划变更复核值无效：${response.change || '空'}`));
    }
    const citations = coverageCitations(response.source);
    for (const id of response.ids) {
      const row = expected.get(id);
      if (!row) {
        issues.push(makeIssue('SPEC_REVIEW_COVERAGE_UNKNOWN', 'FAIL', `对账覆盖表包含清单外 ID：${id}`));
        continue;
      }
      if (seen.has(id)) {
        issues.push(makeIssue('SPEC_REVIEW_COVERAGE_DUPLICATE', 'FAIL', `对账覆盖表重复响应 ${id}`));
        continue;
      }
      seen.add(id);
      if (version === SPEC_REVIEW_CHECKLIST_VERSION && response.actual !== row.actual) {
        issues.push(makeIssue('SPEC_REVIEW_BINDING_MISMATCH', 'FAIL', `${id} 的实测值或绑定未逐字复制清单`));
      }
      if (response.verdict === '未核实') {
        issues.push(makeIssue('SPEC_REVIEW_INCOMPLETE', 'BLOCKED', `${id} 仍标记为未核实；须核实或按规则形成 P-M`));
      }
      if (row.changed) {
        if (response.change === '变更不成立') {
          issues.push(makeIssue('SPEC_PLAN_CHANGE_REJECTED', 'FAIL', `${id} 的计划变更被审查者判为不成立；恢复原断言或重新验收`));
        } else if (response.change !== '变更成立') {
          issues.push(makeIssue('SPEC_PLAN_CHANGE_REVIEW_MISSING', 'BLOCKED', `${id} 的冻结断言已变化，必须判变更成立或变更不成立`));
        }
      } else if (response.change !== '不适用') {
        issues.push(makeIssue('SPEC_PLAN_CHANGE_REVIEW_MISSING', 'BLOCKED', `${id} 未发生计划变更，复核列必须写不适用`));
      }
      let sourceValid = response.source.replace(/`[^`\n]+:\d+`/g, '').trim().length > 0;
      if (sourceValid) {
        sourceValid = false;
        for (const citation of citations) {
          if (await citationIsValid(root, featureDir, row, citation, cache, { snapshotRoot })) {
            sourceValid = true;
            break;
          }
        }
      }
      if (!sourceValid) {
        issues.push(makeIssue(
          'SPEC_REVIEW_SOURCE_INVALID',
          'FAIL',
          `${id} 没有与接缝匹配、行号存在且命中断言谓词的源码引用`,
          row.sourceCandidates.length
            ? `允许的来源：${row.sourceCandidates.join('、')}（需指向真实测试或断言 ±5 行内，禁止 :1 敷衍）`
            : '引用特性证据或仓库源码的 path:line（命中测试/断言谓词），并填写谓词摘要',
        ));
      }
    }
  }

  const units = Array.isArray(checklist.reviewUnits) && checklist.reviewUnits.length ? checklist.reviewUnits : null;
  const inheritedIds = new Set(units ? units.filter((u) => u.verificationStatus === 'inherited').flatMap((u) => u.rowIds) : []);
  const sampledIds = new Set(units ? units.filter((u) => u.verificationStatus === 'sampled').flatMap((u) => u.rowIds) : []);

  const requiredRows = version === SPEC_REVIEW_CHECKLIST_V2
    ? checklist.rows.filter((row) => (
        units
          ? !inheritedIds.has(row.id) && !sampledIds.has(row.id) && row.required
          : row.required
      ))
    : checklist.rows;
  const missing = requiredRows.map((row) => row.id).filter((id) => !seen.has(id));
  if (missing.length) {
    issues.push(makeIssue('SPEC_REVIEW_COVERAGE_MISSING', 'BLOCKED', `Spec 原文缺少必审项对账覆盖：${missing.join('、')}`));
  }

  if (version === SPEC_REVIEW_CHECKLIST_V2) {
    const optionalRows = checklist.rows.filter((row) => (
      units
        ? sampledIds.has(row.id)
        : !row.required
    ));
    const uncoveredOptionalRows = optionalRows.filter((row) => !seen.has(row.id));
    if (uncoveredOptionalRows.length) {
      const hasSamplingHeading = /^## 抽检范围\s*$/m.test(markdown);
      const optionalFiles = [...new Set(uncoveredOptionalRows.flatMap((row) => row.sourceCandidates.map((item) => path.posix.basename(item))))];
      const samplingLines = samplingSection(markdown);
      const samplingText = samplingLines.join('\n');
      const hasValidSamplingHeading = hasSamplingHeading
        && samplingLines.length > 0
        && !/<请写出/.test(samplingText)
        && (!optionalFiles.length || optionalFiles.some((name) => samplingText.includes(name)));
      const mentionsSampling = /抽检/.test(markdown)
        && !/<请写出/.test(markdown)
        && (!optionalFiles.length || optionalFiles.some((name) => markdown.includes(name)));
      if (!hasValidSamplingHeading && !mentionsSampling) {
        issues.push(makeIssue(
          'SPEC_REVIEW_SAMPLING_MISSING',
          'BLOCKED',
          `v2 清单含 ${uncoveredOptionalRows.length} 条常规通过项，但 Spec 原文缺少有效 ## 抽检范围 或未说明实际抽检结果`,
          '在 Spec 审查原文补充 ## 抽检范围 填写抽检文件范围及结果，不得留空或保留骨架 <请写出...> 占位符',
        ));
      }
    }
  }

  return issues;
}

/** seal 前与 qa-check 共用的审查原文校验唯一入口：任一不通过即阻断生成 .source.json */
export async function validateReviewReportForSeal({
  root,
  featureDir,
  axis,
  markdown,
  pendingIds = [],
  checklist = null,
  snapshotRoot = null,
}) {
  const issues = [];
  if (!rawHasFindingOrNoFinding(markdown)) {
    issues.push(makeIssue(
      'REVIEW_RAW_UNNUMBERED',
      'FAIL',
      '审查原文没有规范编号（[S-H/J<n>] / [P-M/W/X<n>]），也没有写「无发现」。',
      '补充规范编号或写明「无发现」/「无新增审查发现」后再封存。',
    ));
  }

  const axisPendingIds = pendingIds.filter((id) => {
    const owner = axisOfFinding(id);
    return owner === null || owner === axis;
  });
  const responseIds = new Set(parseFindingResponses(markdown).map((finding) => finding.id));
  const missingPending = axisPendingIds.filter((id) => !responseIds.has(id));
  if (missingPending.length) {
    issues.push(makeIssue(
      'FINDING_NOT_REREVIEWED',
      'BLOCKED',
      `复审原文缺少 --pending-ids 声明的待复核编号：${missingPending.join('、')}。`,
      '按 code-review 复审规则逐条写出 [编号] 已修/未修/修错 或 改档成立/改档不成立 后再封存。',
    ));
  }

  if (axis === 'spec' && checklist) {
    issues.push(...await specReviewCoverageIssues(root, featureDir, checklist, markdown, { snapshotRoot }));
  }

  return { ok: issues.length === 0, issues };
}
