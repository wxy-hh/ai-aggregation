import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkFeature, formatReport } from '../qa-check.mjs';

// 本文件覆盖 qa-workflow-control-points 特性的控制点检查（US 1–5），夹具已迁移到 Schema 4
const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));
const COMMAND = 'node --version';
const SHOT = '`screenshots/TC01.png`';
const TEST_FILE = 'tests/a.test.mjs';
const BINDING = `\`${TEST_FILE}\` › 第一条断言成立`;

function specText({ commands = [COMMAND] } = {}) {
  const lines = ['## User Stories', '1. 第一条需求', ''];
  if (commands) lines.push('## 交付命令', '', '```bash', ...commands, '```', '');
  return lines.join('\n');
}

function planText({
  kind = 'feature',
  seam = 'unit',
  assertions = ['第一条断言'],
  rows = ['| TC01 | 1 | BLOCKED | 尚未执行 | | |'],
  delivery = [[COMMAND, '待执行']],
  reproduction = [],
} = {}) {
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    `QA Kind: ${kind}`,
    '',
    '### TC01: 示例',
    '- Priority: P0',
    '- Covers: 1',
    `- Seam: ${seam}`,
    '',
    '#### 验证断言',
    ...assertions.map((text, index) => `${index + 1}. ${text}`),
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    ...delivery.map(([command, evidence]) => `| \`${command}\` | ${evidence} |`),
    '',
    '## 修复前复现',
    '| 用例 | 证据 |',
    '| --- | --- |',
    ...reproduction,
    '',
    '## 计划变更',
    '- 无',
  ].join('\n');
}

/** 手写的 qa-run 日志夹具，用于构造指定开始时间或 argv 的证据 */
function runLog({ argv = ['node', '--version'], exit = 0, started, cwd = '.', tree = 'none', body = '测试输出' }) {
  return [
    '# qa-run v1',
    '# label: fixture',
    `# command: ${argv.join(' ')}`,
    `# argv: ${JSON.stringify(argv)}`,
    `# cwd: ${cwd}`,
    '# head: 0123456789abcdef',
    `# tree: ${tree}`,
    `# started: ${started}`,
    '# ---',
    body,
    '# ---',
    `# finished: ${started}`,
    `# exit: ${exit}`,
    '',
  ].join('\n');
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function writeDeep(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

async function tempDir(t, prefix) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

/** 临时 git 仓库：先提交 committed，再在 init 前写入 dirty，最后用真实 review-package init 建基线 */
async function featureRepo(t, {
  spec = specText(),
  plan = planText(),
  committed = {},
  dirty = {},
  scopes = ['tracked.txt'],
} = {}) {
  const dir = await tempDir(t, 'qa-control-');
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  for (const [relative, content] of Object.entries({
    'tracked.txt': '原始内容\n',
    [TEST_FILE]: "import test from 'node:test';\ntest('第一条断言成立', () => {});\n",
    ...committed,
  })) {
    await writeDeep(path.join(dir, relative), content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  for (const [relative, content] of Object.entries(dirty)) await writeDeep(path.join(dir, relative), content);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeDeep(path.join(feature, 'spec.md'), spec);
  await writeDeep(path.join(feature, 'qa-plan.md'), plan);
  const init = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', ...scopes], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  const scope = JSON.parse(await readFile(path.join(feature, '_qa', 'scope.json'), 'utf8'));
  return { dir, feature, scope };
}

/** 不在 git 仓库中的特性目录，只用于规划阶段 */
async function planWorkspace(t, { spec = specText(), plan = planText(), files = {} } = {}) {
  const dir = await tempDir(t, 'qa-control-plain-');
  for (const [relative, content] of Object.entries(files)) await writeDeep(path.join(dir, relative), content);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeDeep(path.join(feature, 'spec.md'), spec);
  await writeDeep(path.join(feature, 'qa-plan.md'), plan);
  return feature;
}

function qaRun(dir, feature, label, argv) {
  const result = spawnSync(process.execPath, [QA_RUN, feature, label, '--', ...argv], { cwd: dir, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}

function codes(report) {
  return report.issues.map((item) => item.code);
}

function shift(iso, milliseconds) {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function skill(name, body) {
  return `---\nname: ${name}\ndescription: 测试技能\n---\n${body}\n`;
}

/** 把个人级技能写入临时 CLAUDE_CONFIG_DIR，测试结束后恢复环境变量 */
async function usePersonalSkills(t, skills) {
  const dir = await tempDir(t, 'qa-personal-');
  for (const [name, content] of Object.entries(skills)) {
    await writeDeep(path.join(dir, 'skills', name, 'SKILL.md'), content);
  }
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = dir;
  t.after(() => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
  });
  return dir;
}

test('个人级流程技能同名且内容不同时 plan 与 review 均阻塞，输出不含个人技能正文（控制点 TC01）', async (t) => {
  await usePersonalSkills(t, { 'code-review': skill('code-review', '个人技能正文标记') });
  const { feature } = await featureRepo(t, {
    committed: { '.claude/skills/code-review/SKILL.md': skill('code-review', '项目技能正文') },
  });
  for (const phase of ['plan', 'review']) {
    const report = await checkFeature(feature, phase);
    const output = formatReport(report, phase);
    assert.ok(codes(report).includes('SHADOWED_WORKFLOW_SKILL'), `${phase}: ${output}`);
    assert.notEqual(report.status, 'PASS');
    assert.match(output, /code-review/);
    assert.doesNotMatch(output, /个人技能正文标记/);
  }
  assert.equal((await checkFeature(feature, 'plan')).status, 'BLOCKED');
});

test('规划期另有结构问题时仍报出同名流程技能阻塞（控制点 TC01）', async (t) => {
  await usePersonalSkills(t, { 'code-review': skill('code-review', '个人版') });
  const { feature } = await featureRepo(t, {
    committed: { '.claude/skills/code-review/SKILL.md': skill('code-review', '项目技能正文') },
    plan: planText({ seam: 'visual' }),
  });
  for (const phase of ['plan', 'review']) {
    const report = await checkFeature(feature, phase);
    assert.ok(codes(report).includes('INVALID_SEAM'), `${phase}: ${formatReport(report, phase)}`);
    assert.ok(codes(report).includes('SHADOWED_WORKFLOW_SKILL'), `${phase}: ${formatReport(report, phase)}`);
  }
});

test('内容一致的流程技能与同名非流程技能只合并为一条 NOTE（控制点 TC01）', async (t) => {
  await usePersonalSkills(t, {
    'code-review': skill('code-review', '相同正文'),
    'ego-browser': skill('ego-browser', '个人版浏览器技能'),
  });
  const { feature } = await featureRepo(t, {
    committed: {
      '.claude/skills/code-review/SKILL.md': skill('code-review', '相同正文'),
      '.claude/skills/ego-browser/SKILL.md': skill('ego-browser', '项目版浏览器技能'),
    },
  });
  const report = await checkFeature(feature, 'plan');
  assert.equal(report.status, 'PASS', formatReport(report, 'plan'));
  const notes = report.notes.filter((note) => note.includes('同名'));
  assert.equal(notes.length, 1, formatReport(report, 'plan'));
  assert.match(notes[0], /code-review/);
  assert.match(notes[0], /ego-browser/);
});

test('只按 frontmatter name 同名也能识别；无个人目录或不在 git 仓库时无输出（控制点 TC01）', async (t) => {
  const personal = await usePersonalSkills(t, { 'my-review': skill('code-review', '改了目录名的个人版') });
  const { feature } = await featureRepo(t, {
    committed: { '.claude/skills/code-review/SKILL.md': skill('code-review', '项目技能正文') },
  });
  const renamed = await checkFeature(feature, 'plan');
  assert.ok(codes(renamed).includes('SHADOWED_WORKFLOW_SKILL'), formatReport(renamed, 'plan'));

  process.env.CLAUDE_CONFIG_DIR = await tempDir(t, 'qa-empty-config-');
  const noPersonal = await checkFeature(feature, 'plan');
  assert.equal(noPersonal.status, 'PASS', formatReport(noPersonal, 'plan'));
  assert.ok(!noPersonal.notes.some((note) => note.includes('同名')));

  process.env.CLAUDE_CONFIG_DIR = personal;
  const plain = await planWorkspace(t, {
    files: { '.claude/skills/code-review/SKILL.md': skill('code-review', '项目技能正文') },
  });
  const outsideGit = await checkFeature(plain, 'plan');
  assert.equal(outsideGit.status, 'PASS', formatReport(outsideGit, 'plan'));
  assert.ok(!outsideGit.notes.some((note) => note.includes('同名')));
});

test('spec 交付命令必须原样进入交付验证，计划可以多于 spec（控制点 TC02）', async (t) => {
  const missing = await planWorkspace(t, { spec: specText({ commands: [COMMAND, 'node --test'] }) });
  const report = await checkFeature(missing, 'plan');
  assert.equal(report.status, 'FAIL');
  const issue = report.issues.find((item) => item.code === 'SPEC_COMMAND_MISSING');
  assert.match(issue.message, /node --test/);
  assert.match(issue.hint, /先修改 spec/);

  const extra = await planWorkspace(t, {
    plan: planText({ delivery: [[COMMAND, '待执行'], ['node --check x.js', '待执行']] }),
  });
  const passed = await checkFeature(extra, 'plan');
  assert.equal(passed.status, 'PASS', formatReport(passed, 'plan'));
});

test('命令文本不完全相等视为缺失，交付命令按代码块逐行解析（控制点 TC02）', async (t) => {
  const feature = await planWorkspace(t, {
    spec: specText({ commands: ['node --test tooling'] }),
    plan: planText({ delivery: [['node --test tooling --watch', '待执行']] }),
  });
  const report = await checkFeature(feature, 'plan');
  assert.ok(codes(report).includes('SPEC_COMMAND_MISSING'), formatReport(report, 'plan'));

  // 代码块内逐行取命令：去掉首尾空白、跳过空行，只有真正缺失的那条报错
  const lines = await planWorkspace(t, {
    spec: specText({ commands: ['  node --version  ', '', 'pnpm exec eslint tooling'] }),
  });
  const partial = await checkFeature(lines, 'plan');
  const missing = partial.issues.filter((item) => item.code === 'SPEC_COMMAND_MISSING');
  assert.equal(missing.length, 1, formatReport(partial, 'plan'));
  assert.match(missing[0].message, /：pnpm exec eslint tooling$/);
});

test('计划结构提示只在 plan 阶段输出，不带入验收与审查（控制点 TC02）', async (t) => {
  // 6 条 browser 用例触发时间盒 NOTE；它属于计划结构提示，与交付命令 NOTE 不同，验收与审查阶段不再输出
  const extraCases = ['TC02', 'TC03', 'TC04', 'TC05', 'TC06']
    .map((id) => `### ${id}: 示例\n- Priority: P0\n- Covers: 1\n- Seam: browser\n\n#### 验证断言\n1. 第一条断言\n`)
    .join('\n');
  const plan = planText({ seam: 'browser' }).replace('## 执行记录', `${extraCases}\n## 执行记录`);
  const feature = await planWorkspace(t, { plan });
  const planned = await checkFeature(feature, 'plan');
  assert.ok(planned.notes.some((note) => note.includes('时间盒')), formatReport(planned, 'plan'));
  for (const phase of ['acceptance', 'review']) {
    const report = await checkFeature(feature, phase);
    assert.ok(!report.notes.some((note) => note.includes('时间盒')), `${phase}: ${formatReport(report, phase)}`);
  }
});

test('spec 缺少交付命令时 plan 不通过，验收与审查只提示（控制点 TC02）', async (t) => {
  const plain = await planWorkspace(t, { spec: specText({ commands: null }) });
  const plan = await checkFeature(plain, 'plan');
  assert.equal(plan.status, 'FAIL');
  assert.ok(codes(plan).includes('MISSING_SPEC_COMMANDS'));

  const { dir, feature } = await featureRepo(t, { spec: specText({ commands: null }) });
  qaRun(dir, feature, 'run', ['node', '--version']);
  await writeFile(path.join(feature, 'qa-plan.md'), planText({ rows: [`| TC01 | 1 | PASS | \`evidence/run.log\` | ${BINDING} | |`] }));
  const acceptance = await checkFeature(feature, 'acceptance');
  assert.equal(acceptance.status, 'PASS', formatReport(acceptance, 'acceptance'));
  assert.ok(acceptance.notes.some((note) => note.includes('## 交付命令')));
  const review = await checkFeature(feature, 'review');
  assert.ok(!codes(review).includes('MISSING_SPEC_COMMANDS'), formatReport(review, 'review'));
  assert.ok(review.notes.some((note) => note.includes('## 交付命令')));
});

test('冻结计划已有 PASS 或 FAIL 时验收不通过，只有 BLOCKED 时不报（控制点 TC03）', async (t) => {
  for (const status of ['PASS', 'FAIL']) {
    const { feature } = await featureRepo(t, {
      plan: planText({ rows: [`| TC01 | 1 | ${status} | \`evidence/old.log\` | | |`] }),
    });
    const report = await checkFeature(feature, 'acceptance');
    assert.equal(report.status, 'FAIL');
    assert.ok(codes(report).includes('PLAN_FROZEN_AFTER_EXECUTION'), `${status}: ${formatReport(report, 'acceptance')}`);
  }
  const { feature } = await featureRepo(t);
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(report).includes('PLAN_FROZEN_AFTER_EXECUTION'), formatReport(report, 'acceptance'));
});

test('PASS 证据日志早于基线时验收不通过，基线之后的日志不报（控制点 TC03）', async (t) => {
  const { dir, feature, scope } = await featureRepo(t);
  await writeDeep(path.join(feature, 'evidence', 'early.log'), runLog({ started: shift(scope.createdAt, -60_000) }));
  await writeFile(path.join(feature, 'qa-plan.md'), planText({ rows: [`| TC01 | 1 | PASS | \`evidence/early.log\` | ${BINDING} | |`] }));
  const early = await checkFeature(feature, 'acceptance');
  assert.equal(early.status, 'FAIL');
  const issue = early.issues.find((item) => item.code === 'EVIDENCE_BEFORE_BASELINE');
  assert.match(issue.message, /evidence\/early\.log/);
  assert.match(issue.message, /TC01 \/ 1/);

  qaRun(dir, feature, 'late', ['node', '--version']);
  await writeFile(path.join(feature, 'qa-plan.md'), planText({ rows: [`| TC01 | 1 | PASS | \`evidence/late.log\` | ${BINDING} | |`] }));
  const late = await checkFeature(feature, 'acceptance');
  assert.equal(late.status, 'PASS', formatReport(late, 'acceptance'));
});

test('交付日志早于基线时审查不通过，修复轮红日志早于基线不报（控制点 TC03）', async (t) => {
  const { feature, scope } = await featureRepo(t, {
    plan: planText({ delivery: [[COMMAND, '`evidence/delivery.log`']] }),
  });
  await writeDeep(path.join(feature, 'evidence', 'delivery.log'), runLog({ started: shift(scope.createdAt, -60_000) }));
  const review = await checkFeature(feature, 'review');
  assert.ok(codes(review).includes('EVIDENCE_BEFORE_BASELINE'), formatReport(review, 'review'));

  const fix = await featureRepo(t, {
    plan: planText({ kind: 'fix', reproduction: ['| TC01 | `evidence/red.log` |'] }),
  });
  await writeDeep(path.join(fix.feature, 'evidence', 'red.log'), runLog({
    exit: 1,
    started: shift(fix.scope.createdAt, -60_000),
    tree: 'red-tree',
  }));
  qaRun(fix.dir, fix.feature, 'green', ['node', '--version']);
  await writeFile(path.join(fix.feature, 'qa-plan.md'), planText({
    kind: 'fix',
    rows: [`| TC01 | 1 | PASS | \`evidence/green.log\` | ${BINDING} | |`],
    reproduction: ['| TC01 | `evidence/red.log` |'],
  }));
  const acceptance = await checkFeature(fix.feature, 'acceptance');
  assert.equal(acceptance.status, 'PASS', formatReport(acceptance, 'acceptance'));
  assert.ok(!codes(acceptance).includes('EVIDENCE_BEFORE_BASELINE'));
});

test('开工前已有阶段产物以外的改动时审查留下 NOTE（控制点 TC04）', async (t) => {
  const committed = { 'src/app.js': '原始实现\n', 'GLOSSARY.md': '# 术语\n', 'docs/adr/0001-x.md': '# ADR\n' };
  const scopes = ['src', 'GLOSSARY.md', 'docs'];
  const late = await featureRepo(t, {
    committed,
    dirty: { 'src/app.js': '开工前已改的实现\n', 'GLOSSARY.md': '# 术语（更新）\n', 'docs/adr/0001-x.md': '# ADR（更新）\n' },
    scopes,
  });
  const report = await checkFeature(late.feature, 'review');
  const notes = report.notes.filter((note) => note.startsWith('开工前范围内已有改动：'));
  assert.equal(notes.length, 1, formatReport(report, 'review'));
  assert.match(notes[0], /src\/app\.js/);
  assert.doesNotMatch(notes[0], /GLOSSARY\.md|docs\/adr/);
  assert.ok(!report.issues.some((item) => item.message.includes('src/app.js')));

  const artifacts = await featureRepo(t, {
    committed,
    dirty: { 'GLOSSARY.md': '# 术语（更新）\n', 'docs/adr/0001-x.md': '# ADR（更新）\n' },
    scopes,
  });
  const clean = await checkFeature(artifacts.feature, 'review');
  assert.ok(!clean.notes.some((note) => note.startsWith('开工前范围内已有改动：')), formatReport(clean, 'review'));
});

test('init 白名单外已改、之后经 add 纳入范围的路径同样留下 NOTE（控制点 TC04）', async (t) => {
  const { dir, feature } = await featureRepo(t, {
    committed: { 'src/app.js': '原始实现\n' },
    dirty: { 'src/app.js': '开工前已改的实现\n' },
  });
  const added = spawnSync(process.execPath, [REVIEW_PACKAGE, 'add', feature, '--', 'src'], { cwd: dir, encoding: 'utf8' });
  assert.equal(added.status, 0, added.stderr);
  const report = await checkFeature(feature, 'review');
  const notes = report.notes.filter((note) => note.startsWith('开工前范围内已有改动：'));
  assert.equal(notes.length, 1, formatReport(report, 'review'));
  assert.match(notes[0], /src\/app\.js/);
});

/** browser 用例仓库：特性目录内已有截图与过程脚本 */
async function browserRepo(t) {
  const repo = await featureRepo(t, { plan: planText({ seam: 'browser' }) });
  await writeDeep(path.join(repo.feature, 'screenshots', 'TC01.png'), '截图');
  await writeDeep(path.join(repo.feature, 'scripts', 'browser.mjs'), "console.log('[TC01-1] PASS 实测：可见');\nconsole.log('[TC01-2] PASS 实测：可见');\n");
  return repo;
}

async function acceptWithLog(feature, log, label) {
  await writeDeep(path.join(feature, 'evidence', `${label}.log`), log);
  await writeFile(path.join(feature, 'qa-plan.md'), planText({
    seam: 'browser',
    rows: [`| TC01 | 1 | PASS | ${SHOT}、\`evidence/${label}.log\` | | |`],
  }));
  return checkFeature(feature, 'acceptance');
}

test('browser 证据日志没有引用特性目录内的脚本时验收不通过（控制点 TC05）', async (t) => {
  const { feature, scope } = await browserRepo(t);
  const report = await acceptWithLog(feature, runLog({
    argv: ['ego-browser', 'nodejs', '-e', "await import('file:///tmp/qa-control-outside.mjs')"],
    started: shift(scope.createdAt, 1000),
  }), 'outside');
  assert.equal(report.status, 'FAIL');
  const issue = report.issues.find((item) => item.code === 'PROCESS_SCRIPT_OUTSIDE_SCRIPTS');
  assert.match(issue.message, /TC01 \/ 1/);
});

test('相对路径或 file URL 引用特性目录内脚本时通过，文件不存在仍报（控制点 TC05）', async (t) => {
  const { dir, feature, scope } = await browserRepo(t);
  qaRun(dir, feature, 'relative', ['node', '.scratch/feature/scripts/browser.mjs']);
  await writeFile(path.join(feature, 'qa-plan.md'), planText({
    seam: 'browser',
    rows: [`| TC01 | 1 | PASS | ${SHOT}、\`evidence/relative.log\` | | |`],
  }));
  const relative = await checkFeature(feature, 'acceptance');
  assert.equal(relative.status, 'PASS', formatReport(relative, 'acceptance'));

  const started = shift(scope.createdAt, 1000);
  const url = pathToFileURL(path.join(feature, 'scripts', 'browser.mjs')).href;
  const fileUrl = await acceptWithLog(feature, runLog({
    argv: ['ego-browser', 'nodejs', '-e', `await import('${url}')`],
    started,
  }), 'file-url');
  assert.ok(!codes(fileUrl).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), formatReport(fileUrl, 'acceptance'));

  const missing = await acceptWithLog(feature, runLog({
    argv: ['node', '.scratch/feature/scripts/missing.mjs'],
    started,
  }), 'missing');
  assert.ok(codes(missing).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), formatReport(missing, 'acceptance'));
});

test('非 browser 接缝不检查入口脚本，只引用截图仍按缺失报错（控制点 TC05）', async (t) => {
  const unit = await featureRepo(t);
  qaRun(unit.dir, unit.feature, 'run', ['node', '--version']);
  await writeFile(path.join(unit.feature, 'qa-plan.md'), planText({ rows: [`| TC01 | 1 | PASS | \`evidence/run.log\` | ${BINDING} | |`] }));
  const unitReport = await checkFeature(unit.feature, 'acceptance');
  assert.equal(unitReport.status, 'PASS', formatReport(unitReport, 'acceptance'));

  const { feature, scope } = await browserRepo(t);
  const screenshotOnly = await acceptWithLog(feature, runLog({
    argv: ['ego-browser', 'nodejs', '-e', "await page.screenshot({ path: '.scratch/feature/screenshots/TC01.png' })"],
    started: shift(scope.createdAt, 1000),
  }), 'screenshot-only');
  assert.ok(codes(screenshotOnly).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), formatReport(screenshotOnly, 'acceptance'));
});

test('计划文件或 prechange 快照中的脚本不算入口脚本（控制点 TC05）', async (t) => {
  const { feature, scope } = await browserRepo(t);
  const started = shift(scope.createdAt, 1000);
  await writeDeep(path.join(feature, '_qa', 'prechange', 'files', 'snapshot.mjs'), '// 快照中的脚本\n');
  for (const [label, target] of [['plan-file', 'qa-plan.md'], ['prechange-script', '_qa/prechange/files/snapshot.mjs']]) {
    const report = await acceptWithLog(feature, runLog({
      argv: ['ego-browser', 'nodejs', '-e', `await run('.scratch/feature/${target}')`],
      started,
    }), label);
    assert.ok(codes(report).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), `${label}: ${formatReport(report, 'acceptance')}`);
  }
});

test('同一 TC 内任一 PASS 日志引用了特性目录内脚本即满足（控制点 TC05）', async (t) => {
  const { dir, feature, scope } = await browserRepo(t);
  qaRun(dir, feature, 'with-script', ['node', '.scratch/feature/scripts/browser.mjs']);
  await writeDeep(path.join(feature, 'evidence', 'inline.log'), runLog({
    argv: ['ego-browser', 'nodejs', '-e', 'await page.reload()'],
    started: shift(scope.createdAt, 1000),
    body: '[TC01-2] PASS 实测：已刷新',
  }));
  await writeFile(path.join(feature, 'qa-plan.md'), planText({
    seam: 'browser',
    assertions: ['第一条断言', '第二条断言'],
    rows: [
      `| TC01 | 1 | PASS | ${SHOT}、\`evidence/with-script.log\` | | |`,
      `| TC01 | 2 | PASS | ${SHOT}、\`evidence/inline.log\` | | |`,
    ],
  }));
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(report).includes('PROCESS_SCRIPT_OUTSIDE_SCRIPTS'), formatReport(report, 'acceptance'));
});

test('TC05 空测试输出即使 exit 0 也不能作为执行或交付绿证据', async (t) => {
  const execution = await featureRepo(t);
  await writeDeep(path.join(execution.feature, 'evidence/empty.log'), runLog({
    started: shift(execution.scope.createdAt, 1000),
    body: 'No projects matched the filters',
  }));
  await writeFile(path.join(execution.feature, 'qa-plan.md'), planText({
    rows: [`| TC01 | 1 | PASS | \`evidence/empty.log\` | ${BINDING} | |`],
  }));
  const acceptance = await checkFeature(execution.feature, 'acceptance');
  assert.ok(codes(acceptance).includes('EMPTY_EVIDENCE'), formatReport(acceptance, 'acceptance'));

  const delivery = await featureRepo(t, {
    plan: planText({ delivery: [[COMMAND, '`evidence/delivery.log`']] }),
  });
  await writeDeep(path.join(delivery.feature, 'evidence/delivery.log'), runLog({
    started: shift(delivery.scope.createdAt, 1000),
    body: 'Test Files  0 passed (0)',
  }));
  const review = await checkFeature(delivery.feature, 'review');
  assert.ok(codes(review).includes('EMPTY_VERIFICATION'), formatReport(review, 'review'));

  const failed = await featureRepo(t);
  await writeDeep(path.join(failed.feature, 'evidence/failed.log'), runLog({
    started: shift(failed.scope.createdAt, 1000),
    body: 'No test files found',
    exit: 1,
  }));
  await writeFile(path.join(failed.feature, 'qa-plan.md'), planText({
    rows: [`| TC01 | 1 | PASS | \`evidence/failed.log\` | ${BINDING} | |`],
  }));
  const failedReport = await checkFeature(failed.feature, 'acceptance');
  assert.ok(codes(failedReport).includes('EVIDENCE_EXIT_NONZERO'));
  assert.ok(!codes(failedReport).includes('EMPTY_EVIDENCE'));
});
