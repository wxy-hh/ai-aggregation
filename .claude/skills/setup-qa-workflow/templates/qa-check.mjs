#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { QA_DIR } from './review-package.mjs';
import { SPEC_REVIEW_CHECKLIST_V2, computeQaPlanDigest, splitMarkdownRow } from './qa-spec-review.mjs';
import {
  CURRENT_SCHEMA,
  PHASES,
  SCRIPTS_DIR,
  deliveryTestDirectoryIssues,
  deriveCaseStatus,
  featureContext,
  issue,
  mergeFindings,
  parsePlan,
  parseSpec,
  parseSpecCommands,
  skillShadowIssues,
  specCommandIssues,
  summarize,
  tableCell,
  validatePlan,
} from './qa-check/plan.mjs';
import { checkAcceptance } from './qa-check/acceptance.mjs';
import { readReviewRounds, checkReview } from './qa-check/review-triage.mjs';
import { reconciliationIssues, reconciliationLines, writeAcceptanceArtifacts } from './qa-check/spec-coverage.mjs';

export { CURRENT_SCHEMA, deriveCaseStatus, parsePlan, parseSpec, splitMarkdownRow };

export async function checkFeature(featureDir, phase) {
  if (!PHASES.has(phase)) throw new Error(`未知检查阶段：${phase}`);
  const markdown = await readFile(path.join(featureDir, 'qa-plan.md'), 'utf8');
  const plan = parsePlan(markdown);
  if (plan.schema !== CURRENT_SCHEMA) {
    const declared = Number.isNaN(plan.schema) ? '未声明 QA Schema' : `声明的是 QA Schema: ${plan.schema}`;
    return summarize([issue(
      'UNSUPPORTED_SCHEMA',
      'FAIL',
      `qa-plan.md ${declared}，检查器只支持 QA Schema: ${CURRENT_SCHEMA}。`,
      `按 Schema ${CURRENT_SCHEMA} 结构重建：执行记录加「绑定」列，过程脚本放 ${SCRIPTS_DIR}/，机器状态放 ${QA_DIR}/。`,
    )]);
  }

  const specText = await readFile(path.join(featureDir, 'spec.md'), 'utf8');
  const specIds = parseSpec(specText);
  const validated = validatePlan(plan, specIds);
  const specCommands = parseSpecCommands(specText);
  const commandContract = specCommandIssues(plan, specCommands, phase);
  if (phase === 'plan') commandContract.issues.push(...await deliveryTestDirectoryIssues(featureDir, specCommands));
  const shadow = phase === 'acceptance' ? { issues: [], notes: [] } : await skillShadowIssues(featureDir);
  const structureNotes = phase === 'plan' && !validated.issues.length ? validated.notes : [];
  const planFindings = mergeFindings({ issues: validated.issues, notes: structureNotes }, commandContract);
  if (planFindings.issues.length || phase === 'plan') {
    const early = mergeFindings(planFindings, shadow);
    return summarize(early.issues, early.notes);
  }
  const context = await featureContext(featureDir);
  const qaPlanDigest = computeQaPlanDigest(markdown);
  const rounds = phase === 'review' ? await readReviewRounds(featureDir) : null;
  const maxInheritRound = phase === 'review' && rounds?.size ? Math.max(...rounds.keys()) - 1 : Infinity;
  const acceptance = await checkAcceptance(featureDir, plan, context, { maxInheritRound });
  const findings = mergeFindings(planFindings, acceptance, shadow);
  if (phase === 'acceptance') {
    return {
      ...summarize(findings.issues, findings.notes),
      table: acceptance.table,
      reviewUnits: acceptance.reviewUnits,
      evidenceTree: context.evidenceTree,
      qaPlanDigest,
    };
  }
  const checklistVersion = plan.reviewCoverage === '2' ? SPEC_REVIEW_CHECKLIST_V2 : 1;
  findings.issues.push(...await reconciliationIssues(featureDir, acceptance.table, {
    checklistRequired: plan.reviewCoverage === '1' || plan.reviewCoverage === '2',
    checklistVersion,
    reviewUnits: acceptance.reviewUnits,
    evidenceTree: context.evidenceTree,
    qaPlanDigest,
  }));
  return { ...await checkReview(featureDir, plan, context, findings), table: acceptance.table, reviewUnits: acceptance.reviewUnits };
}

export function formatReport(report, phase) {
  const lines = (report.notes ?? []).map((note) => `[NOTE] ${note}`);
  lines.push(...report.issues.map((item) => `[${item.code}] ${item.message}`));
  const hintedCodes = new Set();
  for (const item of report.issues) {
    if (!item.hint || hintedCodes.has(item.code)) continue;
    hintedCodes.add(item.code);
    lines.push(`[提示] ${item.code}：${item.hint}`);
  }
  if (report.table?.length) {
    lines.push('', '对账表（人工终审入口：逐行核对实测值或绑定是否证明冻结断言）', ...reconciliationLines(report.table), '');
  }
  if (report.rawLines?.length) {
    lines.push(
      '',
      '原文核对（仅供人工核对，非结论：逐行确认分流表处置状态与审查原文一致）',
      '| 编号 | 处置状态 | 最后出现位置 | 原文摘录 |',
      '| --- | --- | --- | --- |',
      ...report.rawLines.map((row) => `| ${row.id} | ${tableCell(row.disposition)} | ${row.location} | ${tableCell(row.excerpt)} |`),
      '',
    );
  }
  lines.push(`结果: ${report.status}`);
  if (report.status !== 'PASS' && report.issues.length) {
    lines.push(`阻塞原因：${[...new Set(report.issues.map((item) => item.code))].join('、')}`);
  }
  if (phase === 'review' && report.pauseState) lines.push(`暂停终态: ${report.pauseState}`);
  if (phase === 'review' && report.decisionPack) {
    lines.push(
      `人工决策包（已达自动复审上限 ${report.decisionPack.round}，停止自动修复）`,
      `- 未闭环项：${report.decisionPack.unresolved.join('、') || '见分流表'}`,
      ...(report.decisionPack.conflicts?.length
        ? [
            '- 双轴分歧对照：',
            ...report.decisionPack.conflicts.map((item) =>
              `  - ${item.topic} | Standards：${item.standards} | Spec：${item.spec}${item.question ? ` | 待裁决：${item.question}` : ''}`),
          ]
        : []),
      `- 追加手动轮次：${report.decisionPack.nextCommand}`,
    );
  }
  if (phase === 'review' && report.status === 'PASS') {
    lines.push('校验范围: 审查材料结构、交付日志、tree 与范围完整性');
    lines.push('不包含: 独立审查来源真实性、证据语义质量与交付授权');
  }
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
    if (phase === 'acceptance') await writeAcceptanceArtifacts(featureDir, report);
    console.log(formatReport(report, phase));
    process.exitCode = report.status === 'PASS' ? 0 : 1;
  } catch (error) {
    console.error(`[INVALID_INPUT] ${error.message}`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
