import { readdir, readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { emptyEvidenceReason, formatCommand, parseRunLog, splitShellWords } from '../qa-run.mjs';
import { QA_DIR, computeQaArtifactsDigest, inScope, sha256, sha256FileOrNull } from '../review-package.mjs';
import {
  REREVIEW_STATUS_PATTERN,
  hasNoFinding,
  parseFindingDefinitions,
  parseFindingResponses,
  rawHasFindingOrNoFinding,
  splitMarkdownRow,
} from '../qa-spec-review.mjs';
import {
  BASELINE_HINT,
  CHALLENGE_FILE,
  DEFAULT_FIX_PREFIXES,
  DISPOSITION_VALUES,
  REVIEW_DIR,
  STAGE_ARTIFACT_PATTERN,
  TRIAGE_VALUES,
  axisOf,
  completeRunLog,
  evidenceLocation,
  evidenceReferences,
  issue,
  markdownSection,
  startedBeforeBaseline,
  summarize,
} from './plan.mjs';
import { auditReceiptSources, currentReviewCompletedAt, readReviewChallenge, readSourceReceipt } from './provenance.mjs';
import { checkSpecCoverage } from './spec-coverage.mjs';

const RAW_EXCERPT_LIMIT = 80;

/** 解析 ## 三档分流 表格：按表头定位编号、档位、处置状态、轮次轨迹、验证证据与理由列 */
function parseTriage(reportText) {
  const body = markdownSection(reportText, /^## 三档分流\s*$/);
  if (body === null) return null;
  const lines = body.split(/\r?\n/);
  const rows = [];
  let evidenceColumn = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes('|')) continue;
    const headers = splitMarkdownRow(lines[index]);
    const column = (name) => headers.findIndex((cell) => cell.includes(name));
    const tierIndex = column('档位');
    if (tierIndex < 0) continue;
    const idIndex = column('编号');
    const finalIndex = headers.findIndex((cell) => cell.includes('处置状态') || cell.includes('最终状态'));
    const trajectoryIndex = column('轮次轨迹');
    const reasonIndex = column('理由');
    const evidenceIndex = column('验证证据');
    if (evidenceIndex >= 0) evidenceColumn = true;
    let rowIndex = index + 1;
    for (; rowIndex < lines.length && lines[rowIndex].includes('|'); rowIndex += 1) {
      const cells = splitMarkdownRow(lines[rowIndex]);
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell.replaceAll(' ', '')))) continue;
      const cell = (position) => (position >= 0 ? cells[position]?.trim() ?? '' : '');
      rows.push({
        id: cell(idIndex).replace(/^\[|\]$/g, ''),
        tier: cell(tierIndex),
        final: cell(finalIndex),
        trajectory: cell(trajectoryIndex),
        reason: cell(reasonIndex),
        evidence: cell(evidenceIndex),
      });
    }
    index = rowIndex - 1;
  }
  return { body, rows, evidenceColumn };
}

function triageIssues(triage) {
  if (triage === null || !triage.body.trim()) {
    return [issue('MISSING_TRIAGE', 'FAIL', 'review-report.md 缺少有效的 ## 三档分流；请给出本次修、转专项或驳回结论')];
  }
  if (!triage.rows.length) {
    return hasNoFinding(triage.body)
      ? []
      : [issue('MISSING_TRIAGE', 'FAIL', '## 三档分流 没有数据行时必须明确写出“无发现”')];
  }
  return triage.rows.flatMap((row) => TRIAGE_VALUES.has(row.tier)
    ? []
    : [issue('INVALID_TRIAGE', 'FAIL', `三档分流的档位“${row.tier || '空'}”无效，只能是本次修、转专项或驳回`)]);
}

/** 列出 review/ 下的审查原文，按轮次分组：{ round: { standards, spec } } */
export async function readReviewRounds(featureDir) {
  let entries;
  try {
    entries = await readdir(path.join(featureDir, REVIEW_DIR));
  } catch {
    return new Map();
  }
  const rounds = new Map();
  for (const entry of entries) {
    const match = entry.match(/^r(\d+)-(standards|spec-axis)\.md$/);
    if (!match) continue;
    const round = Number(match[1]);
    if (!rounds.has(round)) rounds.set(round, {});
    rounds.get(round)[match[2] === 'standards' ? 'standards' : 'spec'] = `${REVIEW_DIR}/${entry}`;
  }
  return rounds;
}

async function reviewPackageTree(featureDir) {
  try {
    const manifest = JSON.parse(await readFile(path.join(featureDir, QA_DIR, 'review-package.json'), 'utf8'));
    return typeof manifest?.treeDigest === 'string' ? manifest.treeDigest : null;
  } catch {
    return null;
  }
}

async function reusableAxis(featureDir, rounds, latest, axis, requiredIds) {
  if (requiredIds.some((id) => axisOf(id) === axis)) return null;
  const tree = await reviewPackageTree(featureDir);
  if (!tree) return null;
  for (let round = latest - 1; round >= 1; round -= 1) {
    const relative = rounds.get(round)?.[axis];
    if (!relative) continue;
    const checked = await readSourceReceipt(featureDir, relative);
    if (checked.receipt?.treeDigest !== tree) continue;
    const content = await readFile(path.join(featureDir, relative), 'utf8').catch(() => null);
    if (content === null) continue;
    if (sha256(content) !== checked.receipt.sha256) continue;
    return { relative, round, receipt: checked.receipt };
  }
  return null;
}

async function roundRaws(featureDir, files) {
  return Promise.all([files.standards, files.spec].filter(Boolean).map(async (relative) => {
    const text = await readFile(path.join(featureDir, relative), 'utf8');
    return { relative, text };
  }));
}

async function rawIndex(featureDir, rounds) {
  const last = new Map();
  const firstRoundById = new Map();
  const collisions = [];
  for (const round of [...rounds.keys()].sort((a, b) => a - b)) {
    for (const { relative, text } of await roundRaws(featureDir, rounds.get(round))) {
      for (const finding of parseFindingDefinitions(text)) {
        const id = finding.id;
        const location = `${relative}:${finding.lineIndex + 1}`;
        if (!firstRoundById.has(id)) {
          firstRoundById.set(id, { round, location });
        } else if (round > firstRoundById.get(id).round && !REREVIEW_STATUS_PATTERN.test(finding.line)) {
          collisions.push({ id, firstRound: firstRoundById.get(id).round, round, location });
        }
        last.set(id, { location, line: finding.line });
      }
    }
  }
  return { last, collisions };
}

function rereviewTarget(row) {
  const matches = [...row.trajectory.matchAll(/\br(\d+)\b/g)];
  if (!matches.length) return null;
  const last = matches.at(-1);
  const trailing = row.trajectory.slice(last.index + last[0].length);
  const following = matches.length === 1 || /未修|修错|改档不成立|本次修|转专项|驳回/.test(trailing);
  return { round: Number(last[1]), following };
}

async function rereviewMissing(featureDir, rounds, index, rows) {
  const missing = [];
  for (const row of rows) {
    if (!index.last.has(row.id)) continue;
    const target = rereviewTarget(row);
    if (!target) {
      missing.push(`${row.id}（轮次轨迹未指明复审锚点）`);
      continue;
    }
    const next = [...rounds.keys()]
      .filter((round) => target.following ? round > target.round : round >= target.round)
      .sort((a, b) => a - b)[0];
    if (next === undefined || !rounds.has(next)) {
      missing.push(`${row.id}（尚无复审轮）`);
      continue;
    }
    const relative = rounds.get(next)[axisOf(row.id)];
    const text = relative ? await readFile(path.join(featureDir, relative), 'utf8') : '';
    const responseIds = new Set(parseFindingResponses(text).map((finding) => finding.id));
    if (!responseIds.has(row.id)) missing.push(`${row.id}（r${next} ${axisOf(row.id) === 'standards' ? 'Standards' : 'Spec'} 原文未出现）`);
  }
  return missing;
}

function lastRawLines(index, rows) {
  return rows.map((row) => {
    const found = index.last.get(row.id);
    const excerpt = found && found.line.length > RAW_EXCERPT_LIMIT
      ? `${found.line.slice(0, RAW_EXCERPT_LIMIT)}…（截断）`
      : found?.line ?? '';
    return { id: row.id, disposition: row.final || '未填', location: found?.location ?? '（原文未出现）', excerpt };
  });
}

async function reviewRawIssues(featureDir, triage) {
  const issues = [];
  const notes = [];
  const rounds = await readReviewRounds(featureDir);
  const latest = rounds.size ? Math.max(...rounds.keys()) : null;
  const latestFiles = latest === null ? null : rounds.get(latest);
  const currentRound = latest ?? 1;
  if (latest !== null && latest > 2) {
    notes.push(`审查轮次已达 r${latest}，超出自动复审 1 轮上限（r1 首审 + r2 增量复审）；应停止自动修复并交人工裁决（WAITING_HUMAN）。`);
  }
  const rows = triage?.rows ?? [];
  const requiredIds = rows.filter((row) => {
    if (row.tier !== '本次修' && !DEFAULT_FIX_PREFIXES.some((prefix) => row.id.startsWith(prefix))) return false;
    const target = rereviewTarget(row);
    if (!target) return false;
    const next = [...rounds.keys()]
      .filter((round) => (target.following ? round > target.round : round >= target.round))
      .sort((left, right) => left - right)[0];
    return next === currentRound;
  }).map((row) => row.id);

  const effectiveFiles = latestFiles ? { ...latestFiles } : null;
  const reused = [];
  if (latest !== null && latest > 1) {
    for (const axis of ['standards', 'spec']) {
      if (effectiveFiles?.[axis]) continue;
      const candidate = await reusableAxis(featureDir, rounds, latest, axis, requiredIds);
      if (!candidate) continue;
      effectiveFiles[axis] = candidate.relative;
      reused.push({ axis, ...candidate });
    }
  }
  const rawHint = `在最新审查包（collect）之后用 Skill 工具调用 code-review 重新审查，由独立审查者自写原文并运行 review-package seal 生成 .source.json 到 ${REVIEW_DIR}/；不要用 Agent 工具自行派审查子代理，也不要由主 Agent 代写或改写原文。`;
  if (!effectiveFiles?.standards || !effectiveFiles?.spec) {
    const missing = latest === null
      ? `${REVIEW_DIR}/ 下没有审查原文`
      : `第 r${latest} 轮缺少 ${[!effectiveFiles?.standards && 'standards', !effectiveFiles?.spec && 'spec-axis'].filter(Boolean).join('、')} 原文，且该轴没有与当前审查包同一 treeDigest 的可复用旧轮次`;
    issues.push(issue('REVIEW_RAW_MISSING', 'BLOCKED', `${missing}。`, rawHint));
  }

  if (latestFiles) {
    const unnumbered = [];
    for (const { relative, text } of await roundRaws(featureDir, latestFiles)) {
      if (!rawHasFindingOrNoFinding(text)) unnumbered.push(relative);
    }
    if (unnumbered.length) {
      issues.push(issue(
        'REVIEW_RAW_UNNUMBERED',
        'FAIL',
        `最新一轮审查原文没有规范编号，也没有写「无发现」：${unnumbered.join('、')}。`,
        '编号格式与落盘规则只在 code-review 技能内；collect 后用 Skill 工具调用 code-review 重新审查，不要用 Agent 工具自行派审查子代理。',
      ));
    }
  }

  const index = await rawIndex(featureDir, rounds);
  if (index.collisions.length) {
    issues.push(issue(
      'FINDING_ID_COLLISION',
      'FAIL',
      `跨轮次存在重复起号冲突：${index.collisions.map((c) => `${c.id}@${c.location}（首次于 r${c.firstRound}）`).join('、')}。`,
      '历史已登记编号不得在后续轮次作为新发现复用；复核请写明「[编号] 已修/未修/修错」，新发现须使用 review-challenge.nextIds 分配的新编号。',
    ));
  }
  const unknown = rows.filter((row) => !index.last.has(row.id)).map((row) => row.id);
  if (unknown.length) {
    issues.push(issue(
      'REVIEW_TRIAGE_UNKNOWN',
      'FAIL',
      `分流表中的编号在任何审查原文中都不存在：${unknown.join('、')}。`,
      '删除无原文依据的分流行；确需补充发现须以新轮次由独立审查者重新产出原文并封存，不得自行补写原文或编号。',
    ));
  }
  const unexplained = rows
    .filter((row) => DEFAULT_FIX_PREFIXES.some((prefix) => row.id.startsWith(prefix)) && row.tier !== '本次修' && !row.reason)
    .map((row) => row.id);
  if (unexplained.length) {
    issues.push(issue(
      'DEFAULT_FIX_WITHOUT_REASON',
      'FAIL',
      `S-H、P-M、P-W 类发现默认本次修，以下编号改档但理由为空：${unexplained.join('、')}。`,
      '改为本次修，或在理由列写明转专项或驳回的依据（驳回须引 ADR 或契约）。',
    ));
  }
  const invalid = rows
    .filter((row) => !DISPOSITION_VALUES.has(row.final))
    .map((row) => `${row.id}（${row.final}）`);
  if (invalid.length) {
    issues.push(issue(
      'INVALID_DISPOSITION',
      'FAIL',
      `分流表处置状态不在允许值内：${invalid.join('、')}。`,
      `处置状态只能是 ${[...DISPOSITION_VALUES].filter(Boolean).join('、')} 之一或留空；部分修复写未修，残留说明写进理由列。`,
    ));
  }
  const missing = await rereviewMissing(featureDir, rounds, index, rows.filter((row) => row.tier === '本次修'
    || (DEFAULT_FIX_PREFIXES.some((prefix) => row.id.startsWith(prefix)) && row.tier !== '本次修')));
  if (missing.length) {
    issues.push(issue(
      'FINDING_NOT_REREVIEWED',
      'BLOCKED',
      `以下待复审编号没有出现在对应轴其后一轮的审查原文中：${missing.join('、')}。`,
      'collect 后用 Skill 工具调用 code-review 做增量复审，复审输入须列出这些编号；S-* 由 Standards 轴、P-* 由 Spec 轴复核。格式问题不得成为修改原文的理由。',
    ));
  }
  const unresolvedRows = rows
    .filter((row) => (row.tier === '本次修' && (!row.final || row.final === '—')) || /^(未修|修错|改档不成立)$/.test(row.final));
  const unresolved = unresolvedRows.map((row) => `${row.id}（${row.final && row.final !== '—' ? row.final : '未填'}）`);
  if (unresolved.length) {
    issues.push(issue(
      'UNRESOLVED_FINDINGS',
      'BLOCKED',
      `以下条目未经复审确认解决：${unresolved.join('、')}。`,
      '自动复审最多 1 轮（r1 首审 + r2 增量）；用尽后停止自动修复，按分流表清单交人工裁决（WAITING_HUMAN）：人工在理由列写明接受现状，或显式传 --allow-manual-round 授权追加修复轮；机器结果保持 BLOCKED，提交由人工明确要求后执行。',
    ));
  }
  return {
    issues,
    notes,
    latest: effectiveFiles,
    latestRoundNum: latest,
    currentRound,
    requiredIds,
    reused,
    rawLines: lastRawLines(index, rows),
    rows,
    unresolvedRows,
    index,
  };
}

async function fixEvidenceProblem(featureDir, reference, raisedAt) {
  const location = evidenceLocation(featureDir, reference);
  if (!location || !/^(?:evidence|screenshots)\//.test(location.relative)) return `${reference} 不在特性目录 evidence/ 或 screenshots/ 下`;
  let info;
  try {
    info = await stat(location.absolute);
  } catch {
    return `${location.relative} 不存在`;
  }
  if (!info.isFile() || info.size === 0) return `${location.relative} 为空`;
  if (location.relative.startsWith('evidence/') && path.posix.extname(location.relative).toLowerCase() === '.log') {
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (!completeRunLog(log)) return `${location.relative} 不是完整 qa-run 日志`;
    if (log.exit !== 0) return `${location.relative} 退出码为 ${log.exit}`;
    const started = Date.parse(log.started ?? '');
    if (raisedAt !== undefined && Number.isFinite(started) && started <= raisedAt) {
      return `${location.relative} 的 started 早于轮次轨迹所指的缺陷审查返回`;
    }
  }
  return null;
}

async function fixVerificationIssues(featureDir, rows, evidenceColumn, findingTimes) {
  const fixed = rows.filter((row) => /^已修/.test(row.final));
  if (!fixed.length) return [];
  const hint = '「已修」行在验证证据列写修复后针对该点运行的证据（反引号包裹的 evidence/ 或 screenshots/ 路径；qa-run 日志须 exit 0，事件时间可核验时 started 须晚于缺陷审查返回），不涉及行为的修复写「静态：<理由>」。';
  if (!evidenceColumn) {
    return [issue('FIX_UNVERIFIED', 'FAIL', `## 三档分流 有已修条目但没有「验证证据」列：${fixed.map((row) => row.id).join('、')}。`, hint)];
  }
  const problems = [];
  for (const row of fixed) {
    const text = row.evidence.trim();
    const staticReason = text.match(/^静态[：:]\s*(.*)$/);
    if (staticReason) {
      if (!staticReason[1].trim()) problems.push(`${row.id}（静态理由为空）`);
      continue;
    }
    const references = evidenceReferences(text);
    if (!references.valid) {
      problems.push(`${row.id}（${text ? '验证证据不是反引号文件路径' : '验证证据为空'}）`);
      continue;
    }
    for (const reference of references.paths) {
      const problem = await fixEvidenceProblem(featureDir, reference, findingTimes.get(row.id));
      if (problem) problems.push(`${row.id}（${problem}）`);
    }
  }
  return problems.length
    ? [issue('FIX_UNVERIFIED', 'FAIL', `已修条目缺少有效的修复后验证证据：${problems.join('、')}。`, hint)]
    : [];
}

function declaredReviewHost(reportText) {
  const method = reportText.split(/\r?\n/).find((line) => /^审查方式[：:]/.test(line)) ?? '';
  const name = method.match(/宿主=([^；;]*)/)?.[1]?.trim();
  if (!name) return null;
  return { name, claude: /^claude code$/i.test(name) };
}

function reviewReportIssues(reportText, triage) {
  const issues = [];
  const method = reportText.split(/\r?\n/).find((line) => /^审查方式[：:]/.test(line));
  if (!method || !method.replace(/^审查方式[：:]/, '').trim()) {
    issues.push(issue('MISSING_REVIEW_METHOD', 'FAIL', 'review-report.md 缺少“审查方式：”行；请写明独立审查者或审查会话'));
  } else if (method.includes('自查')) {
    issues.push(issue(
      'SELF_REVIEW',
      'BLOCKED',
      '审查方式为自查。',
      '中大型改动需要独立于实现者的 Standards 与 Spec 审查（子代理、独立会话或人工）；无法提供时保持 BLOCKED，由人工决定。',
    ));
  }
  issues.push(...triageIssues(triage));
  return issues;
}

async function gateEvidenceIssues(featureDir, context) {
  const issues = [];
  for (const phase of ['plan', 'acceptance']) {
    const entries = await readdir(path.join(featureDir, 'evidence')).catch(() => []);
    const logs = [];
    for (const entry of entries.filter((name) => name.startsWith(`gate-${phase}-`) && name.endsWith('.log'))) {
      const log = parseRunLog(await readFile(path.join(featureDir, 'evidence', entry), 'utf8'));
      if (!log?.complete || !log.argv) continue;
      if (path.basename(log.argv[0]) !== 'node' || path.basename(log.argv[1] ?? '') !== 'qa-check.mjs' || log.argv[2] !== phase) continue;
      logs.push(log);
    }
    const valid = phase === 'plan'
      ? logs.some((log) => log.exit === 0)
      : logs.some((log) => log.tree === context.evidenceTree);
    if (!valid) {
      issues.push(issue(
        'GATE_EVIDENCE_MISSING',
        'BLOCKED',
        phase === 'plan'
          ? '缺少 exit 0 的 gate-plan-* 门禁日志。'
          : '缺少当前行为树上的完整 gate-acceptance-* 门禁日志。',
        `经 qa-run 运行 qa-check ${phase}，标签使用 gate-${phase}-*；不要手写门禁输出。`,
      ));
    }
  }
  return issues;
}

async function verificationIssues(featureDir, plan, context, { enforceOrder = false, reviewCompletedAt = null } = {}) {
  const issues = [];
  for (const declaration of plan.delivery) {
    const references = evidenceReferences(declaration.evidence);
    if (!references.paths.length) {
      issues.push(issue('MISSING_VERIFICATION', 'BLOCKED', `交付验证 ${declaration.command} 没有证据日志；请在最终代码上通过 node tooling/scripts/qa-run.mjs 真实执行`));
      continue;
    }
    const location = evidenceLocation(featureDir, references.paths[0]);
    if (!location) {
      issues.push(issue('EVIDENCE_OUT_OF_SCOPE', 'FAIL', `交付验证 ${declaration.command} 的证据越出特性目录`));
      continue;
    }
    try {
      const info = await stat(location.absolute);
      if (!info.isFile() || info.size === 0) {
        issues.push(issue('INVALID_RUN_LOG', 'FAIL', `交付验证 ${declaration.command} 的证据不是完整 qa-run 日志：${location.relative}`));
        continue;
      }
    } catch {
      issues.push(issue('MISSING_EVIDENCE', 'FAIL', `交付验证 ${declaration.command} 的证据不存在：${location.relative}`));
      continue;
    }
    const log = parseRunLog(await readFile(location.absolute, 'utf8'));
    if (path.posix.extname(location.relative).toLowerCase() !== '.log' || !completeRunLog(log)) {
      issues.push(issue('INVALID_RUN_LOG', 'FAIL', `交付验证 ${declaration.command} 的证据不是完整 qa-run 日志：${location.relative}`));
      continue;
    }
    if (startedBeforeBaseline(log, context.scope)) {
      issues.push(issue(
        'EVIDENCE_BEFORE_BASELINE',
        'FAIL',
        `交付验证 ${declaration.command} 的日志开始时间 ${log.started} 早于开工基线 ${context.scope.createdAt}。`,
        BASELINE_HINT,
      ));
    }
    const started = Date.parse(log.started ?? '');
    if (enforceOrder && Number.isFinite(reviewCompletedAt) && Number.isFinite(started) && started < reviewCompletedAt) {
      issues.push(issue(
        'VERIFICATION_BEFORE_REVIEW',
        'FAIL',
        `交付验证 ${declaration.command} 的开始时间 ${log.started} 早于当前双轴最晚完成时间 ${new Date(reviewCompletedAt).toISOString()}。`,
        '在当前独立审查与修复复审完成后，用新标签重跑全部交付命令；不要修改日志时间。',
      ));
    }
    let expectedArgv = null;
    try {
      expectedArgv = splitShellWords(declaration.command);
    } catch {
      expectedArgv = null;
    }
    if (JSON.stringify(log.argv) !== JSON.stringify(expectedArgv)) {
      issues.push(issue(
        'VERIFICATION_COMMAND_MISMATCH',
        'FAIL',
        `交付验证声明的命令是 ${declaration.command}，日志实际执行的是 ${formatCommand(log.argv)}。`,
        '请按声明的命令重新运行；需要改命令时先在 ## 计划变更 说明。',
      ));
    }
    if (log.exit !== 0) {
      issues.push(issue('VERIFICATION_FAILED', 'FAIL', `交付验证 ${declaration.command} 的日志退出码为 ${log.exit}；请修复失败后重新运行`));
    } else if (emptyEvidenceReason(log.body)) {
      issues.push(issue('EMPTY_VERIFICATION', 'FAIL', `交付验证 ${declaration.command} 虽 exit 0，但${emptyEvidenceReason(log.body)}`));
    }
    if (!context.evidenceTree || log.tree === 'none' || log.tree !== context.evidenceTree) {
      issues.push(issue(
        'STALE_VERIFICATION',
        'BLOCKED',
        `交付验证 ${declaration.command} 的日志生成后代码又有改动，或未绑定 tree。`,
        '请在最终代码上用 qa-run 重新运行该命令并更新证据路径。',
      ));
    }
  }
  return issues;
}

/** review 阶段完整门禁：校验范围基线、不可变快照、单轨 challenge 来源、分流与交付时序 */
export async function checkReview(featureDir, plan, context, earlier) {
  const issues = [...earlier.issues];
  const notes = [...earlier.notes];
  if (!context.scope) {
    issues.push(issue('MISSING_BASELINE', 'BLOCKED', `缺少 ${QA_DIR}/scope.json；请在改代码前用 review-package init 建立开工基线`));
  }
  const dirtyAtInit = context.scope?.dirtyAtInit;
  const dirtyPaths = [
    ...(dirtyAtInit?.inScope ?? []),
    ...Object.keys(dirtyAtInit?.outOfScope ?? {}).filter((relative) => inScope(relative, context.scope.scopes)),
  ];
  const dirtyNonArtifacts = [...new Set(dirtyPaths)]
    .filter((relative) => !STAGE_ARTIFACT_PATTERN.test(relative))
    .sort();
  if (dirtyNonArtifacts.length) {
    notes.push(`开工前范围内已有改动：${dirtyNonArtifacts.join('、')}；若基线建得晚，请在 review-report 的 ## 范围说明 解释这些改动的来源。`);
  }

  let manifest = null;
  let currentQaDigest = null;
  try {
    manifest = JSON.parse(await readFile(path.join(featureDir, QA_DIR, 'review-package.json'), 'utf8'));
  } catch {
    issues.push(issue('MISSING_REVIEW_PACKAGE', 'BLOCKED', `缺少 ${QA_DIR}/review-package.json；请先用 node tooling/scripts/review-package.mjs collect 收集审查包`));
  }
  let snapshotRoot = null;
  if (manifest) {
    if (Array.isArray(manifest.unreviewed) && manifest.unreviewed.length) {
      issues.push(issue('UNREVIEWED_FILES', 'FAIL', `存在未审查文件：${manifest.unreviewed.map((item) => item.path || item).join(', ')}；请补充审查或说明`));
    }
    if (Array.isArray(manifest.changedFiles) && manifest.changedFiles.length) {
      try {
        const patch = await readFile(path.join(featureDir, QA_DIR, 'review-package.diff'), 'utf8');
        if (!patch.trim()) issues.push(issue('EMPTY_REVIEW_DIFF', 'FAIL', `存在代码变更但 ${QA_DIR}/review-package.diff 为空；请重新 collect`));
      } catch {
        issues.push(issue('MISSING_REVIEW_DIFF', 'FAIL', `存在代码变更但缺少 ${QA_DIR}/review-package.diff；请重新 collect`));
      }
    }
    if (context.tree && manifest.treeDigest !== context.tree) {
      issues.push(issue('STALE_REVIEW_PACKAGE', 'BLOCKED', `${QA_DIR}/review-package.json 的 treeDigest 与当前代码不一致；请在最终代码上重新 collect 并增量复审`));
    }
    if (typeof manifest.qaArtifactsDigest === 'string') {
      currentQaDigest = await computeQaArtifactsDigest(featureDir);
      if (manifest.qaArtifactsDigest !== currentQaDigest) {
        issues.push(issue(
          'STALE_QA_ARTIFACTS',
          'BLOCKED',
          `${QA_DIR}/review-package.json 的 qaArtifactsDigest 与当前 QA 产物（scripts/screenshots/qa-plan）不一致。`,
          '请先重跑 qa-check acceptance 并重新 collect 审查包，确保审查对象包含最新测试产物。',
        ));
      }
    }
    if (manifest.snapshotDir && (await stat(path.join(featureDir, manifest.snapshotDir)).catch(() => null))?.isDirectory()) {
      snapshotRoot = path.join(featureDir, manifest.snapshotDir);
    }
    if (manifest.snapshotManifest) {
      const snapManifest = await readFile(path.join(featureDir, manifest.snapshotManifest), 'utf8').then(JSON.parse, () => null);
      if (!snapManifest) {
        issues.push(issue('SUPERSEDED', 'BLOCKED', `缺少当轮不可变快照清单 ${manifest.snapshotManifest}，当轮审查结果已作废；请重新 collect。`));
      } else {
        const reasons = [];
        if (context.tree && snapManifest.treeDigest && snapManifest.treeDigest !== context.tree) {
          reasons.push('范围内代码树已变化');
        }
        const liveQaDigest = currentQaDigest ?? await computeQaArtifactsDigest(featureDir);
        if (snapManifest.qaArtifactsDigest && snapManifest.qaArtifactsDigest !== liveQaDigest) {
          reasons.push('QA 产物或计划已变化');
        }
        const liveSpecHash = await sha256FileOrNull(path.join(featureDir, 'spec.md'));
        if (snapManifest.specSha256 && liveSpecHash !== snapManifest.specSha256) {
          reasons.push('spec.md 在 collect 后被修改');
        }
        if (context.root && snapManifest.files) {
          for (const [rel, snapHash] of Object.entries(snapManifest.files)) {
            const liveHash = await sha256FileOrNull(path.join(context.root, rel));
            if (liveHash !== snapHash) {
              reasons.push(`${rel} 与快照不一致`);
              break;
            }
          }
        }
        if (reasons.length) {
          issues.push(issue(
            'SUPERSEDED',
            'BLOCKED',
            `当轮审查快照（${snapManifest.round ?? ''}）已失效：${reasons.join('、')}；请基于最新代码重新 collect 并增量复审。`,
          ));
        }
      }
    }
    if (Array.isArray(manifest.preexisting) && manifest.preexisting.length) {
      notes.push(`开工时范围内已有改动，未进入审查包：${manifest.preexisting.join('、')}`);
    }
  }

  let reportText = '';
  try {
    reportText = await readFile(path.join(featureDir, 'review-report.md'), 'utf8');
  } catch {
    issues.push(issue('MISSING_REVIEW_REPORT', 'BLOCKED', `缺少 review-report.md；请先 collect 并调用 code-review，待两轴原文落盘到 ${REVIEW_DIR}/ 后再写审查方式、三档分流与范围说明`));
  }
  const infraPause = await readFile(path.join(featureDir, QA_DIR, 'infra-pause.json'), 'utf8').then(JSON.parse, () => null);
  const infraMethodLine = reportText.match(/^审查方式[：:][^\n]*INFRA_UNAVAILABLE[^\n]*/m)?.[0] ?? null;
  if (infraPause?.code === 'INFRA_UNAVAILABLE' || infraMethodLine) {
    issues.push(issue(
      'INFRA_UNAVAILABLE',
      'BLOCKED',
      infraPause?.reason || `基础设施或子代理不可用（${infraMethodLine}），已暂停并保持待独立审查。`,
      '保留已落盘内容，勿自动换模型或重派，由用户恢复环境后手动继续。',
    ));
  }
  const triage = reportText ? parseTriage(reportText) : null;
  if (reportText) issues.push(...reviewReportIssues(reportText, triage));
  const raw = await reviewRawIssues(featureDir, triage);
  issues.push(...raw.issues);
  notes.push(...(raw.notes ?? []));

  const specCoverage = await checkSpecCoverage(context, featureDir, plan, manifest, raw, snapshotRoot);
  issues.push(...specCoverage.issues);
  notes.push(...specCoverage.notes);

  let findingTimes = new Map();
  const host = reportText ? declaredReviewHost(reportText) : null;
  const requiredIds = raw.requiredIds;
  const challengeInfo = await readReviewChallenge(featureDir);
  if (challengeInfo.challenge && raw.latest) {
    const provenance = await auditReceiptSources(
      context.root,
      raw.latest,
      featureDir,
      challengeInfo.challenge,
      requiredIds,
      raw.rows,
      host,
      manifest,
      raw.reused,
    );
    issues.push(...provenance.issues);
    notes.push(...provenance.notes);
    findingTimes = provenance.findingTimes;
  } else {
    if (!challengeInfo.challenge && (challengeInfo.problem || raw.latest || manifest)) {
      issues.push(issue(
        'MISSING_REVIEW_CHALLENGE',
        'BLOCKED',
        challengeInfo.problem
          ? `审查 challenge 无效（${challengeInfo.problem}）；请重新 collect 生成 challenge 并由独立审查者重新审查封存。`
          : `缺少 ${QA_DIR}/${CHALLENGE_FILE}；无 challenge 旧双轨已日落，请重新 collect 生成 challenge 并由独立审查者自写原文后 seal 封存。`,
        '运行 node tooling/scripts/review-package.mjs collect .scratch/<特性> 生成 challenge，再通过 code-review 完成独立双轴审查并 seal；不得手写或绕过 challenge。',
      ));
    }
    notes.push('来源核验：未核验（人工）');
  }
  issues.push(...await fixVerificationIssues(featureDir, raw.rows, triage?.evidenceColumn, findingTimes));

  const hasChecklist = Boolean(manifest?.specReviewChecklist);
  const dualDigestUnchanged = Boolean(
    currentQaDigest !== null
    && context.tree
    && manifest.treeDigest === context.tree
    && manifest.qaArtifactsDigest === currentQaDigest,
  );
  // 双指纹（treeDigest + qaArtifactsDigest）均未变时免除 VERIFICATION_BEFORE_REVIEW；gateEvidence 与人工时序提示在有清单时仍正常执行
  const enforceOrder = hasChecklist && !dualDigestUnchanged;
  const reviewCompletedAt = hasChecklist ? await currentReviewCompletedAt(featureDir, raw.latest) : null;
  if (hasChecklist) {
    if (!Number.isFinite(reviewCompletedAt)) {
      notes.push('交付时序：当前有效双轴缺少可用 completedAt，最终命令与审查的先后交人工核对。');
    }
    issues.push(...await gateEvidenceIssues(featureDir, context));
  }

  const outOfScope = Array.isArray(manifest?.outOfScope) ? manifest.outOfScope : [];
  if (outOfScope.length) {
    const scopeExplanation = reportText ? markdownSection(reportText, /^## 范围说明\s*$/) ?? '' : '';
    const unexplained = outOfScope.map((item) => item.path || item).filter((relative) => !scopeExplanation.includes(relative));
    if (unexplained.length) {
      issues.push(issue(
        'OUT_OF_SCOPE_CHANGES',
        'BLOCKED',
        `开工后范围外出现改动：${unexplained.join('、')}。`,
        `属于本任务的文件运行 node tooling/scripts/review-package.mjs add .scratch/<特性> -- <路径> 后重新 collect；不属于本任务的，在 review-report 的 ## 范围说明 逐个写明来源。不要修改 ${QA_DIR}/scope.json。`,
      ));
    }
  }
  issues.push(...await verificationIssues(featureDir, plan, context, { enforceOrder, reviewCompletedAt }));
  const res = summarize(issues, notes);

  let pauseState = null;
  let decisionPack = null;
  if (res.status !== 'PASS') {
    const issueCodes = new Set(issues.map((item) => item.code));
    if (issueCodes.has('INFRA_UNAVAILABLE')) {
      pauseState = 'WAITING_INFRA';
    } else if (
      raw.latestRoundNum !== null && raw.latestRoundNum >= 2
      && (issueCodes.has('UNRESOLVED_FINDINGS') || issueCodes.has('FINDING_NOT_REREVIEWED') || raw.latestRoundNum > 2)
    ) {
      const resolvedFeatureDir = await realpath(featureDir).catch(() => path.resolve(featureDir));
      const featureRel = context.root
        ? path.relative(context.root, resolvedFeatureDir).split(path.sep).join('/')
        : `.scratch/${path.basename(featureDir)}`;
      pauseState = 'WAITING_HUMAN';
      decisionPack = {
        round: `r${raw.latestRoundNum}`,
        unresolved: raw.unresolvedRows.map((row) => `${row.id}（${row.tier || '未定档'} / ${row.final || '未填'} / ${row.trajectory || '无轨迹'}）`),
        nextCommand: `node tooling/scripts/review-package.mjs collect ${featureRel} --allow-manual-round`,
      };
    } else if (
      issueCodes.has('MISSING_REVIEW_PACKAGE')
      || issueCodes.has('MISSING_REVIEW_CHALLENGE')
      || issueCodes.has('STALE_REVIEW_PACKAGE')
      || issueCodes.has('STALE_QA_ARTIFACTS')
      || issueCodes.has('SUPERSEDED')
      || issueCodes.has('SPEC_REVIEW_CHECKLIST_STALE')
      || issueCodes.has('RECONCILIATION_STALE')
    ) {
      pauseState = 'PACKAGE_INVALID';
    }
  }

  return {
    ...res,
    rawLines: raw.rawLines,
    ...(pauseState ? { pauseState } : {}),
    ...(decisionPack ? { decisionPack } : {}),
  };
}
