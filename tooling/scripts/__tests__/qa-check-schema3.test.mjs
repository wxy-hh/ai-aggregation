import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeature, CURRENT_SCHEMA, formatReport } from '../qa-check.mjs';

const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));
const SPEC = '## User Stories\n1. 第一条需求\n2. 第二条需求\n';

function runLog({
  label = 'run',
  argv = ['node', '--version'],
  exit = 0,
  started = '2026-01-02T00:00:00.000Z',
  finished = '2026-01-02T00:00:01.000Z',
  tree = 'none',
  complete = true,
} = {}) {
  const lines = [
    '# qa-run v1',
    `# label: ${label}`,
    `# command: ${argv.join(' ')}`,
    `# argv: ${JSON.stringify(argv)}`,
    '# cwd: .',
    '# head: 0123456789abcdef',
    `# tree: ${tree}`,
    `# started: ${started}`,
    '# ---',
    '测试输出',
  ];
  if (complete) lines.push('# ---', `# finished: ${finished}`, `# exit: ${exit}`);
  return `${lines.join('\n')}\n`;
}

function singlePlan({
  kind = 'feature',
  seam = 'unit',
  status = 'PASS',
  evidence = '`evidence/run.log`',
  assertion = '第一条断言',
  deliveryCommand = '`node --version`',
  deliveryEvidence = '`evidence/delivery.log`',
  reproduction = '',
  changes = '- 无',
  extraCases = '',
  extraResults = '',
} = {}) {
  return [
    'QA Schema: 3',
    'QA Mode: inline',
    `QA Kind: ${kind}`,
    '',
    '### TC01: 示例',
    '- Priority: P0',
    '- Covers: 1, 2',
    `- Seam: ${seam}`,
    '',
    '#### 验证断言',
    `1. ${assertion}`,
    '',
    extraCases,
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 备注 |',
    '| --- | --- | --- | --- | --- |',
    `| TC01 | 1 | ${status} | ${evidence} | |`,
    extraResults,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    `| ${deliveryCommand} | ${deliveryEvidence} |`,
    '',
    '## 修复前复现',
    '| 用例 | 证据 |',
    '| --- | --- |',
    reproduction,
    '',
    '## 计划变更',
    changes,
  ].join('\n');
}

async function workspace(t, { spec = SPEC, plan, evidence = {} }) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-schema3-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'spec.md'), spec);
  await writeFile(path.join(dir, 'qa-plan.md'), plan);
  for (const [relative, content] of Object.entries(evidence)) {
    const file = path.join(dir, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, content);
  }
  return dir;
}

function codes(report) {
  return report.issues.map((item) => item.code);
}

const REPORT_OK = [
  '# 审查报告',
  '',
  '审查方式：独立子代理完成 Standards 与 Spec 双轴审查',
  '',
  '## Standards 规范轴',
  '规范检查有具体结论。',
  '',
  '## Spec 需求轴',
  '需求检查有具体结论。',
  '',
  '## 证据审计',
  '逐个核对证据与断言。',
  '',
  '## Spec 对账',
  '| US | 状态 | 证据或原因 |',
  '| --- | --- | --- |',
  '| 1 | PASS | TC01 / 1 |',
  '| 2 | PASS | 交付验证 |',
  '',
  '## 三档分流',
  '| 档位 | 说明 |',
  '| --- | --- |',
  '',
  '无发现',
  '',
  '## 范围说明',
  '无范围外改动。',
].join('\n');

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

async function reviewRepo(t, {
  plan = singlePlan(),
  report = REPORT_OK,
  deliveryArgv = ['node', '--version'],
  deliveryExit = 0,
  outsideChange = false,
} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-review3-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeFile(path.join(dir, 'tracked.txt'), '原始内容\n');
  await writeFile(path.join(dir, 'outside.txt'), '范围外原始内容\n');
  git(dir, ['add', 'tracked.txt', 'outside.txt']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  await writeFile(path.join(dir, 'spec.md'), SPEC);
  await writeFile(path.join(feature, 'spec.md'), SPEC);
  await writeFile(path.join(feature, 'qa-plan.md'), plan);

  const init = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  if (outsideChange) await writeFile(path.join(dir, 'outside.txt'), '开工后范围外修改\n');
  for (const [label, argv, expected] of [
    ['run', ['node', '--version'], 0],
    ['delivery', deliveryArgv, deliveryExit],
  ]) {
    const executed = spawnSync(process.execPath, [QA_RUN, feature, label, '--', ...argv], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(executed.status, expected, executed.stderr);
  }
  const collected = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(collected.status, 0, collected.stderr);
  await writeFile(path.join(feature, 'review-report.md'), report);
  return { dir, feature };
}

test('证据格拒绝自由文本与空路径，并给出真实执行动作（TC01、TC12）', async (t) => {
  for (const evidence of ['`evidence/run.log` command: node --test', 'command: node --test', '']) {
    const dir = await workspace(t, { plan: singlePlan({ evidence }) });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL');
    assert.ok(codes(report).includes('INVALID_EVIDENCE'));
    const invalid = report.issues.find((item) => item.code === 'INVALID_EVIDENCE');
    assert.match(invalid.message, /TC01 \/ 1.*证据格无效/);
    assert.match(invalid.hint, /node tooling\/scripts\/qa-run\.mjs/);
  }
});

test('browser 与非 browser 接缝都必须绑定对应证据（TC01）', async (t) => {
  const cases = [
    { seam: 'browser', evidence: '`evidence/run.log`', files: { 'evidence/run.log': runLog() } },
    { seam: 'browser', evidence: '`evidence/a.png`', files: { 'evidence/a.png': '图片' } },
    { seam: 'unit', evidence: '`evidence/a.png`', files: { 'evidence/a.png': '图片' } },
  ];
  for (const item of cases) {
    const dir = await workspace(t, {
      plan: singlePlan({ seam: item.seam, evidence: item.evidence }),
      evidence: item.files,
    });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL');
    assert.ok(codes(report).includes('SEAM_EVIDENCE_MISMATCH'));
  }
});

test('非零日志与无效日志分别返回对应错误（TC01）', async (t) => {
  for (const [content, code] of [
    [runLog({ exit: 2 }), 'EVIDENCE_EXIT_NONZERO'],
    ['不是 qa-run 日志\n', 'INVALID_RUN_LOG'],
    [runLog({ complete: false }), 'INVALID_RUN_LOG'],
  ]) {
    const dir = await workspace(t, {
      plan: singlePlan(),
      evidence: { 'evidence/run.log': content },
    });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL');
    assert.ok(codes(report).includes(code));
  }
});

test('browser 截图加日志及其他接缝日志齐全时 acceptance 为 PASS（TC01）', async (t) => {
  const extraCases = [
    '### TC02: 浏览器场景',
    '- Priority: P0',
    '- Covers: 2',
    '- Seam: browser',
    '',
    '#### 验证断言',
    '1. 页面真实可见',
    '',
  ].join('\n');
  const plan = singlePlan({
    extraCases,
    extraResults: '| TC02 | 1 | PASS | `evidence/page.png`、`evidence/browser.log` | |',
  });
  const dir = await workspace(t, {
    plan,
    evidence: {
      'evidence/run.log': runLog(),
      'evidence/page.png': '独立截图',
      'evidence/browser.log': runLog({ label: 'browser' }),
    },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.deepEqual(report.issues, []);
});

test('同一截图跨 TC 引用判 FAIL 并列出 TC（TC03）', async (t) => {
  const extraCases = [
    '### TC02: 另一场景',
    '- Priority: P0',
    '- Covers: 2',
    '- Seam: browser',
    '',
    '#### 验证断言',
    '1. 另一断言',
    '',
  ].join('\n');
  const plan = singlePlan({
    seam: 'browser',
    evidence: '`evidence/shared.png`、`evidence/run.log`',
    extraCases,
    extraResults: '| TC02 | 1 | PASS | `evidence/shared.png`、`evidence/other.log` | |',
  });
  const dir = await workspace(t, {
    plan,
    evidence: {
      'evidence/shared.png': '图片',
      'evidence/run.log': runLog(),
      'evidence/other.log': runLog(),
    },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'FAIL');
  const shared = report.issues.find((item) => item.code === 'SHARED_SCREENSHOT');
  assert.match(shared.message, /TC01/);
  assert.match(shared.message, /TC02/);
});

test('同一 TC 的多条断言可引用同一截图（TC03）', async (t) => {
  const plan = singlePlan({
    seam: 'browser',
    evidence: '`evidence/shared.png`、`evidence/run.log`',
    extraResults: '| TC01 | 2 | PASS | `evidence/shared.png`、`evidence/run.log` | |',
  }).replace('1. 第一条断言', '1. 第一条断言\n2. 第二条断言');
  const dir = await workspace(t, {
    plan,
    evidence: { 'evidence/shared.png': '图片', 'evidence/run.log': runLog() },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('SHARED_SCREENSHOT'));
});

const FROZEN_PLAN = [
  'QA Schema: 3',
  'QA Mode: inline',
  '',
  '### TC01: 原用例',
  '- Priority: P0',
  '- Covers: 1, 2',
  '- Seam: unit',
  '',
  '#### 验证断言',
  '1. 保留断言',
  '2. 原断言二',
  '3. 原断言三',
  '',
  '### TC02: 被删除用例',
  '- Priority: P1',
  '- Covers: 2',
  '- Seam: static',
  '',
  '#### 验证断言',
  '1. 静态断言',
  '',
  '## 执行记录',
  '| 用例 | 断言序号 | 状态 | 证据 | 备注 |',
  '| --- | --- | --- | --- | --- |',
  '',
  '## 交付验证',
  '| 命令 | 证据 |',
  '| --- | --- |',
  '| `node --version` | 待执行 |',
  '| `node --test` | 待执行 |',
  '',
  '## 计划变更',
  '- 无',
].join('\n');

const CHANGED_PLAN = [
  'QA Schema: 3',
  'QA Mode: inline',
  '',
  '### TC01: 改动用例',
  '- Priority: P0',
  '- Covers: 1',
  '- Seam: browser',
  '',
  '#### 验证断言',
  '1. 保留断言',
  '2. 改写后的断言二',
  '',
  '### TC03: 新增用例',
  '- Priority: P1',
  '- Covers: 2',
  '- Seam: static',
  '',
  '#### 验证断言',
  '1. 新增静态断言',
  '',
  '## 执行记录',
  '| 用例 | 断言序号 | 状态 | 证据 | 备注 |',
  '| --- | --- | --- | --- | --- |',
  '| TC01 | 1 | BLOCKED | 尚未执行 | |',
  '| TC01 | 2 | BLOCKED | 尚未执行 | |',
  '| TC03 | 1 | BLOCKED | 尚未执行 | |',
  '',
  '## 交付验证',
  '| 命令 | 证据 |',
  '| --- | --- |',
  '| `node --version --watch` | 待执行 |',
  '',
  '## 计划变更',
  '- 无',
].join('\n');

test('冻结计划的每类削弱都要求记录，记录后与追加均不报（TC04、TC12）', async (t) => {
  const dir = await workspace(t, { plan: CHANGED_PLAN });
  await mkdir(path.join(dir, 'prechange'));
  await writeFile(path.join(dir, 'prechange', 'qa-plan.md'), FROZEN_PLAN);
  const report = await checkFeature(dir, 'acceptance');
  const changes = report.issues.filter((item) => item.code === 'UNRECORDED_PLAN_CHANGE');
  assert.equal(changes.length, 7, formatReport(report));
  assert.ok(changes.some((item) => /TC02.*删除/.test(item.message)));
  assert.ok(changes.some((item) => /TC01.*Seam/.test(item.message)));
  assert.ok(changes.some((item) => /TC01.*Covers.*US 2/.test(item.message)));
  assert.ok(changes.some((item) => /TC01.*断言 2/.test(item.message)));
  assert.ok(changes.some((item) => /TC01.*断言 3/.test(item.message)));
  assert.equal(changes.filter((item) => /交付验证/.test(item.message)).length, 2);
  assert.match(changes[0].hint, /## 计划变更.*恢复原断言/s);

  await writeFile(path.join(dir, 'qa-plan.md'), CHANGED_PLAN.replace('- 无', '- TC01、TC02 与交付验证的调整原因已记录'));
  const recorded = await checkFeature(dir, 'acceptance');
  assert.ok(!codes(recorded).includes('UNRECORDED_PLAN_CHANGE'), formatReport(recorded));

  const appended = FROZEN_PLAN
    .replace('3. 原断言三', '3. 原断言三\n4. 追加断言')
    .replace('- Covers: 1, 2', '- Covers: 1, 2, 2')
    .replace('| `node --test` | 待执行 |', '| `node --test` | 待执行 |\n| `node --check x.js` | 待执行 |');
  await writeFile(path.join(dir, 'qa-plan.md'), appended);
  const additions = await checkFeature(dir, 'acceptance');
  assert.ok(!codes(additions).includes('UNRECORDED_PLAN_CHANGE'), formatReport(additions));
});

test('范围外改动必须在范围说明中逐个解释（TC06、TC12）', async (t) => {
  const { feature } = await reviewRepo(t, { outsideChange: true });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  const issue = report.issues.find((item) => item.code === 'OUT_OF_SCOPE_CHANGES');
  assert.match(issue.message, /outside\.txt/);
  assert.match(issue.hint, /review-package\.mjs add/);

  await writeFile(
    path.join(feature, 'review-report.md'),
    REPORT_OK.replace('无范围外改动。', 'outside.txt：用户开工后独立修改，与本任务无关。'),
  );
  const explained = await checkFeature(feature, 'review');
  assert.equal(explained.status, 'PASS', formatReport(explained));
  assert.ok(!codes(explained).includes('OUT_OF_SCOPE_CHANGES'));
});

test('审查方式缺失判 FAIL，自查判 BLOCKED（TC07、TC12）', async (t) => {
  const { feature } = await reviewRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(reportPath, REPORT_OK.replace(/^审查方式：.*$/m, ''));
  const missing = await checkFeature(feature, 'review');
  assert.equal(missing.status, 'FAIL');
  assert.ok(codes(missing).includes('MISSING_REVIEW_METHOD'));

  await writeFile(reportPath, REPORT_OK.replace(/审查方式：.*$/m, '审查方式：实现者自查'));
  const self = await checkFeature(feature, 'review');
  assert.equal(self.status, 'BLOCKED');
  const issue = self.issues.find((item) => item.code === 'SELF_REVIEW');
  assert.match(issue.message, /自查/);
  assert.match(issue.hint, /独立/);
});

test('Standards、Spec 与证据审计节缺失或为空分别报错（TC07）', async (t) => {
  const { feature } = await reviewRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  const cases = [
    [/## Standards 规范轴\n规范检查有具体结论。/, 'MISSING_STANDARDS_REVIEW'],
    [/## Spec 需求轴\n需求检查有具体结论。/, 'MISSING_SPEC_SECTION'],
    [/## 证据审计\n逐个核对证据与断言。/, 'MISSING_EVIDENCE_AUDIT'],
  ];
  for (const [pattern, code] of cases) {
    await writeFile(reportPath, REPORT_OK.replace(pattern, ''));
    const report = await checkFeature(feature, 'review');
    assert.equal(report.status, 'FAIL');
    assert.ok(codes(report).includes(code), `${code}: ${formatReport(report)}`);
  }
});

test('Spec 对账只采信 review-report 并检查完整性与状态（TC07）', async (t) => {
  const { feature } = await reviewRepo(t, {
    plan: `${singlePlan()}\n## Spec 对账\n| US | 状态 | 证据或原因 |\n| 1 | PASS | 计划内伪对账 |\n| 2 | PASS | 计划内伪对账 |`,
  });
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(reportPath, REPORT_OK.replace('| 2 | PASS | 交付验证 |', ''));
  const missing = await checkFeature(feature, 'review');
  assert.equal(missing.status, 'FAIL');
  assert.ok(codes(missing).includes('MISSING_US'));

  await writeFile(reportPath, REPORT_OK.replace('| 2 | PASS | 交付验证 |', '| 1 | PASS | 重复 |\n| 99 | FAIL | 未知且失败 |'));
  const invalid = await checkFeature(feature, 'review');
  assert.ok(codes(invalid).includes('DUPLICATE_US'));
  assert.ok(codes(invalid).includes('UNKNOWN_US'));
  assert.ok(codes(invalid).includes('SPEC_FAILED'));
  assert.ok(codes(invalid).includes('MISSING_US'));

  await writeFile(reportPath, REPORT_OK.replace('| 2 | PASS | 交付验证 |', '| 2 | BLOCKED | 等待确认 |'));
  const blocked = await checkFeature(feature, 'review');
  assert.equal(blocked.status, 'BLOCKED');
  assert.ok(codes(blocked).includes('SPEC_BLOCKED'));
});

test('三档分流拒绝非法档位，空表必须写明无发现（TC07）', async (t) => {
  const { feature } = await reviewRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(reportPath, REPORT_OK.replace('| --- | --- |\n\n无发现', '| --- | --- |\n| 稍后处理 | 某问题 |'));
  const invalid = await checkFeature(feature, 'review');
  assert.equal(invalid.status, 'FAIL');
  assert.ok(codes(invalid).includes('INVALID_TRIAGE'));

  await writeFile(reportPath, REPORT_OK.replace('无发现', '尚未形成结论'));
  const missing = await checkFeature(feature, 'review');
  assert.equal(missing.status, 'FAIL');
  assert.ok(codes(missing).includes('MISSING_TRIAGE'));
});

test('三档分流数据行含档位文字且后续有数据时不误判表头（TC07）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeFile(
    path.join(feature, 'review-report.md'),
    REPORT_OK.replace(
      '| 档位 | 说明 |\n| --- | --- |\n\n无发现',
      '| 档位 | 说明 |\n| --- | --- |\n| 本次修 | 档位说明文字 |\n| 驳回 | 后续数据 |',
    ),
  );
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('INVALID_TRIAGE'));
});

test('plan 检查 Seam、QA Kind 与交付命令，并聚合结构问题（TC01、TC08、TC09）', async (t) => {
  const missingDelivery = await workspace(t, { plan: singlePlan({ deliveryCommand: '待声明' }) });
  const delivery = await checkFeature(missingDelivery, 'plan');
  assert.equal(delivery.status, 'FAIL');
  assert.ok(codes(delivery).includes('MISSING_DELIVERY_COMMANDS'));

  const invalid = await workspace(t, { plan: singlePlan({ seam: 'visual', kind: 'hotfix' }) });
  const structure = await checkFeature(invalid, 'plan');
  assert.ok(codes(structure).includes('INVALID_SEAM'));
  assert.ok(codes(structure).includes('INVALID_QA_KIND'));
});

test('交付验证缺失、命令不一致及非零退出分别报错（TC08）', async (t) => {
  const missingRepo = await reviewRepo(t, { plan: singlePlan({ deliveryEvidence: '待执行' }) });
  const missing = await checkFeature(missingRepo.feature, 'review');
  assert.equal(missing.status, 'BLOCKED', formatReport(missing));
  assert.ok(codes(missing).includes('MISSING_VERIFICATION'));

  const mismatchRepo = await reviewRepo(t, {
    deliveryArgv: ['node', '-e', 'process.exit(2)'],
    deliveryExit: 2,
  });
  const mismatch = await checkFeature(mismatchRepo.feature, 'review');
  assert.equal(mismatch.status, 'FAIL');
  assert.ok(codes(mismatch).includes('VERIFICATION_COMMAND_MISMATCH'));
  assert.match(
    mismatch.issues.find((item) => item.code === 'VERIFICATION_COMMAND_MISMATCH').hint,
    /按声明的命令重新运行/,
  );
  assert.ok(codes(mismatch).includes('VERIFICATION_FAILED'));
});

test('交付验证的空日志属于无效 qa-run 日志（TC08）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeFile(path.join(feature, 'evidence', 'delivery.log'), '');
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL');
  assert.ok(codes(report).includes('INVALID_RUN_LOG'), formatReport(report));
});

test('代码变化使交付日志与审查包同时过期（TC08）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  await writeFile(path.join(dir, 'tracked.txt'), '日志生成后的代码修改\n');
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('STALE_VERIFICATION'));
  assert.match(
    report.issues.find((item) => item.code === 'STALE_VERIFICATION').hint,
    /最终代码.*重新运行/s,
  );
  assert.ok(codes(report).includes('STALE_REVIEW_PACKAGE'));
});

test('产物齐全且新鲜时 review 为 PASS，多个问题一次聚合（TC08）', async (t) => {
  const { feature } = await reviewRepo(t);
  const fresh = await checkFeature(feature, 'review');
  assert.equal(fresh.status, 'PASS', formatReport(fresh));
  assert.deepEqual(fresh.issues, []);

  await writeFile(path.join(feature, 'review-report.md'), REPORT_OK.replace(/^审查方式：.*$/m, ''));
  await rm(path.join(feature, 'review-package.json'));
  const aggregated = await checkFeature(feature, 'review');
  assert.ok(codes(aggregated).includes('MISSING_REVIEW_METHOD'));
  assert.ok(codes(aggregated).includes('MISSING_REVIEW_PACKAGE'));
  assert.ok(codes(aggregated).includes('MISSING_SPEC_REVIEW') === false);
});

function fixPlan({ reproduction = '| TC01 | `evidence/red.log` |' } = {}) {
  return singlePlan({ kind: 'fix', reproduction });
}

test('修复轮每个 TC 都必须有复现行（TC09）', async (t) => {
  const dir = await workspace(t, {
    plan: fixPlan({ reproduction: '' }),
    evidence: { 'evidence/run.log': runLog() },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'BLOCKED');
  assert.ok(codes(report).includes('MISSING_REPRODUCTION'));
});

test('复现日志必须非零、同源、更早且对应不同 tree（TC09）', async (t) => {
  const cases = [
    { red: { exit: 0 }, code: 'REPRODUCTION_NOT_RED' },
    { red: { argv: ['node', 'other.js'] }, code: 'REPRODUCTION_SOURCE_MISMATCH' },
    { red: { started: '2026-01-03T00:00:00.000Z' }, code: 'REPRODUCTION_ORDER' },
    { red: { tree: 'green-tree' }, code: 'REPRODUCTION_SAME_TREE' },
  ];
  for (const item of cases) {
    const green = runLog({ argv: ['node', 'repro.js'], tree: 'green-tree' });
    const red = runLog({
      argv: ['node', 'repro.js'],
      exit: 1,
      started: '2026-01-01T00:00:00.000Z',
      tree: 'red-tree',
      ...item.red,
    });
    const dir = await workspace(t, {
      plan: fixPlan(),
      evidence: { 'evidence/run.log': green, 'evidence/red.log': red },
    });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL', `${item.code}: ${formatReport(report)}`);
    assert.ok(codes(report).includes(item.code));
  }
});

test('合格复现不报复现错误（TC09）', async (t) => {
  const dir = await workspace(t, {
    plan: fixPlan(),
    evidence: {
      'evidence/run.log': runLog({ argv: ['node', 'repro.js'], tree: 'green-tree' }),
      'evidence/red.log': runLog({
        argv: ['node', 'repro.js'],
        exit: 1,
        started: '2026-01-01T00:00:00.000Z',
        tree: 'red-tree',
      }),
    },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).some((code) => code.startsWith('REPRODUCTION_')));
});

test('Schema 1/2 保持兼容，未声明受支持 Schema 时 LEGACY 且 CLI 为 0（TC12）', async (t) => {
  const legacyPlan = [
    'QA Schema: 1',
    'QA Mode: inline',
    '',
    '### TC01: 旧计划',
    '- Priority: P0',
    '- Covers: 1, 2',
    '',
    '#### 验证断言',
    '1. 旧断言',
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据或原因 |',
    '| TC01 | 1 | PASS | `evidence/a.png` |',
  ].join('\n');
  const dir = await workspace(t, { plan: legacyPlan, evidence: { 'evidence/a.png': '旧证据' } });
  const schema1 = await checkFeature(dir, 'acceptance');
  assert.equal(schema1.status, 'PASS', formatReport(schema1));
  await writeFile(path.join(dir, 'qa-plan.md'), legacyPlan.replace('QA Schema: 1', 'QA Schema: 2'));
  const schema2 = await checkFeature(dir, 'plan');
  assert.equal(schema2.status, 'PASS', formatReport(schema2));

  await writeFile(path.join(dir, 'qa-plan.md'), '# 未声明 Schema 的历史计划\n');
  const legacy = await checkFeature(dir, 'acceptance');
  assert.equal(legacy.status, 'LEGACY');
  const cli = spawnSync(process.execPath, [QA_CHECK, 'acceptance', dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /结果: LEGACY/);
});

test('当前 Schema 与三个安装模板一致（TC12）', async () => {
  assert.equal(CURRENT_SCHEMA, 3);
  for (const name of ['qa-check.mjs', 'review-package.mjs', 'qa-run.mjs']) {
    const script = await readFile(fileURLToPath(new URL(`../${name}`, import.meta.url)), 'utf8');
    const template = await readFile(
      fileURLToPath(new URL(`../../../.claude/skills/setup-qa-workflow/templates/${name}`, import.meta.url)),
      'utf8',
    );
    assert.equal(template, script, name);
  }
});

test('同代码问题保留各自 message，通用 hint 只输出一次（TC12）', async (t) => {
  const plan = singlePlan({
    seam: 'browser',
    evidence: '`evidence/page.png`',
    extraResults: '| TC01 | 2 | PASS | `evidence/page.png` | |',
  }).replace('1. 第一条断言', '1. 第一条断言\n2. 第二条断言');
  const dir = await workspace(t, { plan, evidence: { 'evidence/page.png': '图片' } });
  const report = await checkFeature(dir, 'acceptance');
  const mismatches = report.issues.filter((item) => item.code === 'SEAM_EVIDENCE_MISMATCH');
  assert.equal(mismatches.length, 2);
  const output = formatReport(report);
  assert.match(output, /\[SEAM_EVIDENCE_MISMATCH\] TC01 \/ 1 声明 Seam: browser，缺少截图或 exit 0 的 qa-run 日志/);
  assert.match(output, /\[SEAM_EVIDENCE_MISMATCH\] TC01 \/ 2 声明 Seam: browser，缺少截图或 exit 0 的 qa-run 日志/);
  assert.equal((output.match(/\[提示\] SEAM_EVIDENCE_MISMATCH：/g) ?? []).length, 1, output);
  assert.ok(output.indexOf('TC01 / 1') < output.indexOf('TC01 / 2'));
  assert.ok(output.indexOf('TC01 / 2') < output.indexOf('[提示] SEAM_EVIDENCE_MISMATCH'));
  assert.ok(output.indexOf('[提示] SEAM_EVIDENCE_MISMATCH') < output.indexOf('结果: FAIL'));
});

test('formatReport 先输出 NOTE，再输出问题与结果（TC12）', () => {
  const text = formatReport({
    status: 'PASS',
    ok: true,
    notes: ['提示'],
    issues: [],
  });
  assert.equal(text, '[NOTE] 提示\n结果: PASS');
});
