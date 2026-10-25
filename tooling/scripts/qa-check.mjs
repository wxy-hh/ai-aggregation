#!/usr/bin/env node

import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const RESULT_STATUSES = new Set(['PASS', 'FAIL', 'BLOCKED']);
const PHASES = new Set(['plan', 'acceptance', 'review']);

function result(status, issues = []) {
  return { status, ok: status === 'PASS', issues };
}

function issue(code, message) {
  return { code, message };
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

export function parsePlan(markdown) {
  const schemaMatch = markdown.match(/^QA Schema:\s*(\d+)\s*$/m);
  if (!schemaMatch) return { legacy: true };
  const schema = Number(schemaMatch[1]);
  if (![1, 2].includes(schema)) return { legacy: true };

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

export async function checkFeature(featureDir, phase) {
  if (!PHASES.has(phase)) throw new Error(`未知检查阶段：${phase}`);
  const markdown = await readFile(path.join(featureDir, 'qa-plan.md'), 'utf8');
  const plan = parsePlan(markdown);
  if (plan.legacy) {
    return result('LEGACY', [issue('LEGACY', '历史计划未声明 QA Schema: 1，未校验')]);
  }

  const specIds = parseSpec(await readFile(path.join(featureDir, 'spec.md'), 'utf8'));
  const planIssues = validatePlan(plan, specIds);
  if (planIssues.length) return result('FAIL', planIssues);
  if (phase === 'plan') return result('PASS');
  if (phase === 'acceptance') return checkAcceptance(featureDir, plan);
  return checkReview(featureDir, plan, specIds, markdown);
}

export function formatReport(report) {
  const lines = report.issues.map((item) => `[${item.code}] ${item.message}`);
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
