import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeature, CURRENT_SCHEMA, formatReport } from '../qa-check.mjs';

const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));
// 默认 spec 声明与默认计划一致的交付命令，使既有用例不受交付命令契约影响
const SPEC = '## User Stories\n1. 第一条需求\n2. 第二条需求\n\n## 交付命令\n\n```bash\nnode --version\n```\n';

function runLog({
  label = 'run',
  argv = ['node', '--version'],
  exit = 0,
  started = '2026-01-02T00:00:00.000Z',
  finished = '2026-01-02T00:00:01.000Z',
  tree = 'none',
  complete = true,
  body = '测试输出',
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
    body,
  ];
  if (complete) lines.push('# ---', `# finished: ${finished}`, `# exit: ${exit}`);
  return `${lines.join('\n')}\n`;
}

// unit 夹具默认绑定的测试文件与标题；workspace 与 reviewRepo 都会写入该文件
const TEST_FILE = 'tests/a.test.mjs';
const TEST_SOURCE = "import test from 'node:test';\ntest('传入过滤条件时两路均收到', () => {});\n";
const BINDING = `\`${TEST_FILE}\` › 传入过滤条件时两路均收到`;

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
  binding = seam === 'unit' || seam === 'integration' ? BINDING : '',
} = {}) {
  return [
    'QA Schema: 4',
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
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| TC01 | 1 | ${status} | ${evidence} | ${binding} | |`,
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
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-schema4-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'spec.md'), spec);
  await writeFile(path.join(dir, 'qa-plan.md'), plan);
  await mkdir(path.join(dir, 'evidence'), { recursive: true });
  // 临时目录不在 git 仓库内，绑定文件相对特性目录解析
  for (const [relative, content] of Object.entries({ [TEST_FILE]: TEST_SOURCE, ...evidence })) {
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
  '审查方式：code-review 的 Standards 与 Spec 两个独立子代理，继承主会话模型',
  '',
  '## 三档分流',
  '| 编号 | 档位 | 最终状态 | 轮次轨迹 | 理由 |',
  '| --- | --- | --- | --- | --- |',
  '',
  '无发现',
  '',
  '## 范围说明',
  '无范围外改动。',
].join('\n');

/** 写入一轮两轴审查原文；默认均为无发现 */
async function writeRaw(feature, round = 1, { standards = '无发现\n', spec = '无发现\n' } = {}) {
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', `r${round}-standards.md`), standards);
  await writeFile(path.join(feature, 'review', `r${round}-spec-axis.md`), spec);
}

function triageReport(rows) {
  return REPORT_OK.replace(
    '| --- | --- | --- | --- | --- |\n\n无发现',
    `| --- | --- | --- | --- | --- |\n${rows.join('\n')}`,
  );
}

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
  await mkdir(path.join(dir, 'tests'), { recursive: true });
  await writeFile(path.join(dir, TEST_FILE), TEST_SOURCE);
  git(dir, ['add', 'tracked.txt', 'outside.txt', TEST_FILE]);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  await writeFile(path.join(dir, 'spec.md'), SPEC);
  await writeFile(path.join(feature, 'spec.md'), SPEC);
  // 按正确时序先冻结尚未执行的计划，init 之后再写入执行结果
  await writeFile(path.join(feature, 'qa-plan.md'), plan.replace(/\| (?:PASS|FAIL) \|/g, '| BLOCKED |'));

  const init = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  await writeFile(path.join(feature, 'qa-plan.md'), plan);
  if (outsideChange) await writeFile(path.join(dir, 'outside.txt'), '开工后范围外修改\n');
  for (const [label, argv, expected] of [
    ['run', ['node', '--test', TEST_FILE], 0],
    ['delivery', deliveryArgv, deliveryExit],
  ]) {
    const executed = spawnSync(process.execPath, [QA_RUN, feature, label, '--', ...argv], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(executed.status, expected, executed.stderr);
  }
  // 按正确时序先 acceptance 落盘对账表，再 collect
  spawnSync(process.execPath, [QA_CHECK, 'acceptance', feature], { cwd: dir, encoding: 'utf8' });
  const collected = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(collected.status, 0, collected.stderr);
  await writeFile(path.join(feature, 'review-report.md'), report);
  await writeRaw(feature);
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
      'scripts/browser.mjs': '// 浏览器过程脚本\n',
    },
  });
  // browser 日志需引用特性目录内的过程脚本；临时目录不在 git 仓库中，因此使用绝对路径
  await writeFile(
    path.join(dir, 'evidence', 'browser.log'),
    runLog({
      label: 'browser',
      argv: ['node', path.join(dir, 'scripts', 'browser.mjs')],
      body: '[TC02-1] PASS 实测：标题可见',
    }),
  );
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
    evidence: { 'evidence/shared.png': '图片', 'scripts/browser.mjs': '// 浏览器过程脚本\n' },
  });
  await writeFile(
    path.join(dir, 'evidence', 'run.log'),
    runLog({
      argv: ['node', path.join(dir, 'scripts', 'browser.mjs')],
      body: '[TC01-1] PASS 实测：甲\n[TC01-2] PASS 实测：乙',
    }),
  );
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('SHARED_SCREENSHOT'));
});

const FROZEN_PLAN = [
  'QA Schema: 4',
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
  '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
  '| --- | --- | --- | --- | --- | --- |',
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
  'QA Schema: 4',
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
  '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
  '| --- | --- | --- | --- | --- | --- |',
  '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
  '| TC01 | 2 | BLOCKED | 尚未执行 | | |',
  '| TC03 | 1 | BLOCKED | 尚未执行 | | |',
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
  // 本用例专测计划冻结差异，spec 不声明交付命令，以免交付命令契约提前拦截
  const dir = await workspace(t, { spec: '## User Stories\n1. 第一条需求\n2. 第二条需求\n', plan: CHANGED_PLAN });
  await mkdir(path.join(dir, '_qa', 'prechange'), { recursive: true });
  await writeFile(path.join(dir, '_qa', 'prechange', 'qa-plan.md'), FROZEN_PLAN);
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

test('报告不含 Standards 与 Spec 章节时不报错，缺审查方式仍 FAIL（TC02-5）', async (t) => {
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.doesNotMatch(REPORT_OK, /^## (?:Standards|Spec)\b/m);

  await writeFile(path.join(feature, 'review-report.md'), REPORT_OK.replace(/^审查方式：.*$/m, ''));
  const missing = await checkFeature(feature, 'review');
  assert.equal(missing.status, 'FAIL');
  assert.ok(codes(missing).includes('MISSING_REVIEW_METHOD'));
});

test('三档分流拒绝非法档位，空表必须写明无发现（TC07）', async (t) => {
  const { feature } = await reviewRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(reportPath, triageReport(['| S-J1 | 稍后处理 | — | r1 | 某问题 |']));
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
    verifiedReport(['| S-J1 | 本次修 | 已修 | r1 发现 → r2 已修 | 静态：改文案 | 档位说明文字 |', '| P-X1 | 驳回 | — | r1 | | 后续数据 |']),
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
  await rm(path.join(feature, '_qa', 'review-package.json'));
  const aggregated = await checkFeature(feature, 'review');
  assert.ok(codes(aggregated).includes('MISSING_REVIEW_METHOD'));
  assert.ok(codes(aggregated).includes('MISSING_REVIEW_PACKAGE'));
  assert.ok(codes(aggregated).includes('MISSING_SPEC_REVIEW') === false);
});

test('review PASS 限定机器校验范围并保留退出码兼容（TC02）', async (t) => {
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));

  const output = formatReport(report, 'review');
  assert.match(output, /结果: PASS/);
  assert.match(output, /校验范围: 审查材料结构、交付日志、tree 与范围完整性/);
  assert.match(output, /不包含: 独立审查来源真实性、证据语义质量与交付授权/);
  assert.doesNotMatch(formatReport(report, 'plan'), /校验范围:/);
  assert.doesNotMatch(formatReport(report, 'acceptance'), /校验范围:/);
  assert.doesNotMatch(formatReport(report, 'review'), /允许 commit/);

  const cli = spawnSync(process.execPath, [QA_CHECK, 'review', feature], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /结果: PASS/);
  assert.match(cli.stdout, /不包含: 独立审查来源真实性、证据语义质量与交付授权/);

  const blocked = await reviewRepo(t, {
    report: REPORT_OK.replace(/审查方式：.*$/m, '审查方式：实现者自查'),
  });
  const blockedCli = spawnSync(process.execPath, [QA_CHECK, 'review', blocked.feature], { encoding: 'utf8' });
  assert.equal(blockedCli.status, 1);
  assert.doesNotMatch(blockedCli.stdout, /校验范围:/);
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

test('Schema 1/2/3 与未声明 Schema 的计划一律 FAIL，提示按 Schema 4 重建且不再输出 LEGACY（TC01-2）', async (t) => {
  for (const header of ['QA Schema: 1', 'QA Schema: 2', 'QA Schema: 3', '']) {
    const plan = singlePlan().replace('QA Schema: 4', header);
    const dir = await workspace(t, { plan, evidence: { 'evidence/run.log': runLog() } });
    for (const phase of ['plan', 'acceptance', 'review']) {
      const report = await checkFeature(dir, phase);
      assert.equal(report.status, 'FAIL', `${header} ${phase}`);
      assert.deepEqual(codes(report), ['UNSUPPORTED_SCHEMA']);
      assert.match(report.issues[0].hint, /Schema 4/);
    }
    const cli = spawnSync(process.execPath, [QA_CHECK, 'acceptance', dir], { encoding: 'utf8' });
    assert.equal(cli.status, 1);
    assert.doesNotMatch(cli.stdout, /LEGACY/);
  }
});

test('Schema 4 计划含绑定列时 plan 为 PASS，缺绑定列时 FAIL（TC01-1）', async (t) => {
  const good = await workspace(t, { plan: singlePlan() });
  const passed = await checkFeature(good, 'plan');
  assert.equal(passed.status, 'PASS', formatReport(passed));

  const noBinding = singlePlan()
    .replace('| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |', '| 用例 | 断言序号 | 状态 | 证据 | 备注 |');
  const bad = await workspace(t, { plan: noBinding });
  const failed = await checkFeature(bad, 'plan');
  assert.equal(failed.status, 'FAIL');
  assert.ok(codes(failed).includes('MISSING_BINDING_COLUMN'));
});

test('当前 Schema 与三个安装模板一致（TC12）', async () => {
  assert.equal(CURRENT_SCHEMA, 4);
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

// ---- Schema 4 新增检查：过程脚本、断言标记、用例绑定、脚本扫描、对账表、审查对账与转录 ----

/** 多用例 Schema 4 计划；rows 为执行记录数据行（含绑定列） */
function plan4({ cases, rows, delivery = '`node --version`' }) {
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    '',
    ...cases.flatMap((item) => [
      `### ${item.id}: 示例`,
      '- Priority: P0',
      `- Covers: ${item.covers ?? '1, 2'}`,
      `- Seam: ${item.seam}`,
      '',
      '#### 验证断言',
      ...(item.assertions ?? ['断言甲']).map((text, index) => `${index + 1}. ${text}`),
      '',
    ]),
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    `| ${delivery} | 待执行 |`,
    '',
    '## 计划变更',
    '- 无',
  ].join('\n');
}

/** 单个 browser 或 api 用例的工作区：脚本放在 scriptPath，日志正文为 body */
async function scriptedWorkspace(t, {
  seam = 'browser',
  body = '[TC01-1] PASS 实测：scrollWidth=375',
  scriptPath = 'scripts/tc01.mjs',
  script = '// 过程脚本\n',
  argvScript = scriptPath,
  extraFiles = {},
} = {}) {
  const evidence = seam === 'browser' ? '`screenshots/TC01.png`、`evidence/tc01.log`' : '`evidence/tc01.log`';
  const dir = await workspace(t, {
    plan: plan4({ cases: [{ id: 'TC01', seam }], rows: [`| TC01 | 1 | PASS | ${evidence} | | |`] }),
    evidence: { 'screenshots/TC01.png': '截图', [scriptPath]: script, ...extraFiles },
  });
  await writeFile(
    path.join(dir, 'evidence', 'tc01.log'),
    runLog({ label: 'tc01', argv: ['node', path.join(dir, argvScript)], body }),
  );
  return dir;
}

test('browser/api 日志未引用 scripts/ 内存在的脚本时 FAIL，引用时不报（TC01-4）', async (t) => {
  for (const seam of ['browser', 'api']) {
    const inside = await scriptedWorkspace(t, { seam });
    const passed = await checkFeature(inside, 'acceptance');
    assert.equal(passed.status, 'PASS', `${seam}: ${formatReport(passed)}`);

    const root = await scriptedWorkspace(t, { seam, scriptPath: 'tc01.mjs' });
    const atRoot = await checkFeature(root, 'acceptance');
    assert.ok(codes(atRoot).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), `${seam}: ${formatReport(atRoot)}`);

    const missing = await scriptedWorkspace(t, { seam, argvScript: 'scripts/missing.mjs' });
    const notFound = await checkFeature(missing, 'acceptance');
    assert.ok(codes(notFound).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), `${seam}: ${formatReport(notFound)}`);
  }
});

test('_qa/debug/ 截图不参与唯一性检查，screenshots/ 跨 TC 共用仍 FAIL（TC01-5）', async (t) => {
  const cases = [{ id: 'TC01', seam: 'browser' }, { id: 'TC02', seam: 'browser', covers: '2' }];
  const build = (shot) => plan4({
    cases,
    rows: [
      `| TC01 | 1 | PASS | \`screenshots/TC01.png\`、\`${shot}\`、\`evidence/tc01.log\` | | |`,
      `| TC02 | 1 | PASS | \`screenshots/TC02.png\`、\`${shot}\`、\`evidence/tc02.log\` | | |`,
    ],
  });
  const dir = await workspace(t, {
    plan: build('_qa/debug/shared.png'),
    evidence: {
      'screenshots/TC01.png': '甲',
      'screenshots/TC02.png': '乙',
      'screenshots/shared.png': '共用',
      '_qa/debug/shared.png': '调试',
      'scripts/run.mjs': '// 过程脚本\n',
    },
  });
  for (const id of ['TC01', 'TC02']) {
    await writeFile(
      path.join(dir, 'evidence', `${id.toLowerCase()}.log`),
      runLog({ argv: ['node', path.join(dir, 'scripts', 'run.mjs')], body: `[${id}-1] PASS 实测：可见` }),
    );
  }
  const debug = await checkFeature(dir, 'acceptance');
  assert.equal(debug.status, 'PASS', formatReport(debug));

  await writeFile(path.join(dir, 'qa-plan.md'), build('screenshots/shared.png'));
  const shared = await checkFeature(dir, 'acceptance');
  assert.ok(codes(shared).includes('SHARED_SCREENSHOT'), formatReport(shared));
});

test('browser/api 断言标记缺失、为空或冲突时 FAIL，static 不检查（TC05）', async (t) => {
  for (const seam of ['browser', 'api']) {
    const good = await scriptedWorkspace(t, { seam });
    const passed = await checkFeature(good, 'acceptance');
    assert.ok(!codes(passed).some((code) => code.startsWith('ASSERTION_MARKER')), `${seam}: ${formatReport(passed)}`);

    for (const body of ['页面已打开', '[TC01-1] PASS 实测：', '[TC01-2] PASS 实测：别的断言']) {
      const dir = await scriptedWorkspace(t, { seam, body });
      const report = await checkFeature(dir, 'acceptance');
      assert.equal(report.status, 'FAIL');
      const marker = report.issues.find((item) => item.code === 'ASSERTION_MARKER_MISSING');
      assert.match(marker.message, /TC01 \/ 1/, `${seam} ${body}`);
    }

    const conflict = await scriptedWorkspace(t, { seam, body: '[TC01-1] PASS 实测：375\n[TC01-1] FAIL scrollWidth=420' });
    const conflicted = await checkFeature(conflict, 'acceptance');
    assert.ok(codes(conflicted).includes('ASSERTION_MARKER_CONFLICT'), `${seam}: ${formatReport(conflicted)}`);
  }

  const dir = await workspace(t, {
    plan: plan4({ cases: [{ id: 'TC01', seam: 'static' }], rows: ['| TC01 | 1 | PASS | `evidence/run.log` | | |'] }),
    evidence: { 'evidence/run.log': runLog({ body: '没有任何标记' }) },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
});

/** 单个 unit 用例：绑定文件位于特性目录内（临时目录不在 git 仓库中） */
async function boundWorkspace(t, { binding, source = TEST_SOURCE, file = TEST_FILE, argv = ['node', '--test'], cwd = '.', files = {} }) {
  const dir = await workspace(t, {
    plan: plan4({ cases: [{ id: 'TC01', seam: 'unit' }], rows: [`| TC01 | 1 | PASS | \`evidence/run.log\` | ${binding} | |`] }),
    evidence: { [file]: source, ...files },
  });
  const log = runLog({ argv, body: 'ok' }).replace('# cwd: .', `# cwd: ${cwd}`);
  await writeFile(path.join(dir, 'evidence', 'run.log'), log);
  return dir;
}

test('unit 绑定有效时不报，绑定为空、文件不存在或找不到标题时 TEST_BINDING_MISSING（TC06-1、TC06-2）', async (t) => {
  const named = await boundWorkspace(t, { binding: BINDING, argv: ['node', '--test', TEST_FILE] });
  const passed = await checkFeature(named, 'acceptance');
  assert.equal(passed.status, 'PASS', formatReport(passed));

  for (const binding of ['', '`tests/none.test.mjs` › 传入过滤条件时两路均收到', `\`${TEST_FILE}\` › 不存在的标题`, '只写了标题']) {
    const dir = await boundWorkspace(t, { binding });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL', binding);
    const missing = report.issues.find((item) => item.code === 'TEST_BINDING_MISSING');
    assert.match(missing.message, /TC01 \/ 1/, binding);
  }
});

test('标题匹配容忍引号与空白差异、参数化字面写法与只写叶子标题（TC06-3）', async (t) => {
  const source = [
    "describe('过滤器', () => {",
    '  test("传入  \'过滤\'  条件时两路均收到", () => {});',
    "  test.each([1, 2])('第 %s 路收到过滤条件', () => {});",
    '});',
  ].join('\n');
  for (const title of ['传入 "过滤" 条件时两路均收到', '第 %s 路收到过滤条件']) {
    const dir = await boundWorkspace(t, { binding: `\`${TEST_FILE}\` › ${title}`, source });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'PASS', `${title}: ${formatReport(report)}`);
  }
});

test('argv 点名其他测试文件或绑定文件位于包外时 TEST_BINDING_OUT_OF_RUN（TC06-4）', async (t) => {
  const other = await boundWorkspace(t, { binding: BINDING, argv: ['node', '--test', 'tests/other.test.mjs'] });
  const report = await checkFeature(other, 'acceptance');
  assert.ok(codes(report).includes('TEST_BINDING_OUT_OF_RUN'), formatReport(report));

  const globbed = await boundWorkspace(t, { binding: BINDING, argv: ['node', '--test', 'tests/*.test.mjs'] });
  assert.equal((await checkFeature(globbed, 'acceptance')).status, 'PASS');

  const inside = await boundWorkspace(t, {
    binding: '`pkg/b.test.mjs` › 包内用例',
    file: 'pkg/b.test.mjs',
    source: "test('包内用例', () => {});\n",
    cwd: 'pkg',
    files: { 'pkg/package.json': '{}\n' },
  });
  assert.equal((await checkFeature(inside, 'acceptance')).status, 'PASS');

  const outside = await boundWorkspace(t, { binding: BINDING, cwd: 'pkg', files: { 'pkg/package.json': '{}\n' } });
  const outsideReport = await checkFeature(outside, 'acceptance');
  assert.ok(codes(outsideReport).includes('TEST_BINDING_OUT_OF_RUN'), formatReport(outsideReport));
});

test('只改绑定列修正标题即可通过，不需要重跑证据命令（TC06-5）', async (t) => {
  const dir = await boundWorkspace(t, { binding: `\`${TEST_FILE}\` › 写错的标题` });
  const logBefore = await readFile(path.join(dir, 'evidence', 'run.log'), 'utf8');
  assert.equal((await checkFeature(dir, 'acceptance')).status, 'FAIL');
  const plan = await readFile(path.join(dir, 'qa-plan.md'), 'utf8');
  await writeFile(path.join(dir, 'qa-plan.md'), plan.replace('写错的标题', '传入过滤条件时两路均收到'));
  const fixed = await checkFeature(dir, 'acceptance');
  assert.equal(fixed.status, 'PASS', formatReport(fixed));
  assert.equal(await readFile(path.join(dir, 'evidence', 'run.log'), 'utf8'), logBefore);
});

test('acceptance 输出对账表，实测取自日志标记、绑定取自执行记录，模拟输入带标注（TC07）', async (t) => {
  const dir = await workspace(t, {
    plan: plan4({
      cases: [
        { id: 'TC01', seam: 'browser', assertions: ['移动端无横向溢出'] },
        { id: 'TC02', seam: 'unit', covers: '2', assertions: ['两路均收到过滤条件'] },
      ],
      rows: [
        '| TC01 | 1 | PASS | `screenshots/TC01.png`、`evidence/tc01.log` | | |',
        `| TC02 | 1 | PASS | \`evidence/run.log\` | ${BINDING} | |`,
      ],
    }),
    evidence: {
      'screenshots/TC01.png': '截图',
      'scripts/tc01.mjs': "await page.evaluate(() => document.querySelector('button').click());\n",
      'evidence/run.log': runLog({ argv: ['node', '--test', TEST_FILE] }),
    },
  });
  await writeFile(
    path.join(dir, 'evidence', 'tc01.log'),
    runLog({ argv: ['node', path.join(dir, 'scripts', 'tc01.mjs')], body: '[TC01-1] PASS 实测：scrollWidth=375' }),
  );
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  const output = formatReport(report, 'acceptance');
  assert.match(output, /\| 用例-断言 \| 冻结断言原文 \| 实测值或绑定 \| 标注 \|/);
  assert.match(output, /\| TC01-1 \| 移动端无横向溢出 \| scrollWidth=375 \| 非真实输入 \|/);
  assert.match(output, /\| TC02-1 \| 两路均收到过滤条件 \| `tests\/a\.test\.mjs` › 传入过滤条件时两路均收到 \| {2}\|/);
  assert.ok(output.indexOf('对账表') < output.indexOf('结果: PASS'));
});

test('过程脚本绕过登录或直连数据存储时 AUTH_BYPASS_IN_SCRIPT，未引用的 helper 同样扫描且不可豁免（TC08-1、TC08-2）', async (t) => {
  const bypasses = {
    cdp: "await client.send('Network.setCookie', { name: 'sid' });",
    context: 'await context.addCookies([{ name: "sid" }]);',
    documentCookie: "await page.evaluate(() => { document.cookie = 'sid=1'; });",
    localStorage: "await page.evaluate(() => localStorage.setItem('auth_token', 'x'));",
    bracket: "localStorage['accessToken'] = 'x';",
    prisma: "import { PrismaClient } from '@prisma/client';",
    pg: "const { Client } = require('pg');",
    nested: "const { PrismaClient } = require(path.join(root, 'packages/db/node_modules/@prisma/client'));",
    mongo: "import { MongoClient } from 'mongodb';",
    redis: "import Redis from 'ioredis';",
    supabase: "import { createClient } from '@supabase/supabase-js';",
    firebase: "import admin from 'firebase-admin';",
    sqlite: "import Database from 'better-sqlite3';",
    mysql: "import mysql from 'mysql2/promise';",
    python: 'import psycopg2\n',
  };
  for (const [name, source] of Object.entries(bypasses)) {
    const extension = name === 'python' ? 'py' : 'mjs';
    const dir = await scriptedWorkspace(t, {
      extraFiles: { [`scripts/helper.${extension}`]: source },
    });
    await writeFile(
      path.join(dir, 'qa-plan.md'),
      (await readFile(path.join(dir, 'qa-plan.md'), 'utf8')).replace('- 无', '- 已获人工豁免：脚本需要直接写库'),
    );
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL', `${name}: ${formatReport(report)}`);
    const bypass = report.issues.find((item) => item.code === 'AUTH_BYPASS_IN_SCRIPT');
    assert.match(bypass?.message ?? '', /scripts\/helper\./, name);
  }
});

test('页面内合成输入只输出 SYNTHETIC_INPUT_IN_SCRIPT 提示，干净脚本无扫描输出（TC08-3、TC08-4）', async (t) => {
  const samples = [
    "await page.evaluate(() => input.dispatchEvent(new Event('input')));",
    "await page.evaluate(() => document.querySelector('a').click());",
    "await page.$eval('input', (el) => el.focus());",
    "await page.evaluate(() => { document.querySelector('input').value = '甲'; });",
    "await cdp.send('Runtime.evaluate', { expression: \"document.querySelector('a').click()\" });",
  ];
  for (const script of samples) {
    const dir = await scriptedWorkspace(t, { script });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'PASS', `${script}: ${formatReport(report)}`);
    assert.ok(report.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT')), script);
  }

  const clean = await scriptedWorkspace(t, {
    script: "await page.getByRole('button', { name: '提交' }).click();\nawait page.fill('input', '甲');\nconst value = await page.evaluate(() => document.body.scrollWidth);\n",
  });
  const report = await checkFeature(clean, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  const output = formatReport(report, 'acceptance');
  assert.doesNotMatch(output, /SYNTHETIC_INPUT_IN_SCRIPT|AUTH_BYPASS_IN_SCRIPT|非真实输入/);
});

test('CDP 方法名不在调用括号内时只截取同一行，之后的真实点击不算合成输入（TC08-3）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "const message = { method: 'Runtime.evaluate', params: { expression: 'document.title' } };\nawait cdp.send(message.method, message.params);\nawait page.getByRole('button', { name: '提交' }).click();\n",
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.doesNotMatch(formatReport(report, 'acceptance'), /SYNTHETIC_INPUT_IN_SCRIPT|非真实输入/);
});

test('多行 Runtime.evaluate 调用中换行后的合成输入仍被检出（TC08-3）', async (t) => {
  const samples = [
    "await cdp.send('Runtime.evaluate', {\n  expression: \"document.querySelector('a').click()\",\n});\n",
    "await cdp.send(\n  'Runtime.evaluate',\n  { expression: \"document.querySelector('a').click()\" },\n);\n",
  ];
  for (const script of samples) {
    const dir = await scriptedWorkspace(t, { script });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'PASS', formatReport(report));
    assert.ok(report.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT')), script);
  }
});

test('最新一轮缺任一轴原文或原文早于审查包时 REVIEW_RAW_MISSING（TC02-1）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  await rm(path.join(feature, 'review', 'r1-spec-axis.md'));
  const missing = await checkFeature(feature, 'review');
  assert.equal(missing.status, 'BLOCKED', formatReport(missing));
  assert.match(missing.issues.find((item) => item.code === 'REVIEW_RAW_MISSING').message, /spec-axis/);

  await writeRaw(feature);
  const old = new Date(Date.now() - 3_600_000);
  await utimes(path.join(feature, 'review', 'r1-standards.md'), old, old);
  const stale = await checkFeature(feature, 'review');
  assert.equal(stale.status, 'BLOCKED', formatReport(stale));
  assert.match(stale.issues.find((item) => item.code === 'REVIEW_RAW_MISSING').message, /r1-standards\.md/);

  // 代码未变时重复 collect 不让已落盘的原文过期
  await writeRaw(feature);
  await new Promise((resolve) => setTimeout(resolve, 20));
  const recollect = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(recollect.status, 0, recollect.stderr);
  const fresh = await checkFeature(feature, 'review');
  assert.ok(!codes(fresh).includes('REVIEW_RAW_MISSING'), formatReport(fresh));

  await rm(path.join(feature, 'review'), { recursive: true });
  const none = await checkFeature(feature, 'review');
  assert.ok(codes(none).includes('REVIEW_RAW_MISSING'), formatReport(none));
});

test('原文编号未进入分流表时 FINDING_NOT_TRIAGED 并列出缺失编号（TC02-2）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, {
    standards: '[S-H1] 硬违规\n[S-J1] 判断建议\n',
    spec: '[P-M1] 缺失\n[P-W1] 有误\n[P-X1] 蔓延\n',
  });
  await writeFile(path.join(feature, 'review-report.md'), triageReport([
    '| S-H1 | 本次修 | 已修 | r1 → r2 已修 | |',
    '| P-M1 | 本次修 | 已修 | r1 → r2 已修 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  const missing = report.issues.find((item) => item.code === 'FINDING_NOT_TRIAGED');
  assert.match(missing.message, /P-W1、P-X1、S-J1/);
  assert.doesNotMatch(missing.message, /S-H1|P-M1/);
});

test('S-H/P-M/P-W 改档无理由时 DEFAULT_FIX_WITHOUT_REASON，S-J/P-X 不要求理由（TC02-3）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-H1] 硬\n[S-J1] 判\n', spec: '[P-W1] 误\n[P-X1] 蔓延\n' });
  await writeFile(path.join(feature, 'review-report.md'), triageReport([
    '| S-H1 | 转专项 | — | r1 | |',
    '| P-W1 | 驳回 | — | r1 | 依据 ADR-0032 §2 |',
    '| S-J1 | 转专项 | — | r1 | |',
    '| P-X1 | 驳回 | — | r1 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  const issues = report.issues.filter((item) => item.code === 'DEFAULT_FIX_WITHOUT_REASON');
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /S-H1/);
  assert.doesNotMatch(issues[0].message, /P-W1|S-J1|P-X1/);
});

test('两轴无发现且分流表写无发现时 review 为 PASS（TC02-4）', async (t) => {
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.deepEqual(report.issues, []);
});

test('以编号最大的轮次为最新一轮，早期轮缺失不报；r4 不因轮次报错（TC03-1、TC03-4）', async (t) => {
  const { feature } = await reviewRepo(t);
  await rm(path.join(feature, 'review', 'r1-spec-axis.md'));
  await writeRaw(feature, 2);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));

  await writeRaw(feature, 3);
  await writeRaw(feature, 4);
  const fourth = await checkFeature(feature, 'review');
  assert.equal(fourth.status, 'PASS', formatReport(fourth));

  await rm(path.join(feature, 'review', 'r4-standards.md'));
  const partial = await checkFeature(feature, 'review');
  assert.match(partial.issues.find((item) => item.code === 'REVIEW_RAW_MISSING')?.message ?? '', /r4/);
});

test('本次修条目最终未修或修错时 UNRESOLVED_FINDINGS，全部已修时 PASS（TC03-2、TC03-3）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-H1] 硬\n', spec: '[P-M1] 缺\n[P-W1] 误\n' });
  await writeRaw(feature, 3, { standards: '[S-H1] 未修\n', spec: '[P-M1] 修错\n[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| S-H1 | 本次修 | 未修 | r1 → r2 未修 → r3 未修 | 静态：同下 | |',
    '| P-M1 | 本次修 | 修错 | r1 → r2 修错 → r3 修错 | 静态：同下 | |',
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：改文案 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  const unresolved = report.issues.find((item) => item.code === 'UNRESOLVED_FINDINGS');
  assert.match(unresolved.message, /S-H1（未修）.*P-M1（修错）/);
  assert.doesNotMatch(unresolved.message, /P-W1/);

  await writeFile(
    path.join(feature, 'review-report.md'),
    (await readFile(path.join(feature, 'review-report.md'), 'utf8')).replace('| 未修 |', '| 已修 |').replace('| 修错 |', '| 已修 |'),
  );
  const fixed = await checkFeature(feature, 'review');
  assert.equal(fixed.status, 'PASS', formatReport(fixed));
});

/** 临时 CLAUDE_CONFIG_DIR，测试结束恢复 */
async function useConfigDir(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-claude-config-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  t.after(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}

async function projectDir(configDir, repoDir) {
  const { realpath } = await import('node:fs/promises');
  const root = await realpath(repoDir);
  return path.join(configDir, 'projects', root.replace(/[^A-Za-z0-9]/g, '-'));
}

/** 主会话转录；默认含一次审查包之后的 code-review Skill 调用 */
async function writeMainSession(configDir, repoDir, { sessionModel = 'claude-opus-5-5', skill = 'code-review' } = {}) {
  const project = await projectDir(configDir, repoDir);
  await mkdir(project, { recursive: true });
  const lines = [{ type: 'assistant', message: { model: sessionModel, content: [{ type: 'text', text: '主会话' }] } }];
  if (skill) {
    lines.push({
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { model: sessionModel, content: [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill, args: '阶段 6' } }] },
    });
  }
  await writeFile(path.join(project, 'session-1.jsonl'), `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  return project;
}

/** 子代理转录：entries 为 assistant 消息 content 列表，按顺序写入 */
async function writeSubagent(configDir, repoDir, { name = 'agent-1', model, contents }) {
  const project = await projectDir(configDir, repoDir);
  const subagents = path.join(project, 'session-1', 'subagents');
  await mkdir(subagents, { recursive: true });
  const lines = [{ type: 'user', message: { content: '审查' } }, ...contents.map((content) => ({ type: 'assistant', message: { model, content } }))];
  const file = path.join(subagents, `${name}.jsonl`);
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  await writeFile(path.join(subagents, `${name}.meta.json`), JSON.stringify({ model }));
  return file;
}

async function writeTranscript(configDir, repoDir, { text, model, sessionModel = 'claude-opus-5-5' }) {
  await writeMainSession(configDir, repoDir, { sessionModel });
  return writeSubagent(configDir, repoDir, { model, contents: [[{ type: 'thinking', thinking: '…' }, { type: 'text', text }]] });
}

test('转录最后一条返回不含原文时输出 NOTE，状态不变（TC04-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  const transcript = await writeTranscript(configDir, dir, { text: '规范轴：无发现', model: 'claude-opus-5-5' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  const notes = report.notes.filter((note) => note.startsWith('转录核验'));
  assert.equal(notes.length, 1, formatReport(report));
  assert.match(notes[0], /review\/r1-spec-axis\.md/);
  assert.ok(notes[0].includes(transcript));
});

test('子代理模型与主会话不一致时输出 NOTE，状态不变（TC04-2）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '同一份原文：无发现\n', spec: '同一份原文：无发现\n' });
  await writeTranscript(configDir, dir, { text: '同一份原文：无发现', model: 'claude-haiku-5.5' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  const notes = report.notes.filter((note) => note.startsWith('转录核验'));
  assert.ok(notes.length >= 1, formatReport(report));
  assert.ok(notes.every((note) => /claude-haiku-5\.5/.test(note) && /主会话模型/.test(note)), notes.join('\n'));
});

test('找不到会话目录时不输出转录相关内容（TC04-3）', async (t) => {
  await useConfigDir(t);
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.doesNotMatch(formatReport(report, 'review'), /转录/);
});

// ---- 审查闭环与修复验证（.scratch/qa-workflow-review-closure） ----

test('最新一轮原文无规范编号且未写无发现时 REVIEW_RAW_UNNUMBERED（TC01-1）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-01] 命名不清\n', spec: '[P-01] 超时未实现\n' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  const found = report.issues.filter((item) => item.code === 'REVIEW_RAW_UNNUMBERED');
  assert.equal(found.length, 1, formatReport(report));
  assert.match(found[0].message, /review\/r1-standards\.md/);
  assert.match(found[0].message, /review\/r1-spec-axis\.md/);
  assert.match(found[0].hint, /Skill 工具调用 code-review/);
  assert.match(found[0].hint, /不要用 Agent 工具自行派审查子代理/);
});

test('原文写无发现时不报 REVIEW_RAW_UNNUMBERED（TC01-2）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_RAW_UNNUMBERED'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('原文含规范编号时不报 REVIEW_RAW_UNNUMBERED，未分流仍报 FINDING_NOT_TRIAGED（TC01-3）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-H1] 硬违规\n', spec: '无发现\n' });
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_RAW_UNNUMBERED'), formatReport(report));
  assert.ok(codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
});

test('只有早期轮原文缺编号时不报 REVIEW_RAW_UNNUMBERED（TC01-4）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-01] 旧格式\n', spec: '[P-01] 旧格式\n' });
  await writeRaw(feature, 2);
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_RAW_UNNUMBERED'), formatReport(report));
});

test('原文出现在子代理非最后一条输出或 SendMessage 消息中时视为匹配（TC02-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards',
    model: 'claude-opus-5-5',
    contents: [[{ type: 'text', text: '规范轴：无发现' }], [{ type: 'text', text: '已返回给主代理' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec',
    model: 'claude-opus-5-5',
    contents: [[{ type: 'tool_use', id: 'toolu_2', name: 'SendMessage', input: { to: 'main', message: '需求轴：无发现' } }], [{ type: 'text', text: '完成' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.doesNotMatch(formatReport(report, 'review'), /转录核验/);
});

test('原文不在任何子代理输出中时 NOTE，状态不变（TC02-2）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, { model: 'claude-opus-5-5', contents: [[{ type: 'text', text: '别的内容' }]] });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  const notes = report.notes.filter((note) => note.startsWith('转录核验'));
  assert.equal(notes.length, 1, formatReport(report));
  assert.match(notes[0], /review\/r1-standards\.md/);
  assert.match(notes[0], /review\/r1-spec-axis\.md/);
});

test('会话目录存在但审查包之后没有子代理转录时 NOTE，状态不变（TC02-3）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeMainSession(configDir, dir);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('最新一轮原文没有对应的子代理转录')), formatReport(report));

  // 审查包之前的子代理转录不算
  const old = new Date(Date.now() - 3_600_000);
  const file = await writeSubagent(configDir, dir, { model: 'claude-opus-5-5', contents: [[{ type: 'text', text: '无发现' }]] });
  await utimes(file, old, old);
  const stale = await checkFeature(feature, 'review');
  assert.ok(stale.notes.some((note) => note.includes('最新一轮原文没有对应的子代理转录')), formatReport(stale));
});

test('审查包之后没有 code-review 的 Skill 调用时 NOTE，带插件前缀的调用视为有（TC02-4）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '同一份原文：无发现\n', spec: '同一份原文：无发现\n' });
  await writeSubagent(configDir, dir, { model: 'claude-opus-5-5', contents: [[{ type: 'text', text: '同一份原文：无发现' }]] });
  for (const [skill, expected] of [[null, true], ['grilling', true], ['code-review', false], ['team:code-review', false]]) {
    await writeMainSession(configDir, dir, { skill });
    const report = await checkFeature(feature, 'review');
    assert.equal(report.status, 'PASS', formatReport(report));
    const noted = report.notes.some((note) => note.includes('Skill 调用'));
    assert.equal(noted, expected, `${skill}: ${formatReport(report)}`);
  }
});

/** 带「验证证据」列的分流表报告 */
function verifiedReport(rows, header = '| 编号 | 档位 | 最终状态 | 轮次轨迹 | 验证证据 | 理由 |') {
  return REPORT_OK
    .replace('| 编号 | 档位 | 最终状态 | 轮次轨迹 | 理由 |', header)
    .replace('| --- | --- | --- | --- | --- |\n\n无发现', `| --- | --- | --- | --- | --- | --- |\n${rows.join('\n')}`);
}

/** r1 提出 P-W1，r2 复审已修；返回特性目录与 r1 原文时间 */
async function fixedRepo(t) {
  const repo = await reviewRepo(t);
  const old = new Date(Date.now() - 600_000);
  await writeRaw(repo.feature, 1, { standards: '无发现\n', spec: '[P-W1] 实现有误\n' });
  for (const name of ['r1-standards.md', 'r1-spec-axis.md']) await utimes(path.join(repo.feature, 'review', name), old, old);
  await writeRaw(repo.feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  return repo;
}

async function fixLog(feature, name, { exit = 0, time } = {}) {
  const file = path.join(feature, 'evidence', name);
  await writeFile(file, runLog({ label: name.replace(/\.log$/, ''), exit }));
  if (time) await utimes(file, time, time);
}

function fixIssue(report) {
  return report.issues.find((item) => item.code === 'FIX_UNVERIFIED');
}

test('已修行验证证据为空或缺列时 FIX_UNVERIFIED（TC03-1、TC03-2）', async (t) => {
  const { feature } = await fixedRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | | |']));
  const empty = await checkFeature(feature, 'review');
  assert.equal(empty.status, 'FAIL', formatReport(empty));
  assert.match(fixIssue(empty)?.message ?? '', /P-W1/);

  await writeFile(reportPath, triageReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | |']));
  const noColumn = await checkFeature(feature, 'review');
  assert.match(fixIssue(noColumn)?.message ?? '', /验证证据/, formatReport(noColumn));
});

test('验证证据文件不存在或越出 evidence/ 与 screenshots/ 时 FIX_UNVERIFIED（TC03-3）', async (t) => {
  const { feature } = await fixedRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(path.join(feature, 'notes.md'), '自述已修');
  for (const reference of ['`evidence/missing.log`', '`notes.md`', '`../outside.txt`']) {
    await writeFile(reportPath, verifiedReport([`| P-W1 | 本次修 | 已修 | r1 → r2 已修 | ${reference} | |`]));
    const report = await checkFeature(feature, 'review');
    assert.match(fixIssue(report)?.message ?? '', /P-W1/, `${reference}: ${formatReport(report)}`);
  }
});

test('验证证据早于首次提出该编号的原文时 FIX_UNVERIFIED，晚于时不报（TC03-4）', async (t) => {
  const { feature } = await fixedRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await mkdir(path.join(feature, 'screenshots'), { recursive: true });
  await writeFile(path.join(feature, 'screenshots', 'fix-old.png'), '旧截图');
  const older = new Date(Date.now() - 3_600_000);
  await utimes(path.join(feature, 'screenshots', 'fix-old.png'), older, older);
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | `screenshots/fix-old.png` | |']));
  const stale = await checkFeature(feature, 'review');
  assert.match(fixIssue(stale)?.message ?? '', /P-W1/, formatReport(stale));

  await writeFile(path.join(feature, 'screenshots', 'fix-new.png'), '修复后截图');
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | `screenshots/fix-new.png` | |']));
  const fresh = await checkFeature(feature, 'review');
  assert.ok(!codes(fresh).includes('FIX_UNVERIFIED'), formatReport(fresh));
});

test('验证证据为 exit 非 0 的 qa-run 日志时 FIX_UNVERIFIED，exit 0 时不报（TC03-5）', async (t) => {
  const { feature } = await fixedRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await fixLog(feature, 'fix-red.log', { exit: 1 });
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | `evidence/fix-red.log` | |']));
  const red = await checkFeature(feature, 'review');
  assert.match(fixIssue(red)?.message ?? '', /P-W1/, formatReport(red));

  await fixLog(feature, 'fix-green.log');
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | `evidence/fix-green.log` | |']));
  const green = await checkFeature(feature, 'review');
  assert.ok(!codes(green).includes('FIX_UNVERIFIED'), formatReport(green));
});

test('静态理由非空时不报，静态后无理由时 FIX_UNVERIFIED（TC03-6）', async (t) => {
  const { feature } = await fixedRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：删除调试代码 | |']));
  const reasoned = await checkFeature(feature, 'review');
  assert.ok(!codes(reasoned).includes('FIX_UNVERIFIED'), formatReport(reasoned));

  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态： | |']));
  const blank = await checkFeature(feature, 'review');
  assert.match(fixIssue(blank)?.message ?? '', /P-W1/, formatReport(blank));
});

test('非已修行验证证据留空不报 FIX_UNVERIFIED（TC03-7）', async (t) => {
  const { feature } = await fixedRepo(t);
  await writeRaw(feature, 2, { standards: '[S-J1] 判断\n', spec: '[P-W1] 未修\n[P-X1] 蔓延\n[P-M1] 缺失\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 未修 | r1 → r2 未修 | | |',
    '| S-J1 | 转专项 | — | r2 | | |',
    '| P-X1 | 驳回 | — | r2 | | 依据 spec Out of Scope |',
    '| P-M1 | 本次修 | 修错 | r2 修错 | | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('FIX_UNVERIFIED'), formatReport(report));
});

test('验证证据合法且列顺序不同时 review 为 PASS（TC03-8）', async (t) => {
  const { feature } = await fixedRepo(t);
  await fixLog(feature, 'fix-green.log');
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport(
    ['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | | `evidence/fix-green.log` |'],
    '| 编号 | 档位 | 最终状态 | 轮次轨迹 | 理由 | 验证证据 |',
  ));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
});

async function scanReport(t, script) {
  const dir = await scriptedWorkspace(t, { extraFiles: { 'scripts/helper.mjs': script } });
  return checkFeature(dir, 'acceptance');
}

function bypassIssue(report) {
  return report.issues.find((item) => item.code === 'AUTH_BYPASS_IN_SCRIPT');
}

test('脚本内密码字面量 AUTH_BYPASS_IN_SCRIPT，空串或环境变量不报（TC04-1）', async (t) => {
  for (const script of ["await page.fill('#pwd', 'x');\nconst body = { username: 'e2e', password: 'LoopPass123!' };", "const TEST_PASS = 'x';", 'const opts = { "passwd": "secret" };']) {
    const report = await scanReport(t, script);
    assert.equal(report.status, 'FAIL', `${script}: ${formatReport(report)}`);
    assert.match(bypassIssue(report)?.message ?? '', /scripts\/helper\.mjs.*密码/, script);
  }
  for (const script of ["const body = { password: '' };", 'const password = process.env.QA_PASSWORD;', "const passwordInput = page.getByLabel('密码');"]) {
    const report = await scanReport(t, script);
    assert.ok(!codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), `${script}: ${formatReport(report)}`);
  }
});

test('脚本内登录、注册、签发令牌接口路径 AUTH_BYPASS_IN_SCRIPT（TC04-2）', async (t) => {
  for (const script of ["await fetch(`${base}/api/auth/login`, { method: 'POST' });", "await request.post('/api/auth/register');", "await fetch('/api/v1/signup');", "await fetch('/api/token');", "await fetch('/signup', { method: 'POST' });", "await request.post(`${base}/login`);"]) {
    const report = await scanReport(t, script);
    assert.equal(report.status, 'FAIL', `${script}: ${formatReport(report)}`);
    assert.match(bypassIssue(report)?.message ?? '', /登录|注册|令牌/, script);
  }
  const page = await scanReport(t, "await page.goto(`${base}/login`);\nawait fetch('/api/voice/realtime/session');\nawait fetch('/api/tokens-usage');\nconst signupPath = '/signup';\nawait page.goto(base + signupPath);");
  assert.ok(!codes(page).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(page));
});

test('通过 window.__* 调用登录类方法 AUTH_BYPASS_IN_SCRIPT（TC04-3）', async (t) => {
  for (const script of [
    "await page.evaluate(() => window.__authStore.getState().login('u', 'p'));",
    "await page.evaluate(() => window.__x.setToken('t'));",
    "await page.evaluate(() => { window.__session.setAuth({}); });",
  ]) {
    const report = await scanReport(t, script);
    assert.equal(report.status, 'FAIL', `${script}: ${formatReport(report)}`);
    assert.match(bypassIssue(report)?.message ?? '', /window\.__/, script);
  }
});

test('登录类 FAIL 不可豁免，提示从已登录状态开始（TC04-4）', async (t) => {
  const dir = await scriptedWorkspace(t, { extraFiles: { 'scripts/helper.mjs': "await fetch('/api/auth/register');" } });
  await writeFile(
    path.join(dir, 'qa-plan.md'),
    (await readFile(path.join(dir, 'qa-plan.md'), 'utf8')).replace('- 无', '- 已获人工豁免：脚本需要注册一次性账号'),
  );
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'FAIL', formatReport(report));
  assert.match(bypassIssue(report)?.hint ?? '', /脚本应从已登录状态开始/);
  assert.match(bypassIssue(report)?.hint ?? '', /真实登录页登录一次/);
});

test('页面内 setState 与 window.__ 访问只 NOTE 并标注非真实输入（TC04-5）', async (t) => {
  for (const script of [
    "await page.evaluate(() => window.__chatStore.setState({ messages: [] }));",
    "const count = await page.evaluate(() => window.__chatStore.getState().messages.length);",
  ]) {
    const dir = await scriptedWorkspace(t, { script });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'PASS', `${script}: ${formatReport(report)}`);
    assert.ok(report.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT')), script);
    assert.match(formatReport(report, 'acceptance'), /\| TC01-1 \|.*\| 非真实输入 \|/);
  }
});

test('不含登录与注入模式的脚本无扫描输出（TC04-6）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "await page.goto('/knowledge');\nawait page.getByRole('button', { name: '保存到知识库' }).click();\nconst width = await page.evaluate(() => document.body.scrollWidth);\n",
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.doesNotMatch(formatReport(report, 'acceptance'), /SYNTHETIC_INPUT_IN_SCRIPT|AUTH_BYPASS_IN_SCRIPT|非真实输入/);
});

function acceptanceCli(dir, feature) {
  return spawnSync(process.execPath, [QA_CHECK, 'acceptance', feature], { cwd: dir, encoding: 'utf8' });
}

test('acceptance 把对账表写入 _qa/reconciliation.md，内容与终端一致（TC05-1）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  await rm(path.join(feature, '_qa', 'reconciliation.md'), { force: true });
  const run = acceptanceCli(dir, feature);
  assert.equal(run.status, 0, run.stdout + run.stderr);
  const saved = await readFile(path.join(feature, '_qa', 'reconciliation.md'), 'utf8');
  const rows = saved.split('\n').filter((line) => line.startsWith('| TC'));
  assert.equal(rows.length, 1, saved);
  assert.match(rows[0], /\| TC01-1 \| 第一条断言 \|/);
  for (const line of saved.split('\n').filter((item) => item.startsWith('|'))) assert.ok(run.stdout.includes(line), line);
});

test('计划结构有问题时 acceptance 删除旧对账表，不留过期文件（TC05-1）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  const saved = path.join(feature, '_qa', 'reconciliation.md');
  await readFile(saved, 'utf8');
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, (await readFile(planPath, 'utf8')).replace('QA Schema: 4', 'QA Schema: 3'));
  assert.notEqual(acceptanceCli(dir, feature).status, 0);
  await assert.rejects(readFile(saved, 'utf8'));
});

test('review 时对账表缺失报 RECONCILIATION_STALE（TC05-2）', async (t) => {
  const { feature } = await reviewRepo(t);
  await rm(path.join(feature, '_qa', 'reconciliation.md'));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  const stale = report.issues.find((item) => item.code === 'RECONCILIATION_STALE');
  assert.match(stale?.hint ?? '', /acceptance/);
  assert.match(stale?.hint ?? '', /collect/);
});

test('执行记录变化未重跑 acceptance 时 RECONCILIATION_STALE，重跑后不报（TC05-3）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, (await readFile(planPath, 'utf8')).replace('传入过滤条件时两路均收到 |', "'传入过滤条件时两路均收到' |"));
  const stale = await checkFeature(feature, 'review');
  assert.ok(codes(stale).includes('RECONCILIATION_STALE'), formatReport(stale));
  assert.equal(acceptanceCli(dir, feature).status, 0);
  const fresh = await checkFeature(feature, 'review');
  assert.ok(!codes(fresh).includes('RECONCILIATION_STALE'), formatReport(fresh));
});
