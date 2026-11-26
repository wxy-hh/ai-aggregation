import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { emptyEvidenceReason, parseRunLog } from '../qa-run.mjs';
import { QA_DIR, sha256 } from '../review-package.mjs';
import {
  BASELINE_HINT,
  BOUND_SEAMS,
  CURRENT_SCHEMA,
  DEBUG_DIR,
  IMAGE_EXTENSIONS,
  SCRIPT_EXTENSIONS,
  SCRIPTED_SEAMS,
  SCRIPTS_DIR,
  TEST_FILE_PATTERN,
  completeRunLog,
  escapeRegExp,
  evidenceLocation,
  evidenceReferences,
  gitRoot,
  issue,
  matchPosixGlob,
  startedBeforeBaseline,
  summarize,
} from './plan.mjs';
import { parsePlan } from './plan.mjs';
import { argvPathCandidates, referencedProcessScripts, scanProcessScripts } from './script-scan.mjs';
import { buildReviewUnits, noRerunReason, reconciliationTable } from './spec-coverage.mjs';

async function validateEvidence(featureDir, row) {
  const issues = [];
  const entries = [];
  const references = evidenceReferences(row.evidence);
  if (!references.valid) {
    issues.push(issue(
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
      issues.push(issue('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据越出特性目录：${reference}`));
      continue;
    }
    const extension = path.posix.extname(location.relative).toLowerCase();
    const entry = { path: location.relative, image: IMAGE_EXTENSIONS.has(extension), log: null };
    entries.push(entry);
    let info;
    try {
      info = await stat(location.absolute);
    } catch {
      issues.push(issue('MISSING_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据不存在：${location.relative}`));
      continue;
    }
    if (!info.isFile() || info.size === 0) {
      issues.push(issue('EMPTY_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的证据为空：${location.relative}`));
      continue;
    }
    if (extension !== '.log') continue;
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (!completeRunLog(log)) {
      issues.push(issue('INVALID_RUN_LOG', 'FAIL', `${row.caseId} / ${row.assertion} 的日志不是完整 qa-run 日志：${location.relative}；请通过 node tooling/scripts/qa-run.mjs 真实执行生成`));
      continue;
    }
    entry.log = log;
    if (log.exit !== 0) {
      issues.push(issue('EVIDENCE_EXIT_NONZERO', 'FAIL', `${row.caseId} / ${row.assertion} 的 PASS 证据日志退出码为 ${log.exit}：${location.relative}；请修复后重新执行`));
    } else if (emptyEvidenceReason(log.body)) {
      issues.push(issue('EMPTY_EVIDENCE', 'FAIL', `${row.caseId} / ${row.assertion} 的日志虽 exit 0，但${emptyEvidenceReason(log.body)}：${location.relative}`));
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
    frozenText = await readFile(path.join(featureDir, QA_DIR, 'prechange', 'qa-plan.md'), 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    if (hasScope) notes.push(`存在 ${QA_DIR}/scope.json，但没有 ${QA_DIR}/prechange/qa-plan.md；本次无法核对计划冻结变化。`);
    return { issues, notes, frozen: null };
  }
  const frozen = parsePlan(frozenText);
  if (frozen.schema !== CURRENT_SCHEMA) return { issues, notes, frozen: null };

  const executed = frozen.results.filter((row) => row.status === 'PASS' || row.status === 'FAIL');
  if (executed.length) {
    issues.push(issue(
      'PLAN_FROZEN_AFTER_EXECUTION',
      'FAIL',
      `开工时冻结的计划已有 ${executed.length} 条 PASS/FAIL 执行结果，基线与计划冻结晚于验收执行。`,
      `计划应在规划收口、执行任何验收之前通过 init 冻结；不要修改 ${QA_DIR}/ 下的文件，在 review-report 的 ## 范围说明 如实说明，由人工终审决定。`,
    ));
  }

  const record = (token, description) => {
    if (planChangeRecorded(plan, token)) return;
    issues.push(issue(
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
  return { issues, notes, frozen };
}

async function reproductionLog(featureDir, reproduction) {
  const references = evidenceReferences(reproduction.evidence);
  if (!references.valid || references.paths.length !== 1) {
    return {
      log: null,
      issues: [issue(
        'INVALID_EVIDENCE',
        'FAIL',
        `${reproduction.caseId} 的修复前复现必须引用一个 qa-run 日志路径`,
        '请在特性目录内通过 node tooling/scripts/qa-run.mjs 真实执行修复前命令，并用一个反引号路径引用生成的日志。',
      )],
    };
  }
  const location = evidenceLocation(featureDir, references.paths[0]);
  if (!location) {
    return {
      log: null,
      issues: [issue('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `${reproduction.caseId} 的修复前复现证据越出特性目录`)],
    };
  }
  try {
    const info = await stat(location.absolute);
    if (!info.isFile() || info.size === 0) {
      return { log: null, issues: [issue('EMPTY_EVIDENCE', 'FAIL', `${reproduction.caseId} 的修复前复现证据为空`)] };
    }
  } catch {
    return { log: null, issues: [issue('MISSING_EVIDENCE', 'FAIL', `${reproduction.caseId} 的修复前复现证据不存在：${location.relative}`)] };
  }
  const log = parseRunLog(await readFile(location.absolute, 'utf8'));
  if (path.posix.extname(location.relative).toLowerCase() !== '.log' || !completeRunLog(log)) {
    return { log: null, issues: [issue('INVALID_RUN_LOG', 'FAIL', `${reproduction.caseId} 的修复前复现必须是完整 qa-run 日志：${location.relative}`)] };
  }
  return { log, issues: [] };
}

/** browser/api 的 PASS 行：引用日志须含该断言的 `[TC01-1] PASS 实测：<值>` 标记，且不得出现 FAIL 标记 */
function assertionMarkerIssues(passRows) {
  const issues = [];
  const values = new Map();
  for (const { row, testCase, logs } of passRows) {
    if (!SCRIPTED_SEAMS.has(testCase.seam)) continue;
    const tag = escapeRegExp(`[${row.caseId}-${row.assertion}]`);
    const body = logs.map((log) => log.body ?? '').join('\n');
    if (new RegExp(`${tag}\\s*FAIL\\b`).test(body)) {
      issues.push(issue(
        'ASSERTION_MARKER_CONFLICT',
        'FAIL',
        `${row.caseId} / ${row.assertion} 记为 PASS，但引用日志中出现该断言的 FAIL 标记。`,
        '以日志为准把该行改为 FAIL，修复后换新标签用 qa-run 重新运行；不要改写日志或删除 FAIL 标记。',
      ));
      continue;
    }
    const observed = [...body.matchAll(new RegExp(`${tag}\\s*PASS\\s+实测[：:][ \\t]*(.*)$`, 'gm'))]
      .map((match) => match[1].trim())
      .filter(Boolean);
    if (!observed.length) {
      issues.push(issue(
        'ASSERTION_MARKER_MISSING',
        'FAIL',
        `${row.caseId} / ${row.assertion} 的引用日志中没有 [${row.caseId}-${row.assertion}] PASS 实测：<观察值> 标记，或实测值为空。`,
        '过程脚本须在该断言的硬断言通过后输出 [TC<id>-<序号>] PASS 实测：<观察值>，失败时输出 [TC<id>-<序号>] FAIL <原因> 并非零退出；补上后换新标签重新运行。',
      ));
      continue;
    }
    values.set(`${row.caseId}:${row.assertion}`, observed.join('；'));
  }
  return { issues, values };
}

function normalizeTitle(text) {
  return text.replace(/[`'"‘’“”]/g, '').replace(/\s+/g, ' ').trim();
}

/** 解析绑定格 `` `<测试文件>` › <用例标题> `` */
export function parseBinding(text) {
  const match = text.trim().match(/^`([^`]+)`\s*›\s*(.+)$/);
  return match ? { file: match[1].trim(), title: match[2].trim() } : null;
}

/** 识别整段反引号误写并给出只改当前行的文本 */
export function wholeWrappedBindingCorrection(text) {
  const match = text.trim().match(/^`([^`]+?)`\s*$/);
  if (!match || !match[1].includes('›')) return null;
  const [file, ...title] = match[1].split('›');
  if (!file.trim() || !title.join('›').trim()) return null;
  return `\`${file.trim()}\` › ${title.join('›').trim()}`;
}

async function packageDirectory(start, root) {
  let current = start;
  for (;;) {
    try {
      await stat(path.join(current, 'package.json'));
      return current;
    } catch {
      // 继续向上查找
    }
    const parent = path.dirname(current);
    if (current === root || parent === current) return root;
    current = parent;
  }
}

function bindingNamedBy(relative, named) {
  return named.some((candidate) => {
    const pattern = candidate.split(path.sep).join('/').replace(/^\.\//, '');
    return relative === pattern
      || relative.endsWith(`/${pattern}`)
      || matchPosixGlob(relative, pattern)
      || matchPosixGlob(relative, `**/${pattern}`);
  });
}

async function testBindingIssues(passRows, root, featureDir) {
  const issues = [];
  const base = root ?? path.resolve(featureDir);
  const sources = new Map();
  for (const { row, testCase, logs } of passRows) {
    if (!BOUND_SEAMS.has(testCase.seam)) continue;
    const label = `${row.caseId} / ${row.assertion}`;
    const binding = parseBinding(row.binding);
    const missing = (reason, hint = '在执行记录的「绑定」列写 `<测试文件>` › <用例标题>（文件相对仓库根，标题取源码中的叶子标题）；只改绑定列不需要重跑证据命令。') => issues.push(issue(
      'TEST_BINDING_MISSING',
      'FAIL',
      `${label} 的用例绑定无效：${reason}。`,
      hint,
    ));
    if (!binding) {
      const correction = wholeWrappedBindingCorrection(row.binding);
      if (correction) {
        missing(
          `qa-plan.md:${row.line} 误将文件与标题整段包裹在反引号中，当前为 ${row.binding}`,
          `将 qa-plan.md:${row.line} 单行修正为：${correction}`,
        );
      } else {
        missing(row.binding ? `格式应为 \`<测试文件>\` › <用例标题>，当前为 ${row.binding}` : '绑定列为空');
      }
      continue;
    }
    const absolute = path.resolve(base, binding.file);
    if (!sources.has(absolute)) {
      sources.set(absolute, await readFile(absolute, 'utf8').then(normalizeTitle, () => null));
    }
    const source = sources.get(absolute);
    if (source === null) {
      missing(`测试文件不存在：${binding.file}`);
      continue;
    }
    if (!source.includes(normalizeTitle(binding.title))) {
      missing(`${binding.file} 中找不到标题「${binding.title}」`);
      continue;
    }
    const relative = path.relative(base, absolute).split(path.sep).join('/');
    let covered = false;
    for (const log of logs) {
      const named = argvPathCandidates(log.argv ?? []).filter((candidate) => TEST_FILE_PATTERN.test(candidate) || candidate.includes('*'));
      if (named.length) {
        if (bindingNamedBy(relative, named)) covered = true;
      } else {
        const packageDir = await packageDirectory(path.resolve(base, log.cwd ?? '.'), base);
        const inside = path.relative(packageDir, absolute);
        if (!inside.startsWith('..') && !path.isAbsolute(inside)) covered = true;
      }
      if (covered) break;
    }
    if (!covered) {
      issues.push(issue(
        'TEST_BINDING_OUT_OF_RUN',
        'FAIL',
        `${label} 绑定的 ${binding.file} 不在证据命令的运行范围内。`,
        '证据命令点名测试文件时须包含绑定文件；未点名时绑定文件须位于命令所属包目录内。请改正绑定，或换新标签用覆盖该文件的命令重新运行。',
      ));
    }
  }
  return issues;
}

export async function checkAcceptance(featureDir, plan, context, { maxInheritRound = Infinity } = {}) {
  const issues = [];
  const notes = [];
  const rows = new Map();
  const evidenceByRow = new Map();
  const scriptedLogs = new Map();
  const passRows = [];
  const tableRows = [];
  const expectedKeys = new Set(
    plan.cases.flatMap((testCase) => testCase.assertions.map((assertion) => `${testCase.id}:${assertion.number}`)),
  );
  for (const row of plan.results) {
    const key = `${row.caseId}:${row.assertion}`;
    if (!expectedKeys.has(key)) {
      issues.push(issue('UNKNOWN_RESULT', 'FAIL', `${row.caseId} / ${row.assertion} 不在计划断言中`));
    }
    if (rows.has(key)) issues.push(issue('DUPLICATE_RESULT', 'FAIL', `${row.caseId} / ${row.assertion} 有重复结果`));
    rows.set(key, row);
  }
  for (const testCase of plan.cases) {
    for (const assertion of testCase.assertions) {
      if (!rows.has(`${testCase.id}:${assertion.number}`)) {
        issues.push(issue('MISSING_RESULT', 'BLOCKED', `${testCase.id} / ${assertion.number} 缺少执行结果；请真实执行后填写，不要预先标记 PASS`));
      }
    }
  }

  const caseById = new Map(plan.cases.map((testCase) => [testCase.id, testCase]));
  for (const row of rows.values()) {
    const testCase = caseById.get(row.caseId);
    if (testCase) tableRows.push({ row, testCase });
    if (row.status === 'FAIL') {
      issues.push(issue('ASSERTION_FAILED', 'FAIL', `${row.caseId} / ${row.assertion} 失败：${row.evidence} ${row.detail}`.trim()));
      continue;
    }
    if (row.status === 'BLOCKED') {
      issues.push(issue('ASSERTION_BLOCKED', 'BLOCKED', `${row.caseId} / ${row.assertion} 阻塞：${row.evidence} ${row.detail}`.trim()));
      continue;
    }
    const checked = await validateEvidence(featureDir, row);
    issues.push(...checked.issues);
    evidenceByRow.set(row, checked.entries);
    if (!testCase) continue;
    const images = checked.entries.filter((entry) => entry.image);
    const goodLogs = checked.entries.filter((entry) => entry.log?.exit === 0);
    const mismatch = testCase.seam === 'browser' ? !images.length || !goodLogs.length : !goodLogs.length;
    if (!mismatch) passRows.push({ row, testCase, logs: goodLogs.map((entry) => entry.log) });
    if (SCRIPTED_SEAMS.has(testCase.seam) && !mismatch) {
      if (!scriptedLogs.has(row.caseId)) scriptedLogs.set(row.caseId, { seam: testCase.seam, logs: [], assertions: [] });
      const collected = scriptedLogs.get(row.caseId);
      collected.logs.push(...goodLogs.map((entry) => entry.log));
      collected.assertions.push(row.assertion);
    }
    if (mismatch) {
      const message = testCase.seam === 'browser'
        ? `${row.caseId} / ${row.assertion} 声明 Seam: browser，缺少截图或 exit 0 的 qa-run 日志`
        : `${row.caseId} / ${row.assertion} 声明 Seam: ${testCase.seam}，缺少 exit 0 的 qa-run 日志`;
      issues.push(issue(
        'SEAM_EVIDENCE_MISMATCH',
        'FAIL',
        message,
        'PASS 证据须满足声明接缝：browser 需要该场景截图和浏览器脚本的 qa-run 日志（exit 0），其他接缝需要至少一个 exit 0 的 qa-run 日志；单元测试或命令输出不能替代浏览器验收。若确应调整接缝，先在 ## 计划变更 说明再改 Seam。',
      ));
    }
  }

  const screenshots = new Map();
  const screenshotHashes = new Map();
  for (const [row, entries] of evidenceByRow) {
    // _qa/debug/ 下的调试截图不是验收证据，不参与唯一性检查
    for (const entry of entries.filter((item) => item.image && !item.path.startsWith(DEBUG_DIR))) {
      if (!screenshots.has(entry.path)) screenshots.set(entry.path, new Set());
      screenshots.get(entry.path).add(row.caseId);
      const content = await readFile(path.join(featureDir, entry.path)).catch(() => null);
      if (content === null) continue;
      const digest = sha256(content);
      if (!screenshotHashes.has(digest)) screenshotHashes.set(digest, new Map());
      screenshotHashes.get(digest).set(entry.path, row.caseId);
    }
  }
  for (const [relative, caseIds] of screenshots) {
    if (caseIds.size < 2) continue;
    const ids = [...caseIds].sort().join('、');
    issues.push(issue(
      'SHARED_SCREENSHOT',
      'FAIL',
      `${relative} 同时被 ${ids} 引用。`,
      '每个用例需要在自己的场景中截取独立截图；复制或改名同一张图视为伪造证据。',
    ));
  }
  for (const [digest, byPath] of screenshotHashes) {
    if (byPath.size < 2) continue;
    const caseIds = [...new Set(byPath.values())].sort();
    if (caseIds.length < 2) continue;
    issues.push(issue(
      'SHARED_SCREENSHOT',
      'FAIL',
      `${[...byPath.keys()].join('、')} 内容完全相同（SHA-256 ${digest.slice(0, 12)}…），被 ${caseIds.join('、')} 引用。`,
      '每个用例需要在自己的场景中截取独立截图；复制或改名同一张图视为伪造证据。',
    ));
  }

  const root = passRows.length ? context.root ?? await gitRoot(featureDir) : null;
  const scriptedCases = [...scriptedLogs];
  const caseScripts = new Map();
  const referenced = await Promise.all(
    scriptedCases.map(([, collected]) => referencedProcessScripts(featureDir, collected.logs, root)),
  );
  scriptedCases.forEach(([caseId, collected], index) => {
    caseScripts.set(caseId, referenced[index]);
    if (referenced[index].length) return;
    issues.push(issue(
      'PROCESS_SCRIPT_OUTSIDE_SCRIPTS',
      'FAIL',
      `${caseId} / ${collected.assertions.join('、')} 的 ${collected.seam} 证据日志都没有引用特性目录 ${SCRIPTS_DIR}/ 内存在的过程脚本。`,
      `把 browser/api 过程脚本放在特性目录的 ${SCRIPTS_DIR}/ 下，并通过 qa-run 以该脚本路径运行；只接受 ${[...SCRIPT_EXTENSIONS].join('、')} 脚本。`,
    ));
  });

  const markers = assertionMarkerIssues(passRows);
  issues.push(...markers.issues);
  const bindings = await testBindingIssues(passRows, root, featureDir);
  issues.push(...bindings);
  const scan = await scanProcessScripts(featureDir);
  issues.push(...scan.issues);
  notes.push(...scan.notes);

  const earlyLogs = new Map();
  for (const [row, entries] of evidenceByRow) {
    for (const entry of entries) {
      if (!startedBeforeBaseline(entry.log, context.scope)) continue;
      if (!earlyLogs.has(entry.path)) earlyLogs.set(entry.path, { started: entry.log.started, rows: [] });
      earlyLogs.get(entry.path).rows.push(`${row.caseId} / ${row.assertion}`);
    }
  }
  for (const [relative, item] of earlyLogs) {
    issues.push(issue(
      'EVIDENCE_BEFORE_BASELINE',
      'FAIL',
      `${relative} 的开始时间 ${item.started} 早于开工基线 ${context.scope.createdAt}，被 ${item.rows.join('、')} 引用。`,
      BASELINE_HINT,
    ));
  }

  const frozen = await frozenPlanIssues(featureDir, plan, Boolean(context.scope));
  issues.push(...frozen.issues);
  notes.push(...frozen.notes);
  const table = reconciliationTable(tableRows, frozen.frozen ?? plan, plan, markers.values, caseScripts, scan.synthetic, scan.injected);
  const reviewUnits = plan.reviewCoverage === '2'
    ? await buildReviewUnits(featureDir, table, evidenceByRow, rows, context, { maxInheritRound })
    : undefined;

  if (plan.kind === 'fix') {
    const reproductionByCase = new Map(plan.reproductions.map((item) => [item.caseId, item]));
    for (const testCase of plan.cases) {
      const reproduction = reproductionByCase.get(testCase.id);
      if (!reproduction) {
        issues.push(issue('MISSING_REPRODUCTION', 'BLOCKED', `${testCase.id} 缺少 ## 修复前复现 行；请先用同一命令保存修复前的红灯日志`));
        continue;
      }
      const checked = await reproductionLog(featureDir, reproduction);
      issues.push(...checked.issues);
      if (!checked.log) continue;
      if (checked.log.exit === 0) {
        issues.push(issue('REPRODUCTION_NOT_RED', 'FAIL', `${testCase.id} 的修复前复现日志 exit 为 0，不能证明修复前测试为红灯`));
      }
      const greenLogs = plan.results
        .filter((row) => row.caseId === testCase.id && row.status === 'PASS')
        .flatMap((row) => evidenceByRow.get(row) ?? [])
        .map((entry) => entry.log)
        .filter((log) => log?.exit === 0 && JSON.stringify(log.argv) === JSON.stringify(checked.log.argv));
      if (!greenLogs.length) {
        issues.push(issue('REPRODUCTION_SOURCE_MISMATCH', 'FAIL', `${testCase.id} 的复现日志与通过日志 argv 不一致；请用同一命令分别保存红、绿日志`));
        continue;
      }
      for (const green of greenLogs) {
        if (!(checked.log.started < green.started)) {
          issues.push(issue('REPRODUCTION_ORDER', 'FAIL', `${testCase.id} 的复现日志开始时间不早于对应通过日志；请保留真实的时间顺序`));
        }
        if (checked.log.tree !== 'none' && green.tree !== 'none' && checked.log.tree === green.tree) {
          issues.push(issue('REPRODUCTION_SAME_TREE', 'FAIL', `${testCase.id} 的复现与通过日志对应相同 tree；请在修复前后的不同代码上分别运行`));
        }
      }
    }
  }

  if (context.evidenceTree) {
    const staleCases = new Set();
    for (const [row, entries] of evidenceByRow) {
      if (noRerunReason(row)) continue;
      if (entries.some((entry) => entry.log && entry.log.tree !== context.evidenceTree)) staleCases.add(row.caseId);
    }
    if (staleCases.size) {
      issues.push(issue(
        'STALE_EVIDENCE',
        'BLOCKED',
        `${[...staleCases].sort().join('、')} 的证据日志 tree 与当前代码不一致。`,
        '在当前代码上换新标签用 qa-run 重跑并更新证据；能确认仅为非行为文档变化时，在执行记录该行备注写「不重跑：<理由>」，由人工终审核对。',
      ));
    }
  }
  return { ...summarize(issues, notes), table, reviewUnits };
}
