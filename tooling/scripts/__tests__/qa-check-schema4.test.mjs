import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeature, CURRENT_SCHEMA, formatReport, splitMarkdownRow } from '../qa-check.mjs';

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

async function readChallenge(feature) {
  return JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
}

/** 按当前磁盘原文写一份自述凭据；用于验证 receipt 协议而非 seal 命令本身 */
async function writeReceipt(feature, {
  round = 'r1',
  axis = 'standards',
  nonce,
  reviewerKind = 'subagent',
  host = 'Claude Code',
  pendingIds,
  completedAt,
  hash,
  featureOverride,
} = {}) {
  const challenge = await readChallenge(feature);
  const fileName = `r${round.slice(1)}-${axis === 'standards' ? 'standards' : 'spec-axis'}.md`;
  const report = await readFile(path.join(feature, 'review', fileName));
  const receipt = {
    schemaVersion: 1,
    feature: featureOverride ?? challenge.feature,
    round,
    axis,
    nonce: nonce ?? challenge.nonce,
    reviewerKind,
    host,
    reportPath: `review/${fileName}`,
    sha256: hash ?? createHash('sha256').update(report).digest('hex'),
    treeDigest: challenge.treeDigest,
    completedAt: completedAt ?? new Date().toISOString(),
  };
  if (pendingIds) receipt.pendingIds = pendingIds;
  await writeFile(path.join(feature, 'review', fileName.replace(/\.md$/, '.source.json')), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

async function writeReceipts(feature, { round = 'r1', nonce, pendingIds, ...rest } = {}) {
  const challenge = await readChallenge(feature);
  return {
    standards: await writeReceipt(feature, { round, axis: 'standards', nonce: nonce ?? challenge.nonce, pendingIds, ...rest }),
    spec: await writeReceipt(feature, { round, axis: 'spec', nonce: nonce ?? challenge.nonce, pendingIds, ...rest }),
  };
}

/** 新协议仓库：保留 challenge，并为两轴写入有效凭据 */
async function receiptRepo(t, options = {}) {
  const result = await reviewRepo(t, { ...options, challenge: true });
  const challenge = await readChallenge(result.feature);
  await writeReceipts(result.feature, { nonce: challenge.nonce });
  return { ...result, challenge };
}

/** 为单轴写一份同 nonce 子代理转录；hash 与 timestamp 可覆盖以覆盖强档负向分支 */
async function strongTranscript(configDir, dir, feature, challenge, {
  axis = 'standards',
  name = `agent-${axis}`,
  hash,
  timestamp = new Date().toISOString(),
  finalText,
  quoteBinding = false,
} = {}) {
  const relative = `review/r1-${axis === 'standards' ? 'standards' : 'spec-axis'}.md`;
  const fileHash = createHash('sha256').update(await readFile(path.join(feature, relative))).digest('hex');
  return writeSubagent(configDir, dir, {
    name,
    binding: `.scratch/feature|r1|${axis}`,
    promptExtra: quoteBinding
      ? `  \`QA_REVIEW_NONCE: ${challenge.nonce}\``
      : `QA_REVIEW_NONCE: ${challenge.nonce}`,
    quoteBinding,
    timestamp,
    contents: [[{ type: 'text', text: finalText ?? `QA_REVIEW_RECEIPT: ${challenge.nonce}|${hash ?? fileHash}` }]],
  });
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
  challenge = false,
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
  // 既有测试模拟旧协议特性：删除 challenge 以继续走全等比对；新协议测试显式保留
  if (!challenge) await rm(path.join(feature, '_qa', 'review-challenge.json'), { force: true });
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
  await writeRaw(feature, 1, { standards: '[S-J1] 判断\n', spec: '[P-X1] 蔓延\n' });
  await writeRaw(feature, 2, { standards: '[S-J1] 已修\n' });
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

test('计划变更后对账表并列冻结原文与当前断言（QA-PROV TC09-1）', async (t) => {
  const original = singlePlan({ assertion: '原始顺序为升序' });
  const { feature } = await reviewRepo(t, { plan: original });
  const current = original
    .replace('原始顺序为升序', '当前顺序为升序且索引连续')
    .replace('- 无', '- TC01：将“原始顺序为升序”调整为“当前顺序为升序且索引连续”，补充索引约束。');
  await writeFile(path.join(feature, 'qa-plan.md'), current);
  const report = await checkFeature(feature, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.match(report.table[0].assertion, /冻结：原始顺序为升序/);
  assert.match(report.table[0].assertion, /当前：当前顺序为升序且索引连续/);
});

test('对账表完整展示 PASS、FAIL、BLOCKED 及原因（QA-PROV TC08-1）', async (t) => {
  const extraCases = [
    '### TC02: 失败场景', '- Priority: P0', '- Covers: 1', '- Seam: static', '', '#### 验证断言', '1. 恰好调用一次', '',
    '### TC03: 阻塞场景', '- Priority: P0', '- Covers: 2', '- Seam: static', '', '#### 验证断言', '1. 上游鉴权通过', '',
  ].join('\n');
  const extraResults = [
    '| TC02 | 1 | FAIL | 预期恰好1次，实际2次 | | 次数不符 |',
    '| TC03 | 1 | BLOCKED | 上游返回401 | | 等待用户授权 |',
  ].join('\n');
  const dir = await workspace(t, {
    plan: singlePlan({ extraCases, extraResults }),
    evidence: { 'evidence/run.log': runLog({ argv: ['node', '--test', TEST_FILE] }) },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'FAIL', formatReport(report));
  assert.equal(report.table.length, 3, formatReport(report));
  assert.deepEqual(report.table.map((row) => row.status), ['PASS', 'FAIL', 'BLOCKED']);
  assert.match(report.table[1].actual, /预期恰好1次，实际2次/);
  assert.match(report.table[2].actual, /上游返回401/);
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
  assert.match(output, /\| 用例-断言 \| 状态 \| 冻结断言原文 \/ 当前断言 \| 实测值、原因或绑定 \| 标注 \|/);
  assert.match(output, /\| TC01-1 \| PASS \| 移动端无横向溢出 \| scrollWidth=375 \| 非真实输入 \|/);
  assert.match(output, /\| TC02-1 \| PASS \| 两路均收到过滤条件 \| `tests\/a\.test\.mjs` › 传入过滤条件时两路均收到 \| {2}\|/);
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
    "await page.evaluate(() => localStorage.setItem('chat', '{}'));",
    "await page.evaluate(() => sessionStorage.setItem('k', 'v'));",
  ];
  for (const script of samples) {
    const dir = await scriptedWorkspace(t, { script });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'PASS', `${script}: ${formatReport(report)}`);
    assert.ok(report.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT')), script);
  }

  const clean = await scriptedWorkspace(t, {
    script: "await page.getByRole('button', { name: '提交' }).click();\nawait page.fill('input', '甲');\nconst value = await page.evaluate(() => document.body.scrollWidth);\nconst saved = await page.evaluate(() => localStorage.getItem('chat'));\nawait page.evaluate(() => localStorage.removeItem('chat'));\n",
  });
  const report = await checkFeature(clean, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  const output = formatReport(report, 'acceptance');
  assert.doesNotMatch(output, /SYNTHETIC_INPUT_IN_SCRIPT|AUTH_BYPASS_IN_SCRIPT|非真实输入/);
});

test('保存原始 fetch 后实际替换仍标注响应注入（QA-PROV TC11-3）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "await page.evaluate(() => { window.__originalFetch = window.fetch; window.fetch = async () => new Response(''); });\n",
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.startsWith('RESPONSE_INJECTION_IN_SCRIPT')), formatReport(report));
  assert.match(report.table[0].flag, /响应注入/);
});

test('动态引用不推测对账标注也不新增阻断（QA-PROV TC11-1）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "const target = './injected-helper.mjs';\nawait import(target);\n",
    extraFiles: {
      'scripts/injected-helper.mjs': "await page.evaluate(() => { window.fetch = async () => new Response(''); });\n",
    },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.equal(report.table[0].flag, '', formatReport(report));
  assert.deepEqual(codes(report), [], formatReport(report));
});

test('仅保存原始 fetch 引用不触发输入或响应注入标注（QA-PROV TC11-2）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: 'await page.evaluate(() => { window.__originalFetch = window.fetch; });\n',
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!report.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT') || note.startsWith('RESPONSE_INJECTION_IN_SCRIPT')), formatReport(report));
  assert.equal(report.table[0].flag, '', formatReport(report));
});

test('静态相对导入形成循环仍终止并合并非真实输入标注（QA-PROV TC10-2）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "import './helper-a.mjs';\n",
    extraFiles: {
      'scripts/helper-a.mjs': "import './helper-b.mjs';\n",
      'scripts/helper-b.mjs': "import './helper-a.mjs';\nawait page.evaluate(() => document.querySelector('a').click());\n",
    },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.equal(report.table.length, 1, formatReport(report));
  assert.match(report.table[0].flag, /非真实输入/);
});

test('Shell 标准输入引用的子脚本恢复响应注入标注（QA-PROV TC10-1）', async (t) => {
  const dir = await scriptedWorkspace(t, {
    scriptPath: 'scripts/run.sh',
    script: '#!/bin/bash\nDIR="$(cd "$(dirname "$0")" && pwd)"\nexec ego-browser nodejs < "$DIR/tc08-send.mjs"\n',
    extraFiles: {
      'scripts/tc08-send.mjs': "await page.evaluate(() => { window.fetch = async () => new Response(''); });\n",
    },
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.match(report.table.find((row) => row.id === 'TC01-1')?.flag ?? '', /响应注入/);
  assert.ok(report.notes.some((note) => note.includes('scripts/tc08-send.mjs') && note.includes('响应注入')), formatReport(report));
});

test('[TC01-1] window.fetch 赋值输出 RESPONSE_INJECTION_IN_SCRIPT 提示并指明脚本', async (t) => {
  const dir = await scriptedWorkspace(t, { script: 'await page.evaluate(() => { window.fetch = async () => new Response(\'\'); });\n' });
  const report = await checkFeature(dir, 'acceptance');
  const note = report.notes.find((item) => item.startsWith('RESPONSE_INJECTION_IN_SCRIPT'));
  assert.match(note ?? '', /scripts\/tc01\.mjs/, formatReport(report));
});

test('[TC01-2] Playwright 路由拦截、Cypress intercept 与 MSW 处理器均输出 RESPONSE_INJECTION_IN_SCRIPT', async (t) => {
  const samples = [
    "await page.route('**/api/chat', handler);",
    'await route.fulfill({ status: 200, body: sse });',
    "cy.intercept('POST', '/api/chat', { fixture: 'sse.txt' });",
    "const handlers = [http.get('/api/chat', () => HttpResponse.text(sse))];",
  ];
  for (const script of samples) {
    const dir = await scriptedWorkspace(t, { script });
    const report = await checkFeature(dir, 'acceptance');
    assert.ok(report.notes.some((item) => item.startsWith('RESPONSE_INJECTION_IN_SCRIPT')), `${script}: ${formatReport(report)}`);
  }
});

test('[TC01-3] 引用含响应注入脚本的用例在对账表标注「响应注入」', async (t) => {
  const dir = await scriptedWorkspace(t, { script: "await page.route('**/api/chat', handler);\n" });
  const report = await checkFeature(dir, 'acceptance');
  assert.match(report.table.find((row) => row.id === 'TC01-1')?.flag ?? '', /响应注入/);
  assert.match(formatReport(report, 'acceptance'), /\| TC01-1 \|.*响应注入/);
});

test('[TC01-4] 仅脚本含响应注入时 acceptance 结果为 PASS', async (t) => {
  const dir = await scriptedWorkspace(t, { script: 'await page.evaluate(() => { window.fetch = stub; });\n' });
  const report = await checkFeature(dir, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('[TC01-5] 同时含输入模拟与响应注入时标注两者', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "await page.evaluate(() => { window.fetch = stub; document.querySelector('a').click(); });\n",
  });
  const report = await checkFeature(dir, 'acceptance');
  const flag = report.table.find((row) => row.id === 'TC01-1')?.flag ?? '';
  assert.match(flag, /响应注入/);
  assert.match(flag, /非真实输入/);
});

test('[TC01-6] 干净脚本不输出 RESPONSE_INJECTION_IN_SCRIPT 也不标注「响应注入」', async (t) => {
  const dir = await scriptedWorkspace(t, {
    script: "const res = await fetch('/api/health');\nawait page.getByRole('button', { name: '发送' }).click();\nconst routeName = page.url();\n",
  });
  const report = await checkFeature(dir, 'acceptance');
  assert.ok(!report.notes.some((item) => item.startsWith('RESPONSE_INJECTION_IN_SCRIPT')), formatReport(report));
  assert.doesNotMatch(formatReport(report, 'acceptance'), /响应注入/);
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

test('最新一轮缺任一轴原文时 REVIEW_RAW_MISSING（TC02-1）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  await rm(path.join(feature, 'review', 'r1-spec-axis.md'));
  const missing = await checkFeature(feature, 'review');
  assert.equal(missing.status, 'BLOCKED', formatReport(missing));
  assert.match(missing.issues.find((item) => item.code === 'REVIEW_RAW_MISSING').message, /spec-axis/);

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

test('正文编号未进入分流表时不自动发现缺陷（TC02-2）', async (t) => {
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
  assert.ok(!codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
  assert.deepEqual(report.rawLines.map((row) => row.id), ['S-H1', 'P-M1']);
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
  await writeRaw(feature, 4, { standards: '[S-H1] 已修\n', spec: '[P-M1] 已修\n' });
  const fixed = await checkFeature(feature, 'review');
  assert.equal(fixed.status, 'PASS', formatReport(fixed));
});

test('改档与人工裁决以分流表为准：改档成立行 PASS，改档不成立仍 BLOCKED，复审漏列改档编号 BLOCKED', async (t) => {
  const { feature } = await reviewRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await writeRaw(feature, 1, { standards: '[S-H1] 硬\n[S-J1] 判\n', spec: '[P-W1] 误\n[P-X1] 蔓延\n' });
  await writeRaw(feature, 2, { standards: '**[S-H1]** 改档成立（引用属实）\n', spec: '- [P-W1]：改档成立\n' });
  await writeFile(reportPath, verifiedReport([
    '| S-H1 | 驳回 | 改档成立 | r1 → r2 改档成立 | | 依据 ADR-0001 |',
    '| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |',
    '| P-W1 | 转专项 | 改档成立 | r1 → r2 改档成立 | | 改动范围超出本特性 |',
    '| P-X1 | 驳回 | 驳回 | r1 | | spec US1 要求 |',
  ]));
  const accepted = await checkFeature(feature, 'review');
  assert.equal(accepted.status, 'PASS', formatReport(accepted));

  // 人工裁决只写入理由列，不改变机器结果
  await writeFile(reportPath, verifiedReport([
    '| S-H1 | 本次修 | 改档不成立 | r1 → r2 改档不成立 | | 人工裁定接受现状 |',
    '| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |',
    '| P-W1 | 转专项 | 修错 | r1 → r2 修错 | | 人工裁定转专项 |',
    '| P-X1 | 驳回 | 驳回 | r1 | | spec US1 要求 |',
  ]));
  const decided = await checkFeature(feature, 'review');
  assert.equal(decided.status, 'BLOCKED', formatReport(decided));
  assert.match(decided.issues.find((item) => item.code === 'UNRESOLVED_FINDINGS').message, /S-H1（改档不成立）.*P-W1（修错）/);

  // 复审漏列改档编号：BLOCKED；S-J、P-X 不要求复核
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 改档成立\n' });
  await writeFile(reportPath, verifiedReport([
    '| S-H1 | 驳回 | 驳回 | r1 | | 依据 ADR-0001 |',
    '| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |',
    '| P-W1 | 转专项 | 改档成立 | r1 → r2 改档成立 | | 改动范围超出本特性 |',
    '| P-X1 | 驳回 | 驳回 | r1 | | spec US1 要求 |',
  ]));
  const missed = await checkFeature(feature, 'review');
  assert.equal(missed.status, 'BLOCKED', formatReport(missed));
  const message = missed.issues.find((item) => item.code === 'FINDING_NOT_REREVIEWED').message;
  assert.match(message, /S-H1/);
  assert.doesNotMatch(message, /S-J1|P-X1|P-W1/);
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
async function writeSubagent(configDir, repoDir, {
  name = 'agent-1',
  model,
  contents,
  binding,
  promptExtra = '',
  quoteBinding = false,
  timestamp = new Date().toISOString(),
}) {
  const project = await projectDir(configDir, repoDir);
  const subagents = path.join(project, 'session-1', 'subagents');
  await mkdir(subagents, { recursive: true });
  const bindingLine = binding ? `QA_REVIEW_BINDING: ${binding}` : '';
  const prompt = ['审查', quoteBinding ? `  \`${bindingLine}\`` : bindingLine, promptExtra].filter(Boolean).join('\n');
  const lines = [{ type: 'user', message: { content: prompt } }, ...contents.map((content) => ({ type: 'assistant', timestamp, message: { model, content } }))];
  const file = path.join(subagents, `${name}.jsonl`);
  await writeFile(file, `${lines.map((line) => JSON.stringify(line)).join('\n')}\n`);
  await writeFile(path.join(subagents, `${name}.meta.json`), JSON.stringify({ model }));
  return file;
}

async function writeTranscript(configDir, repoDir, { text, model, sessionModel = 'claude-opus-5-5' }) {
  await writeMainSession(configDir, repoDir, { sessionModel });
  return writeSubagent(configDir, repoDir, { model, contents: [[{ type: 'thinking', thinking: '…' }, { type: 'text', text }]] });
}

test('转专项后在本特性修好可写当前本次修已修并保留轨迹（QA-PROV TC16-1）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 实现有误\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 改档成立\n' });
  await writeRaw(feature, 3, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 转专项 → r2 本次修 → r3 已修 | 静态：后续决策改为当前修复 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('INVALID_DISPOSITION'), formatReport(report));
  assert.ok(!codes(report).includes('UNRESOLVED_FINDINGS'), formatReport(report));
});

test('最新审查返回早于当前 collect 时不得通过（QA-PROV TC13-3）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  for (const [axis, text] of [['standards', '规范轴：无发现'], ['spec', '需求轴：无发现']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-stale`, model: 'claude-opus-5-5', binding: `.scratch/feature|r1|${axis}`,
      timestamp: '2000-01-01T00:00:00.000Z', contents: [[{ type: 'text', text }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_STALE'), formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('真实本次修编号没有后续复审仍被拦截（QA-PROV TC14-3）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '- [P-W1] 后续真实缺陷的编号示例\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '### [P-W1] 真实缺陷\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r2 | 静态：尚无复审 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('FINDING_NOT_REREVIEWED'), formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'FINDING_NOT_REREVIEWED')?.message ?? '', /P-W1/);
});

test('分流表引用不存在的编号只提示删除不制造复审（QA-PROV TC14-2）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W9 | 本次修 | 已修 | r1 → r2 已修 | 静态：无原文依据 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_TRIAGE_UNKNOWN'), formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'REVIEW_TRIAGE_UNKNOWN')?.hint ?? '', /删除/);
  assert.ok(!codes(report).includes('FINDING_NOT_REREVIEWED'), formatReport(report));
});

test('Markdown 包裹的占位编号与无新发现不产生复审（QA-PROV TC14-1）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无新发现\n', spec: '- [P-W4] 仅作后续编号示例，不对应实际缺陷；本轮无新发现\n' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
  assert.ok(!codes(report).includes('FINDING_NOT_REREVIEWED'), formatReport(report));
});

test('tree 过期仍阻断且既有不重跑理由可豁免（QA-PROV TC13-2）', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  await writeFile(path.join(dir, 'tracked.txt'), '行为变化\n');
  const stale = await checkFeature(feature, 'acceptance');
  assert.ok(codes(stale).includes('STALE_EVIDENCE'), formatReport(stale));
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, (await readFile(planPath, 'utf8')).replace(`${BINDING} | |`, `${BINDING} | 不重跑：仅文档变化 |`));
  const exempt = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(exempt).includes('STALE_EVIDENCE'), formatReport(exempt));
  assert.match(exempt.table[0].flag, /不重跑：仅文档变化/);
});

test('日志 started 早于缺陷真实返回时修复验证不通过（QA-PROV TC13-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '- [P-W1] 后续真实缺陷的编号示例\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 顺序断言不成立\n' });
  await writeRaw(feature, 3, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r2 → r3 已修 | `evidence/run.log` | |',
  ]));
  const future = new Date('2099-01-01T00:00:00.000Z');
  await utimes(path.join(feature, 'evidence', 'run.log'), future, future);
  await writeMainSession(configDir, dir);
  for (const [axis, text] of [['standards', '无发现'], ['spec', '- [P-W1] 后续真实缺陷的编号示例']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r1`, model: 'claude-opus-5-5', binding: `.scratch/feature|r1|${axis}`,
      timestamp: '2026-01-01T00:00:00.000Z', contents: [[{ type: 'text', text }]],
    });
  }
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W1] 顺序断言不成立']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r2`, model: 'claude-opus-5-5', binding: `.scratch/feature|r2|${axis}`,
      timestamp: '2099-01-01T00:00:00.000Z', contents: [[{ type: 'text', text }]],
    });
  }
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W1] 已修']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r3`, model: 'claude-opus-5-5', binding: `.scratch/feature|r3|${axis}`,
      promptExtra: '待复核：[P-W1]', contents: [[{ type: 'text', text }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS', formatReport(report));
  assert.ok(codes(report).includes('FIX_UNVERIFIED'), formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'FIX_UNVERIFIED')?.message ?? '', /started/);
});

test('事件时间正确时文件 mtime 倒挂不影响修复验证（QA-PROV TC12-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 顺序断言不成立\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | `evidence/run.log` | |',
  ]));
  const old = new Date('2020-01-01T00:00:00.000Z');
  await utimes(path.join(feature, 'evidence', 'run.log'), old, old);
  for (const name of ['r2-standards.md', 'r2-spec-axis.md']) await utimes(path.join(feature, 'review', name), old, old);
  await writeMainSession(configDir, dir);
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W1] 顺序断言不成立']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r1`, model: 'claude-opus-5-5', binding: `.scratch/feature|r1|${axis}`,
      timestamp: '2020-01-01T00:00:00.000Z', contents: [[{ type: 'text', text }]],
    });
  }
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W1] 已修']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r2`, model: 'claude-opus-5-5', binding: `.scratch/feature|r2|${axis}`,
      promptExtra: '待复核：[P-W1]', contents: [[{ type: 'text', text }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('FIX_UNVERIFIED'), formatReport(report));
});

test('同轮原文可按真实最终返回逐字纠偏（QA-PROV TC07-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  const specPath = path.join(feature, 'review', 'r1-spec-axis.md');
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '主代理漏改了结论\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|spec',
    contents: [[{ type: 'text', text: '需求轴：无发现' }]],
  });
  const mismatch = await checkFeature(feature, 'review');
  assert.ok(codes(mismatch).includes('REVIEW_SOURCE_MISMATCH'), formatReport(mismatch));
  await writeFile(specPath, '需求轴：无发现\n');
  const corrected = await checkFeature(feature, 'review');
  assert.equal(corrected.status, 'PASS', formatReport(corrected));
  assert.equal(await readFile(specPath, 'utf8'), '需求轴：无发现\n');
  await assert.rejects(readFile(path.join(feature, 'review', 'r1-spec-axis.corrected.md'), 'utf8'), { code: 'ENOENT' });
  await assert.rejects(readFile(path.join(feature, 'review', 'r2-spec-axis.md'), 'utf8'), { code: 'ENOENT' });
});

test('无关会话的相同文本不能替代本轮来源（QA-PROV TC05-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-other-feature', model: 'claude-opus-5-5', binding: '.scratch/other-feature|r1|spec',
    contents: [[{ type: 'text', text: '需求轴：无发现' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  const note = report.notes.find((item) => item.includes('来源未核验')) ?? '';
  assert.match(note, /review\/r1-spec-axis\.md/);
  assert.doesNotMatch(note, /r1-standards/);
});

test('两轴最终返回经确定性归一后一致时来源核验通过（QA-PROV TC01-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, {
    standards: '<!-- 主代理复制时保留的注释 -->\n规范轴：&lt;无发现&gt;\n',
    spec: '需求轴：\n  无发现\n',
  });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：<无发现>' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|spec',
    contents: [[{ type: 'text', text: '需求轴： 无发现' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
  assert.ok(!report.notes.some((note) => note.includes('来源未核验')), formatReport(report));
});

test('主代理与子代理模型不同不输出任何模型提示（QA-PROV TC06-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir, { sessionModel: 'claude-opus-5-5' });
  await writeSubagent(configDir, dir, {
    name: 'agent-standards', model: 'claude-haiku-5.5', binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec', model: 'gpt-5.6-sol', binding: '.scratch/feature|r1|spec',
    contents: [[{ type: 'text', text: '需求轴：无发现' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!report.notes.some((note) => /模型|claude-haiku|gpt-5\.6/.test(note)), report.notes.join('\n'));
});

test('已绑定子代理没有最终返回时保持待独立审查（QA-PROV TC04-2）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec-without-return', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|spec', contents: [],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_MISSING'), formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('无法绑定转录时只标来源未核验（QA-PROV TC04-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-unbound', model: 'claude-opus-5-5',
    contents: [[{ type: 'text', text: '规范轴：无发现\n需求轴：无发现' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('来源未核验')), formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('较长编号不能冒充待复核短编号（QA-PROV TC03-3）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 顺序断言不成立\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：测试夹具 | |',
  ]));
  await writeMainSession(configDir, dir);
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W1] 已修']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r2`, model: 'claude-opus-5-5', binding: `.scratch/feature|r2|${axis}`,
      promptExtra: '待复核：[P-W10]', contents: [[{ type: 'text', text }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_REINPUT_MISSING'), formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'REVIEW_REINPUT_MISSING')?.message ?? '', /P-W1/);
});

test('历史已解决与当轮新发现不误报复审输入缺失（QA-PROV TC03-2）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 已解决历史\n[P-W3] 未解决历史\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n[P-W2] 当轮新发现\n[P-W3] 未修\n' });
  await writeRaw(feature, 3, { standards: '无发现\n', spec: '[P-W2] 已修\n[P-W3] 已修\n[P-W4] 当轮新发现\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：历史已解决 | |',
    '| P-W2 | 本次修 | 已修 | r2 → r3 已修 | 静态：当轮新发现 | |',
    '| P-W3 | 本次修 | 已修 | r1 → r2 未修 → r3 已修 | 静态：更早未解决 | |',
    '| P-W4 | 本次修 |  | r3 | |',
  ]));
  await writeMainSession(configDir, dir);
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W2] 已修\n[P-W3] 已修\n[P-W4] 当轮新发现']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r3`, model: 'claude-opus-5-5', binding: `.scratch/feature|r3|${axis}`,
      promptExtra: '待复核：[P-W2]、[P-W3]', contents: [[{ type: 'text', text }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_REINPUT_MISSING'), formatReport(report));

  await writeSubagent(configDir, dir, {
    name: 'agent-spec-r3', model: 'claude-opus-5-5', binding: '.scratch/feature|r3|spec',
    promptExtra: '待复核：[P-W2]', contents: [[{ type: 'text', text: '[P-W2] 已修\n[P-W3] 已修\n[P-W4] 当轮新发现' }]],
  });
  const missingOlder = await checkFeature(feature, 'review');
  assert.notEqual(missingOlder.status, 'PASS', formatReport(missingOlder));
  assert.ok(codes(missingOlder).includes('REVIEW_REINPUT_MISSING'), formatReport(missingOlder));
  assert.match(missingOlder.issues.find((item) => item.code === 'REVIEW_REINPUT_MISSING')?.message ?? '', /P-W3/);
});

test('r4 使用当前轮之前最近一次处置判断历史已解决（QA-PROV TC03-4）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 历史缺陷\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n[P-W2] 新缺陷\n' });
  await writeRaw(feature, 3, { standards: '无发现\n', spec: '[P-W2] 未修\n' });
  await writeRaw(feature, 4, { standards: '无发现\n', spec: '[P-W2] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：历史已解决 | |',
    '| P-W2 | 本次修 | 已修 | r2 → r3 未修 → r4 已修 | 静态：后续修复 | |',
  ]));
  await writeMainSession(configDir, dir);
  for (const [axis, text] of [['standards', '无发现'], ['spec', '[P-W2] 已修']]) {
    await writeSubagent(configDir, dir, {
      name: `agent-${axis}-r4`, model: 'claude-opus-5-5', binding: `.scratch/feature|r4|${axis}`,
      promptExtra: '待复核：[P-W2]', contents: [[{ type: 'text', text }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_REINPUT_MISSING'), formatReport(report));
});

test('复审输入缺少待复核编号时 review 不通过（QA-PROV TC03-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 顺序断言不成立\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：测试夹具 | |',
  ]));
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards-r2', model: 'claude-opus-5-5', binding: '.scratch/feature|r2|standards',
    contents: [[{ type: 'text', text: '无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec-r2', model: 'claude-opus-5-5', binding: '.scratch/feature|r2|spec',
    contents: [[{ type: 'text', text: '[P-W1] 已修' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_REINPUT_MISSING'), formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'REVIEW_REINPUT_MISSING')?.message ?? '', /P-W1/);
});

test('已定位最终返回的原文失真时 review 不通过（QA-PROV TC02-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '主代理改写：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec', model: 'claude-opus-5-5', binding: '.scratch/feature|r1|spec',
    contents: [[{ type: 'text', text: '子代理实际：无发现' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'REVIEW_SOURCE_MISMATCH')?.message ?? '', /review\/r1-spec-axis\.md/);
});

test('未绑定转录不含原文时输出来源未核验 NOTE，状态不变（TC04-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeTranscript(configDir, dir, { text: '规范轴：无发现', model: 'claude-opus-5-5' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  const notes = report.notes.filter((note) => note.startsWith('转录核验'));
  assert.equal(notes.length, 1, formatReport(report));
  assert.match(notes[0], /来源未核验/);
});

test('子代理模型与主会话不一致时不输出模型提示（TC04-2）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '同一份原文：无发现\n', spec: '同一份原文：无发现\n' });
  await writeTranscript(configDir, dir, { text: '同一份原文：无发现', model: 'claude-haiku-5.5' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  const notes = report.notes.filter((note) => note.startsWith('转录核验'));
  assert.ok(notes.length >= 1, formatReport(report));
  assert.ok(notes.every((note) => !/模型|claude-haiku-5\.5/.test(note)), notes.join('\n'));
});

test('找不到会话目录时提示来源未核验（TC04-3）', async (t) => {
  await useConfigDir(t);
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.match(formatReport(report, 'review'), /来源未核验/);
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

test('原文含规范编号时不报 REVIEW_RAW_UNNUMBERED（TC01-3）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-H1] 硬违规\n', spec: '无发现\n' });
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_RAW_UNNUMBERED'), formatReport(report));
  assert.ok(!codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
});

test('只有早期轮原文缺编号时不报 REVIEW_RAW_UNNUMBERED（TC01-4）', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-01] 旧格式\n', spec: '[P-01] 旧格式\n' });
  await writeRaw(feature, 2);
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_RAW_UNNUMBERED'), formatReport(report));
});

test('只用最终返回匹配，SendMessage 最终返回可用（TC02-1）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards',
    model: 'claude-opus-5-5',
    binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '中间草稿' }], [{ type: 'text', text: '规范轴：无发现' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec',
    model: 'claude-opus-5-5',
    binding: '.scratch/feature|r1|spec',
    contents: [[{ type: 'text', text: '中间草稿' }], [{ type: 'tool_use', id: 'toolu_2', name: 'SendMessage', input: { to: 'main', message: '需求轴：无发现' } }]],
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

test('会话目录存在但审查包之后没有子代理转录时提示来源未核验（TC02-3）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeMainSession(configDir, dir);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('来源未核验')), formatReport(report));

  // 审查包之前的子代理转录不算
  const old = new Date(Date.now() - 3_600_000);
  const file = await writeSubagent(configDir, dir, { model: 'claude-opus-5-5', contents: [[{ type: 'text', text: '无发现' }]] });
  await utimes(file, old, old);
  const stale = await checkFeature(feature, 'review');
  assert.ok(stale.notes.some((note) => note.includes('来源未核验')), formatReport(stale));
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

/** r1 提出发现、r2 写复审原文，分流表使用指定表头与行；返回特性目录 */
async function rereviewRepo(t, { r1 = {}, r2, rows, header } = {}) {
  const { feature } = await reviewRepo(t);
  const old = new Date(Date.now() - 600_000);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '无发现\n', ...r1 });
  if (r2) {
    for (const name of ['r1-standards.md', 'r1-spec-axis.md']) await utimes(path.join(feature, 'review', name), old, old);
    await writeRaw(feature, 2, { standards: '无发现\n', spec: '无发现\n', ...r2 });
  }
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport(rows, header));
  return feature;
}

const STATIC_FIXED = '| P-W1 | 本次修 | 已修 | r1 → r2 | 静态：改文案 | |';

test('[TC02-1] 原文加粗写作 **[P-W1] 已修** 时不报 UNRESOLVED_FINDINGS', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n' },
    r2: { spec: '# Spec 轴审查报告(Round 2)\n\n**[P-W1] 已修**\n新版截图已解除加载态。\n' },
    rows: [STATIC_FIXED],
  });
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('UNRESOLVED_FINDINGS'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('[TC02-2] 原文其他写法（加粗编号、冒号、反引号、带限定语）均不报 UNRESOLVED_FINDINGS', async (t) => {
  for (const line of ['**[P-W1]** 已修', '[P-W1]：已修', '[P-W1] `已修`', '[P-W1] 已修（有残留）']) {
    const feature = await rereviewRepo(t, { r1: { spec: '[P-W1] 实现有误\n' }, r2: { spec: `${line}\n` }, rows: [STATIC_FIXED] });
    const report = await checkFeature(feature, 'review');
    assert.ok(!codes(report).includes('UNRESOLVED_FINDINGS'), `${line}: ${formatReport(report)}`);
  }
});

test('[TC02-3] 原文写未修而分流表写已修时不报原文状态词比对问题', async (t) => {
  const feature = await rereviewRepo(t, { r1: { spec: '[P-W1] 实现有误\n' }, r2: { spec: '[P-W1] 未修\n' }, rows: [STATIC_FIXED] });
  const report = await checkFeature(feature, 'review');
  assert.doesNotMatch(formatReport(report), /原文最后一次状态词|与审查原文.*不一致/);
  assert.ok(!codes(report).includes('UNRESOLVED_FINDINGS'), formatReport(report));
});

function rereviewIssue(report) {
  return report.issues.find((item) => item.code === 'FINDING_NOT_REREVIEWED');
}

test('[TC03-1] 本次修编号未出现在下一轮 Spec 原文时 BLOCKED 并列出该编号', async (t) => {
  const feature = await rereviewRepo(t, { r1: { spec: '[P-W1] 实现有误\n' }, r2: { spec: '无发现\n' }, rows: [STATIC_FIXED] });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(rereviewIssue(report)?.message ?? '', /P-W1/);
});

test('[TC03-2] 下一轮 Spec 原文含该编号（任意后续文字）时不报复审缺失', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n' },
    r2: { spec: '- 关于 **[P-W1]**：看过了，截图仍有遮挡但不影响结论\n' },
    rows: [STATIC_FIXED],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(rereviewIssue(report), undefined, formatReport(report));
});

test('[TC03-3] 被驳回的 P-M 编号未出现在下一轮 Spec 原文时 BLOCKED', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-M1] 缺失\n' },
    r2: { spec: '无发现\n' },
    rows: ['| P-M1 | 驳回 | 驳回 | r1 | | 依据 ADR-0001 |'],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(rereviewIssue(report)?.message ?? '', /P-M1/);
});

test('[TC03-4] S-H 编号只出现在下一轮 Spec 原文、不在 Standards 原文时 BLOCKED', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { standards: '[S-H1] 硬违规\n' },
    r2: { standards: '无发现\n', spec: '另见 [S-H1] 已修\n' },
    rows: ['| S-H1 | 本次修 | 已修 | r1 → r2 | 静态：改注释 | |'],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(rereviewIssue(report)?.message ?? '', /S-H1/);
});

test('[TC03-5] 只有 r1 原文、无待复审编号时不报复审缺失', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { standards: '[S-J1] 判断\n', spec: '[P-X1] 蔓延\n' },
    rows: ['| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |', '| P-X1 | 驳回 | 驳回 | r1 | | spec US1 要求 |'],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(rereviewIssue(report), undefined, formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('[TC03-7] 分流表有待复审编号但尚无复审轮时 BLOCKED 并注明尚无复审轮', async (t) => {
  const feature = await rereviewRepo(t, { r1: { spec: '[P-W1] 实现有误\n' }, rows: [STATIC_FIXED] });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(rereviewIssue(report)?.message ?? '', /P-W1（尚无复审轮）/);
});

test('[TC03-6] 被驳回的 S-J 编号未出现在下一轮 Standards 原文时不报复审缺失', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { standards: '[S-J1] 判断\n', spec: '[P-W1] 实现有误\n' },
    r2: { spec: '[P-W1] 已修\n' },
    rows: ['| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |', STATIC_FIXED],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(rereviewIssue(report), undefined, formatReport(report));
});

test('[TC04-1] 处置状态为未修时 BLOCKED UNRESOLVED_FINDINGS 并列出该编号', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n' },
    r2: { spec: '[P-W1] 未修\n' },
    rows: ['| P-W1 | 本次修 | 未修 | r1 → r2 未修 | | |'],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'UNRESOLVED_FINDINGS')?.message ?? '', /P-W1（未修）/);
});

test('[TC04-2] 档位本次修、处置状态为空时 BLOCKED UNRESOLVED_FINDINGS 并列出该编号', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n' },
    r2: { spec: '[P-W1] 未修\n' },
    rows: ['| P-W1 | 本次修 |  | r1 | | |'],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'UNRESOLVED_FINDINGS')?.message ?? '', /P-W1（未填）/);
});

test('[TC04-3] 处置状态为枚举之外的值时 FAIL 并指出编号与非法值', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n' },
    r2: { spec: '[P-W1] 已修\n' },
    rows: ['| P-W1 | 本次修 | 基本修好 | r1 → r2 | 静态：改文案 | |'],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'INVALID_DISPOSITION')?.message ?? '', /P-W1.*基本修好/);
});

test('[TC04-4] 表头为「处置状态」或「最终状态」时结果与问题码相同', async (t) => {
  const outcomes = [];
  for (const name of ['处置状态', '最终状态']) {
    const feature = await rereviewRepo(t, {
      r1: { spec: '[P-W1] 实现有误\n[P-M1] 缺失\n' },
      r2: { spec: '[P-W1] 已修\n[P-M1] 未修\n' },
      header: `| 编号 | 档位 | ${name} | 轮次轨迹 | 验证证据 | 理由 |`,
      rows: [STATIC_FIXED, '| P-M1 | 本次修 | 未修 | r1 → r2 未修 | | |'],
    });
    const report = await checkFeature(feature, 'review');
    outcomes.push({ status: report.status, codes: codes(report).sort() });
  }
  assert.equal(outcomes[0].status, 'BLOCKED');
  assert.deepEqual(outcomes[0], outcomes[1]);
});

test('[TC05-1] review 输出「原文核对」段，每个编号一行含处置状态与原文位置', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { standards: '[S-J1] 判断\n', spec: '[P-W1] 实现有误\n' },
    r2: { spec: '首行说明\n[P-W1] 已修\n' },
    rows: ['| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |', STATIC_FIXED],
  });
  const output = formatReport(await checkFeature(feature, 'review'), 'review');
  assert.match(output, /原文核对/);
  assert.match(output, /P-W1.*已修.*review\/r2-spec-axis\.md:2/);
  assert.match(output, /S-J1.*驳回.*review\/r1-standards\.md:1/);
});

test('[TC05-2] 原文行过长时截断并带截断标记，短行原样输出', async (t) => {
  const long = `[P-W1] 已修。${'截图与对账表逐行核对完毕，'.repeat(12)}结尾不应出现`;
  const feature = await rereviewRepo(t, {
    r1: { standards: '[S-J1] 短行原样\n', spec: '[P-W1] 实现有误\n' },
    r2: { spec: `${long}\n` },
    rows: ['| S-J1 | 驳回 | 驳回 | r1 | | 成本大于收益 |', STATIC_FIXED],
  });
  const output = formatReport(await checkFeature(feature, 'review'), 'review');
  const line = output.split('\n').find((item) => item.includes('P-W1') && item.includes('r2-spec-axis.md'));
  assert.match(line ?? '', /…（截断）/);
  assert.doesNotMatch(line ?? '', /结尾不应出现/);
  assert.match(output, /\[S-J1\] 短行原样(?!…)/);
});

test('[TC05-3] 「原文核对」段首注明仅供人工核对、非结论', async (t) => {
  const feature = await rereviewRepo(t, { r1: { spec: '[P-W1] 实现有误\n' }, r2: { spec: '[P-W1] 已修\n' }, rows: [STATIC_FIXED] });
  const output = formatReport(await checkFeature(feature, 'review'), 'review');
  assert.match(output, /原文核对[^\n]*仅供人工核对，非结论/);
});

test('[TC06-1] 未列入分流表的正文编号不影响已列编号复审', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n[P-W2] 漏列\n' },
    r2: { spec: '[P-W1] 已修\n' },
    rows: [STATIC_FIXED],
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
});

test('[TC06-2] 无可靠事件时间时证据 mtime 早于原文不报 FIX_UNVERIFIED', async (t) => {
  const feature = await rereviewRepo(t, {
    r1: { spec: '[P-W1] 实现有误\n' },
    r2: { spec: '[P-W1] 已修\n' },
    rows: ['| P-W1 | 本次修 | 已修 | r1 → r2 | `evidence/fix-old.log` | |'],
  });
  await fixLog(feature, 'fix-old.log', { time: new Date(Date.now() - 3_600_000) });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('FIX_UNVERIFIED'), formatReport(report));
});

/** r1 提出 P-W1，r2 复审已修；返回带两轮原文的特性目录 */
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

test('截图 mtime 早于或晚于原文均不单独决定修复验证（TC03-4）', async (t) => {
  const { feature } = await fixedRepo(t);
  const reportPath = path.join(feature, 'review-report.md');
  await mkdir(path.join(feature, 'screenshots'), { recursive: true });
  await writeFile(path.join(feature, 'screenshots', 'fix-old.png'), '旧截图');
  const older = new Date(Date.now() - 3_600_000);
  await utimes(path.join(feature, 'screenshots', 'fix-old.png'), older, older);
  await writeFile(reportPath, verifiedReport(['| P-W1 | 本次修 | 已修 | r1 → r2 已修 | `screenshots/fix-old.png` | |']));
  const stale = await checkFeature(feature, 'review');
  assert.ok(!codes(stale).includes('FIX_UNVERIFIED'), formatReport(stale));

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

test('TC03-1 密码扫描不误伤 PASS 变量名，真实凭据仍拦截', async (t) => {
  const clean = await scanReport(t, 'const PASS_LABEL = "PASS";\nconst passCount = 1;\n');
  assert.ok(!codes(clean).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(clean));
  for (const script of ['const password = "secret123";\n', 'const passwd = "s3cret";\n', 'const pwd = "s3cret";\n']) {
    const report = await scanReport(t, script);
    assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), `${script}: ${formatReport(report)}`);
  }
});

test('TC03-2 注释剥离不误报，字符串内登录接口仍拦截', async (t) => {
  const commented = await scanReport(t, '// password = "secret"\n// el.click()\nconst x = 1;\n');
  assert.ok(!codes(commented).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(commented));
  assert.ok(!commented.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT')), formatReport(commented));
  const inString = await scanReport(t, 'await page.goto("http://localhost:3030/api/login");\n');
  assert.ok(codes(inString).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(inString));
  // 正则字面量不得被误判为行注释或块注释，其后的登录接口仍应被拦截
  const afterRegex = await scanReport(t, 'const slashes = /\\/\\//;\nconst block = /\\/*/;\nawait fetch("/api/login");\n');
  assert.ok(codes(afterRegex).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(afterRegex));
});

test('TC09-2 JavaScript 私有字段不按 Python 注释剥离', async (t) => {
  const privateField = await scanReport(t, 'class Login { #password = "secret"; }\n');
  assert.ok(codes(privateField).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(privateField));

  const dir = await scriptedWorkspace(t, { extraFiles: { 'scripts/helper.py': '# password = "secret"\n' } });
  const python = await checkFeature(dir, 'acceptance');
  assert.ok(!codes(python).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(python));
});

test('TC03-3 inPageSegment 跳过字符串与正则内括号不提前截断', async (t) => {
  for (const script of [
    "await page.evaluate(() => { const s = 'a)b'; document.querySelector('#x').click(); });\n",
    "await page.evaluate(() => { const re = /\\)/; document.querySelector('#x').click(); });\n",
  ]) {
    const report = await scanReport(t, script);
    assert.ok(report.notes.some((note) => note.startsWith('SYNTHETIC_INPUT_IN_SCRIPT')), `${script}: ${formatReport(report)}`);
  }
});

test('TC03-4 已闭环轨迹的旧编号不再误报缺少复审必交编号', async (t) => {
  const { dir, feature } = await reviewRepo(t, { challenge: true });
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-M1] 缺失\n' });
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-M1] 未修\n' });
  await writeRaw(feature, 3, { standards: '无发现\n', spec: '[P-M1] 已修\n' });
  await writeRaw(feature, 4, { standards: '无发现\n', spec: '[P-M1] 已修（维持）\n' });
  await writeRaw(feature, 5, { standards: '无发现\n', spec: '[P-M1] 已修（维持）\n' });
  const collected = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature, '--round', 'r5'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(collected.status, 0, collected.stderr);
  const challenge = await readChallenge(feature);
  await writeReceipts(feature, { round: 'r5', nonce: challenge.nonce });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-M1 | 本次修 | 已修 | r3 发现 → 本次修 | 静态：测试 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.ok(!report.notes.some((note) => note.includes('缺少复审必交编号') && note.includes('P-M1')), formatReport(report));
});

test('TC03-5 不同路径但内容相同的截图按 SHARED_SCREENSHOT 拦截', async (t) => {
  const extraCases = [
    '### TC02: 第二个浏览器场景',
    '- Priority: P0',
    '- Covers: 2',
    '- Seam: browser',
    '',
    '#### 验证断言',
    '1. 页面真实可见',
    '',
  ].join('\n');
  for (const same of [true, false]) {
    const plan = singlePlan({
      seam: 'browser',
      evidence: '`evidence/a.png`、`evidence/browser.log`',
      extraCases,
      extraResults: '| TC02 | 1 | PASS | `evidence/b.png`、`evidence/browser.log` | |',
    });
    const dir = await workspace(t, {
      plan,
      evidence: {
        'evidence/a.png': '相同截图内容',
        'evidence/b.png': same ? '相同截图内容' : '不同截图内容',
        'scripts/browser.mjs': '// 浏览器过程脚本\n',
      },
    });
    await writeFile(path.join(dir, 'evidence', 'browser.log'), runLog({
      label: 'browser',
      argv: ['node', path.join(dir, 'scripts', 'browser.mjs')],
      body: '[TC01-1] PASS 实测：标题可见\n[TC02-1] PASS 实测：标题可见',
    }));
    const report = await checkFeature(dir, 'acceptance');
    if (same) {
      assert.equal(report.status, 'FAIL', formatReport(report));
      assert.ok(codes(report).includes('SHARED_SCREENSHOT'), formatReport(report));
    } else {
      assert.equal(report.status, 'PASS', formatReport(report));
    }
  }
});

test('脚本内密码字面量 AUTH_BYPASS_IN_SCRIPT，空串、环境变量或 PASS 变量名不报（TC04-1）', async (t) => {
  for (const script of ["await page.fill('#pwd', 'x');\nconst body = { username: 'e2e', password: 'LoopPass123!' };", 'const opts = { "passwd": "secret" };']) {
    const report = await scanReport(t, script);
    assert.equal(report.status, 'FAIL', `${script}: ${formatReport(report)}`);
    assert.match(bypassIssue(report)?.message ?? '', /scripts\/helper\.mjs.*密码/, script);
  }
  for (const script of ["const body = { password: '' };", 'const password = process.env.QA_PASSWORD;', "const passwordInput = page.getByLabel('密码');", "const TEST_PASS = 'x';"]) {
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
  assert.match(rows[0], /\| TC01-1 \| PASS \| 第一条断言 \|/);
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

// ADR-0042：证据前置拦截与审查降噪

/** 第二个 unit 用例，与 TC01 绑定同一测试，共用 run 日志 */
const SECOND_CASE = ['### TC02: 第二个示例', '- Priority: P0', '- Covers: 1', '- Seam: unit', '', '#### 验证断言', '1. 第二条断言', ''].join('\n');

function rowNote(plan, caseId, note) {
  return plan.replace(new RegExp(`(\\| ${caseId} \\| 1 \\| PASS \\| [^\\n]*\\| )\\|$`, 'm'), `$1${note} |`);
}

test('[HR-TC01-1] 行为证据 tree 过期且无豁免时 acceptance 报 STALE_EVIDENCE', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  await writeFile(path.join(dir, 'tracked.txt'), '日志生成后的代码修改\n');
  const report = await checkFeature(feature, 'acceptance');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.match(report.issues.find((item) => item.code === 'STALE_EVIDENCE')?.message ?? '', /TC01/);
});

test('[HR-TC01-2] 备注写「不重跑：<理由>」时放行并在对账表标注', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, rowNote(await readFile(planPath, 'utf8'), 'TC01', '不重跑：仅改注释'));
  await writeFile(path.join(dir, 'tracked.txt'), '日志生成后的代码修改\n');
  const run = acceptanceCli(dir, feature);
  assert.doesNotMatch(run.stdout, /STALE_EVIDENCE/, run.stdout);
  const saved = await readFile(path.join(feature, '_qa', 'reconciliation.md'), 'utf8');
  assert.match(saved, /\| TC01-1 \|.*不重跑：仅改注释 \|/);
});

test('[HR-TC01-3] 「不重跑：」后无理由时仍报 STALE_EVIDENCE', async (t) => {
  const { dir, feature } = await reviewRepo(t);
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, rowNote(await readFile(planPath, 'utf8'), 'TC01', '不重跑：'));
  await writeFile(path.join(dir, 'tracked.txt'), '日志生成后的代码修改\n');
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('STALE_EVIDENCE'), formatReport(report));
});

test('[HR-TC01-4] 两行过期只有一行豁免时只列出未豁免的 TC', async (t) => {
  const plan = singlePlan({
    extraCases: SECOND_CASE,
    extraResults: `| TC02 | 1 | PASS | \`evidence/run.log\` | ${BINDING} | |`,
  });
  const { dir, feature } = await reviewRepo(t, { plan });
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, rowNote(await readFile(planPath, 'utf8'), 'TC02', '不重跑：仅改注释'));
  await writeFile(path.join(dir, 'tracked.txt'), '日志生成后的代码修改\n');
  const report = await checkFeature(feature, 'acceptance');
  const message = report.issues.find((item) => item.code === 'STALE_EVIDENCE')?.message ?? '';
  assert.match(message, /TC01/, formatReport(report));
  assert.doesNotMatch(message, /TC02/);
});

test('[HR-TC01-5] 证据 tree 与当前一致时不报 STALE_EVIDENCE', async (t) => {
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('STALE_EVIDENCE'));
});

test('[HR-TC02-1] 编号后紧跟无发现的三种写法不产生待分流编号', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { spec: '[P-M3]:无发现\n[P-X1]：无发现\n**[P-M2]** 无发现\n' });
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
});

test('[HR-TC02-2] 正文编号未进表时不自动发现缺陷', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { spec: '[P-M3]:无发现\n[P-W1] 截图被遮挡\n' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('FINDING_NOT_TRIAGED'), formatReport(report));
});

test('[HR-TC03-2] 未进表的 S-J 不输出默认驳回清单', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '[S-J1] 判断一\n[S-J2] 判断二\n' });
  const report = await checkFeature(feature, 'review');
  assert.doesNotMatch(formatReport(report, 'review'), /默认驳回 S-J/);
});

test('[HR-TC04-1] 原文首行注释与实体转义差异不触发来源失真', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  const body = '比较 a < b && c > d：无发现';
  await writeRaw(feature, 1, { standards: `<!-- 主代理注：说明 -->\n\n${body}\n`, spec: `${body}\n` });
  await writeMainSession(configDir, dir);
  for (const [axis, name] of [['standards', 'agent-standards'], ['spec', 'agent-spec']]) {
    await writeSubagent(configDir, dir, {
      name, model: 'claude-opus-5-5', binding: `.scratch/feature|r1|${axis}`,
      contents: [[{ type: 'text', text: '比较 a &lt; b &amp;&amp; c &gt; d：无发现' }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
  assert.ok(!report.notes.some((note) => note.includes('来源未核验')), formatReport(report));
});

test('[HR-TC04-2] 实体转义之外的文字差异仍触发来源失真', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '比较 a < b：无发现\n', spec: '比较 a < b：无发现\n' });
  await writeMainSession(configDir, dir);
  for (const [axis, name] of [['standards', 'agent-standards'], ['spec', 'agent-spec']]) {
    await writeSubagent(configDir, dir, {
      name, model: 'claude-opus-5-5', binding: `.scratch/feature|r1|${axis}`,
      contents: [[{ type: 'text', text: '比较 a &lt; c：无发现' }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.ok(codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('[HR-TC06-1] 非 PASS 时结果行之后输出阻塞原因', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { spec: '[P-W1] 误\n' });
  await writeRaw(feature, 3, { spec: '[P-W1] 未修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport(['| P-W1 | 本次修 | 未修 | r1 → r3 未修 | | |']));
  const report = await checkFeature(feature, 'review');
  const output = formatReport(report, 'review');
  assert.match(output, /结果: BLOCKED\n阻塞原因：[^\n]*UNRESOLVED_FINDINGS/, output);
});

test('[HR-TC06-2] PASS 时不输出阻塞原因', async (t) => {
  const { feature } = await reviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.doesNotMatch(formatReport(report, 'review'), /阻塞原因/);
});

test('同 nonce 的转录凭据行与原文哈希一致时按强档核验', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  for (const [axis, relative, name] of [
    ['standards', 'review/r1-standards.md', 'agent-standards'],
    ['spec', 'review/r1-spec-axis.md', 'agent-spec'],
  ]) {
    const hash = createHash('sha256').update(await readFile(path.join(feature, relative))).digest('hex');
    await writeSubagent(configDir, dir, {
      name,
      binding: `.scratch/feature|r1|${axis}`,
      promptExtra: `QA_REVIEW_NONCE: ${challenge.nonce}`,
      contents: [[{ type: 'text', text: `QA_REVIEW_RECEIPT: ${challenge.nonce}|${hash}` }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：转录（强）'), formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));

  for (const mode of ['missing', 'malformed']) {
    for (const name of ['r1-standards', 'r1-spec-axis']) {
      const receipt = path.join(feature, 'review', `${name}.source.json`);
      if (mode === 'missing') await rm(receipt, { force: true });
      else await writeFile(receipt, '{}\n');
    }
    const strong = await checkFeature(feature, 'review');
    assert.equal(strong.status, 'PASS', `${mode}: ${formatReport(strong)}`);
    assert.ok(strong.notes.includes('来源核验：转录（强）'), `${mode}: ${formatReport(strong)}`);
    assert.ok(strong.notes.some((note) => note.includes(mode === 'missing' ? '缺少自述凭据' : '自述凭据格式错误')), `${mode}: ${formatReport(strong)}`);
  }
});

test('没有同 nonce 转录时降为弱档或人工而不判失败', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  for (const [axis, name] of [['standards', 'agent-standards'], ['spec', 'agent-spec']]) {
    await writeSubagent(configDir, dir, {
      name,
      binding: `.scratch/feature|r1|${axis}`,
      promptExtra: 'QA_REVIEW_NONCE: 旧轮次-nonce',
      contents: [[{ type: 'text', text: `QA_REVIEW_RECEIPT: 旧轮次-nonce|${'a'.repeat(64)}` }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：自述凭据（弱）'), formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('复审输入缺少必交编号时强档仍失败', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRereviewRepo(t);
  await writeMainSession(configDir, dir);
  for (const [axis, relative, name] of [
    ['standards', 'review/r2-standards.md', 'agent-standards'],
    ['spec', 'review/r2-spec-axis.md', 'agent-spec'],
  ]) {
    const hash = createHash('sha256').update(await readFile(path.join(feature, relative))).digest('hex');
    await writeSubagent(configDir, dir, {
      name,
      binding: `.scratch/feature|r2|${axis}`,
      promptExtra: `QA_REVIEW_NONCE: ${challenge.nonce}`,
      contents: [[{ type: 'text', text: `QA_REVIEW_RECEIPT: ${challenge.nonce}|${hash}` }]],
    });
  }
  const report = await checkFeature(feature, 'review');
  assert.ok(codes(report).includes('REVIEW_REINPUT_MISSING'), formatReport(report));
  const message = report.issues.find((item) => item.code === 'REVIEW_REINPUT_MISSING').message;
  assert.match(message, /P-W1/);
});

test('只有凭据时输出自述凭据弱档', async (t) => {
  const { feature } = await receiptRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：自述凭据（弱）'), formatReport(report));
});

test('弱档不新增 PASS-WEAK 状态', async (t) => {
  const { feature } = await receiptRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.ok(['PASS', 'FAIL', 'BLOCKED'].includes(report.status));
  assert.doesNotMatch(formatReport(report, 'review'), /PASS-WEAK/);
});

test('凭据哈希与原文不一致时 review 失败', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '无发现（seal 后又被修改）\n');
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('凭据 nonce 与当前 challenge 不一致时 review 阻断', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeReceipt(feature, { axis: 'standards', nonce: '旧轮次-nonce' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_STALE'), formatReport(report));
});

test('凭据缺失、格式错误或时间早于 collect 只给 NOTE', async (t) => {
  const expected = {
    missing: '缺少自述凭据',
    malformed: '自述凭据格式错误',
    early: '自述时间早于 collect',
  };
  for (const mode of ['missing', 'malformed', 'early']) {
    const { feature, challenge } = await receiptRepo(t);
    const receipts = [
      path.join(feature, 'review', 'r1-standards.source.json'),
      path.join(feature, 'review', 'r1-spec-axis.source.json'),
    ];
    if (mode === 'missing') {
      for (const file of receipts) await rm(file, { force: true });
    } else if (mode === 'malformed') {
      for (const file of receipts) await writeFile(file, '{}\n');
    } else {
      await writeReceipts(feature, {
        nonce: challenge.nonce,
        completedAt: new Date(Date.parse(challenge.packagedAt) - 1000).toISOString(),
      });
    }
    const report = await checkFeature(feature, 'review');
    assert.equal(report.status, 'PASS', `${mode}: ${formatReport(report)}`);
    assert.ok(report.notes.some((note) => note.includes(expected[mode])), `${mode}: ${formatReport(report)}`);
    assert.ok(!codes(report).some((code) => code === 'REVIEW_SOURCE_MISMATCH' || code === 'REVIEW_SOURCE_STALE'), `${mode}: ${formatReport(report)}`);
  }

  const { feature } = await receiptRereviewRepo(t);
  await writeReceipts(feature, { round: 'r2', pendingIds: {} });
  const malformed = await checkFeature(feature, 'review');
  assert.equal(malformed.status, 'PASS', formatReport(malformed));
  assert.ok(malformed.notes.some((note) => note.includes('自述凭据格式错误')), formatReport(malformed));
  assert.ok(malformed.notes.includes('来源核验：未核验（人工）'), formatReport(malformed));
});

test('宿主声明与凭据宿主不一致只给 NOTE', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeFile(path.join(feature, 'review-report.md'), REPORT_OK.replace(
    '审查方式：code-review 的 Standards 与 Spec 两个独立子代理，继承主会话模型',
    '审查方式：宿主=Kimi Code；两轴独立子代理',
  ));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('审查方式声明的宿主与凭据 host 不一致')), formatReport(report));
});

test('空原文或有凭据也不能绕过原文检查', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '');
  await writeReceipt(feature, { axis: 'standards' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_RAW_UNNUMBERED'), formatReport(report));
});

test('自述凭据缺待复核编号只给 NOTE', async (t) => {
  const { feature } = await receiptRereviewRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('缺少复审必交编号') && note.includes('P-W1')), formatReport(report));
});

test('自述凭据含全部待复核编号时不报缺失', async (t) => {
  const { feature } = await receiptRereviewRepo(t, { pendingIds: ['P-W1'] });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!report.notes.some((note) => note.includes('缺少复审必交编号')), formatReport(report));
});

test('新轮次宿主声明不改变按证据选择路径', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeFile(path.join(feature, 'review-report.md'), REPORT_OK.replace(
    '审查方式：code-review 的 Standards 与 Spec 两个独立子代理，继承主会话模型',
    '审查方式：宿主=Kimi Code；两轴独立子代理',
  ));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：自述凭据（弱）'), formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('无 challenge 的旧轮次仍按旧逻辑核验', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '规范轴：无发现\n', spec: '需求轴：无发现\n' });
  await writeMainSession(configDir, dir);
  await writeSubagent(configDir, dir, {
    name: 'agent-standards',
    binding: '.scratch/feature|r1|standards',
    contents: [[{ type: 'text', text: '规范轴：内容不同\n' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-spec',
    binding: '.scratch/feature|r1|spec',
    contents: [[{ type: 'text', text: '需求轴：无发现\n' }]],
  });
  const report = await checkFeature(feature, 'review');
  assert.ok(codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));

  const legacy = await reviewRepo(t);
  await writeRaw(legacy.feature, 1);
  await writeFile(path.join(legacy.feature, 'review-report.md'), REPORT_OK.replace(
    '审查方式：code-review 的 Standards 与 Spec 两个独立子代理，继承主会话模型',
    '审查方式：宿主=Kimi Code；两轴独立子代理',
  ));
  const legacyReport = await checkFeature(legacy.feature, 'review');
  assert.equal(legacyReport.status, 'PASS', formatReport(legacyReport));
  assert.ok(legacyReport.notes.some((note) => note.includes('Claude Code 转录核验不适用')), formatReport(legacyReport));
  assert.ok(!codes(legacyReport).includes('REVIEW_SOURCE_MISMATCH'), formatReport(legacyReport));
});

test('外部会话凭据按弱档接受', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeReceipts(feature, { reviewerKind: 'external-session', host: 'Codex' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：自述凭据（弱）'), formatReport(report));
});

/** r2 复审夹具：r1 的 P-W1 在 r2 已修，两轴凭据可带待复核编号 */
async function receiptRereviewRepo(t, { pendingIds } = {}) {
  const { dir, feature } = await reviewRepo(t, { challenge: true });
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 未修\n' });
  const collected = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature, '--round', 'r2'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(collected.status, 0, collected.stderr);
  const challenge = await readChallenge(feature);
  await writeRaw(feature, 2, { standards: '无发现\n', spec: '[P-W1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 未修 → r2 已修 | 静态：测试 | |',
  ]));
  await writeReceipts(feature, { round: 'r2', nonce: challenge.nonce, pendingIds });
  return { dir, feature, challenge };
}

test('challenge 未落盘审查原文时仍输出来源核验未核验', async (t) => {
  const { feature } = await receiptRepo(t);
  await rm(path.join(feature, 'review'), { recursive: true, force: true });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(report.notes.includes('来源核验：未核验（人工）'), formatReport(report));
});

test('强档转录哈希不一致时 review 失败', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  await strongTranscript(configDir, dir, feature, challenge, {
    axis: 'standards',
    hash: 'a'.repeat(64),
  });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'spec' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'FAIL', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_MISMATCH'), formatReport(report));
});

test('强档转录早于 collect 时阻断', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  const early = new Date(Date.parse(challenge.packagedAt) - 1000).toISOString();
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'standards', timestamp: early });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'spec' });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_STALE'), formatReport(report));
});

test('多个同 nonce 转录时只给 NOTE 不判强档', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'standards', name: 'agent-a' });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'standards', name: 'agent-b' });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'spec' });
  const report = await checkFeature(feature, 'review');
  assert.ok(report.notes.some((note) => note.includes('多个同 nonce')), formatReport(report));
  assert.ok(!report.notes.includes('来源核验：转录（强）'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('同 nonce 转录没有凭据行时只给 NOTE', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'standards', finalText: '只有审查结论，没有凭据行' });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'spec' });
  const report = await checkFeature(feature, 'review');
  assert.ok(report.notes.some((note) => note.includes('没有可用的凭据行')), formatReport(report));
  assert.ok(!report.notes.includes('来源核验：转录（强）'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('转录时间无法确认时只给 NOTE', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'standards', timestamp: null });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'spec' });
  const report = await checkFeature(feature, 'review');
  assert.ok(report.notes.some((note) => note.includes('转录时间无法确认')), formatReport(report));
  assert.ok(!report.notes.includes('来源核验：转录（强）'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('转录 prompt 的绑定行带缩进和反引号时仍按强档核验', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir);
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'standards', quoteBinding: true });
  await strongTranscript(configDir, dir, feature, challenge, { axis: 'spec', quoteBinding: true });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：转录（强）'), formatReport(report));
});

test('单轴凭据缺失只影响该轴并保留另一轴', async (t) => {
  const { feature } = await receiptRepo(t);
  await rm(path.join(feature, 'review', 'r1-standards.source.json'));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('r1-standards.md 缺少自述凭据')), formatReport(report));
  assert.ok(report.notes.includes('来源核验：未核验（人工）'), formatReport(report));
  assert.ok(!codes(report).some((code) => code === 'REVIEW_SOURCE_MISMATCH' || code === 'REVIEW_SOURCE_STALE'), formatReport(report));
});

test('跨特性凭据按来源过期阻断', async (t) => {
  const { feature } = await receiptRepo(t);
  await writeReceipt(feature, {
    axis: 'standards',
    nonce: 'other-feature-nonce',
    featureOverride: '.scratch/other',
  });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_SOURCE_STALE'), formatReport(report));
});

test('challenge 与审查包 manifest 不一致时 review 失败', async (t) => {
  for (const [field, value] of [['treeDigest', '0'.repeat(64)], ['packagedAt', new Date(0).toISOString()]]) {
    const { feature, challenge } = await receiptRepo(t);
    const challengePath = path.join(feature, '_qa', 'review-challenge.json');
    await writeFile(challengePath, `${JSON.stringify({ ...challenge, [field]: value }, null, 2)}\n`);
    const report = await checkFeature(feature, 'review');
    assert.equal(report.status, 'FAIL', `${field}: ${formatReport(report)}`);
    assert.ok(codes(report).includes('REVIEW_SOURCE_MISMATCH'), `${field}: ${formatReport(report)}`);
  }
});

test('challenge 只有单轴原文时不抛异常并输出未核验', async (t) => {
  const { feature } = await receiptRepo(t);
  await rm(path.join(feature, 'review', 'r1-spec-axis.md'));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_RAW_MISSING'), formatReport(report));
  assert.ok(report.notes.includes('来源核验：未核验（人工）'), formatReport(report));
});

/** 构造 r1 双轴 + 可选 r2 单轴复审的仓库（带 challenge） */
async function singleAxisRepo(t, { changeCodeBeforeR2 = false } = {}) {
  const { dir, feature } = await reviewRepo(t, { challenge: true });
  const challenge1 = await readChallenge(feature);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-W1] 实现有误\n' });
  await writeReceipts(feature, { nonce: challenge1.nonce });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 发现 → r2 已修 | 静态：测试 | |',
  ]));
  if (changeCodeBeforeR2) await writeFile(path.join(dir, 'tracked.txt'), 'r1 审查后的代码修改\n');
  const collected = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature, '--round', 'r2'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(collected.status, 0, collected.stderr);
  const challenge2 = await readChallenge(feature);
  await writeFile(path.join(feature, 'review', 'r2-spec-axis.md'), '[P-W1] 已修\n');
  await writeReceipt(feature, {
    round: 'r2',
    axis: 'spec',
    nonce: challenge2.nonce,
    pendingIds: ['P-W1'],
  });
  return { dir, feature, challenge1, challenge2 };
}

test('TC02-1 r1 缺少任一轴原文时 review 阻断', async (t) => {
  const { feature } = await reviewRepo(t, { challenge: true });
  const challenge = await readChallenge(feature);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await rm(path.join(feature, 'review', 'r1-spec-axis.md'), { force: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '无发现\n');
  await writeReceipt(feature, { round: 'r1', axis: 'standards', nonce: challenge.nonce });
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'BLOCKED', formatReport(report));
  assert.ok(codes(report).includes('REVIEW_RAW_MISSING'), formatReport(report));
});

test('TC02-2 r2+ 审查包未变时允许无待复核项的轴沿用同一 treeDigest 旧轮次', async (t) => {
  const { feature } = await singleAxisRepo(t);
  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('REVIEW_RAW_MISSING'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('沿用第 r1 轮原文')), formatReport(report));
});

test('TC02-3 r2+ 审查包变化时缺席轴仍报 REVIEW_RAW_MISSING', async (t) => {
  const { feature } = await singleAxisRepo(t, { changeCodeBeforeR2: true });
  const report = await checkFeature(feature, 'review');
  assert.ok(codes(report).includes('REVIEW_RAW_MISSING'), formatReport(report));
  assert.equal(report.status, 'BLOCKED', formatReport(report));
});

test('TC02-4 声明与凭据均为非 Claude 宿主的新协议不扫描 Claude 转录', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge } = await receiptRepo(t);
  await writeMainSession(configDir, dir, { skill: null });
  await writeReceipts(feature, { nonce: challenge.nonce, host: 'Kimi Code' });
  await writeFile(path.join(feature, 'review-report.md'), REPORT_OK.replace(
    '审查方式：code-review 的 Standards 与 Spec 两个独立子代理，继承主会话模型',
    '审查方式：宿主=Kimi Code；两轴独立子代理',
  ));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(report.notes.includes('来源核验：自述凭据（弱）'), formatReport(report));
  assert.ok(report.notes.some((note) => note.includes('跳过 Claude 转录扫描')), formatReport(report));
  assert.ok(!report.notes.some((note) => note.includes('没有 code-review 的 Skill 调用')), formatReport(report));
});

test('TC01-1~3 行为证据树排除非契约文档而审查包保留文档且契约文档仍触发过期', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-dual-tree-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeFile(path.join(dir, 'tracked.txt'), '代码初始\n');
  await writeFile(path.join(dir, 'GLOSSARY.md'), '# 术语\n');
  await mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
  await writeFile(path.join(dir, 'docs', 'agents', 'qa-workflow.md'), '# 正本\n');
  await mkdir(path.join(dir, 'tests'), { recursive: true });
  await writeFile(path.join(dir, TEST_FILE), TEST_SOURCE);
  git(dir, ['add', 'tracked.txt', 'GLOSSARY.md', 'docs/agents/qa-workflow.md', TEST_FILE]);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);

  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  await writeFile(path.join(feature, 'spec.md'), SPEC);
  const plan = singlePlan();
  await writeFile(path.join(feature, 'qa-plan.md'), plan.replace(/\| (?:PASS|FAIL) \|/g, '| BLOCKED |'));
  const init = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt', 'GLOSSARY.md', 'docs/agents/qa-workflow.md'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  await writeFile(path.join(feature, 'qa-plan.md'), plan);
  for (const [label, argv] of [['run', ['node', '--test', TEST_FILE]], ['delivery', ['node', '--version']]]) {
    assert.equal(spawnSync(process.execPath, [QA_RUN, feature, label, '--', ...argv], { cwd: dir, encoding: 'utf8' }).status, 0);
  }
  assert.equal(acceptanceCli(dir, feature).status, 0);
  assert.equal(spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature], { cwd: dir, encoding: 'utf8' }).status, 0);
  const challenge = await readChallenge(feature);
  await writeRaw(feature);
  await writeReceipts(feature, { nonce: challenge.nonce });
  await writeFile(path.join(feature, 'review-report.md'), REPORT_OK.replace('审查方式：', '审查方式：宿主=Kimi Code；'));

  // 1. 仅修改 GLOSSARY.md：行为与交付证据不报 STALE_EVIDENCE/STALE_VERIFICATION，但审查包报 STALE_REVIEW_PACKAGE
  await writeFile(path.join(dir, 'GLOSSARY.md'), '# 术语\n新增说明\n');
  const afterGlossaryAcc = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(afterGlossaryAcc).includes('STALE_EVIDENCE'), formatReport(afterGlossaryAcc));
  const afterGlossaryRev = await checkFeature(feature, 'review');
  assert.ok(!codes(afterGlossaryRev).includes('STALE_EVIDENCE'), formatReport(afterGlossaryRev));
  assert.ok(!codes(afterGlossaryRev).includes('STALE_VERIFICATION'), formatReport(afterGlossaryRev));
  assert.ok(codes(afterGlossaryRev).includes('STALE_REVIEW_PACKAGE'), formatReport(afterGlossaryRev));

  // 2. 改回 GLOSSARY.md 后修改契约文档 docs/agents/qa-workflow.md：行为与交付证据均触发 STALE
  await writeFile(path.join(dir, 'GLOSSARY.md'), '# 术语\n');
  await writeFile(path.join(dir, 'docs', 'agents', 'qa-workflow.md'), '# 正本\n新条款\n');
  const afterContract = await checkFeature(feature, 'review');
  assert.ok(codes(afterContract).includes('STALE_EVIDENCE'), formatReport(afterContract));
  assert.ok(codes(afterContract).includes('STALE_VERIFICATION'), formatReport(afterContract));
});

test('P0-TC02-1 本地存储写入 auth 或 session 认证键时报 AUTH_BYPASS_IN_SCRIPT，普通业务键不误报', async (t) => {
  for (const script of [
    "localStorage.setItem('ai-app-auth', JSON.stringify({ state: { accessToken: 'x' } }));\n",
    "sessionStorage.setItem('user_session', 'sid');\n",
    "localStorage['auth_state'] = '1';\n",
    "sessionStorage['sessionId'] = 'abc';\n",
  ]) {
    const report = await scanReport(t, script);
    assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), `${script}: ${formatReport(report)}`);
  }
  const clean = await scanReport(t, "localStorage.setItem('theme', 'dark');\nsessionStorage['draft_id'] = '42';\n");
  assert.ok(!codes(clean).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(clean));
});

test('P0-TC05-1 qa-check 不依赖 path.posix.matchesGlob 且绑定 glob 匹配精准覆盖精确路径与通配符', async (t) => {
  const source = await readFile(path.join(process.cwd(), 'tooling/scripts/qa-check.mjs'), 'utf8');
  assert.doesNotMatch(source, /matchesGlob/, 'qa-check.mjs 不得依赖 Node 22.5+ 专有的 path.posix.matchesGlob');

  const cases = [
    { file: 'tests/sub/a+1.test.mjs', argv: ['node', '--test', 'tests/sub/a+1.test.mjs'], hit: true },
    { file: 'tests/sub/a.test.mjs', argv: ['node', '--test', 'tests/sub/*.test.mjs'], hit: true },
    { file: 'tests/deep/nested/b.test.mjs', argv: ['node', '--test', 'tests/**/*.test.mjs'], hit: true },
    { file: 'tests/a.test.mjs', argv: ['node', '--test', 'tests/**/*.test.mjs'], hit: true },
    { file: 'tests/a1.test.mjs', argv: ['node', '--test', 'tests/a?.test.mjs'], hit: true },
    { file: 'tests/sub/a.test.mjs', argv: ['node', '--test', 'tests/*.test.mjs'], hit: false },
    { file: 'tests/a12.test.mjs', argv: ['node', '--test', 'tests/a?.test.mjs'], hit: false },
  ];
  for (const item of cases) {
    const dir = await boundWorkspace(t, {
      file: item.file,
      binding: `\`${item.file}\` › 传入过滤条件时两路均收到`,
      argv: item.argv,
    });
    const report = await checkFeature(dir, 'acceptance');
    const outOfRange = codes(report).includes('TEST_BINDING_OUT_OF_RUN');
    assert.equal(outOfRange, !item.hit, `${item.file} vs ${item.argv.join(' ')}: ${formatReport(report)}`);
  }
});

test('P0-TC03-1 r2 单轴复用时按旧轴自身轮次与 nonce 核对转录，保持转录（强）', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge1, challenge2 } = await singleAxisRepo(t);
  await writeMainSession(configDir, dir);

  // standards 轴沿用 r1 原文与 r1 nonce，且 r1 转录时间早于当轮刷新后的 collect 时间；spec 轴使用 r2 原文与 r2 nonce
  const r1StandardsHash = createHash('sha256')
    .update(await readFile(path.join(feature, 'review', 'r1-standards.md')))
    .digest('hex');
  const olderR1Time = new Date(Date.parse(challenge2.packagedAt) - 10_000).toISOString();
  await writeSubagent(configDir, dir, {
    name: 'agent-r1-standards',
    binding: '.scratch/feature|r1|standards',
    timestamp: olderR1Time,
    promptExtra: `QA_REVIEW_NONCE: ${challenge1.nonce}`,
    contents: [[{ type: 'text', text: `QA_REVIEW_RECEIPT: ${challenge1.nonce}|${r1StandardsHash}` }]],
  });

  const r2SpecHash = createHash('sha256')
    .update(await readFile(path.join(feature, 'review', 'r2-spec-axis.md')))
    .digest('hex');
  await writeSubagent(configDir, dir, {
    name: 'agent-r2-spec',
    binding: '.scratch/feature|r2|spec',
    promptExtra: `QA_REVIEW_NONCE: ${challenge2.nonce}\n待复核编号：P-W1`,
    contents: [[{ type: 'text', text: `QA_REVIEW_RECEIPT: ${challenge2.nonce}|${r2SpecHash}` }]],
  });

  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(!codes(report).includes('REVIEW_SOURCE_STALE'), formatReport(report));
  assert.ok(report.notes.includes('来源核验：转录（强）'), formatReport(report));
});

test('P0-TC04-1 同一 binding 存在多条转录时不静默覆盖事件时间，回退对应凭据时间', async (t) => {
  const configDir = await useConfigDir(t);
  const { dir, feature, challenge1 } = await singleAxisRepo(t);
  await writeMainSession(configDir, dir);

  const r1Time = new Date(Date.now() - 60_000).toISOString();
  const fixStarted = new Date(Date.now() - 30_000).toISOString();
  const futureConflictTime = new Date(Date.now() + 60_000).toISOString();

  // r1-spec-axis 凭据时间为 r1Time；修复验证日志 started 在 r1Time 之后、但在冲突转录时间之前
  await writeReceipt(feature, {
    round: 'r1',
    axis: 'spec',
    nonce: challenge1.nonce,
    completedAt: r1Time,
  });
  await writeFile(
    path.join(feature, 'evidence', 'fix-verify.log'),
    runLog({ argv: ['node', '--version'], started: fixStarted, finished: fixStarted, exit: 0 }),
  );
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-W1 | 本次修 | 已修 | r1 发现 → r2 已修 | `evidence/fix-verify.log` | |',
  ]));

  // 同 binding（.scratch/feature|r1|spec）写入两条时间戳不同的转录，后者时间戳晚于 fixStarted
  await writeSubagent(configDir, dir, {
    name: 'agent-r1-spec-a',
    binding: '.scratch/feature|r1|spec',
    timestamp: r1Time,
    contents: [[{ type: 'text', text: '[P-W1] 实现有误' }]],
  });
  await writeSubagent(configDir, dir, {
    name: 'agent-r1-spec-b',
    binding: '.scratch/feature|r1|spec',
    timestamp: futureConflictTime,
    contents: [[{ type: 'text', text: '[P-W1] 实现有误' }]],
  });

  const report = await checkFeature(feature, 'review');
  assert.ok(!codes(report).includes('FIX_UNVERIFIED'), formatReport(report));
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('P1-TC02-1 splitMarkdownRow 支持单元格内转义管道符且不错误拆列', () => {
  const cells = splitMarkdownRow('| TC01 | `a \\| b` | PASS | 含 `x \\| y` 说明 |');
  assert.deepEqual(cells, ['TC01', '`a | b`', 'PASS', '含 `x | y` 说明']);
});

test('P1-TC03-1 跨行动态 import 与 require 导入数据存储模块时仍报 AUTH_BYPASS_IN_SCRIPT', async (t) => {
  for (const script of [
    "const db = await import(\n  '@prisma/client'\n);\n",
    "const pg = require(\n  'pg'\n);\n",
  ]) {
    const report = await scanReport(t, script);
    assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), `${script}: ${formatReport(report)}`);
  }
});

test('P1-TC04-1 pnpm-workspace.yaml 支持行尾注释、多级 glob 展开与排除项过滤', async (t) => {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-ws-glob-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  await writeFile(path.join(dir, 'pnpm-workspace.yaml'), [
    'packages: # 工作区配置',
    '  - "packages/**" # 多级包',
    '  - "!packages/ignored" # 精确目录前缀排除',
    '  - "!packages/ignored-glob/**" # 通配目录排除',
    '',
  ].join('\n'));
  await mkdir(path.join(dir, 'packages', 'nested', 'db'), { recursive: true });
  await writeFile(path.join(dir, 'packages', 'nested', 'db', 'package.json'), JSON.stringify({
    name: '@repo/nested-db',
    dependencies: { '@prisma/client': '1.0.0' },
  }));
  await mkdir(path.join(dir, 'packages', 'ignored', 'db'), { recursive: true });
  await writeFile(path.join(dir, 'packages', 'ignored', 'db', 'package.json'), JSON.stringify({
    name: '@repo/ignored-db',
    dependencies: { pg: '1.0.0' },
  }));
  await mkdir(path.join(dir, 'packages', 'ignored-glob', 'db'), { recursive: true });
  await writeFile(path.join(dir, 'packages', 'ignored-glob', 'db', 'package.json'), JSON.stringify({
    name: '@repo/ignored-glob-db',
    dependencies: { pg: '1.0.0' },
  }));

  const makeFeature = async (name, script) => {
    const feature = path.join(dir, '.scratch', name);
    await mkdir(path.join(feature, 'scripts'), { recursive: true });
    await writeFile(path.join(feature, 'spec.md'), SPEC);
    await writeFile(path.join(feature, 'qa-plan.md'), singlePlan({ seam: 'api' }).replace(/\| PASS \|/g, '| BLOCKED |'));
    await writeFile(path.join(feature, 'scripts', 'helper.mjs'), script);
    return checkFeature(feature, 'acceptance');
  };

  const hitNested = await makeFeature('f-hit', "import { db } from '@repo/nested-db';\n");
  assert.ok(codes(hitNested).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(hitNested));

  const skipIgnored = await makeFeature('f-skip', "import { db } from '@repo/ignored-db';\n");
  assert.ok(!codes(skipIgnored).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(skipIgnored));

  const skipIgnoredGlob = await makeFeature('f-skip-glob', "import { db } from '@repo/ignored-glob-db';\n");
  assert.ok(!codes(skipIgnoredGlob).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(skipIgnoredGlob));
});

test('P1-TC05-1 Python 三引号与 JS 模板字符串嵌套注释不破坏词法去注释状态机', async (t) => {
  // Python 三引号内含单个双引号与 # 时，不得拆错三引号导致后续 # 注释被吞进字符串误报
  const pyCommentedDir = await scriptedWorkspace(t, {
    extraFiles: {
      'scripts/helper.py': 'doc = """\n"inner\n# 非注释\n"""\n# import psycopg2\n',
    },
  });
  const pyCommented = await checkFeature(pyCommentedDir, 'acceptance');
  assert.ok(!codes(pyCommented).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(pyCommented));

  const pyRealDir = await scriptedWorkspace(t, {
    extraFiles: {
      'scripts/helper.py': 'doc = """\n"inner\n# 非注释\n"""\nimport psycopg2\n',
    },
  });
  const pyReal = await checkFeature(pyRealDir, 'acceptance');
  assert.ok(codes(pyReal).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(pyReal));

  // JS 模板字符串 ${...} 内含带反引号的块注释、行注释或字符串时，均不得词法失步
  const jsBacktickCommentClean = await scanReport(
    t,
    'const label = `prefix ${/* ` */ value} suffix`;\n// await fetch("/api/login");\n',
  );
  assert.ok(!codes(jsBacktickCommentClean).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(jsBacktickCommentClean));

  const jsBacktickCommentReal = await scanReport(
    t,
    'const label = `prefix ${/* ` */ value} suffix`;\nawait fetch("/api/login");\n',
  );
  assert.ok(codes(jsBacktickCommentReal).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(jsBacktickCommentReal));

  const jsLineCommentBacktick = await scanReport(
    t,
    'const label = `prefix ${\n// `\nvalue} suffix`;\n// await fetch("/api/login");\n',
  );
  assert.ok(!codes(jsLineCommentBacktick).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(jsLineCommentBacktick));

  const jsNestedQuote = await scanReport(
    t,
    'const label = `prefix ${"a`b"} suffix`;\n// await fetch("/api/login");\n',
  );
  assert.ok(!codes(jsNestedQuote).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(jsNestedQuote));

  const jsNestedComment = await scanReport(
    t,
    'const label = `prefix ${/* /api/login */ "ok"} suffix`;\n',
  );
  assert.ok(!codes(jsNestedComment).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(jsNestedComment));
});

test('P1-TC06-1 审查轮次达 r4 时输出超自动复审上限强 NOTE 且不因轮次报错', async (t) => {
  const { feature } = await reviewRepo(t);
  await writeRaw(feature, 1, { standards: '无发现\n', spec: '[P-M1] 缺失\n' });
  await writeRaw(feature, 4, { standards: '无发现\n', spec: '[P-M1] 已修\n' });
  await writeFile(path.join(feature, 'review-report.md'), verifiedReport([
    '| P-M1 | 本次修 | 已修 | r1 发现 → r4 已修 | 静态：补齐 | |',
  ]));
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));
  assert.ok(
    report.notes.some((note) => note.includes('r4') && note.includes('上限') && note.includes('人工裁决')),
    formatReport(report),
  );
});

test('P1-TC06-2 个人级目录遮蔽 setup-qa-workflow 或 domain-modeling 时报 SHADOWED_WORKFLOW_SKILL', async (t) => {
  const configDir = await useConfigDir(t);
  for (const skillName of ['setup-qa-workflow', 'domain-modeling']) {
    const dir = await mkdtemp(path.join(tmpdir(), `qa-shadow-${skillName}-`));
    t.after(() => rm(dir, { recursive: true, force: true }));
    git(dir, ['init', '--quiet']);
    await mkdir(path.join(dir, '.claude', 'skills', skillName), { recursive: true });
    await writeFile(path.join(dir, '.claude', 'skills', skillName, 'SKILL.md'), `---\nname: ${skillName}\n---\n项目版本\n`);
    await mkdir(path.join(configDir, 'skills', skillName), { recursive: true });
    await writeFile(path.join(configDir, 'skills', skillName, 'SKILL.md'), `---\nname: ${skillName}\n---\n个人遮蔽版本\n`);

    const feature = path.join(dir, '.scratch', 'feature');
    await mkdir(feature, { recursive: true });
    await writeFile(path.join(feature, 'spec.md'), SPEC);
    await writeFile(path.join(feature, 'qa-plan.md'), singlePlan().replace(/\| PASS \|/g, '| BLOCKED |'));

    const report = await checkFeature(feature, 'plan');
    assert.equal(report.status, 'BLOCKED', `${skillName}: ${formatReport(report)}`);
    assert.ok(codes(report).includes('SHADOWED_WORKFLOW_SKILL'), `${skillName}: ${formatReport(report)}`);
  }
});
