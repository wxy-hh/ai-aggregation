import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeature, formatReport } from '../qa-check.mjs';
import { scanHistoricalFindingIds } from '../review-package.mjs';
import {
  hasNoFinding,
  parseFindingDefinitions,
  parseSpecReviewChecklist,
  parseSpecReviewCoverage,
  rawHasFindingOrNoFinding,
  specReviewChecklistDocument,
  specReviewSkeletonDocument,
} from '../qa-spec-review.mjs';

const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));
const TEST_FILE = 'tests/a.test.mjs';
const BINDING = `\`${TEST_FILE}\` › 第一条叶子用例`;

function codes(report) {
  return report.issues.map((item) => item.code);
}

function writeDeep(file, content) {
  return mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, content));
}

async function r1FindingFixture(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-finding-r1-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const feature = path.join(dir, '.scratch', 'feature');
  const standards = [
    ...Array.from({ length: 6 }, (_, index) => `## S-H${index + 1}：硬违规 ${index + 1}`),
    ...Array.from({ length: 11 }, (_, index) => `## S-J${index + 1}：判断建议 ${index + 1}`),
  ].join('\n\n');
  const spec = [
    ...Array.from({ length: 4 }, (_, index) => `## [P-M${index + 1}] 缺失 ${index + 1}`),
    ...Array.from({ length: 2 }, (_, index) => `## [P-W${index + 1}] 错误 ${index + 1}`),
    '## [P-X1] 范围蔓延',
  ].join('\n\n');
  await writeDeep(path.join(feature, 'review', 'r1-standards.md'), `${standards}\n`);
  await writeDeep(path.join(feature, 'review', 'r1-spec-axis.md'), `${spec}\n`);
  return feature;
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function planText({ seam = 'unit', status = 'PASS', assertion = '第一条断言', changes = '- 无' } = {}) {
  const browser = seam === 'browser';
  const evidence = browser ? '`screenshots/target.png`、`evidence/run.log`' : '`evidence/run.log`';
  const binding = browser ? '' : BINDING;
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    'QA Review Coverage: 1',
    '',
    '### TC01: 示例',
    '- Priority: P0',
    '- Covers: 1',
    `- Seam: ${seam}`,
    '',
    '#### 验证断言',
    `1. ${assertion}`,
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| TC01 | 1 | ${status} | ${status === 'PASS' ? evidence : '尚未执行'} | ${status === 'PASS' ? binding : ''} | |`,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --version` | `evidence/delivery.log` |',
    '',
    '## 计划变更',
    changes,
  ].join('\n');
}

function mixedPlanText(phase) {
  const current = phase === 'current';
  const status = current ? 'PASS' : 'BLOCKED';
  const assertions = ['第一条断言', current ? '修改后的第二条断言' : '第二条断言', '第三条断言'];
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    'QA Review Coverage: 2',
    '',
    '### TC01: 混合计划变更',
    '- Priority: P1',
    '- Covers: 1',
    '- Seam: unit',
    '',
    '#### 验证断言',
    ...assertions.map((assertion, index) => `${index + 1}. ${assertion}`),
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...assertions.map((_, index) => `| TC01 | ${index + 1} | ${status} | ${current ? '`evidence/run.log`' : '尚未执行'} | ${current ? BINDING : ''} | |`),
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --version` | `evidence/delivery.log` |',
    '',
    '## 计划变更',
    current ? '- TC01：根据已核实契约只校正第二条断言' : '- 无',
  ].join('\n');
}

const SPEC = '## User Stories\n1. 第一条需求\n\n## 交付命令\n\n```bash\nnode --version\n```\n';

function escapeCell(value) {
  return String(value).replaceAll('|', '\\|').replace(/\r?\n/g, ' ');
}

function coverageMarkdown(checklist, overrides = {}) {
  const rows = checklist.rows.map((row) => {
    const source = row.seam === 'browser' ? 'scripts/browser.mjs:2' : `${TEST_FILE}:2`;
    const value = {
      ids: row.id,
      actual: row.actual,
      verdict: '已核实',
      source: `\`${source}\` 已核对实际谓词`,
      change: row.changed ? '变更成立' : '不适用',
      ...overrides,
    };
    return `| ${value.ids} | ${escapeCell(value.actual)} | ${value.verdict} | ${value.source} | ${value.change} |`;
  });
  return [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 对账实测值或绑定 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

async function newProtocolRepo(t, { seam = 'unit', planFactory = null, autoSeal = true } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-spec-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeDeep(path.join(dir, 'tracked.txt'), '原始内容\n');
  await writeDeep(path.join(dir, TEST_FILE), "import test from 'node:test';\ntest('第一条叶子用例', () => {});\n");
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);

  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  await writeDeep(path.join(feature, 'scripts/browser.mjs'), [
    "import assert from 'node:assert/strict';",
    'const visible = true;',
    'assert.ok(visible);',
    "console.log('[TC01-1] PASS 实测：目标可见');",
  ].join('\n'));
  await writeFile(path.join(feature, 'spec.md'), SPEC);
  await writeFile(path.join(feature, 'qa-plan.md'), planFactory ? planFactory('initial') : planText({ seam, status: 'BLOCKED' }));
  let result = spawnSync(process.execPath, [QA_RUN, feature, 'gate-plan-initial', '--', process.execPath, QA_CHECK, 'plan', feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  await writeFile(path.join(feature, 'qa-plan.md'), planFactory ? planFactory('current') : planText({ seam }));
  if (seam === 'browser') await writeDeep(path.join(feature, 'screenshots', 'target.png'), '目标截图');
  const runArgv = seam === 'browser' ? [process.execPath, '.scratch/feature/scripts/browser.mjs'] : [process.execPath, '--test', TEST_FILE];
  result = spawnSync(process.execPath, [QA_RUN, feature, 'run', '--', ...runArgv], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, [QA_RUN, feature, 'delivery', '--', 'node', '--version'], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  result = spawnSync(process.execPath, [QA_RUN, feature, 'gate-acceptance-initial', '--', process.execPath, QA_CHECK, 'acceptance', feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  result = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);

  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  if (autoSeal) {
    await writeDeep(path.join(feature, 'review-report.md'), '审查方式：宿主=Kimi Code；两轴独立子代理\n\n## 三档分流\n\n无发现\n');
    await writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n');
    await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), coverageMarkdown(checklist));
    for (const [axis, file] of [['standards', 'review/r1-standards.md'], ['spec', 'review/r1-spec-axis.md']]) {
      result = spawnSync(process.execPath, [
        REVIEW_PACKAGE, 'seal', feature, '--round', 'r1', '--axis', axis, '--file', file,
        '--reviewer-kind', 'subagent', '--host', 'Kimi Code',
      ], { cwd: dir, encoding: 'utf8' });
      assert.equal(result.status, 0, result.stderr);
    }
  }
  return { dir, feature, checklist };
}

async function replaceSpecReview(feature, content) {
  await writeFile(path.join(feature, 'review/r1-spec-axis.md'), content);
}

test('TC01 清单序列化保留完整字段、顺序与转义内容', () => {
  const rows = [
    { id: 'TC01-1', status: 'PASS', assertion: '第一条', actual: '左 | 右', seam: 'unit', sourceCandidates: ['a.test.mjs'], changed: false },
    { id: 'TC01-2', status: 'BLOCKED', assertion: '第二条', actual: '环境不足', seam: 'browser', sourceCandidates: ['scripts/a.mjs'], changed: true },
  ];
  const parsed = parseSpecReviewChecklist(specReviewChecklistDocument(rows));
  assert.equal(parsed.version, 1);
  assert.deepEqual(parsed.rows, rows);
  assert.throws(() => parseSpecReviewChecklist('{"version":3,"rows":[]}'), /无效/);
  assert.throws(() => parseSpecReviewChecklist('{"version":1,"rows":{}}'), /无效/);
});

test('TC01 覆盖表解析支持合并 ID、管道符和空段，拒绝坏列', () => {
  const parsed = parseSpecReviewCoverage([
    '## 对账覆盖',
    '| 审查项 | 对账实测值或绑定 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- | --- |',
    '| TC01-1、TC01-2 | 左 \\| 右 | 已核实 | `a.test.mjs:2` 比较值 | 不适用 |',
    '## 其他',
  ].join('\n'));
  assert.deepEqual(parsed.rows, [{
    ids: ['TC01-1', 'TC01-2'], actual: '左 | 右', verdict: '已核实', source: '`a.test.mjs:2` 比较值', change: '不适用',
  }]);
  assert.deepEqual(parseSpecReviewCoverage('无发现\n').rows, []);
  assert.throws(() => parseSpecReviewCoverage('## 对账覆盖\n| TC01-1 | 只有两列 |'), /五列/);
});

test('TC02 新协议有效 unit 与 browser 覆盖均不产生对账覆盖错误', async (t) => {
  for (const seam of ['unit', 'browser']) {
    const { feature } = await newProtocolRepo(t, { seam });
    const report = await checkFeature(feature, 'review');
    const unexpected = codes(report).filter((code) => code.startsWith('SPEC_REVIEW_') || code.startsWith('SPEC_PLAN_CHANGE_'));
    assert.deepEqual(unexpected, [], `${seam}: ${formatReport(report, 'review')}`);
  }
});

test('TC02 缺行、重复、未知、错绑定和未核实均被机械识别', async (t) => {
  const missingRepo = await newProtocolRepo(t);
  await replaceSpecReview(missingRepo.feature, '无发现\n\n## 对账覆盖\n');
  const missing = await checkFeature(missingRepo.feature, 'review');
  assert.ok(codes(missing).includes('SPEC_REVIEW_COVERAGE_MISSING'), formatReport(missing, 'review'));

  const duplicateRepo = await newProtocolRepo(t);
  const valid = coverageMarkdown(duplicateRepo.checklist);
  const row = valid.split('\n').find((line) => line.startsWith('| TC01-1 |'));
  await replaceSpecReview(duplicateRepo.feature, `${valid.trimEnd()}\n${row}\n| TC99-1 | ${BINDING} | 已核实 | \`${TEST_FILE}:2\` 错误编号 | 不适用 |\n`);
  const duplicated = await checkFeature(duplicateRepo.feature, 'review');
  assert.ok(codes(duplicated).includes('SPEC_REVIEW_COVERAGE_DUPLICATE'));
  assert.ok(codes(duplicated).includes('SPEC_REVIEW_COVERAGE_UNKNOWN'));

  const mismatchRepo = await newProtocolRepo(t);
  await replaceSpecReview(mismatchRepo.feature, coverageMarkdown(mismatchRepo.checklist, { actual: '另一套绑定' }));
  assert.ok(codes(await checkFeature(mismatchRepo.feature, 'review')).includes('SPEC_REVIEW_BINDING_MISMATCH'));

  const incompleteRepo = await newProtocolRepo(t);
  await replaceSpecReview(incompleteRepo.feature, coverageMarkdown(incompleteRepo.checklist, { verdict: '未核实' }));
  assert.ok(codes(await checkFeature(incompleteRepo.feature, 'review')).includes('SPEC_REVIEW_INCOMPLETE'));
});

test('TC02 源码引用必须匹配绑定或过程脚本且行号存在', async (t) => {
  const unit = await newProtocolRepo(t);
  await replaceSpecReview(unit.feature, coverageMarkdown(unit.checklist, { source: '`tracked.txt:99` 错误位置' }));
  assert.ok(codes(await checkFeature(unit.feature, 'review')).includes('SPEC_REVIEW_SOURCE_INVALID'));

  const browser = await newProtocolRepo(t, { seam: 'browser' });
  await replaceSpecReview(browser.feature, coverageMarkdown(browser.checklist, { source: `\`${TEST_FILE}:2\` 错误脚本` }));
  assert.ok(codes(await checkFeature(browser.feature, 'review')).includes('SPEC_REVIEW_SOURCE_INVALID'));
});

test('TC02 计划变更必须独立判定且不成立时失败', async (t) => {
  const { dir, feature } = await newProtocolRepo(t);
  const changedPlan = planText({ assertion: '修改后的断言', changes: '- TC01：根据已核实契约校正断言' });
  await writeFile(path.join(feature, 'qa-plan.md'), changedPlan);
  const acceptance = spawnSync(process.execPath, [QA_RUN, feature, 'gate-acceptance-change', '--', process.execPath, QA_CHECK, 'acceptance', feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(acceptance.status, 0, acceptance.stderr + acceptance.stdout);
  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  assert.equal(checklist.rows[0].changed, true);

  await replaceSpecReview(feature, coverageMarkdown(checklist, { change: '不适用' }));
  assert.ok(codes(await checkFeature(feature, 'review')).includes('SPEC_PLAN_CHANGE_REVIEW_MISSING'));
  await replaceSpecReview(feature, coverageMarkdown(checklist, { change: '变更不成立' }));
  assert.ok(codes(await checkFeature(feature, 'review')).includes('SPEC_PLAN_CHANGE_REJECTED'));

  const unchanged = await newProtocolRepo(t);
  await replaceSpecReview(unchanged.feature, coverageMarkdown(unchanged.checklist, { change: '变更成立' }));
  assert.ok(codes(await checkFeature(unchanged.feature, 'review')).includes('SPEC_PLAN_CHANGE_REVIEW_MISSING'));
});

test('TC02 旧 manifest 保留人工 NOTE，不强制补覆盖表', async (t) => {
  const { feature } = await newProtocolRepo(t);
  const manifestPath = path.join(feature, '_qa/review-package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.specReviewChecklist;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await replaceSpecReview(feature, '无发现\n');
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).some((code) => code.startsWith('SPEC_REVIEW_COVERAGE')), formatReport(report, 'review'));
  assert.ok(report.notes.some((note) => note.includes('旧审查包') && note.includes('人工')));
});

test('TC07 旧 manifest 缺少 qaArtifactsDigest 时交付早于审查仍报 VERIFICATION_BEFORE_REVIEW；双指纹未变时免除重跑', async (t) => {
  const { dir, feature } = await newProtocolRepo(t);
  // 新版带 qaArtifactsDigest 的审查包在双指纹未变时免除 VERIFICATION_BEFORE_REVIEW
  const modern = await checkFeature(feature, 'review');
  assert.ok(!codes(modern).includes('VERIFICATION_BEFORE_REVIEW'), formatReport(modern, 'review'));

  // 去掉 qaArtifactsDigest 模拟旧 manifest：早于双轴完成的交付日志仍报 VERIFICATION_BEFORE_REVIEW，重跑后消除
  const manifestPath = path.join(feature, '_qa/review-package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  delete manifest.qaArtifactsDigest;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const early = await checkFeature(feature, 'review');
  assert.ok(codes(early).includes('VERIFICATION_BEFORE_REVIEW'), formatReport(early, 'review'));

  const delivered = spawnSync(process.execPath, [QA_RUN, feature, 'delivery-after', '--', 'node', '--version'], { cwd: dir, encoding: 'utf8' });
  assert.equal(delivered.status, 0, delivered.stderr);
  await writeFile(
    path.join(feature, 'qa-plan.md'),
    (await readFile(path.join(feature, 'qa-plan.md'), 'utf8')).replace('`evidence/delivery.log`', '`evidence/delivery-after.log`'),
  );
  const acceptance = spawnSync(process.execPath, [QA_RUN, feature, 'gate-acceptance-after', '--', process.execPath, QA_CHECK, 'acceptance', feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(acceptance.status, 0, acceptance.stderr + acceptance.stdout);
  const after = await checkFeature(feature, 'review');
  assert.ok(!codes(after).includes('VERIFICATION_BEFORE_REVIEW'), formatReport(after, 'review'));
});

test('TC07 新协议要求成功 plan 与当前 tree acceptance 门禁日志', async (t) => {
  const complete = await newProtocolRepo(t);
  const completeReport = await checkFeature(complete.feature, 'review');
  assert.ok(!codes(completeReport).includes('GATE_EVIDENCE_MISSING'), formatReport(completeReport, 'review'));

  const missingPlan = await newProtocolRepo(t);
  await rm(path.join(missingPlan.feature, 'evidence/gate-plan-initial.log'));
  const planReport = await checkFeature(missingPlan.feature, 'review');
  assert.ok(codes(planReport).includes('GATE_EVIDENCE_MISSING'), formatReport(planReport, 'review'));
  assert.match(planReport.issues.find((item) => item.code === 'GATE_EVIDENCE_MISSING').message, /plan/);

  const missingAcceptance = await newProtocolRepo(t);
  await rm(path.join(missingAcceptance.feature, 'evidence/gate-acceptance-initial.log'));
  const acceptanceReport = await checkFeature(missingAcceptance.feature, 'review');
  assert.ok(codes(acceptanceReport).includes('GATE_EVIDENCE_MISSING'));
  assert.match(acceptanceReport.issues.find((item) => item.code === 'GATE_EVIDENCE_MISSING').message, /acceptance/);
});

test('TC07 当前审查时间不可知时交人工而不伪造时序错误', async (t) => {
  const { feature } = await newProtocolRepo(t);
  await rm(path.join(feature, 'review/r1-standards.source.json'));
  await rm(path.join(feature, 'review/r1-spec-axis.source.json'));
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('VERIFICATION_BEFORE_REVIEW'), formatReport(report, 'review'));
  assert.ok(report.notes.some((note) => note.includes('交付时序') && note.includes('人工')));
});

test('TC08 qa-spec-review 安装模板与工具逐字一致', async () => {
  const [script, template] = await Promise.all([
    readFile(new URL('../qa-spec-review.mjs', import.meta.url), 'utf8'),
    readFile(new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-spec-review.mjs', import.meta.url), 'utf8'),
  ]);
  assert.equal(template, script);
});

test('v2 清单自动计算 required、生成 4 列骨架并解析 4 列覆盖表', async () => {
  const {
    SPEC_REVIEW_CHECKLIST_V2,
    isRequiredSpecRow,
    specReviewSkeletonDocument,
    hasNoFinding,
    normalizeCitationPath,
  } = await import('../qa-spec-review.mjs');
  assert.equal(SPEC_REVIEW_CHECKLIST_V2, 2);
  const rows = [
    { id: 'TC01-1', status: 'PASS', assertion: '核心浏览器断言', actual: '可见', seam: 'browser', priority: 'P0', sourceCandidates: ['scripts/a.mjs'], changed: false },
    { id: 'TC02-1', status: 'PASS', assertion: '常规 P1 单测', actual: 'tests/a.test.mjs › 用例', seam: 'unit', priority: 'P1', sourceCandidates: ['tests/a.test.mjs'], changed: false },
    { id: 'TC03-1', status: 'PASS', assertion: 'P1 但发生变更', actual: 'tests/b.test.mjs › 用例', seam: 'unit', priority: 'P1', sourceCandidates: ['tests/b.test.mjs'], changed: true },
  ];
  assert.equal(isRequiredSpecRow(rows[0]), true);
  assert.equal(isRequiredSpecRow(rows[1]), false);
  assert.equal(isRequiredSpecRow(rows[2]), true);

  const v2Doc = specReviewChecklistDocument(rows, { version: 2 });
  const parsed = parseSpecReviewChecklist(v2Doc);
  assert.equal(parsed.version, 2);
  assert.equal(parsed.rows[0].required, true);
  assert.equal(parsed.rows[1].required, false);
  assert.equal(parsed.rows[2].required, true);

  const skeleton = specReviewSkeletonDocument(parsed);
  assert.match(skeleton, /\| TC01-1 \|/);
  assert.match(skeleton, /\| TC03-1 \|/);
  assert.doesNotMatch(skeleton, /\| TC02-1 \|/);
  assert.match(skeleton, /## 抽检范围/);
  assert.match(skeleton, /tests\/a\.test\.mjs/);

  const coverage = parseSpecReviewCoverage([
    '无新增审查发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `scripts/a.mjs:12` 校验可见 | 不适用 |',
    '| TC03-1 | 已核实 | `tests/b.test.mjs:18` 校验变更 | 变更成立 |',
  ].join('\n'), { version: 2 });
  assert.equal(coverage.rows.length, 2);
  assert.equal(coverage.rows[0].ids[0], 'TC01-1');

  assert.equal(hasNoFinding('无新增审查发现'), true);
  assert.equal(hasNoFinding('无新增编号'), true);
  assert.equal(hasNoFinding('无新发现'), true);
  assert.equal(normalizeCitationPath('./.scratch/demo/scripts/a.mjs', '.scratch/demo'), 'scripts/a.mjs');
});

test('citationIsValid 拦截 :1 无谓词敷衍引用，放行 ±5 行谓词命中与前缀归一化，seal 同步校验阻断', async (t) => {
  const {
    citationIsValid,
    validateReviewReportForSeal,
  } = await import('../qa-spec-review.mjs');
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-spec-citation-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const feature = path.join(dir, '.scratch', 'demo');
  const lines = [
    '// 顶部文件说明',
    "import assert from 'node:assert/strict';",
    'const HEADER = true;',
    'const SPACE_LINE_4 = 4;',
    'const SPACE_LINE_5 = 5;',
    'const SPACE_LINE_6 = 6;',
    'const SPACE_LINE_7 = 7;',
    'const SPACE_LINE_8 = 8;',
    'const SPACE_LINE_9 = 9;',
    'const SPACE_LINE_10 = 10;',
    'function runCheck() {',
    '  const val = 42;',
    '  assert.equal(val, 42);',
    "  console.log('[TC01-1] PASS 实测：42');",
    '}',
  ];
  await writeDeep(path.join(feature, 'scripts', 'tc01.mjs'), lines.join('\n'));
  const row = {
    id: 'TC01-1',
    status: 'PASS',
    seam: 'browser',
    sourceCandidates: ['scripts/tc01.mjs'],
    changed: false,
    required: true,
  };
  const cache = new Map();
  // 第 1 行前后 ±5 行窗口只有注释、import 与常量定义，没有任何断言谓词，必须拦截
  assert.equal(await citationIsValid(dir, feature, row, { path: 'scripts/tc01.mjs', line: 1 }, cache), false);
  // 第 13 行本身为 assert.equal，第 11 行处于 ±5 行窗口内，且前缀归一化后应命中
  assert.equal(await citationIsValid(dir, feature, row, { path: '.scratch/demo/scripts/tc01.mjs', line: 13 }, cache), true);
  assert.equal(await citationIsValid(dir, feature, row, { path: './scripts/tc01.mjs', line: 11 }, cache), true);

  // 共享 seal 同步阻断测试
  const emptyFail = await validateReviewReportForSeal({
    root: dir,
    featureDir: feature,
    axis: 'standards',
    markdown: '这段内容既没有规范编号也缺少结论声明',
    pendingIds: [],
  });
  assert.equal(emptyFail.ok, false);
  assert.ok(emptyFail.issues.some((item) => item.code === 'REVIEW_RAW_UNNUMBERED'));

  const pendingFail = await validateReviewReportForSeal({
    root: dir,
    featureDir: feature,
    axis: 'standards',
    markdown: '无新增审查发现\n',
    pendingIds: ['S-H1', 'P-M1'],
  });
  assert.equal(pendingFail.ok, false);
  assert.ok(pendingFail.issues.some((item) => item.code === 'FINDING_NOT_REREVIEWED' && item.message.includes('S-H1')));

  const validPass = await validateReviewReportForSeal({
    root: dir,
    featureDir: feature,
    axis: 'standards',
    markdown: '[S-H1] 已修\n',
    pendingIds: ['S-H1', 'P-M1'],
  });
  assert.equal(validPass.ok, true);

  // 带特殊正则字符的输入与缺少方括号的 S-H1 均安全拦截而不崩溃
  const unbracketed = await validateReviewReportForSeal({
    root: dir,
    featureDir: feature,
    axis: 'standards',
    markdown: 'S-H1 已修\n',
    pendingIds: ['S-H1', 'S-H[1](foo)'],
  });
  assert.equal(unbracketed.ok, false);
  assert.ok(unbracketed.issues.some((item) => item.code === 'FINDING_NOT_REREVIEWED'));
});

test('亲自复审补强：NO_FINDING_AFTER_ID 变体、非零退出码谓词与 ## 抽检范围 防空绕过', async (t) => {
  const {
    NO_FINDING_AFTER_ID,
    citationIsValid,
    specReviewCoverageIssues,
  } = await import('../qa-spec-review.mjs');

  assert.equal(NO_FINDING_AFTER_ID.test('无新增审查发现'), true);
  assert.equal(NO_FINDING_AFTER_ID.test('无新增编号'), true);
  assert.equal(NO_FINDING_AFTER_ID.test(': 无新发现'), true);

  const dir = await mkdtemp(path.join(tmpdir(), 'qa-spec-hardening-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const feature = path.join(dir, '.scratch', 'demo');
  await writeDeep(
    path.join(feature, 'scripts', 'exit-only.mjs'),
    [
      '// 第 1 行',
      'const zero = 0;',
      'process.exitCode = 0;',
      'process.exit(0);',
      'const spacer1 = 1;',
      'const spacer2 = 2;',
      'const spacer3 = 3;',
      'const spacer4 = 4;',
      'const spacer5 = 5;',
      'const spacer6 = 6;',
      'const spacer7 = 7;',
      'if (zero !== 0) process.exit(1);',
    ].join('\n'),
  );
  await writeDeep(path.join(dir, 'tests', 'opt.test.mjs'), "import test from 'node:test';\ntest('常规项', () => {});\n");

  const row = {
    id: 'TC01-1',
    status: 'PASS',
    seam: 'browser',
    sourceCandidates: ['scripts/exit-only.mjs'],
    changed: false,
    required: true,
  };
  const cache = new Map();
  assert.equal(await citationIsValid(dir, feature, row, { path: 'scripts/exit-only.mjs', line: 3 }, cache), false);
  assert.equal(await citationIsValid(dir, feature, row, { path: 'scripts/exit-only.mjs', line: 12 }, cache), true);

  const checklist = {
    version: 2,
    rows: [
      row,
      { id: 'TC02-1', status: 'PASS', seam: 'unit', sourceCandidates: ['tests/opt.test.mjs'], changed: false, required: false },
    ],
  };
  const coverageBody = [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `scripts/exit-only.mjs:12` 非零退出保护 | 不适用 |',
  ].join('\n');

  const emptyHeading = await specReviewCoverageIssues(dir, feature, checklist, `${coverageBody}\n\n## 抽检范围\n`);
  assert.ok(emptyHeading.some((item) => item.code === 'SPEC_REVIEW_SAMPLING_MISSING'));

  const placeholderHeading = await specReviewCoverageIssues(
    dir,
    feature,
    checklist,
    `${coverageBody}\n\n## 抽检范围\n- 候选文件：\`tests/opt.test.mjs\`\n- 抽检结果：<请写出实际抽检的文件、用例及发现；无异常写无发现>\n`,
  );
  assert.ok(placeholderHeading.some((item) => item.code === 'SPEC_REVIEW_SAMPLING_MISSING'));

  const filledHeading = await specReviewCoverageIssues(
    dir,
    feature,
    checklist,
    `${coverageBody}\n\n## 抽检范围\n- 已抽检 \`tests/opt.test.mjs\`：断言常规用例存在，无发现。\n`,
  );
  assert.deepEqual(filledHeading, []);
});

test('TC01-1 r1 脱敏原文登记二十四条 FindingId', async (t) => {
  const feature = await r1FindingFixture(t);
  const historical = await scanHistoricalFindingIds(feature, { upToRound: 2 });
  assert.equal(historical.allIds.length, 24);
});

test('TC01-2 Standards 的两种标题形式共登记十七条', async (t) => {
  const feature = await r1FindingFixture(t);
  const historical = await scanHistoricalFindingIds(feature, { upToRound: 2 });
  assert.equal(historical.allIds.filter((id) => id.startsWith('S-')).length, 17);
  assert.ok(historical.records.get('S-H1').firstLine.startsWith('## S-H1'));
  assert.ok(historical.records.get('P-M1').firstLine.startsWith('## [P-M1]'));
});

test('TC01-3 r2 下一编号接续全部五个前缀', async (t) => {
  const feature = await r1FindingFixture(t);
  const historical = await scanHistoricalFindingIds(feature, { upToRound: 2 });
  assert.deepEqual(historical.nextIds, {
    'S-H': 'S-H7',
    'S-J': 'S-J12',
    'P-M': 'P-M5',
    'P-W': 'P-W3',
    'P-X': 'P-X2',
  });
});

test('TC01-4 历史行首方括号定义保持兼容', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-finding-legacy-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const feature = path.join(dir, '.scratch', 'feature');
  await writeDeep(path.join(feature, 'review', 'r1-standards.md'), '[S-H3] 已修\n[S-J2] 判断建议\n');
  await writeDeep(path.join(feature, 'review', 'r1-spec-axis.md'), '[P-M4] 缺失\n');
  const historical = await scanHistoricalFindingIds(feature, { upToRound: 2 });
  assert.deepEqual(historical.allIds.sort(), ['P-M4', 'S-H3', 'S-J2']);
  assert.equal(historical.nextIds['S-H'], 'S-H4');
  assert.equal(historical.nextIds['S-J'], 'S-J3');
  assert.equal(historical.nextIds['P-M'], 'P-M5');
});

test('TC02-1 五类非定义位置均不登记 FindingId', () => {
  const samples = [
    '## 核对 [S-H1] 的标题中段',
    '正文引用 [S-H1] 与 S-H2，不应登记。',
    '  - [S-H1] 缩进列表引用',
    '| [S-H1] | 表格单元格引用 |',
    '## [S-H1] 编号示例，仅作格式说明',
  ];
  for (const sample of samples) assert.equal(parseFindingDefinitions(sample).length, 0, sample);
});

test('TC02-2 局部无发现部分不吞掉真实发现', () => {
  const markdown = '## [S-H1] 真实缺陷\n\n## 实际核对范围（无发现部分）\n';
  assert.equal(parseFindingDefinitions(markdown).length, 1);
  assert.equal(hasNoFinding(markdown), false);
  assert.equal(rawHasFindingOrNoFinding(markdown), true);
});

test('TC02-3 零发现原文接受两种整局声明', () => {
  const samples = [
    '无发现\n',
    '## 无新增审查发现\n',
    '无发现。\n',
    '无新增审查发现。\n',
    '本轮无新增审查发现。\n',
    '本次审查无发现。\n',
    '本次审查：无发现\n',
    '本次审查：无发现。\n',
    '> 无发现\n',
    '> 无发现。\n',
    '- [P-W4] 仅作后续编号示例，不对应实际缺陷；本次审查无新发现\n',
  ];
  for (const markdown of samples) {
    assert.equal(hasNoFinding(markdown), true, markdown);
    assert.equal(rawHasFindingOrNoFinding(markdown), true, markdown);
  }
});

test('TC02-4 局部或带例外的声明不算整局无发现', () => {
  const samples = [
    '## 实际核对范围（无发现部分）\n',
    '## 无新增审查发现（除 S-H7 / S-H8 / S-H9 外）\n',
    '> 实际核对范围（无发现部分）\n',
    '本次审查无发现（部分）。\n',
    '- [P-W4] 仅作后续编号示例，不对应实际缺陷；本次审查无新增审查发现（除 S-H1 外）\n',
  ];
  for (const markdown of samples) {
    assert.equal(hasNoFinding(markdown), false, markdown);
    assert.equal(rawHasFindingOrNoFinding(markdown), false, markdown);
  }
});

test('TC03-1 混合变更单元按 changed 拆行并分别预填', () => {
  const skeleton = specReviewSkeletonDocument({
    version: 2,
    rows: [
      { id: 'TC03-1', changed: false, sourceCandidates: ['tests/mixed.test.mjs'] },
      { id: 'TC03-2', changed: true, sourceCandidates: ['tests/mixed.test.mjs'] },
      { id: 'TC03-3', changed: false, sourceCandidates: ['tests/mixed.test.mjs'] },
    ],
    reviewUnits: [{
      unitId: 'mixed-unit',
      rowIds: ['TC03-1', 'TC03-2', 'TC03-3'],
      sourceCandidates: ['tests/mixed.test.mjs'],
      verificationStatus: 'required',
    }],
  });
  const rows = skeleton.split(/\r?\n/).filter((line) => line.startsWith('| TC03-'));
  assert.equal(rows.length, 2);
  const unchanged = rows.find((line) => line.includes('TC03-1'));
  const changed = rows.find((line) => line.includes('TC03-2'));
  assert.ok(unchanged.includes('TC03-3') && !unchanged.includes('TC03-2'));
  assert.ok(unchanged.endsWith('不适用 |'));
  assert.ok(!changed.includes('TC03-1') && !changed.includes('TC03-3'));
  assert.ok(changed.endsWith('待判（变更成立/变更不成立） |'));
});

test('TC03-2 混合变更骨架真实首次 seal 成功', async (t) => {
  const { dir, feature } = await newProtocolRepo(t, { planFactory: mixedPlanText, autoSeal: false });
  const skeleton = await readFile(path.join(feature, '_qa/spec-review-skeleton.md'), 'utf8');
  const markdown = `无新增审查发现\n\n${skeleton}`
    .replaceAll('待判（已核实/未核实）', '已核实')
    .replaceAll('`tests/a.test.mjs:<行号>` 待核对真实谓词', '`tests/a.test.mjs:2` 核对真实叶子谓词')
    .replaceAll('待判（变更成立/变更不成立）', '变更成立');
  await writeDeep(path.join(feature, 'review', 'r1-spec-axis.md'), markdown);
  const result = spawnSync(process.execPath, [
    REVIEW_PACKAGE, 'seal', feature, '--round', 'r1', '--axis', 'spec', '--file', 'review/r1-spec-axis.md',
    '--reviewer-kind', 'subagent', '--host', 'Kimi Code',
  ], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr + result.stdout);
  assert.doesNotMatch(result.stderr, /SPEC_PLAN_CHANGE_REVIEW_MISSING/);
  const challenge = JSON.parse(await readFile(path.join(feature, '_qa/review-challenge.json'), 'utf8'));
  assert.equal(challenge.axes.spec.sealAttempts, 1);
});

test('S2-TC01-1 specReviewChecklistDocument 与 parseSpecReviewChecklist 保留并校验 evidenceTree 和 qaPlanDigest', async () => {
  const {
    specReviewChecklistDocument,
    parseSpecReviewChecklist,
  } = await import('../qa-spec-review.mjs');

  const rows = [{
    id: 'TC01-1',
    status: 'PASS',
    assertion: '断言内容',
    actual: '实测结果',
    seam: 'unit',
    sourceCandidates: ['tests/a.test.mjs'],
    changed: false,
    priority: 'P1',
    required: false,
  }];
  const evidenceTree = 'a'.repeat(64);
  const qaPlanDigest = 'b'.repeat(64);

  for (const version of [1, 2]) {
    const raw = specReviewChecklistDocument(rows, { version, evidenceTree, qaPlanDigest });
    const parsed = parseSpecReviewChecklist(raw);
    assert.equal(parsed.version, version);
    assert.equal(parsed.evidenceTree, evidenceTree);
    assert.equal(parsed.qaPlanDigest, qaPlanDigest);
  }

  assert.throws(
    () => parseSpecReviewChecklist(JSON.stringify({ version: 2, rows: [], evidenceTree: 123 })),
    /evidenceTree/,
  );
  assert.throws(
    () => parseSpecReviewChecklist(JSON.stringify({ version: 2, rows: [], qaPlanDigest: '' })),
    /qaPlanDigest/,
  );
});

test('S2-TC01-2 computeQaPlanDigest 仅对非交付验证段落变更敏感，回填交付验证保持一致', async () => {
  const { computeQaPlanDigest } = await import('../qa-spec-review.mjs');
  const basePlan = [
    'QA Schema: 4',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| TC01 | 1 | PASS | `evidence/a.log` | `tests/a.test.mjs` › 用例1 | |',
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `pnpm test` | 待执行 |',
  ].join('\n');

  const deliveryUpdated = basePlan.replace('待执行', '`evidence/delivery.log`');
  const executionUpdated = basePlan.replace('`evidence/a.log`', '`evidence/b.log`');

  assert.equal(computeQaPlanDigest(deliveryUpdated), computeQaPlanDigest(basePlan));
  assert.notEqual(computeQaPlanDigest(executionUpdated), computeQaPlanDigest(basePlan));
});

test('S2-TC01-3 isFreshAcceptanceGateLog 区分 PASS、合法 ASSERTION_BLOCKED 与旧树/FAIL/STALE_EVIDENCE', async () => {
  const { isFreshAcceptanceGateLog, parseRunLog } = await import('../qa-spec-review.mjs');
  const tree = 'f'.repeat(64);
  const buildGateLog = ({ exit = 0, logTree = tree, body = '结果: PASS' } = {}) => parseRunLog([
    '# qa-run v1',
    '# label: gate-acceptance-1',
    '# command: node tooling/scripts/qa-check.mjs acceptance .scratch/demo',
    '# argv: ["node","tooling/scripts/qa-check.mjs","acceptance",".scratch/demo"]',
    '# cwd: /tmp/repo',
    '# head: deadbeef',
    `# tree: ${logTree}`,
    '# started: 2026-11-28T00:00:00.000Z',
    '# ---',
    body,
    '# ---',
    '# finished: 2026-11-28T00:00:01.000Z',
    '# durationMs: 1000',
    `# exit: ${exit}`,
  ].join('\n'));

  assert.equal(isFreshAcceptanceGateLog(buildGateLog({ exit: 0, body: '结果: PASS' }), tree), true);
  assert.equal(
    isFreshAcceptanceGateLog(
      buildGateLog({
        exit: 1,
        body: '[ASSERTION_BLOCKED] TC01 / 1 阻塞：尚未完成\n结果: BLOCKED\n阻塞原因：ASSERTION_BLOCKED',
      }),
      tree,
    ),
    true,
  );
  assert.equal(isFreshAcceptanceGateLog(buildGateLog({ exit: 0, logTree: '0'.repeat(64) }), tree), false);
  assert.equal(
    isFreshAcceptanceGateLog(
      buildGateLog({
        exit: 1,
        body: '[STALE_EVIDENCE] TC01 过期\n结果: BLOCKED\n阻塞原因：ASSERTION_BLOCKED、STALE_EVIDENCE',
      }),
      tree,
    ),
    false,
  );
  assert.equal(
    isFreshAcceptanceGateLog(
      buildGateLog({
        exit: 1,
        body: '[MISSING_EVIDENCE] 缺少日志\n结果: FAIL\n阻塞原因：MISSING_EVIDENCE',
      }),
      tree,
    ),
    false,
  );
});

test('S4-TC02-2 specReviewChecklistDocument 与 parseSpecReviewChecklist 往返校验 closureHash 与 closureInvalidationReasons 并兼容历史清单', async () => {
  const { specReviewChecklistDocument, parseSpecReviewChecklist } = await import('../qa-spec-review.mjs');
  const rows = [{
    id: 'TC01-1',
    status: 'PASS',
    assertion: '断言内容',
    actual: '实测结果',
    seam: 'unit',
    sourceCandidates: ['tests/a.test.mjs'],
    changed: false,
    priority: 'P0',
    required: true,
  }];
  const reviewUnits = [{
    unitId: 'unit:tests/a.test.mjs',
    rowIds: ['TC01-1'],
    sourceCandidates: ['tests/a.test.mjs'],
    riskReason: '常规断言',
    sourceHash: 'a'.repeat(64),
    evidenceHash: 'b'.repeat(64),
    assertionHash: 'c'.repeat(64),
    closureHash: 'd'.repeat(64),
    verificationStatus: 'required',
  }, {
    unitId: 'unit:tests/b.test.mjs',
    rowIds: ['TC01-1'],
    sourceCandidates: ['tests/b.test.mjs'],
    riskReason: '常规断言',
    sourceHash: 'a'.repeat(64),
    evidenceHash: 'b'.repeat(64),
    assertionHash: 'c'.repeat(64),
    closureHash: null,
    closureInvalidationReasons: ['tests/b.test.mjs 读取环境变量'],
    verificationStatus: 'required',
  }];

  const raw = specReviewChecklistDocument(rows, { version: 2, reviewUnits });
  const parsed = parseSpecReviewChecklist(raw);
  assert.equal(parsed.reviewUnits[0].closureHash, 'd'.repeat(64));
  assert.equal(parsed.reviewUnits[1].closureHash, null);
  assert.deepEqual(parsed.reviewUnits[1].closureInvalidationReasons, ['tests/b.test.mjs 读取环境变量']);

  // 兼容不含 closureHash 的历史清单
  const legacyRaw = specReviewChecklistDocument(rows, {
    version: 2,
    reviewUnits: [{
      unitId: 'unit:tests/legacy.test.mjs',
      rowIds: ['TC01-1'],
      sourceCandidates: ['tests/legacy.test.mjs'],
      verificationStatus: 'required',
    }],
  });
  assert.equal(parseSpecReviewChecklist(legacyRaw).reviewUnits[0].closureHash, undefined);

  assert.throws(
    () => parseSpecReviewChecklist(JSON.stringify({
      version: 2,
      rows,
      reviewUnits: [{ ...reviewUnits[0], closureHash: '' }],
    })),
    /closureHash/,
  );
  assert.throws(
    () => parseSpecReviewChecklist(JSON.stringify({
      version: 2,
      rows,
      reviewUnits: [{ ...reviewUnits[0], closureInvalidationReasons: [123] }],
    })),
    /closureInvalidationReasons/,
  );
});
