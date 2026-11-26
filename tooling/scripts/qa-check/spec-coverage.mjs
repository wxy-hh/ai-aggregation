import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { QA_DIR, inScope, sha256, sha256FileOrNull } from '../review-package.mjs';
import {
  SPEC_REVIEW_CHECKLIST_FILE,
  SPEC_REVIEW_CHECKLIST_V2,
  SPEC_REVIEW_CHECKLIST_VERSION,
  SUPPORTED_CHECKLIST_VERSIONS,
  isRequiredSpecRow,
  parseSpecReviewChecklist,
  parseSpecReviewCoverage,
  specReviewChecklistDocument,
  specReviewCoverageIssues,
} from '../qa-spec-review.mjs';
import {
  BOUND_SEAMS,
  NO_RERUN_PATTERN,
  RECONCILIATION_FILE,
  REVIEW_DIR,
  SCRIPTED_SEAMS,
  gitResult,
  issue,
  tableCell,
} from './plan.mjs';
import { importedSpecifiers } from './script-scan.mjs';
import { readSourceReceipt } from './provenance.mjs';

const HIGH_RISK_PATH_PATTERN = /(?:^|\/)(?:auth|permission|billing|pay|quota|privacy|security|token|session|secret|credential)(?:[./_-]|$)/i;
const HIGH_RISK_TEXT_PATTERN = /认证|鉴权|权限|隐私|安全|计费|扣费|账单|配额|支付|密码|令牌|会话|未登录|越权/;

/** 执行记录备注中的「不重跑：<理由>」；理由为空时返回 null */
export function noRerunReason(row) {
  return row.detail.match(NO_RERUN_PATTERN)?.[1].trim() || null;
}

/** 对账表：每条执行结果一行，PASS 对照实测值或绑定，FAIL/BLOCKED 保留原因 */
export function reconciliationTable(rows, frozenPlan, currentPlan, markerValues, caseScripts, synthetic, injected) {
  const assertionText = (plan) => new Map(plan.cases.flatMap((testCase) => testCase.assertions
    .map((assertion) => [`${testCase.id}:${assertion.number}`, assertion.text])));
  const frozenText = assertionText(frozenPlan);
  const currentText = assertionText(currentPlan);
  return rows.map(({ row, testCase }) => {
    const key = `${row.caseId}:${row.assertion}`;
    const actual = row.status !== 'PASS'
      ? [row.evidence, row.detail].filter(Boolean).join(' ') || '（未填写原因）'
      : SCRIPTED_SEAMS.has(testCase.seam)
        ? markerValues.get(key) ?? '（无实测标记）'
        : BOUND_SEAMS.has(testCase.seam) ? row.binding || '（无绑定）' : row.evidence;
    const scripts = caseScripts.get(row.caseId) ?? [];
    const flags = [
      scripts.some((script) => injected.has(script)) && '响应注入',
      scripts.some((script) => synthetic.has(script)) && '非真实输入',
      noRerunReason(row) && `不重跑：${noRerunReason(row)}`,
    ].filter(Boolean);
    const frozenAssertion = frozenText.get(key) ?? currentText.get(key) ?? '';
    const currentAssertion = currentText.get(key) ?? frozenAssertion;
    return {
      id: `${row.caseId}-${row.assertion}`,
      status: row.status,
      priority: testCase.priority ?? 'P1',
      assertion: frozenAssertion === currentAssertion ? currentAssertion : `冻结：${frozenAssertion}<br>当前：${currentAssertion}`,
      actual,
      flag: flags.join('、'),
      seam: testCase.seam,
      target: testCase.target ?? '',
      sourceCandidates: BOUND_SEAMS.has(testCase.seam)
        ? [row.binding.match(/^`([^`]+)`/)?.[1]].filter(Boolean)
        : scripts,
      changed: frozenAssertion !== currentAssertion,
    };
  });
}

function isHighRiskRow(row) {
  if (row.changed || row.status !== 'PASS' || SCRIPTED_SEAMS.has(row.seam)) return true;
  if (HIGH_RISK_TEXT_PATTERN.test(`${row.assertion} ${row.actual}`)) return true;
  return (row.sourceCandidates ?? []).some(
    (candidate) => HIGH_RISK_PATH_PATTERN.test(candidate) || HIGH_RISK_TEXT_PATTERN.test(candidate),
  );
}

/** 计算给定候选源码是否自基线起未发生变更且未导入已变更模块 */
async function areRegressionSourcesUntouched(featureDir, root, scope, candidates) {
  if (!candidates.length || !root || !scope?.base) return false;
  const dirtySet = new Set(scope.dirtyAtInit?.inScope ?? []);
  const changedInScope = new Set(
    (gitResult(root, ['diff', '--name-only', '-z', scope.base, 'HEAD']).stdout ?? '').split('\0').filter(Boolean),
  );
  const prechangeRoot = path.join(featureDir, QA_DIR, 'prechange', 'files');

  for (const rel of candidates) {
    if (dirtySet.has(rel)) return false;
    const livePath = path.join(root, rel);
    const liveHash = await sha256FileOrNull(livePath);
    if (!liveHash) return false;
    let baseHash = await sha256FileOrNull(path.join(prechangeRoot, rel));
    if (!baseHash) {
      const committed = gitResult(root, ['show', `${scope.base}:${rel}`]);
      if (committed.status !== 0) return false;
      baseHash = sha256(Buffer.from(committed.stdout, 'utf8'));
    }
    if (baseHash !== liveHash) return false;
    const text = await readFile(livePath, 'utf8').catch(() => '');
    for (const specifier of importedSpecifiers(text)) {
      if (!/^\.\.?(?:\/|$)/.test(specifier)) continue;
      const baseTarget = path.relative(root, path.resolve(path.dirname(livePath), specifier)).split(path.sep).join('/');
      const candidateTargets = [baseTarget, ...['.js', '.mjs', '.cjs', '.ts', '.tsx'].map((ext) => `${baseTarget}${ext}`)];
      if (candidateTargets.some((target) => changedInScope.has(target) || inScope(target, scope.scopes))) return false;
    }
  }
  return true;
}

/** 按过程脚本或测试文件聚合并生成 reviewUnits（支持 untouched 抽检与 r2+ 哈希继承） */
export async function buildReviewUnits(featureDir, table, evidenceByRow, rowByKey, context, { maxInheritRound = Infinity } = {}) {
  const rowIndex = new Map(table.map((row) => [row.id, row]));
  const grouped = new Map();
  for (const row of table) {
    const primary = row.sourceCandidates[0] ?? row.id;
    const groupKey = `${row.seam}:${primary}`;
    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        unitId: `${row.seam}:${primary}`,
        rows: [],
        sourceCandidates: new Set(),
      });
    }
    const bucket = grouped.get(groupKey);
    bucket.rows.push(row);
    for (const cand of row.sourceCandidates) bucket.sourceCandidates.add(cand);
  }

  const priorVerified = [];
  const reviewEntries = await readdir(path.join(featureDir, REVIEW_DIR)).catch(() => []);
  const specRounds = reviewEntries
    .map((name) => name.match(/^r(\d+)-spec-axis\.md$/)?.[1])
    .filter(Boolean)
    .map(Number)
    .filter((round) => round <= maxInheritRound)
    .sort((left, right) => left - right);

  for (const round of specRounds) {
    const specRel = `${REVIEW_DIR}/r${round}-spec-axis.md`;
    const checked = await readSourceReceipt(featureDir, specRel);
    if (!checked.receipt) continue;
    const specText = await readFile(path.join(featureDir, specRel), 'utf8').catch(() => '');
    let coverage;
    try {
      coverage = parseSpecReviewCoverage(specText, { version: SPEC_REVIEW_CHECKLIST_V2 });
    } catch {
      continue;
    }
    const verifiedIds = new Set(
      coverage.rows
        .filter((item) => item.verdict === '已核实' && item.change !== '变更不成立')
        .flatMap((item) => item.ids),
    );
    const snapChecklistPath = path.join(featureDir, QA_DIR, 'round-snapshots', `r${round}`, 'feature', SPEC_REVIEW_CHECKLIST_FILE);
    const snapRaw = await readFile(snapChecklistPath, 'utf8').catch(() => null);
    if (!snapRaw) continue;
    let snapChecklist;
    try {
      snapChecklist = parseSpecReviewChecklist(snapRaw);
    } catch {
      continue;
    }
    priorVerified.push({ round, verifiedIds, units: snapChecklist.reviewUnits ?? [] });
  }

  const reviewUnits = [];
  for (const bucket of grouped.values()) {
    const sourceCandidates = [...bucket.sourceCandidates];
    const sourceHashes = [];
    for (const cand of sourceCandidates) {
      const base = bucket.rows.some((r) => SCRIPTED_SEAMS.has(r.seam)) ? featureDir : context.root;
      const hash = base ? await sha256FileOrNull(path.join(base, cand)) : null;
      sourceHashes.push(`${cand}:${hash ?? 'missing'}`);
    }
    const evidenceHashes = [];
    for (const row of bucket.rows) {
      const [caseId, num] = row.id.split('-');
      const planRow = rowByKey.get(`${caseId}:${num}`);
      const entries = (planRow && evidenceByRow.get(planRow)) || [];
      for (const entry of entries) {
        const hash = await sha256FileOrNull(path.join(featureDir, entry.path));
        evidenceHashes.push(`${entry.path}:${hash ?? 'missing'}`);
      }
      if (row.status !== 'PASS') evidenceHashes.push(`status:${row.status}`);
    }
    const assertionMaterial = bucket.rows
      .map((r) => `${r.id}\0${r.status}\0${r.assertion}\0${r.changed}\0${r.seam}\0${r.priority}\0${r.target ?? ''}`)
      .join('\n');
    const sourceHash = sha256(sourceHashes.join('\n'));
    const evidenceHash = sha256(evidenceHashes.sort().join('\n'));
    const assertionHash = sha256(assertionMaterial);
    const rowIds = bucket.rows.map((r) => r.id);

    let verificationStatus = bucket.rows.some((r) => isRequiredSpecRow(r)) ? 'required' : 'sampled';
    let riskReason = bucket.rows.some((r) => isHighRiskRow(r)) ? '核心链路或高风险红线' : '常规断言';
    let inheritedFrom = null;

    if (
      bucket.rows.every((r) => !isHighRiskRow(r))
      && sourceCandidates.length
      && await areRegressionSourcesUntouched(featureDir, context.root, context.scope, sourceCandidates)
    ) {
      verificationStatus = 'sampled';
      riskReason = '未实质改动源码与测试的存量回归';
    }

    if (verificationStatus === 'required' && bucket.rows.every((r) => r.status === 'PASS' && !r.changed)) {
      for (const prior of priorVerified) {
        const matchedUnit = prior.units.find(
          (unit) =>
            unit.unitId === bucket.unitId
            && unit.sourceHash === sourceHash
            && unit.evidenceHash === evidenceHash
            && unit.assertionHash === assertionHash
            && JSON.stringify(unit.rowIds) === JSON.stringify(rowIds)
            && (rowIds.every((id) => prior.verifiedIds.has(id)) || unit.verificationStatus === 'inherited'),
        );
        if (matchedUnit) {
          verificationStatus = 'inherited';
          inheritedFrom = matchedUnit.inheritedFrom ?? `r${prior.round}-spec@${sourceHash.slice(0, 12)}`;
          riskReason = '代码、证据与断言自上轮已核实后未发生实质变化';
          break;
        }
      }
    }

    for (const row of bucket.rows) {
      const targetRow = rowIndex.get(row.id);
      if (!targetRow) continue;
      targetRow.required = verificationStatus === 'required';
      if (verificationStatus === 'sampled') targetRow.samplingReason = riskReason;
    }

    reviewUnits.push({
      unitId: bucket.unitId,
      rowIds,
      sourceCandidates,
      riskReason,
      sourceHash,
      evidenceHash,
      assertionHash,
      verificationStatus,
      ...(inheritedFrom ? { inheritedFrom } : {}),
    });
  }
  return reviewUnits;
}

/** 对账表的 markdown 行；终端输出与 _qa/reconciliation.md 共用 */
export function reconciliationLines(table) {
  return [
    '| 用例-断言 | 状态 | 冻结断言原文 / 当前断言 | 实测值、原因或绑定 | 标注 |',
    '| --- | --- | --- | --- | --- |',
    ...table.map((row) => `| ${row.id} | ${row.status} | ${tableCell(row.assertion)} | ${tableCell(row.actual)} | ${row.flag} |`),
  ];
}

export function reconciliationDocument(table) {
  return [
    '# 对账表',
    '',
    '由 qa-check acceptance 生成，请勿手改；Spec 轴审查者逐行核对实测值或绑定是否证明冻结断言。',
    '',
    ...reconciliationLines(table),
    '',
  ].join('\n');
}

/** review 阶段：落盘的对账表须与按当前执行记录计算的一致，审查者才看到最新对账表 */
export async function reconciliationIssues(
  featureDir,
  table,
  { checklistRequired = false, checklistVersion = SPEC_REVIEW_CHECKLIST_VERSION, reviewUnits } = {},
) {
  const issues = [];
  const saved = await readFile(path.join(featureDir, RECONCILIATION_FILE), 'utf8').catch(() => null);
  if (saved !== reconciliationDocument(table)) {
    issues.push(issue(
      'RECONCILIATION_STALE',
      'FAIL',
      saved === null ? `缺少 ${RECONCILIATION_FILE}。` : `${RECONCILIATION_FILE} 与按当前执行记录计算的对账表不一致。`,
      '重跑 qa-check acceptance 生成最新对账表，再重新 collect 并按增量复审交给 Spec 轴核对。',
    ));
  }
  const savedChecklist = await readFile(path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE), 'utf8').catch(() => null);
  const expectedChecklist = specReviewChecklistDocument(table, { version: checklistVersion, reviewUnits });
  if ((checklistRequired && savedChecklist === null) || (savedChecklist !== null && savedChecklist !== expectedChecklist)) {
    issues.push(issue(
      'SPEC_REVIEW_CHECKLIST_STALE',
      'FAIL',
      savedChecklist === null ? `缺少 ${SPEC_REVIEW_CHECKLIST_FILE}。` : `${SPEC_REVIEW_CHECKLIST_FILE} 与当前执行记录不一致。`,
      '经 qa-check acceptance 重新生成对账表和 Spec 审查清单，不要手改 _qa/。',
    ));
  }
  return issues;
}

/** review 阶段：校验 Spec 对账覆盖与抽检范围（支持不可变快照） */
export async function checkSpecCoverage(context, featureDir, plan, manifest, raw, snapshotRoot) {
  const issues = [];
  const notes = [];
  if (manifest?.specReviewChecklist) {
    try {
      if (!SUPPORTED_CHECKLIST_VERSIONS.has(manifest.specReviewChecklist.version)
        || manifest.specReviewChecklist.path !== SPEC_REVIEW_CHECKLIST_FILE) {
        throw new Error('manifest 的清单版本或路径不受支持');
      }
      const checklist = parseSpecReviewChecklist(await readFile(path.join(featureDir, SPEC_REVIEW_CHECKLIST_FILE), 'utf8'));
      if (raw.latest?.spec) {
        const specReview = await readFile(path.join(featureDir, raw.latest.spec), 'utf8');
        issues.push(...await specReviewCoverageIssues(context.root, featureDir, checklist, specReview, { snapshotRoot }));
      }
    } catch (error) {
      issues.push(issue('SPEC_REVIEW_CHECKLIST_STALE', 'BLOCKED', `Spec 审查清单不可用：${error.message}`));
    }
  } else if (plan.reviewCoverage === '1' || plan.reviewCoverage === '2') {
    notes.push('Spec 对账覆盖：旧审查包没有清单声明，保持人工核对；重新 collect 生成新协议审查包。');
  }
  return { issues, notes };
}
