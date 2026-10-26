#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { computeTreeDigest, readScope } from './review-package.mjs';
import { formatCommand, parseRunLog, splitShellWords } from './qa-run.mjs';

export const CURRENT_SCHEMA = 3;

const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED']);
const PHASES = new Set(['plan', 'acceptance', 'review']);
const SEAMS = new Set(['browser', 'api', 'integration', 'unit', 'static']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);
const TRIAGE_VALUES = new Set(['本次修', '转专项', '驳回']);

function result(status, issues = [], notes = []) {
  return { status, ok: status === 'PASS', issues, notes };
}

function issue(code, message) {
  return { code, message };
}

function issue3(code, severity, message, hint) {
  return { code, severity, message, ...(hint ? { hint } : {}) };
}

function result3(issues = [], notes = []) {
  const status = issues.some((item) => item.severity === 'FAIL')
    ? 'FAIL'
    : issues.some((item) => item.severity === 'BLOCKED')
      ? 'BLOCKED'
      : 'PASS';
  return result(status, issues, notes);
}

export function parseSpec(markdown) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## User Stories\s*$/.test(line));
  if (start < 0) throw new Error('缺少 ## User Stories');
  const nextHeading = lines.findIndex((line, index) => index > start && /^##\s/.test(line));
  const end = nextHeading < 0 ? lines.length : nextHeading;
  const ids = lines.slice(start + 1, end).flatMap((line) => {
    const match = line.match(/^(\d+)\.\s+\S/);
    return match ? [Number(match[1])] : [];
  });
  if (!ids.length || new Set(ids).size !== ids.length) {
    throw new Error('User Stories 编号为空或重复');
  }
  return ids;
}

export function splitMarkdownRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split('|').map((cell) => cell.trim());
}

export function deriveCaseStatus(rows) {
  if (!rows.length) return 'BLOCKED';
  if (rows.some((row) => row?.status === 'FAIL')) return 'FAIL';
  if (rows.some((row) => !row || row.status === 'BLOCKED')) return 'BLOCKED';
  return 'PASS';
}

function parseSchema3Plan(markdown) {
  const mode = markdown.match(/^QA Mode:\s*(\S+)\s*$/m)?.[1];
  const kind = markdown.match(/^QA Kind:\s*(\S+)\s*$/m)?.[1] ?? 'feature';
  const cases = [];
  const results = [];
  const delivery = [];
  const reproductions = [];
  const planChanges = [];
  let currentCase = null;
  let inAssertions = false;
  let section = '';

  for (const line of markdown.split(/\r?\n/)) {
    const caseHeading = line.match(/^###\s+(TC\d+)\b/);
    if (caseHeading) {
      currentCase = { id: caseHeading[1], priority: null, covers: [], seam: null, assertions: [] };
      cases.push(currentCase);
      inAssertions = false;
      section = '';
      continue;
    }

    const heading = line.match(/^##\s+(.+?)\s*$/);
    if (heading) {
      currentCase = null;
      inAssertions = false;
      section = heading[1];
      continue;
    }

    if (currentCase) {
      const priority = line.match(/^- Priority:\s*(P\d+)\s*$/);
      if (priority) currentCase.priority = priority[1];
      const covers = line.match(/^- Covers:\s*([\d,\s]+)$/);
      if (covers) currentCase.covers = covers[1].split(',').map((value) => Number(value.trim()));
      const seam = line.match(/^- Seam:\s*(\S+)\s*$/);
      if (seam) currentCase.seam = seam[1];
      if (/^####\s+验证断言\s*$/.test(line)) {
        inAssertions = true;
        continue;
      }
      if (/^#{1,4}\s/.test(line)) inAssertions = false;
      if (inAssertions) {
        const assertion = line.match(/^(\d+)\.\s+(.+)$/);
        if (assertion) {
          currentCase.assertions.push({ number: Number(assertion[1]), text: assertion[2].trim() });
        }
      }
    }

    if (!line.includes('|')) {
      if (section === '计划变更') planChanges.push(line);
      continue;
    }
    const cells = splitMarkdownRow(line);
    if (section === '执行记录') {
      if (cells.length < 4 || !/^TC\d+$/.test(cells[0])) continue;
      if (!/^\d+$/.test(cells[1]) || !RESULT_STATUSES.has(cells[2])) continue;
      results.push({
        caseId: cells[0],
        assertion: Number(cells[1]),
        status: cells[2],
        evidence: cells[3],
        detail: cells.slice(4).join('|').trim(),
      });
    } else if (section === '交付验证') {
      const command = cells[0]?.match(/^`([^`]+)`$/);
      if (command) delivery.push({ command: command[1], evidence: cells[1] ?? '' });
    } else if (section === '修复前复现') {
      if (/^TC\d+$/.test(cells[0] ?? '')) reproductions.push({ caseId: cells[0], evidence: cells[1] ?? '' });
    } else if (section === '计划变更') {
      planChanges.push(line);
    }
  }
  return {
    legacy: false,
    schema: 3,
    mode,
    kind,
    cases,
    results,
    delivery,
    reproductions,
    planChanges: planChanges.join('\n'),
  };
}

export function parsePlan(markdown) {
  const schemaMatch = markdown.match(/^QA Schema:\s*(\d+)\s*$/m);
  if (!schemaMatch) return { legacy: true };
  const schema = Number(schemaMatch[1]);
  if (![1, 2, 3].includes(schema)) return { legacy: true };
  if (schema === 3) return parseSchema3Plan(markdown);

  const mode = markdown.match(/^QA Mode:\s*(\S+)\s*$/m)?.[1];
  const cases = [];
  const results = [];
  let currentCase = null;
  let inAssertions = false;
  let inExecution = false;

  for (const line of markdown.split(/\r?\n/)) {
    const caseHeading = line.match(/^###\s+(TC\d+)\b/);
    if (caseHeading) {
      currentCase = { id: caseHeading[1], priority: null, covers: [], assertions: [] };
      cases.push(currentCase);
      inAssertions = false;
      inExecution = false;
      continue;
    }

    if (/^##\s+执行记录\s*$/.test(line)) {
      currentCase = null;
      inAssertions = false;
      inExecution = true;
      continue;
    }

    if (/^##\s/.test(line)) {
      currentCase = null;
      inAssertions = false;
      inExecution = false;
      continue;
    }

    if (currentCase) {
      const priority = line.match(/^- Priority:\s*(P\d+)\s*$/);
      if (priority) currentCase.priority = priority[1];

      const covers = line.match(/^- Covers:\s*([\d,\s]+)$/);
      if (covers) {
        currentCase.covers = covers[1].split(',').map((value) => Number(value.trim()));
      }

      if (/^####\s+验证断言\s*$/.test(line)) {
        inAssertions = true;
        continue;
      }

      if (/^#{1,4}\s/.test(line)) inAssertions = false;
      if (inAssertions) {
        const assertion = line.match(/^(\d+)\.\s+\S/);
        if (assertion) currentCase.assertions.push(Number(assertion[1]));
      }
    }

    if (inExecution && line.includes('|')) {
      const cells = splitMarkdownRow(line);
      if (cells.length < 4 || !/^TC\d+$/.test(cells[0])) continue;
      if (!/^\d+$/.test(cells[1]) || !RESULT_STATUSES.has(cells[2])) continue;
      results.push({
        caseId: cells[0],
        assertion: Number(cells[1]),
        status: cells[2],
        detail: cells.slice(3).join('|').trim(),
      });
    }
  }

  return { legacy: false, schema, mode, cases, results };
}

function validatePlan(plan, specIds) {
  const issues = [];
  if (!['inline', 'independent'].includes(plan.mode)) {
    issues.push(issue('INVALID_QA_MODE', 'QA Mode 必须是 inline 或 independent'));
  }
  if (!plan.cases.length) issues.push(issue('NO_TEST_CASES', '测试计划没有 TC 用例'));

  const caseIds = new Set();
  const covered = new Set();
  for (const testCase of plan.cases) {
    if (caseIds.has(testCase.id)) issues.push(issue('DUPLICATE_TC', `${testCase.id} 重复定义`));
    caseIds.add(testCase.id);
    if (!testCase.priority) issues.push(issue('MISSING_PRIORITY', `${testCase.id} 缺少 Priority`));
    if (!testCase.covers.length) issues.push(issue('MISSING_COVERS', `${testCase.id} 缺少 Covers`));
    if (!testCase.assertions.length) {
      issues.push(issue('MISSING_ASSERTIONS', `${testCase.id} 缺少验证断言`));
    }
    testCase.assertions.forEach((assertion, index) => {
      if (assertion !== index + 1) {
        issues.push(issue('INVALID_ASSERTION_SEQUENCE', `${testCase.id} 断言必须从 1 连续编号`));
      }
    });
    for (const us of testCase.covers) {
      if (!specIds.includes(us)) issues.push(issue('UNKNOWN_US', `${testCase.id} 覆盖未知 US ${us}`));
      covered.add(us);
    }
  }
  for (const us of specIds) {
    if (!covered.has(us)) issues.push(issue('UNCOVERED_US', `US ${us} 没有被任何 TC 覆盖`));
  }
  return issues;
}

function validateSchema3Plan(plan, specIds) {
  const issues = [];
  const notes = [];
  if (!['inline', 'independent'].includes(plan.mode)) {
    issues.push(issue3('INVALID_QA_MODE', 'FAIL', 'QA Mode 必须是 inline 或 independent'));
  }
  if (!['feature', 'fix'].includes(plan.kind)) {
    issues.push(issue3('INVALID_QA_KIND', 'FAIL', `QA Kind 必须是 feature 或 fix，当前为 ${plan.kind}`));
  }
  if (!plan.cases.length) issues.push(issue3('NO_TEST_CASES', 'FAIL', '测试计划没有 TC 用例'));
  if (!plan.delivery.length) {
    issues.push(issue3('MISSING_DELIVERY_COMMANDS', 'FAIL', '## 交付验证 中没有反引号命令；请在规划时声明最终需要真实运行的完整命令'));
  }

  const caseIds = new Set();
  const covered = new Set();
  for (const testCase of plan.cases) {
    if (caseIds.has(testCase.id)) issues.push(issue3('DUPLICATE_TC', 'FAIL', `${testCase.id} 重复定义`));
    caseIds.add(testCase.id);
    if (!testCase.priority) issues.push(issue3('MISSING_PRIORITY', 'FAIL', `${testCase.id} 缺少 Priority`));
    if (!testCase.covers.length) issues.push(issue3('MISSING_COVERS', 'FAIL', `${testCase.id} 缺少 Covers`));
    if (!testCase.seam) issues.push(issue3('MISSING_SEAM', 'FAIL', `${testCase.id} 缺少 Seam`));
    else if (!SEAMS.has(testCase.seam)) {
      issues.push(issue3('INVALID_SEAM', 'FAIL', `${testCase.id} 的 Seam ${testCase.seam} 无效，应为 browser、api、integration、unit 或 static`));
    }
    if (!testCase.assertions.length) {
      issues.push(issue3('MISSING_ASSERTIONS', 'FAIL', `${testCase.id} 缺少验证断言`));
    }
    testCase.assertions.forEach((assertion, index) => {
      if (assertion.number !== index + 1) {
        issues.push(issue3('INVALID_ASSERTION_SEQUENCE', 'FAIL', `${testCase.id} 断言必须从 1 连续编号`));
      }
    });
    for (const us of testCase.covers) {
      if (!specIds.includes(us)) issues.push(issue3('UNKNOWN_US', 'FAIL', `${testCase.id} 覆盖未知 US ${us}`));
      covered.add(us);
    }
  }
  for (const us of specIds) {
    if (!covered.has(us)) issues.push(issue3('UNCOVERED_US', 'FAIL', `US ${us} 没有被任何 TC 覆盖`));
  }
  const browserCount = plan.cases.filter((testCase) => testCase.seam === 'browser').length;
  if (browserCount > 5) {
    notes.push(`browser 用例共 ${browserCount} 条，时间盒为 ≤5 条/15 分钟；请考虑把部分断言下沉到更低接缝。`);
  }
  return { issues, notes };
}

async function validateEvidence(featureDir, row) {
  if (row.detail.startsWith('command:') || row.detail.startsWith('server:')) {
    const description = row.detail.slice(row.detail.indexOf(':') + 1).trim();
    return description ? [] : [issue('MISSING_EVIDENCE', `${row.caseId} / ${row.assertion} 的 PASS 缺少命令或服务端说明`)];
  }
  const match = row.detail.match(/^`([^`]+)`$/);
  if (!match) return [issue('MISSING_EVIDENCE', `${row.caseId} / ${row.assertion} 的 PASS 缺少证据`)];

  const root = path.resolve(featureDir);
  const evidencePath = path.resolve(root, match[1]);
  if (!evidencePath.startsWith(`${root}${path.sep}`)) {
    return [issue('EVIDENCE_OUT_OF_SCOPE', `${row.caseId} / ${row.assertion} 的证据越出特性目录`)];
  }

  try {
    const info = await stat(evidencePath);
    if (!info.isFile() || info.size === 0) {
      return [issue('EMPTY_EVIDENCE', `${row.caseId} / ${row.assertion} 的证据为空`)];
    }
  } catch {
    return [issue('MISSING_EVIDENCE', `${row.caseId} / ${row.assertion} 的证据不存在：${match[1]}`)];
  }
  return [];
}

async function checkAcceptance(featureDir, plan) {
  const issues = [];
  const rows = new Map();
  const expectedKeys = new Set(
    plan.cases.flatMap((testCase) =>
      testCase.assertions.map((assertion) => `${testCase.id}:${assertion}`),
    ),
  );
  for (const row of plan.results) {
    const key = `${row.caseId}:${row.assertion}`;
    if (!expectedKeys.has(key)) {
      issues.push(issue('UNKNOWN_RESULT', `${row.caseId} / ${row.assertion} 不在计划断言中`));
    }
    if (rows.has(key)) issues.push(issue('DUPLICATE_RESULT', `${row.caseId} / ${row.assertion} 有重复结果`));
    rows.set(key, row);
  }

  for (const testCase of plan.cases) {
    for (const assertion of testCase.assertions) {
      const row = rows.get(`${testCase.id}:${assertion}`);
      if (!row) {
        issues.push(issue('MISSING_RESULT', `${testCase.id} / ${assertion} 缺少执行结果`));
      }
    }
  }

  for (const row of rows.values()) {
    if (row.status === 'FAIL') {
      issues.push(issue('ASSERTION_FAILED', `${row.caseId} / ${row.assertion} 失败：${row.detail}`));
    } else if (row.status === 'BLOCKED') {
      issues.push(issue('ASSERTION_BLOCKED', `${row.caseId} / ${row.assertion} 阻塞：${row.detail}`));
    } else {
      issues.push(...(await validateEvidence(featureDir, row)));
    }
  }

  const caseStatuses = plan.cases.map((testCase) =>
    deriveCaseStatus(testCase.assertions.map((assertion) => rows.get(`${testCase.id}:${assertion}`))),
  );
  const hardFailure = issues.some((item) => !['ASSERTION_BLOCKED', 'MISSING_RESULT'].includes(item.code));
  const status = hardFailure || caseStatuses.includes('FAIL')
    ? 'FAIL'
    : caseStatuses.includes('BLOCKED')
      ? 'BLOCKED'
      : 'PASS';
  return result(status, issues);
}

async function checkReview(featureDir, plan, specIds, markdown) {
  const acceptance = await checkAcceptance(featureDir, plan);
  if (!acceptance.ok) return acceptance;

  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => /^## Spec 对账\s*$/.test(line));
  if (start < 0) return result('FAIL', [issue('MISSING_SPEC_REVIEW', '缺少 ## Spec 对账')]);

  const issues = [];
  const rows = [];
  for (let index = start + 1; index < lines.length && !/^##\s/.test(lines[index]); index += 1) {
    if (!lines[index].includes('|')) continue;
    const cells = splitMarkdownRow(lines[index]);
    if (cells.length < 3 || !/^\d+$/.test(cells[0]) || !RESULT_STATUSES.has(cells[1])) continue;
    rows.push({ us: Number(cells[0]), status: cells[1], detail: cells.slice(2).join('|').trim() });
  }

  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.us)) issues.push(issue('DUPLICATE_US', `US ${row.us} 在 Spec 对账中重复`));
    seen.add(row.us);
    if (!specIds.includes(row.us)) issues.push(issue('UNKNOWN_US', `Spec 对账包含未知 US ${row.us}`));
    if (!row.detail) issues.push(issue('MISSING_REVIEW_DETAIL', `US ${row.us} 缺少证据或原因`));
    if (row.status === 'FAIL') issues.push(issue('SPEC_FAILED', `US ${row.us} 未通过：${row.detail}`));
    if (row.status === 'BLOCKED') issues.push(issue('SPEC_BLOCKED', `US ${row.us} 阻塞：${row.detail}`));
  }
  for (const us of specIds) {
    if (!seen.has(us)) issues.push(issue('MISSING_US', `US ${us} 未出现在 Spec 对账中`));
  }

  if (plan.schema === 2) {
    let manifest;
    try {
      manifest = JSON.parse(await readFile(path.join(featureDir, 'review-package.json'), 'utf8'));
    } catch {
      return result('BLOCKED', [issue('MISSING_REVIEW_PACKAGE', 'Schema 2 审查必须具备有效的 review-package.json')]);
    }

    if (Array.isArray(manifest.unreviewed) && manifest.unreviewed.length > 0) {
      issues.push(issue('UNREVIEWED_FILES', `存在未审查文件：${manifest.unreviewed.map((u) => u.path || u).join(', ')}`));
    }

    if (Array.isArray(manifest.changedFiles) && manifest.changedFiles.length > 0) {
      try {
        const patch = await readFile(path.join(featureDir, 'review-package.diff'), 'utf8');
        if (!patch.trim()) {
          issues.push(issue('EMPTY_REVIEW_DIFF', '存在代码变更但 review-package.diff 为空'));
        }
      } catch {
        issues.push(issue('MISSING_REVIEW_DIFF', '存在代码变更但缺少 review-package.diff'));
      }
    }

    let reportText = '';
    try {
      reportText = await readFile(path.join(featureDir, 'review-report.md'), 'utf8');
    } catch {
      return result('BLOCKED', [issue('MISSING_REVIEW_REPORT', 'Schema 2 审查必须具备 .scratch/<feature>/review-report.md')]);
    }

    if (!/^##\s+Standards\b/m.test(reportText)) {
      issues.push(issue('MISSING_STANDARDS_REVIEW', 'review-report.md 缺少 ## Standards 规范轴审查报告'));
    }
    if (!/^##\s+Spec\b/m.test(reportText)) {
      issues.push(issue('MISSING_SPEC_SECTION', 'review-report.md 缺少 ## Spec 需求轴审查报告'));
    }
    if (!/本次修|转专项|驳回/.test(reportText)) {
      issues.push(issue('MISSING_TRIAGE_CONCLUSION', 'review-report.md 缺少三档分流结论（本次修/转专项/驳回）'));
    }
  }

  const blockedCodes = new Set(['SPEC_BLOCKED', 'MISSING_REVIEW_PACKAGE', 'MISSING_REVIEW_REPORT']);
  const hardFailure = issues.some((item) => !blockedCodes.has(item.code));
  const isBlocked = issues.some((item) => blockedCodes.has(item.code)) || rows.some((row) => row.status === 'BLOCKED');
  const status = hardFailure ? 'FAIL' : isBlocked ? 'BLOCKED' : 'PASS';
  return result(status, issues);
}

async function schema3Context(featureDir) {
  let scope;
  try {
    scope = await readScope(featureDir);
  } catch (error) {
    if (error.code === 'ENOENT') return { scope: null, root: null, tree: null };
    throw error;
  }
  const rootResult = spawnSync('git', ['-C', featureDir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (rootResult.error) throw rootResult.error;
  if (rootResult.status !== 0) throw new Error(`无法定位特性目录所在仓库：${rootResult.stderr.trim()}`);
  const root = await realpath(rootResult.stdout.trim());
  return { scope, root, tree: await computeTreeDigest(root, scope.scopes) };
}

function evidenceReferences(text) {
  const paths = [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1].trim()).filter(Boolean);
  const remainder = text.replace(/`[^`]+`/g, '');
  const valid = paths.length > 0 && /^[\s,，、;；&+]*$/.test(remainder);
  return { paths, valid };
}

function evidenceLocation(featureDir, reference) {
  const root = path.resolve(featureDir);
  const absolute = path.resolve(root, reference);
  const relative = path.relative(root, absolute);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    return null;
  }
  return { absolute, relative: relative.split(path.sep).join('/') };
}

function completeRunLog(log) {
  return Boolean(
    log?.complete
    && log.label
    && log.command !== null
    && Array.isArray(log.argv)
    && log.cwd
    && log.head
    && log.tree
    && log.started
    && log.finished,
  );
}

async function validateSchema3Evidence(featureDir, row) {
  const issues = [];
  const entries = [];
  const references = evidenceReferences(row.evidence);
  if (!references.valid) {
    issues.push(issue3(
      'INVALID_EVIDENCE',
      'FAIL',
      `${row.caseId} / ${row.assertion} 的证据格无效：没有反引号文件路径，或含有路径以外的文字。`,
      '证据格只能写特性目录内的文件路径（反引号）。命令请用 node tooling/scripts/qa-run.mjs .scratch/<特性> <标签> -- <命令> 真实执行后引用生成的日志；说明写在备注列。',
    ));
    return { issues, entries };
  }

  for (const reference of references.paths) {
    const location = evidenceLocation(featureDir, reference);
    if (!location) {
      issues.push(issue3('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据越出特性目录：${reference}`));
      continue;
    }
    const extension = path.posix.extname(location.relative).toLowerCase();
    const entry = { path: location.relative, image: IMAGE_EXTENSIONS.has(extension), log: null };
    entries.push(entry);
    let info;
    try {
      info = await stat(location.absolute);
    } catch {
      issues.push(issue3('MISSING_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据不存在：${location.relative}`));
      continue;
    }
    if (!info.isFile() || info.size === 0) {
      issues.push(issue3('EMPTY_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据为空：${location.relative}`));
      continue;
    }
    if (extension !== '.log') continue;
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (!completeRunLog(log)) {
      issues.push(issue3('INVALID_RUN_LOG', 'FAIL', `${row.caseId} / ${row.assertion} 的日志不是完整 qa-run 日志：${location.relative}；请通过 qa:run 真实执行生成`));
      continue;
    }
    entry.log = log;
    if (log.exit !== 0) {
      issues.push(issue3('EVIDENCE_EXIT_NONZERO', 'FAIL', `${row.caseId} / ${row.assertion} 的 PASS 证据日志退出码为 ${log.exit}：${location.relative}；请修复后重新执行`));
    }
  }
  return { issues, entries };
}

function normalizeAssertion(text) {
  return text.trim().replace(/\s+/g, ' ');
}

function planChangeRecorded(plan, token) {
  if (token === '交付验证') return plan.planChanges.includes('交付验证');
  return new RegExp(`\\b${token}\\b`).test(plan.planChanges);
}

async function frozenPlanIssues(featureDir, plan, hasScope) {
  const issues = [];
  const notes = [];
  let frozenText;
  try {
    frozenText = await readFile(path.join(featureDir, 'prechange', 'qa-plan.md'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (hasScope) notes.push('存在 scope.json，但没有 prechange/qa-plan.md；本次无法核对计划冻结变化。');
    return { issues, notes };
  }
  const frozen = parsePlan(frozenText);
  if (frozen.legacy || frozen.schema !== 3) return { issues, notes };

  const record = (token, description) => {
    if (planChangeRecorded(plan, token)) return;
    issues.push(issue3(
      'UNRECORDED_PLAN_CHANGE',
      'FAIL',
      `${description}。`,
      '若计划确需调整，在 ## 计划变更 写明对应 TC 或交付验证的原因供审查复核；若是为了迁就实现而改弱断言，请恢复原断言并如实记录 FAIL/BLOCKED。',
    ));
  };
  const currentCases = new Map(plan.cases.map((testCase) => [testCase.id, testCase]));
  for (const frozenCase of frozen.cases) {
    const current = currentCases.get(frozenCase.id);
    if (!current) {
      record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：TC 已删除`);
      continue;
    }
    if (current.seam !== frozenCase.seam) {
      record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：Seam 从 ${frozenCase.seam} 改为 ${current.seam}`);
    }
    for (const us of new Set(frozenCase.covers)) {
      if (!current.covers.includes(us)) {
        record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：Covers 丢失 US ${us}`);
      }
    }
    for (let index = 0; index < frozenCase.assertions.length; index += 1) {
      const before = frozenCase.assertions[index];
      const after = current.assertions[index];
      if (!after) {
        record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：断言 ${index + 1} 已缺失`);
      } else if (normalizeAssertion(after.text) !== normalizeAssertion(before.text)) {
        record(frozenCase.id, `${frozenCase.id} 与开工时冻结的计划不一致：断言 ${index + 1} 文本已改变`);
      }
    }
  }

  const remainingCommands = plan.delivery.map((item) => item.command);
  for (const item of frozen.delivery) {
    const index = remainingCommands.indexOf(item.command);
    if (index >= 0) remainingCommands.splice(index, 1);
    else record('交付验证', `交付验证与开工时冻结的计划不一致：命令已删除或修改：${item.command}`);
  }
  return { issues, notes };
}

async function reproductionLog(featureDir, reproduction) {
  const references = evidenceReferences(reproduction.evidence);
  if (!references.valid || references.paths.length !== 1) {
    return {
      log: null,
      issues: [issue3(
        'INVALID_EVIDENCE',
        'FAIL',
        `${reproduction.caseId} 的修复前复现必须引用一个 qa-run 日志路径`,
        '请在特性目录内通过 qa:run 真实执行修复前命令，并用一个反引号路径引用生成的日志。',
      )],
    };
  }
  const location = evidenceLocation(featureDir, references.paths[0]);
  if (!location) {
    return {
      log: null,
      issues: [issue3('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `${reproduction.caseId} 的修复前复现证据越出特性目录`)],
    };
  }
  try {
    const info = await stat(location.absolute);
    if (!info.isFile() || info.size === 0) {
      return { log: null, issues: [issue3('EMPTY_EVIDENCE', 'FAIL', `${reproduction.caseId} 的修复前复现证据为空`)] };
    }
  } catch {
    return { log: null, issues: [issue3('MISSING_EVIDENCE', 'FAIL', `${reproduction.caseId} 的修复前复现证据不存在：${location.relative}`)] };
  }
  const log = parseRunLog(await readFile(location.absolute, 'utf8'));
  if (path.posix.extname(location.relative).toLowerCase() !== '.log' || !completeRunLog(log)) {
    return { log: null, issues: [issue3('INVALID_RUN_LOG', 'FAIL', `${reproduction.caseId} 的修复前复现必须是完整 qa-run 日志：${location.relative}`)] };
  }
  return { log, issues: [] };
}

async function checkSchema3Acceptance(featureDir, plan, context) {
  const issues = [];
  const notes = [];
  const rows = new Map();
  const evidenceByRow = new Map();
  const expectedKeys = new Set(
    plan.cases.flatMap((testCase) => testCase.assertions.map((assertion) => `${testCase.id}:${assertion.number}`)),
  );
  for (const row of plan.results) {
    const key = `${row.caseId}:${row.assertion}`;
    if (!expectedKeys.has(key)) {
      issues.push(issue3('UNKNOWN_RESULT', 'FAIL', `${row.caseId} / ${row.assertion} 不在计划断言中`));
    }
    if (rows.has(key)) issues.push(issue3('DUPLICATE_RESULT', 'FAIL', `${row.caseId} / ${row.assertion} 有重复结果`));
    rows.set(key, row);
  }
  for (const testCase of plan.cases) {
    for (const assertion of testCase.assertions) {
      if (!rows.has(`${testCase.id}:${assertion.number}`)) {
        issues.push(issue3('MISSING_RESULT', 'BLOCKED', `${testCase.id} / ${assertion.number} 缺少执行结果；请真实执行后填写，不要预先标记 PASS`));
      }
    }
  }

  const caseById = new Map(plan.cases.map((testCase) => [testCase.id, testCase]));
  for (const row of rows.values()) {
    if (row.status === 'FAIL') {
      issues.push(issue3('ASSERTION_FAILED', 'FAIL', `${row.caseId} / ${row.assertion} 失败：${row.evidence} ${row.detail}`.trim()));
      continue;
    }
    if (row.status === 'BLOCKED') {
      issues.push(issue3('ASSERTION_BLOCKED', 'BLOCKED', `${row.caseId} / ${row.assertion} 阻塞：${row.evidence} ${row.detail}`.trim()));
      continue;
    }
    const checked = await validateSchema3Evidence(featureDir, row);
    issues.push(...checked.issues);
    evidenceByRow.set(row, checked.entries);
    const testCase = caseById.get(row.caseId);
    if (!testCase) continue;
    const images = checked.entries.filter((entry) => entry.image);
    const goodLogs = checked.entries.filter((entry) => entry.log?.exit === 0);
    const mismatch = testCase.seam === 'browser' ? !images.length || !goodLogs.length : !goodLogs.length;
    if (mismatch) {
      const message = testCase.seam === 'browser'
        ? `${row.caseId} / ${row.assertion} 声明 Seam: browser，缺少截图或 exit 0 的 qa-run 日志`
        : `${row.caseId} / ${row.assertion} 声明 Seam: ${testCase.seam}，缺少 exit 0 的 qa-run 日志`;
      issues.push(issue3(
        'SEAM_EVIDENCE_MISMATCH',
        'FAIL',
        message,
        'PASS 证据须满足声明接缝：browser 需要该场景截图和浏览器脚本的 qa-run 日志（exit 0），其他接缝需要至少一个 exit 0 的 qa-run 日志；单元测试或命令输出不能替代浏览器验收。若确应调整接缝，先在 ## 计划变更 说明再改 Seam。',
      ));
    }
  }

  const screenshots = new Map();
  for (const [row, entries] of evidenceByRow) {
    for (const entry of entries.filter((item) => item.image)) {
      if (!screenshots.has(entry.path)) screenshots.set(entry.path, new Set());
      screenshots.get(entry.path).add(row.caseId);
    }
  }
  for (const [relative, caseIds] of screenshots) {
    if (caseIds.size < 2) continue;
    const ids = [...caseIds].sort().join('、');
    issues.push(issue3(
      'SHARED_SCREENSHOT',
      'FAIL',
      `${relative} 同时被 ${ids} 引用。`,
      '每个用例需要在自己的场景中截取独立截图；复制或改名同一张图视为伪造证据。',
    ));
  }

  const frozen = await frozenPlanIssues(featureDir, plan, Boolean(context.scope));
  issues.push(...frozen.issues);
  notes.push(...frozen.notes);

  if (plan.kind === 'fix') {
    const reproductionByCase = new Map(plan.reproductions.map((item) => [item.caseId, item]));
    for (const testCase of plan.cases) {
      const reproduction = reproductionByCase.get(testCase.id);
      if (!reproduction) {
        issues.push(issue3('MISSING_REPRODUCTION', 'BLOCKED', `${testCase.id} 缺少 ## 修复前复现 行；请先用同一命令保存修复前的红灯日志`));
        continue;
      }
      const checked = await reproductionLog(featureDir, reproduction);
      issues.push(...checked.issues);
      if (!checked.log) continue;
      if (checked.log.exit === 0) {
        issues.push(issue3('REPRODUCTION_NOT_RED', 'FAIL', `${testCase.id} 的修复前复现日志 exit 为 0，不能证明修复前测试为红灯`));
      }
      const greenLogs = plan.results
        .filter((row) => row.caseId === testCase.id && row.status === 'PASS')
        .flatMap((row) => evidenceByRow.get(row) ?? [])
        .map((entry) => entry.log)
        .filter((log) => log?.exit === 0 && JSON.stringify(log.argv) === JSON.stringify(checked.log.argv));
      if (!greenLogs.length) {
        issues.push(issue3('REPRODUCTION_SOURCE_MISMATCH', 'FAIL', `${testCase.id} 的复现日志与通过日志 argv 不一致；请用同一命令分别保存红、绿日志`));
        continue;
      }
      for (const green of greenLogs) {
        if (!(checked.log.started < green.started)) {
          issues.push(issue3('REPRODUCTION_ORDER', 'FAIL', `${testCase.id} 的复现日志开始时间不早于对应通过日志；请保留真实的时间顺序`));
        }
        if (checked.log.tree !== 'none' && green.tree !== 'none' && checked.log.tree === green.tree) {
          issues.push(issue3('REPRODUCTION_SAME_TREE', 'FAIL', `${testCase.id} 的复现与通过日志对应相同 tree；请在修复前后的不同代码上分别运行`));
        }
      }
    }
  }

  if (context.tree) {
    const staleCases = new Set();
    for (const [row, entries] of evidenceByRow) {
      if (entries.some((entry) => entry.log && entry.log.tree !== context.tree)) staleCases.add(row.caseId);
    }
    if (staleCases.size) {
      notes.push(`${[...staleCases].sort().join('、')} 的证据日志 tree 与当前代码不一致；核心行为改动后需重跑。`);
    }
  }
  return result3(issues, notes);
}

function markdownSection(markdown, headingPattern) {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((line) => headingPattern.test(line));
  if (start < 0) return null;
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^##\s/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start + 1, end).join('\n');
}

function specReconciliationIssues(reportText, specIds) {
  const body = markdownSection(reportText, /^## Spec 对账\s*$/);
  if (body === null) return [issue3('MISSING_SPEC_REVIEW', 'FAIL', 'review-report.md 缺少 ## Spec 对账；请在审查报告中逐个 US 对账')];
  const issues = [];
  const rows = [];
  for (const line of body.split(/\r?\n/)) {
    if (!line.includes('|')) continue;
    const cells = splitMarkdownRow(line);
    if (cells.length < 3 || !/^\d+$/.test(cells[0]) || !RESULT_STATUSES.has(cells[1])) continue;
    rows.push({ us: Number(cells[0]), status: cells[1], detail: cells.slice(2).join('|').trim() });
  }
  const seen = new Set();
  for (const row of rows) {
    if (seen.has(row.us)) issues.push(issue3('DUPLICATE_US', 'FAIL', `US ${row.us} 在 Spec 对账中重复`));
    seen.add(row.us);
    if (!specIds.includes(row.us)) issues.push(issue3('UNKNOWN_US', 'FAIL', `Spec 对账包含未知 US ${row.us}`));
    if (!row.detail) issues.push(issue3('MISSING_REVIEW_DETAIL', 'FAIL', `US ${row.us} 缺少证据或原因`));
    if (row.status === 'FAIL') issues.push(issue3('SPEC_FAILED', 'FAIL', `US ${row.us} 未通过：${row.detail}`));
    if (row.status === 'BLOCKED') issues.push(issue3('SPEC_BLOCKED', 'BLOCKED', `US ${row.us} 阻塞：${row.detail}`));
  }
  for (const us of specIds) {
    if (!seen.has(us)) issues.push(issue3('MISSING_US', 'FAIL', `US ${us} 未出现在 review-report 的 Spec 对账中`));
  }
  return issues;
}

function triageIssues(reportText) {
  const body = markdownSection(reportText, /^## 三档分流\s*$/);
  if (body === null || !body.trim()) {
    return [issue3('MISSING_TRIAGE', 'FAIL', 'review-report.md 缺少有效的 ## 三档分流；请给出本次修、转专项或驳回结论')];
  }
  const lines = body.split(/\r?\n/);
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('|')) continue;
    const headers = splitMarkdownRow(lines[index]);
    const tierIndex = headers.findIndex((cell) => cell.includes('档位'));
    if (tierIndex < 0) continue;
    let rowIndex = index + 1;
    for (; rowIndex < lines.length && lines[rowIndex].includes('|'); rowIndex += 1) {
      const cells = splitMarkdownRow(lines[rowIndex]);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(' ', '')))) continue;
      rows.push(cells[tierIndex]?.trim() ?? '');
    }
    index = rowIndex - 1;
  }
  if (!rows.length) {
    return body.includes('无发现')
      ? []
      : [issue3('MISSING_TRIAGE', 'FAIL', '## 三档分流 没有数据行时必须明确写出“无发现”')];
  }
  return rows.flatMap((tier) => TRIAGE_VALUES.has(tier)
    ? []
    : [issue3('INVALID_TRIAGE', 'FAIL', `三档分流的档位“${tier || '空'}”无效，只能是本次修、转专项或驳回`)]);
}

function reviewReportIssues(reportText, specIds) {
  const issues = [];
  const method = reportText.split(/\r?\n/).find((line) => /^审查方式[：:]/.test(line));
  if (!method || !method.replace(/^审查方式[：:]/, '').trim()) {
    issues.push(issue3('MISSING_REVIEW_METHOD', 'FAIL', 'review-report.md 缺少“审查方式：”行；请写明独立审查者或审查会话'));
  } else if (method.includes('自查')) {
    issues.push(issue3(
      'SELF_REVIEW',
      'BLOCKED',
      '审查方式为自查。',
      '中大型改动需要独立于实现者的 Standards 与 Spec 审查（子代理、独立会话或人工）；无法提供时保持 BLOCKED，由人工决定。',
    ));
  }

  const standards = markdownSection(reportText, /^## Standards(?:\s+.*)?$/);
  if (standards === null || !standards.trim()) {
    issues.push(issue3('MISSING_STANDARDS_REVIEW', 'FAIL', 'review-report.md 的 ## Standards 缺失或正文为空；请补充规范轴审查'));
  }
  const spec = markdownSection(reportText, /^## Spec(?:\s+(?!对账(?:\s|$)).*)?$/);
  if (spec === null || !spec.trim()) {
    issues.push(issue3('MISSING_SPEC_SECTION', 'FAIL', 'review-report.md 的 ## Spec 缺失或正文为空；请补充需求轴审查，Spec 对账不能替代该节'));
  }
  const audit = markdownSection(reportText, /^## 证据审计\s*$/);
  if (audit === null || !audit.trim()) {
    issues.push(issue3('MISSING_EVIDENCE_AUDIT', 'FAIL', 'review-report.md 的 ## 证据审计 缺失或正文为空；请逐条核对接缝、入口与证据真实性'));
  }
  issues.push(...specReconciliationIssues(reportText, specIds));
  issues.push(...triageIssues(reportText));
  return issues;
}

async function verificationIssues(featureDir, plan, context) {
  const issues = [];
  for (const declaration of plan.delivery) {
    const references = evidenceReferences(declaration.evidence);
    if (!references.paths.length) {
      issues.push(issue3('MISSING_VERIFICATION', 'BLOCKED', `交付验证 ${declaration.command} 没有证据日志；请在最终代码上通过 qa:run 真实执行`));
      continue;
    }
    const location = evidenceLocation(featureDir, references.paths[0]);
    if (!location) {
      issues.push(issue3('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `交付验证 ${declaration.command} 的证据越出特性目录`));
      continue;
    }
    try {
      const info = await stat(location.absolute);
      if (!info.isFile() || info.size === 0) {
        issues.push(issue3('INVALID_RUN_LOG', 'FAIL', `交付验证 ${declaration.command} 的证据不是完整 qa-run 日志：${location.relative}`));
        continue;
      }
    } catch {
      issues.push(issue3('MISSING_EVIDENCE', 'FAIL', `交付验证 ${declaration.command} 的证据不存在：${location.relative}`));
      continue;
    }
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (path.posix.extname(location.relative).toLowerCase() !== '.log' || !completeRunLog(log)) {
      issues.push(issue3('INVALID_RUN_LOG', 'FAIL', `交付验证 ${declaration.command} 的证据不是完整 qa-run 日志：${location.relative}`));
      continue;
    }
    let expectedArgv = null;
    try {
      expectedArgv = splitShellWords(declaration.command);
    } catch {
      expectedArgv = null;
    }
    if (JSON.stringify(log.argv) !== JSON.stringify(expectedArgv)) {
      issues.push(issue3(
        'VERIFICATION_COMMAND_MISMATCH',
        'FAIL',
        `交付验证声明的命令是 ${declaration.command}，日志实际执行的是 ${formatCommand(log.argv)}。`,
        '请按声明的命令重新运行；需要改命令时先在 ## 计划变更 说明。',
      ));
    }
    if (log.exit !== 0) {
      issues.push(issue3('VERIFICATION_FAILED', 'FAIL', `交付验证 ${declaration.command} 的日志退出码为 ${log.exit}；请修复失败后重新运行`));
    }
    if (!context.tree || log.tree === 'none' || log.tree !== context.tree) {
      issues.push(issue3(
        'STALE_VERIFICATION',
        'BLOCKED',
        `交付验证 ${declaration.command} 的日志生成后代码又有改动，或未绑定 tree。`,
        '请在最终代码上用 qa-run 重新运行该命令并更新证据路径。',
      ));
    }
  }
  return issues;
}

async function checkSchema3Review(featureDir, plan, specIds, context, acceptance) {
  const issues = [...acceptance.issues];
  const notes = [...acceptance.notes];
  if (!context.scope) {
    issues.push(issue3('MISSING_BASELINE', 'BLOCKED', '缺少 scope.json；请在改代码前用 review-package init 建立开工基线'));
  }

  let manifest = null;
  try {
    const parsed = JSON.parse(await readFile(path.join(featureDir, 'review-package.json'), 'utf8'));
    if (!parsed || typeof parsed.treeDigest !== 'string' || !parsed.treeDigest) throw new Error('缺少 treeDigest');
    manifest = parsed;
  } catch {
    issues.push(issue3('MISSING_REVIEW_PACKAGE', 'BLOCKED', 'review-package.json 缺失、无效或没有 treeDigest；请用新版 collect 重新生成'));
  }
  if (manifest) {
    if (Array.isArray(manifest.unreviewed) && manifest.unreviewed.length) {
      issues.push(issue3('UNREVIEWED_FILES', 'FAIL', `存在未审查文件：${manifest.unreviewed.map((item) => item.path || item).join(', ')}；请补充审查或说明`));
    }
    if (Array.isArray(manifest.changedFiles) && manifest.changedFiles.length) {
      try {
        const patch = await readFile(path.join(featureDir, 'review-package.diff'), 'utf8');
        if (!patch.trim()) issues.push(issue3('EMPTY_REVIEW_DIFF', 'FAIL', '存在代码变更但 review-package.diff 为空；请重新 collect'));
      } catch {
        issues.push(issue3('MISSING_REVIEW_DIFF', 'FAIL', '存在代码变更但缺少 review-package.diff；请重新 collect'));
      }
    }
    if (context.tree && manifest.treeDigest !== context.tree) {
      issues.push(issue3('STALE_REVIEW_PACKAGE', 'BLOCKED', 'review-package.json 的 treeDigest 与当前代码不一致；请在最终代码上重新 collect 并复审'));
    }
    if (Array.isArray(manifest.preexisting) && manifest.preexisting.length) {
      notes.push(`开工时范围内已有改动，未进入审查包：${manifest.preexisting.join('、')}`);
    }
  }

  let reportText = '';
  try {
    reportText = await readFile(path.join(featureDir, 'review-report.md'), 'utf8');
  } catch {
    issues.push(issue3('MISSING_REVIEW_REPORT', 'BLOCKED', '缺少 review-report.md；请由独立审查者补齐 Standards、Spec、证据审计与三档分流'));
  }
  if (reportText) issues.push(...reviewReportIssues(reportText, specIds));

  const outOfScope = Array.isArray(manifest?.outOfScope) ? manifest.outOfScope : [];
  if (outOfScope.length) {
    const scopeExplanation = reportText ? markdownSection(reportText, /^## 范围说明\s*$/) ?? '' : '';
    const unexplained = outOfScope.map((item) => item.path || item).filter((relative) => !scopeExplanation.includes(relative));
    if (unexplained.length) {
      issues.push(issue3(
        'OUT_OF_SCOPE_CHANGES',
        'BLOCKED',
        `开工后范围外出现改动：${unexplained.join('、')}。`,
        '属于本任务的文件运行 node tooling/scripts/review-package.mjs add .scratch/<特性> -- <路径> 后重新 collect；不属于本任务的，在 review-report 的 ## 范围说明 逐个写明来源。不要修改 scope.json。',
      ));
    }
  }
  issues.push(...await verificationIssues(featureDir, plan, context));
  return result3(issues, notes);
}

export async function checkFeature(featureDir, phase) {
  if (!PHASES.has(phase)) throw new Error(`未知检查阶段：${phase}`);
  const markdown = await readFile(path.join(featureDir, 'qa-plan.md'), 'utf8');
  const plan = parsePlan(markdown);
  if (plan.legacy) {
    return result('LEGACY', [issue('LEGACY', '未声明受支持的 QA Schema（1/2/3），未校验')]);
  }

  const specIds = parseSpec(await readFile(path.join(featureDir, 'spec.md'), 'utf8'));
  if (plan.schema === 3) {
    const validated = validateSchema3Plan(plan, specIds);
    if (validated.issues.length) return result3(validated.issues);
    if (phase === 'plan') return result3([], validated.notes);
    const context = await schema3Context(featureDir);
    const acceptance = await checkSchema3Acceptance(featureDir, plan, context);
    if (phase === 'acceptance') return acceptance;
    return checkSchema3Review(featureDir, plan, specIds, context, acceptance);
  }

  const planIssues = validatePlan(plan, specIds);
  if (planIssues.length) return result('FAIL', planIssues);
  if (phase === 'plan') return result('PASS');
  if (phase === 'acceptance') return checkAcceptance(featureDir, plan);
  return checkReview(featureDir, plan, specIds, markdown);
}

export function formatReport(report) {
  const lines = (report.notes ?? []).map((note) => `[NOTE] ${note}`);
  lines.push(...report.issues.map((item) => `[${item.code}] ${item.message}`));
  const hintedCodes = new Set();
  for (const item of report.issues) {
    if (!item.hint || hintedCodes.has(item.code)) continue;
    hintedCodes.add(item.code);
    lines.push(`[提示] ${item.code}：${item.hint}`);
  }
  lines.push(`结果: ${report.status}`);
  return lines.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  if (args[0] === '--') args.shift();
  const [phase, featureDir] = args;
  if (!PHASES.has(phase) || !featureDir) {
    console.error('用法: node tooling/scripts/qa-check.mjs <plan|acceptance|review> <feature-dir>');
    process.exitCode = 1;
    return;
  }

  try {
    const report = await checkFeature(featureDir, phase);
    console.log(formatReport(report));
    process.exitCode = ['PASS', 'LEGACY'].includes(report.status) ? 0 : 1;
  } catch (error) {
    console.error(`[INVALID_INPUT] ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
