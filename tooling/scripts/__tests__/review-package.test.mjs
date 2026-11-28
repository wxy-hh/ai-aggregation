import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = fileURLToPath(new URL('../review-package.mjs', import.meta.url));

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

async function repo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'review-package-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n');
  await writeFile(path.join(dir, 'delete-me.txt'), '待删除行\n');
  git(dir, ['add', 'tracked.txt', 'delete-me.txt']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n开工前已有修改\n');
  await writeFile(path.join(dir, 'untouched.txt'), '开工前不应纳入\n');
  await writeFile(path.join(dir, 'existing-untracked.txt'), '开工前未跟踪内容\n');
  await mkdir(path.join(dir, '.scratch', 'feature'), { recursive: true });
  return dir;
}

function run(repo, command, feature, paths = []) {
  return spawnSync(process.execPath, [SCRIPT, command, feature, '--', ...paths], {
    cwd: repo,
    encoding: 'utf8',
  });
}

function runArgs(repo, args) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    cwd: repo,
    encoding: 'utf8',
  });
}

/** 建立基线并 collect；返回特性目录与 challenge */
async function collected(t, { round } = {}) {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n本任务修改\n');
  const args = ['collect', feature, ...(round ? ['--round', round] : [])];
  const collect = runArgs(dir, args);
  assert.equal(collect.status, 0, collect.stderr);
  const challenge = JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
  return { dir, feature, challenge };
}

function sealArgs(feature, overrides = {}) {
  const values = {
    round: 'r1',
    axis: 'standards',
    file: 'review/r1-standards.md',
    kind: 'subagent',
    host: 'Claude Code',
    ...overrides,
  };
  return [
    'seal',
    feature,
    '--round', values.round,
    '--axis', values.axis,
    '--file', values.file,
    '--reviewer-kind', values.kind,
    '--host', values.host,
  ];
}

async function sealStateDigests(feature) {
  const files = {
    report: 'review/r1-standards.md',
    receipt: 'review/r1-standards.source.json',
    challenge: '_qa/review-challenge.json',
    manifest: '_qa/review-package.json',
  };
  return Object.fromEntries(await Promise.all(Object.entries(files).map(async ([key, relative]) => {
    const content = await readFile(path.join(feature, relative));
    return [key, createHash('sha256').update(content).digest('hex')];
  })));
}

async function reReviewFixture(t, { bodyOnly = false, legacyReference = false } = {}) {
  const { dir, feature } = await collected(t, { round: 'r2' });
  await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 复审语义一致\n\n## 交付命令\n\n```bash\nnode --version\n```\n');
  await writeFile(path.join(feature, 'qa-plan.md'), [
    'QA Schema: 4',
    'QA Mode: inline',
    '',
    '### TC01: 复审夹具',
    '- Priority: P1',
    '- Covers: 1',
    '- Seam: unit',
    '',
    '#### 验证断言',
    '1. 保持阻塞以便继续原文核对。',
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --version` | 待执行 |',
  ].join('\n'));
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-H1] 原始硬违规\n');
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), '无发现\n');
  await writeFile(
    path.join(feature, 'review', 'r2-standards.md'),
    legacyReference
      ? '- 关于 **[S-H1]**：已复核\n'
      : bodyOnly ? '正文仅引用 S-H1，没有给出复审响应。\n' : '## S-H1 已修\n',
  );
  await writeFile(path.join(feature, 'review', 'r2-spec-axis.md'), '无新增审查发现\n');
  const standardsSeal = runArgs(dir, [
    ...sealArgs(feature, { round: 'r2', file: 'review/r2-standards.md', host: 'Kimi Code' }),
    '--pending-ids', 'S-H1',
  ]);
  const specSeal = runArgs(dir, sealArgs(feature, {
    round: 'r2', axis: 'spec', file: 'review/r2-spec-axis.md', host: 'Kimi Code',
  }));
  assert.equal(specSeal.status, 0, specSeal.stderr);
  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Kimi Code；两轴独立子代理',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| S-H1 | 本次修 | 已修 | r1 → r2 已修 | 静态：测试夹具 | |',
  ].join('\n'));
  return { dir, feature, standardsSeal };
}

test('快照只包含开工后的修改、创建和删除，不改变 index，且机器状态只写入 _qa', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  const scope = ['tracked.txt', 'untouched.txt', 'delete-me.txt', 'created.txt', 'existing-untracked.txt'];
  const init = run(dir, 'init', feature, scope);
  assert.equal(init.status, 0, init.stderr);
  const before = git(dir, ['diff', '--cached', '--name-only']);

  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n本任务修改\n');
  await writeFile(path.join(dir, 'created.txt'), '本任务新增\n');
  await writeFile(path.join(dir, 'existing-untracked.txt'), '本任务修改未跟踪内容\n');
  await rm(path.join(dir, 'delete-me.txt'));

  const collect = run(dir, 'collect', feature, scope);
  assert.equal(collect.status, 0, collect.stderr);
  const after = git(dir, ['diff', '--cached', '--name-only']);
  const patch = await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));

  assert.match(patch, /本任务修改/);
  assert.match(patch, /本任务新增/);
  assert.match(patch, /本任务修改未跟踪内容/);
  assert.match(patch, /待删除行/);
  assert.match(patch, /-开工前已有修改\n\+本任务修改/);
  assert.match(patch, /-开工前未跟踪内容\n\+本任务修改未跟踪内容/);
  assert.doesNotMatch(patch, /开工前不应纳入/);
  assert.equal(before, after);
  assert.deepEqual(manifest.unreviewed, []);
  assert.deepEqual(new Set(manifest.changedFiles), new Set(['tracked.txt', 'created.txt', 'delete-me.txt', 'existing-untracked.txt']));
  // Schema 4：机器状态只写入 _qa/，特性目录顶层不再生成（TC01-3）
  assert.deepEqual((await readdir(feature)).sort(), ['_qa']);
  assert.deepEqual((await readdir(path.join(feature, '_qa'))).sort(), ['prechange', 'review-brief.md', 'review-challenge.json', 'review-package.diff', 'review-package.json', 'round-snapshots', 'scope.json']);
});

test('开工前未跟踪内容未改变时不会进入审查包', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['existing-untracked.txt']).status, 0);

  const collect = run(dir, 'collect', feature, ['existing-untracked.txt']);
  assert.equal(collect.status, 0, collect.stderr);
  const patch = await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.equal(patch, '');
  assert.deepEqual(manifest.changedFiles, []);
});

test('init 拒绝重置已有基线', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  const second = run(dir, 'init', feature, ['tracked.txt']);
  assert.notEqual(second.status, 0);
  assert.match(second.stderr, /SCOPE_EXISTS/);
});

test('敏感文件不读取，只进入 unreviewed', async (t) => {
  const dir = await repo(t);
  await writeFile(path.join(dir, '.env'), 'PRIVATE_TOKEN=not-for-review\n');
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['.env', 'tracked.txt']).status, 0);

  await writeFile(path.join(dir, '.env'), 'PRIVATE_TOKEN=changed-after-init\n');
  await writeFile(path.join(dir, 'tracked.txt'), '本任务修改\n');
  const collect = run(dir, 'collect', feature, ['.env', 'tracked.txt']);
  assert.equal(collect.status, 0, collect.stderr);
  const patch = await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.doesNotMatch(patch, /PRIVATE_TOKEN/);
  assert.ok(manifest.unreviewed.some((item) => item.path === '.env'));
});

test('review-package 安装模板与工具脚本保持逐字一致', async () => {
  const templatePath = fileURLToPath(
    new URL('../../../.claude/skills/setup-qa-workflow/templates/review-package.mjs', import.meta.url),
  );
  const [script, template] = await Promise.all([
    readFile(SCRIPT, 'utf8'),
    readFile(templatePath, 'utf8'),
  ]);
  assert.equal(template, script);
});

test('开工时冻结 qa-plan，并写入 v2 基线（TC04）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  const plan = 'QA Schema: 3\nQA Mode: inline\n\n### TC01: 示例\n';
  await writeFile(path.join(feature, 'qa-plan.md'), plan);

  const init = run(dir, 'init', feature, ['tracked.txt']);
  assert.equal(init.status, 0, init.stderr);
  assert.match(init.stdout, /计划已冻结：_qa\/prechange\/qa-plan\.md/);
  assert.equal(await readFile(path.join(feature, '_qa', 'prechange', 'qa-plan.md'), 'utf8'), plan);
  const scope = JSON.parse(await readFile(path.join(feature, '_qa', 'scope.json'), 'utf8'));
  assert.equal(scope.version, 2);
  assert.deepEqual(scope.fromBase, []);
  assert.ok(scope.createdAt);
  assert.deepEqual(scope.dirtyAtInit.inScope, ['tracked.txt']);
});

test('未变化的跳过文件不算未审查，变化后才进入 unreviewed（TC05）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeFile(path.join(dir, '.env'), 'PRIVATE_TOKEN=do-not-copy\n');
  await writeFile(path.join(dir, 'image.png'), Buffer.from([0, 1, 2, 3]));
  await writeFile(path.join(dir, 'large.txt'), '大'.repeat(180 * 1024));
  const paths = ['.env', 'image.png', 'large.txt'];
  assert.equal(run(dir, 'init', feature, paths).status, 0);

  const unchanged = run(dir, 'collect', feature);
  assert.equal(unchanged.status, 0, unchanged.stderr);
  const unchangedManifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.deepEqual(unchangedManifest.unreviewed, []);

  await writeFile(path.join(dir, '.env'), 'PRIVATE_TOKEN=changed-but-still-private\n');
  await writeFile(path.join(dir, 'image.png'), Buffer.from([0, 1, 2, 4]));
  await writeFile(path.join(dir, 'large.txt'), '变'.repeat(180 * 1024));
  const changed = run(dir, 'collect', feature);
  assert.equal(changed.status, 0, changed.stderr);
  const changedManifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.deepEqual(new Set(changedManifest.unreviewed.map((item) => item.path)), new Set(paths));
  const patch = await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8');
  assert.doesNotMatch(patch, /PRIVATE_TOKEN|do-not-copy|changed-but-still-private/);
});

test('代码未变时重复 collect 沿用首次打包时间，代码变化后刷新', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n第一次修改\n');
  assert.equal(run(dir, 'collect', feature).status, 0);
  const manifestPath = path.join(feature, '_qa', 'review-package.json');
  const first = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.ok(!Number.isNaN(Date.parse(first.packagedAt)));

  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(run(dir, 'collect', feature).status, 0);
  const again = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(again.treeDigest, first.treeDigest);
  assert.equal(again.packagedAt, first.packagedAt);

  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n第二次修改\n');
  assert.equal(run(dir, 'collect', feature).status, 0);
  const changed = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.notEqual(changed.treeDigest, first.treeDigest);
  assert.ok(Date.parse(changed.packagedAt) > Date.parse(first.packagedAt));
});

test('声明范围被收窄时 collect 拒绝生成审查包（TC05）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  const scopePath = path.join(feature, '_qa', 'scope.json');
  const scope = JSON.parse(await readFile(scopePath, 'utf8'));
  scope.scopes = [];
  await writeFile(scopePath, JSON.stringify(scope));

  const collect = run(dir, 'collect', feature);
  assert.equal(collect.status, 1);
  assert.match(collect.stderr, /SCOPE_NARROWED/);
  assert.match(collect.stderr, /不要修改 _qa\/scope\.json.*扩大范围请用 add/s);
});

test('中文路径在 init、add 与 collect 中保持原样（TC05）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  const relative = '中文 文档.txt';
  await writeFile(path.join(dir, relative), '开工前内容\n');
  assert.equal(run(dir, 'init', feature, [relative]).status, 0);
  await writeFile(path.join(dir, relative), '本任务修改\n');

  const collect = run(dir, 'collect', feature);
  assert.equal(collect.status, 0, collect.stderr);
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.deepEqual(manifest.changedFiles, [relative]);
  assert.match(await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8'), /本任务修改/);
});

test('add 以 base 为前值扩大范围且不改变 git index（TC05）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeFile(path.join(dir, 'new-file.txt'), '开工前新增文件\n');
  const indexBefore = git(dir, ['diff', '--cached', '--name-only']);
  assert.equal(run(dir, 'init', feature, ['delete-me.txt']).status, 0);

  const add = run(dir, 'add', feature, ['tracked.txt', 'new-file.txt']);
  assert.equal(add.status, 0, add.stderr);
  await writeFile(path.join(dir, 'tracked.txt'), '本任务修改\n');
  await writeFile(path.join(dir, 'new-file.txt'), '本任务新增内容\n');
  const collect = run(dir, 'collect', feature);
  assert.equal(collect.status, 0, collect.stderr);
  const indexAfter = git(dir, ['diff', '--cached', '--name-only']);

  assert.equal(indexAfter, indexBefore);
  const patch = await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8');
  assert.match(patch, /-原始行\n\+本任务修改/);
  assert.match(patch, /\+本任务新增内容/);
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.deepEqual(new Set(manifest.changedFiles), new Set(['tracked.txt', 'new-file.txt']));
  assert.deepEqual(manifest.preexisting, []);
  assert.deepEqual(manifest.fromBase, ['new-file.txt', 'tracked.txt']);
});

test('collect 区分开工后新增、继续修改、已提交与稳定的范围外改动（TC06）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['delete-me.txt']).status, 0);
  await writeFile(path.join(dir, 'existing-untracked.txt'), '开工后继续修改\n');
  await writeFile(path.join(dir, 'outside-new.txt'), '开工后新增\n');
  await writeFile(path.join(dir, 'tracked.txt'), '开工后提交\n');
  git(dir, ['add', 'tracked.txt']);
  git(dir, ['commit', '--quiet', '-m', '范围外提交']);

  const collect = run(dir, 'collect', feature);
  assert.equal(collect.status, 0, collect.stderr);
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  const outOfScope = Object.fromEntries(manifest.outOfScope.map((item) => [item.path, item.reason]));
  assert.equal(outOfScope['outside-new.txt'], '开工后新增改动');
  assert.equal(outOfScope['existing-untracked.txt'], '开工后继续修改');
  assert.equal(outOfScope['tracked.txt'], '开工后已提交');
  assert.equal(outOfScope['untouched.txt'], undefined);
});

test('collect 在包头标注白名单内被开工后提交改过的文件', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  await writeFile(path.join(dir, 'tracked.txt'), '他人提交\n');
  git(dir, ['add', 'tracked.txt']);
  git(dir, ['commit', '--quiet', '-m', '他人提交']);

  assert.equal(run(dir, 'collect', feature).status, 0);
  const patch = await readFile(path.join(feature, '_qa', 'review-package.diff'), 'utf8');
  assert.match(patch.split('\n')[0], /^# 以下文件含开工后的提交.*tracked\.txt$/);
  assert.match(patch, /\+他人提交/);
});

test('tree 摘要与 digest 一致并随范围内内容变化（TC02）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  const { computeTreeDigest, readScope, resolveFeature, listFiles, inScope } = await import(
    new URL('../review-package.mjs', import.meta.url)
  );
  const { root } = await resolveFeature(dir, feature);
  const scope = await readScope(feature);
  const first = await computeTreeDigest(root, scope.scopes);
  const digest = run(dir, 'digest', feature);
  assert.equal(digest.status, 0, digest.stderr);
  assert.equal(digest.stdout.trim(), `tree: ${first}`);
  assert.deepEqual(listFiles(root, scope.scopes), ['tracked.txt']);
  assert.equal(inScope('tracked.txt', scope.scopes), true);
  assert.equal(inScope('tracked.txt/child', scope.scopes), true);
  assert.equal(inScope('other.txt', scope.scopes), false);

  await writeFile(path.join(dir, 'tracked.txt'), '改变摘要\n');
  assert.notEqual(await computeTreeDigest(root, scope.scopes), first);
});

test('add 与 init、collect 使用一致的符号链接哈希（TC05）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeFile(path.join(dir, 'file.txt'), '链接目标\n');
  await symlink('file.txt', path.join(dir, 'link.txt'));
  git(dir, ['add', 'file.txt', 'link.txt']);
  git(dir, ['commit', '--quiet', '-m', '加入符号链接']);
  assert.equal(run(dir, 'init', feature, ['delete-me.txt']).status, 0);

  const add = run(dir, 'add', feature, ['link.txt']);
  assert.equal(add.status, 0, add.stderr);
  const collect = run(dir, 'collect', feature);
  assert.equal(collect.status, 0, collect.stderr);
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.deepEqual(manifest.unreviewed, []);
});

test('范围外文件 git mv 到范围内时保留原路径（TC06）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeFile(path.join(dir, 'outside.txt'), '范围外原始内容\n');
  git(dir, ['add', 'outside.txt']);
  git(dir, ['commit', '--quiet', '-m', '加入范围外文件']);
  assert.equal(run(dir, 'init', feature, ['scoped.txt']).status, 0);
  git(dir, ['mv', 'outside.txt', 'scoped.txt']);

  const collect = run(dir, 'collect', feature);
  assert.equal(collect.status, 0, collect.stderr);
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  const paths = manifest.outOfScope.map((item) => item.path);
  assert.ok(paths.includes('outside.txt'), JSON.stringify(manifest.outOfScope));
  assert.ok(!paths.includes('scoped.txt'));
});


test('collect 发放一次性 challenge 并绑定当前审查包', async (t) => {
  const { dir, feature, challenge } = await collected(t, { round: 'r2' });
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.equal(challenge.round, 'r2');
  assert.ok(challenge.nonce);
  assert.equal(challenge.treeDigest, manifest.treeDigest);
  assert.equal(challenge.packagedAt, manifest.packagedAt);

  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r2-standards.md'), '[S-J1] 判断建议\n');
  const seal = sealArgs(feature, { round: 'r2', file: 'review/r2-standards.md' });
  const firstSeal = runArgs(dir, seal);
  assert.equal(firstSeal.status, 0, firstSeal.stderr);
  const receiptPath = path.join(feature, 'review', 'r2-standards.source.json');
  const firstReceipt = JSON.parse(await readFile(receiptPath, 'utf8'));

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(runArgs(dir, ['collect', feature, '--round', 'r2']).status, 0);
  const next = JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
  assert.notEqual(next.nonce, challenge.nonce);
  assert.equal(next.round, 'r2');

  const replay = runArgs(dir, seal);
  assert.equal(replay.status, 1);
  assert.match(replay.stderr, /凭据.*(?:nonce|已存在)/);
  assert.deepEqual(JSON.parse(await readFile(receiptPath, 'utf8')), firstReceipt);

  assert.equal(runArgs(dir, ['collect', feature, '--round', 'r1']).status, 0);
  const explicit = JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
  assert.equal(explicit.round, 'r1');
});

test('collect 未指定轮次时按现有审查原文推导下一轮', async (t) => {
  const { dir, feature, challenge } = await collected(t);
  assert.equal(challenge.round, 'r1');

  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-J1] 判断建议\n');
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), '[P-M1] 缺失\n');
  assert.equal(runArgs(dir, ['collect', feature]).status, 0);
  const next = JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
  assert.equal(next.round, 'r2');
  assert.notEqual(next.nonce, challenge.nonce);
});

test('collect 未指定轮次时按最新已有轮次推导（单轴与跳轮）', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-J1] 判断建议\n');
  assert.equal(runArgs(dir, ['collect', feature]).status, 0);
  assert.equal(JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8')).round, 'r2');

  await writeFile(path.join(feature, 'review', 'r3-standards.md'), '[S-J1] 判断建议\n');
  await writeFile(path.join(feature, 'review', 'r3-spec-axis.md'), '[P-M1] 缺失\n');
  assert.equal(runArgs(dir, ['collect', feature, '--allow-manual-round']).status, 0);
  assert.equal(JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8')).round, 'r4');
});

test('seal 拒绝与审查包 manifest 不一致的 challenge', async (t) => {
  for (const [field, value] of [['treeDigest', '0'.repeat(64)], ['packagedAt', new Date(0).toISOString()]]) {
    const { dir, feature } = await collected(t);
    const challengePath = path.join(feature, '_qa', 'review-challenge.json');
    const challenge = JSON.parse(await readFile(challengePath, 'utf8'));
    await writeFile(challengePath, `${JSON.stringify({ ...challenge, [field]: value }, null, 2)}\n`);
    await mkdir(path.join(feature, 'review'), { recursive: true });
    await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-J1] 判断建议\n');
    const seal = runArgs(dir, sealArgs(feature));
    assert.equal(seal.status, 1, `${field}: ${seal.stdout}`);
    assert.match(seal.stderr, new RegExp(field));
    assert.deepEqual((await readdir(path.join(feature, 'review'))).sort(), ['r1-standards.md']);
  }
});

test('seal 拒绝非法轴值', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-J1] 判断建议\n');
  const seal = runArgs(dir, [...sealArgs(feature), '--axis', 'other']);
  assert.equal(seal.status, 1);
  assert.match(seal.stderr, /--axis/);
});

test('seal 生成最小凭据并打印 nonce 与原文哈希', async (t) => {
  const { dir, feature, challenge } = await collected(t);
  const standards = '## Standards\n[P-W1] 实现有误\n';
  const spec = '## Spec\n[P-M2] 缺失\n';
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), standards);
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), spec);

  const standardsSeal = runArgs(dir, sealArgs(feature));
  assert.equal(standardsSeal.status, 0, standardsSeal.stderr);
  const standardsHash = createHash('sha256').update(standards).digest('hex');
  assert.equal(standardsSeal.stdout.trim(), `QA_REVIEW_RECEIPT: ${challenge.nonce}|${standardsHash}`);
  const standardsReceipt = JSON.parse(await readFile(path.join(feature, 'review', 'r1-standards.source.json'), 'utf8'));
  assert.deepEqual(Object.keys(standardsReceipt).sort(), [
    'axis', 'completedAt', 'diffBytes', 'dispatchedAt', 'errorClass', 'feature', 'host', 'nonce',
    'repairAndWaitMs', 'reportPath', 'reviewUnits', 'reviewerKind', 'round', 'schemaVersion',
    'sealAttempts', 'sha256', 'snapshotHash', 'startedAt', 'terminalState', 'treeDigest',
  ]);
  assert.equal(standardsReceipt.schemaVersion, 1);
  assert.equal(standardsReceipt.feature, '.scratch/feature');
  assert.equal(standardsReceipt.round, 'r1');
  assert.equal(standardsReceipt.axis, 'standards');
  assert.equal(standardsReceipt.nonce, challenge.nonce);
  assert.equal(standardsReceipt.reviewerKind, 'subagent');
  assert.equal(standardsReceipt.host, 'Claude Code');
  assert.equal(standardsReceipt.reportPath, 'review/r1-standards.md');
  assert.equal(standardsReceipt.sha256, standardsHash);
  assert.ok(!Number.isNaN(Date.parse(standardsReceipt.completedAt)));

  const specSeal = runArgs(dir, sealArgs(feature, {
    axis: 'spec',
    file: 'review/r1-spec-axis.md',
    kind: 'external-session',
    host: 'Codex',
  }));
  assert.equal(specSeal.status, 0, specSeal.stderr);
  const specReceipt = JSON.parse(await readFile(path.join(feature, 'review', 'r1-spec-axis.source.json'), 'utf8'));
  assert.equal(specReceipt.axis, 'spec');
  assert.equal(specReceipt.reportPath, 'review/r1-spec-axis.md');
  assert.equal(specReceipt.reviewerKind, 'external-session');
  assert.equal(specReceipt.host, 'Codex');
  assert.equal(specReceipt.sha256, createHash('sha256').update(spec).digest('hex'));
});

test('seal 拒绝错误轮次、轴、路径与缺失 challenge', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-J1] 判断建议\n');
  await writeFile(path.join(feature, 'review', 'other.md'), '[S-J1] 其他\n');

  const attempts = [
    runArgs(dir, sealArgs(feature, { round: 'r2' })),
    runArgs(dir, sealArgs(feature, { axis: 'spec' })),
    runArgs(dir, sealArgs(feature, { file: 'review/other.md' })),
  ];
  for (const attempt of attempts) {
    assert.equal(attempt.status, 1, attempt.stdout);
    assert.match(attempt.stderr, /seal|轮次|轴|路径|challenge/);
  }
  assert.deepEqual((await readdir(path.join(feature, 'review'))).sort(), ['other.md', 'r1-standards.md']);

  await rm(path.join(feature, '_qa', 'review-challenge.json'));
  const missing = runArgs(dir, sealArgs(feature));
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /review-challenge\.json/);
  assert.deepEqual((await readdir(path.join(feature, 'review'))).sort(), ['other.md', 'r1-standards.md']);
});

test('seal 拒绝覆盖已存在的凭据', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  const report = path.join(feature, 'review', 'r1-standards.md');
  await writeFile(report, '[S-J1] 判断建议\n');
  assert.equal(runArgs(dir, sealArgs(feature)).status, 0);

  const receiptPath = path.join(feature, 'review', 'r1-standards.source.json');
  const before = await readFile(receiptPath, 'utf8');
  await writeFile(report, '[S-J1] 判断建议（已修改）\n');
  const second = runArgs(dir, sealArgs(feature));
  assert.equal(second.status, 1);
  assert.match(second.stderr, /已存在|拒绝覆盖/);
  assert.equal(await readFile(receiptPath, 'utf8'), before);
});

test('凭据只包含元数据与哈希，不包含审查正文', async (t) => {
  const { dir, feature } = await collected(t);
  const secretish = '这是一段不应出现在凭据里的审查正文。';
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), `[S-J1] ${secretish}\n`);
  assert.equal(runArgs(dir, sealArgs(feature)).status, 0);

  const receiptText = await readFile(path.join(feature, 'review', 'r1-standards.source.json'), 'utf8');
  assert.doesNotMatch(receiptText, /不应出现在凭据里的审查正文/);
  const receipt = JSON.parse(receiptText);
  assert.equal('model' in receipt, false);
  assert.equal('prompt' in receipt, false);
  assert.equal('report' in receipt, false);
});

test('seal 在复审轮写入待复核编号', async (t) => {
  const { dir, feature } = await collected(t, { round: 'r2' });
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r2-standards.md'), '[S-J1] 判断建议\n');
  const seal = runArgs(dir, [
    ...sealArgs(feature, { round: 'r2', file: 'review/r2-standards.md' }),
    '--pending-ids', 'P-W2, P-M1',
  ]);
  assert.equal(seal.status, 0, seal.stderr);
  const receipt = JSON.parse(await readFile(path.join(feature, 'review', 'r2-standards.source.json'), 'utf8'));
  assert.deepEqual(receipt.pendingIds, ['P-W2', 'P-M1']);
});

test('TC06 Schema 4 只放行显式声明的计划新建路径', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(path.join(dir, 'existing-dir'), { recursive: true });
  await writeFile(path.join(dir, 'existing-dir', 'nested.txt'), '现存目录内容\n');
  await writeFile(path.join(feature, 'qa-plan.md'), 'QA Schema: 4\n\n## 计划新建路径\n- `planned.txt`\n');
  const unknown = run(dir, 'init', feature, ['tracked.txt', 'typo.txt']);
  assert.notEqual(unknown.status, 0);
  assert.match(unknown.stderr, /UNKNOWN_SCOPE_PATH.*typo\.txt/);

  const planned = run(dir, 'init', feature, ['tracked.txt', 'planned.txt', 'existing-dir']);
  assert.equal(planned.status, 0, planned.stderr);
  const scope = JSON.parse(await readFile(path.join(feature, '_qa', 'scope.json'), 'utf8'));
  assert.ok(scope.scopes.includes('planned.txt'));
  assert.ok(scope.scopes.includes('tracked.txt'));
  assert.ok(scope.scopes.includes('existing-dir'));
});

test('TC06 base 已删除文件和普通无计划新文件保持兼容', async (t) => {
  const deleted = await repo(t);
  const deletedFeature = path.join(deleted, '.scratch', 'feature');
  await writeFile(path.join(deletedFeature, 'qa-plan.md'), 'QA Schema: 4\n');
  await rm(path.join(deleted, 'delete-me.txt'));
  const deletedResult = run(deleted, 'init', deletedFeature, ['delete-me.txt']);
  assert.equal(deletedResult.status, 0, deletedResult.stderr);

  const ordinary = await repo(t);
  const ordinaryFeature = path.join(ordinary, '.scratch', 'feature');
  const ordinaryResult = run(ordinary, 'init', ordinaryFeature, ['created.txt']);
  assert.equal(ordinaryResult.status, 0, ordinaryResult.stderr);
});

test('qaArtifactsDigest 覆盖 scripts/screenshots 与去除交付段的 qa-plan，且修改交付段不改变摘要', async (t) => {
  const { computeQaArtifactsDigest } = await import(new URL('../review-package.mjs', import.meta.url).href);
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(path.join(feature, 'scripts'), { recursive: true });
  await mkdir(path.join(feature, 'screenshots'), { recursive: true });
  await writeFile(path.join(feature, 'scripts', 'tc01.mjs'), 'console.log("ok");\n');
  await writeFile(path.join(feature, 'screenshots', 'TC01.png'), 'png1');
  await writeFile(path.join(feature, 'qa-plan.md'), [
    'QA Schema: 4',
    '## 执行记录',
    '| TC01 | 1 | PASS | `evidence/run.log` | | |',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `pnpm test` | 待执行 |',
    '## 计划变更',
    '- 无',
  ].join('\n'));

  const d1 = await computeQaArtifactsDigest(feature);
  // 回填 ## 交付验证 日志路径不得改变 qaArtifactsDigest
  await writeFile(path.join(feature, 'qa-plan.md'), (await readFile(path.join(feature, 'qa-plan.md'), 'utf8')).replace('待执行', '`evidence/delivery.log`'));
  const d2 = await computeQaArtifactsDigest(feature);
  assert.equal(d2, d1);

  // 修改 scripts/、screenshots/ 或 ## 执行记录 必须立刻改变 qaArtifactsDigest
  await writeFile(path.join(feature, 'scripts', 'tc01.mjs'), 'console.log("changed");\n');
  const d3 = await computeQaArtifactsDigest(feature);
  assert.notEqual(d3, d1);
});

test('collect 接入 qa-preflight（ERROR 阻断，--skip-preflight 可跳过）并支持 v2 清单与骨架', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 需求\n\n## 交付命令\n```bash\npnpm test\n```\n');
  await writeFile(path.join(feature, 'qa-plan.md'), [
    'QA Schema: 4',
    'QA Mode: inline',
    'QA Review Coverage: 2',
    '### TC01: 示例',
    '- Priority: P0',
    '- Covers: 1',
    '- Seam: unit',
    '#### 验证断言',
    '1. 断言甲',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `pnpm test` | 待执行 |',
  ].join('\n'));
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  await mkdir(path.join(feature, 'scripts'), { recursive: true });
  await writeFile(path.join(feature, 'scripts', 'bad.mjs'), "check(true, '[TC01-1] PASS 实测：假断言');\n");

  const blocked = runArgs(dir, ['collect', feature]);
  assert.equal(blocked.status, 1, blocked.stdout);
  assert.match(blocked.stdout + blocked.stderr, /PSEUDO_ASSERTION|check\(true\)/);

  // 允许应急 --skip-preflight 跳过
  const { computeQaPlanDigest } = await import(new URL('../qa-spec-review.mjs', import.meta.url).href);
  const { computeEvidenceTreeDigest, readScope } = await import(new URL('../review-package.mjs', import.meta.url).href);
  const scope = await readScope(feature);
  const evidenceTree = await computeEvidenceTreeDigest(dir, scope.scopes);
  const qaPlanDigest = computeQaPlanDigest(await readFile(path.join(feature, 'qa-plan.md'), 'utf8'));
  await mkdir(path.join(feature, '_qa'), { recursive: true });
  await mkdir(path.join(feature, 'evidence'), { recursive: true });
  await writeFile(
    path.join(feature, '_qa', 'spec-review-checklist.json'),
    JSON.stringify({ version: 2, evidenceTree, qaPlanDigest, rows: [] }),
  );
  await writeFile(path.join(feature, 'evidence', 'gate-acceptance-1.log'), [
    '# qa-run v1',
    '# label: gate-acceptance-1',
    `# command: node ${QA_CHECK} acceptance ${feature}`,
    `# argv: ${JSON.stringify([process.execPath, QA_CHECK, 'acceptance', feature])}`,
    `# cwd: ${dir}`,
    '# head: deadbeef',
    `# tree: ${evidenceTree}`,
    '# started: 2026-11-28T00:00:00.000Z',
    '# ---',
    '结果: PASS',
    '# ---',
    '# finished: 2026-11-28T00:00:01.000Z',
    '# durationMs: 100',
    '# exit: 0',
    '',
  ].join('\n'));
  const skipped = runArgs(dir, ['collect', feature, '--skip-preflight']);
  assert.equal(skipped.status, 0, skipped.stderr + skipped.stdout);
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa', 'review-package.json'), 'utf8'));
  assert.ok(typeof manifest.qaArtifactsDigest === 'string' && manifest.qaArtifactsDigest.length === 64);
  assert.equal(manifest.specReviewChecklist.version, 2);
});

test('seal 在写凭据前同步阻断无效原文（无编号、漏待复核、缺覆盖或 :1 敷衍），修复后可直接封存', async (t) => {
  const { dir, feature } = await collected(t, { round: 'r2' });
  await mkdir(path.join(feature, 'review'), { recursive: true });
  const stdPath = path.join(feature, 'review', 'r2-standards.md');
  await writeFile(stdPath, '缺少规范编号与结论说明\n');
  const failUnnumbered = runArgs(dir, sealArgs(feature, { round: 'r2', file: 'review/r2-standards.md' }));
  assert.equal(failUnnumbered.status, 1);
  assert.match(failUnnumbered.stderr, /REVIEW_RAW_UNNUMBERED/);
  assert.equal(await readFile(path.join(feature, 'review', 'r2-standards.source.json'), 'utf8').catch(() => null), null);

  await writeFile(stdPath, '无新增审查发现\n');
  const failPending = runArgs(dir, [
    ...sealArgs(feature, { round: 'r2', file: 'review/r2-standards.md' }),
    '--pending-ids', 'S-H1',
  ]);
  assert.equal(failPending.status, 1);
  assert.match(failPending.stderr, /FINDING_NOT_REREVIEWED/);
  assert.equal(await readFile(path.join(feature, 'review', 'r2-standards.source.json'), 'utf8').catch(() => null), null);

  await writeFile(stdPath, '[S-H1] 已修\n');
  const okSeal = runArgs(dir, [
    ...sealArgs(feature, { round: 'r2', file: 'review/r2-standards.md' }),
    '--pending-ids', 'S-H1',
  ]);
  assert.equal(okSeal.status, 0, okSeal.stderr);
});

test('TC04-1 相同原文重复 seal 失败且四类文件不变', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(path.join(feature, 'review', 'r1-standards.md'), '[S-J1] 判断建议\n');
  assert.equal(runArgs(dir, sealArgs(feature)).status, 0);
  const before = await sealStateDigests(feature);

  const replay = runArgs(dir, sealArgs(feature));
  assert.equal(replay.status, 1);
  assert.match(replay.stderr, /PACKAGE_INVALID/);
  assert.deepEqual(await sealStateDigests(feature), before);
});

test('TC04-2 修改原文重复 seal 不覆盖 returned 状态', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  const report = path.join(feature, 'review', 'r1-standards.md');
  await writeFile(report, '[S-J1] 判断建议\n');
  assert.equal(runArgs(dir, sealArgs(feature)).status, 0);
  await writeFile(report, '[S-J1] 判断建议（重复代理改写）\n');
  const before = await sealStateDigests(feature);

  const replay = runArgs(dir, sealArgs(feature));
  assert.equal(replay.status, 1);
  assert.match(replay.stderr, /PACKAGE_INVALID/);
  assert.deepEqual(await sealStateDigests(feature), before);
  const challenge = JSON.parse(await readFile(path.join(feature, '_qa/review-challenge.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(path.join(feature, '_qa/review-package.json'), 'utf8'));
  assert.equal(challenge.axes.standards.terminalState, 'returned');
  assert.equal(manifest.axes.standards.terminalState, 'returned');
});

test('TC04-3 startedAt 仅表示首次 seal 尝试事件', async (t) => {
  const { dir, feature } = await collected(t);
  await mkdir(path.join(feature, 'review'), { recursive: true });
  const report = path.join(feature, 'review', 'r1-standards.md');
  await writeFile(report, '没有编号也没有整局结论\n');
  const failed = runArgs(dir, sealArgs(feature));
  assert.equal(failed.status, 1);
  const failedChallenge = JSON.parse(await readFile(path.join(feature, '_qa/review-challenge.json'), 'utf8'));
  const firstStartedAt = failedChallenge.axes.standards.startedAt;

  await writeFile(report, '[S-J1] 判断建议\n');
  assert.equal(runArgs(dir, sealArgs(feature)).status, 0);
  const receipt = JSON.parse(await readFile(path.join(feature, 'review/r1-standards.source.json'), 'utf8'));
  assert.equal(receipt.startedAt, firstStartedAt);
  assert.ok(Date.parse(receipt.completedAt) >= Date.parse(receipt.startedAt));
  const before = await sealStateDigests(feature);

  assert.equal(runArgs(dir, sealArgs(feature)).status, 1);
  assert.deepEqual(await sealStateDigests(feature), before);
});

test('TC06-1 collect 与分流骨架复用同一 FindingId 登记', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['tracked.txt']).status, 0);
  await writeFile(path.join(dir, 'tracked.txt'), '原始行\n本任务修改\n');
  await mkdir(path.join(feature, 'review'), { recursive: true });
  await writeFile(
    path.join(feature, 'review', 'r1-standards.md'),
    '## S-H2：无方括号标题\n\n[S-J1] 历史行首方括号\n\n正文引用 [S-J9]，不得登记。\n',
  );
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), '[P-M1] 缺失\n');
  assert.equal(runArgs(dir, ['collect', feature, '--round', 'r2']).status, 0);
  const { scanHistoricalFindingIds } = await import(new URL('../review-package.mjs', import.meta.url).href);
  const historical = await scanHistoricalFindingIds(feature, { upToRound: 2 });
  const challenge = JSON.parse(await readFile(path.join(feature, '_qa/review-challenge.json'), 'utf8'));
  assert.deepEqual([...challenge.reservedIds].sort(), historical.allIds.sort());
  assert.deepEqual(challenge.nextIds, historical.nextIds);

  assert.equal(runArgs(dir, ['scaffold-report', feature]).status, 0);
  const report = await readFile(path.join(feature, 'review-report.md'), 'utf8');
  assert.match(report, /S-H2/);
  assert.match(report, /S-J1/);
  assert.match(report, /P-M1/);
  assert.doesNotMatch(report, /S-J9/);
});

test('TC06-2 seal 与 qa-check 使用同一复审响应语义', async (t) => {
  const { checkFeature } = await import(new URL('../qa-check.mjs', import.meta.url).href);
  const supported = await reReviewFixture(t);
  assert.equal(supported.standardsSeal.status, 0, supported.standardsSeal.stderr);
  const supportedReport = await checkFeature(supported.feature, 'review');
  assert.ok(!supportedReport.issues.some((item) => item.code === 'FINDING_NOT_REREVIEWED'));

  const legacy = await reReviewFixture(t, { legacyReference: true });
  assert.equal(legacy.standardsSeal.status, 0, legacy.standardsSeal.stderr);
  const legacyReport = await checkFeature(legacy.feature, 'review');
  assert.ok(!legacyReport.issues.some((item) => item.code === 'FINDING_NOT_REREVIEWED'));

  const referenced = await reReviewFixture(t, { bodyOnly: true });
  assert.equal(referenced.standardsSeal.status, 1);
  assert.match(referenced.standardsSeal.stderr, /FINDING_NOT_REREVIEWED/);
  assert.match(referenced.standardsSeal.stderr, /S-H1/);
  const referencedReport = await checkFeature(referenced.feature, 'review');
  const missing = referencedReport.issues.find((item) => item.code === 'FINDING_NOT_REREVIEWED');
  assert.ok(missing, JSON.stringify(referencedReport.issues));
  assert.match(missing.message, /S-H1/);
});

const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));

/** 创建含完整 spec/qa-plan/tests 的仓库并运行一次真实 acceptance 门禁 */
async function freshAcceptanceRepo(t, { assertionBlocked = false } = {}) {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeFile(path.join(dir, 'tracked.txt'), 'export const value = 1;\n');
  git(dir, ['add', 'tracked.txt']);
  git(dir, ['commit', '--quiet', '-m', '基线源码']);
  await mkdir(path.join(dir, 'tests'), { recursive: true });
  await writeFile(
    path.join(dir, 'tests', 'app.test.mjs'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('断言甲', () => assert.equal(1, 1));\n",
  );
  git(dir, ['add', 'tests/app.test.mjs']);
  git(dir, ['commit', '--quiet', '-m', '基线测试']);

  await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 核心断言\n\n## 交付命令\n```bash\nnode --version\n```\n');
  const buildQaPlan = (rowLine) => [
    'QA Schema: 4',
    'QA Mode: inline',
    'QA Review Coverage: 2',
    '### TC01: 示例场景',
    '- Priority: P1',
    '- Covers: 1',
    '- Seam: unit',
    '#### 验证断言',
    '1. 核心断言甲通过',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    rowLine,
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --version` | 待执行 |',
  ].join('\n');

  await writeFile(path.join(feature, 'qa-plan.md'), buildQaPlan('| TC01 | 1 | BLOCKED | 尚未执行 | | |'));
  assert.equal(run(dir, 'init', feature, ['tracked.txt', 'tests/app.test.mjs']).status, 0);

  if (!assertionBlocked) {
    const unitRun = spawnSync(process.execPath, [QA_RUN, feature, 'unit-1', '--', process.execPath, '--test', 'tests/app.test.mjs'], {
      cwd: dir,
      encoding: 'utf8',
    });
    assert.equal(unitRun.status, 0, unitRun.stderr);
    await writeFile(
      path.join(feature, 'qa-plan.md'),
      buildQaPlan('| TC01 | 1 | PASS | `evidence/unit-1.log` | `tests/app.test.mjs` › 断言甲 | |'),
    );
  }

  const gateAcc = spawnSync(process.execPath, [QA_RUN, feature, 'gate-acceptance-1', '--', process.execPath, QA_CHECK, 'acceptance', feature], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(gateAcc.status, assertionBlocked ? 1 : 0, gateAcc.stderr + gateAcc.stdout);
  return { dir, feature, buildQaPlan };
}

test('S2-TC02-1 清单缺少 evidenceTree 或 qaPlanDigest 时 collect 2 秒内报 PACKAGE_INVALID', async (t) => {
  const { dir, feature } = await freshAcceptanceRepo(t);
  const checklistPath = path.join(feature, '_qa', 'spec-review-checklist.json');
  const checklist = JSON.parse(await readFile(checklistPath, 'utf8'));
  delete checklist.evidenceTree;
  await writeFile(checklistPath, `${JSON.stringify(checklist, null, 2)}\n`);

  const startedAt = Date.now();
  const missingTree = runArgs(dir, ['collect', feature]);
  assert.equal(missingTree.status, 1);
  assert.ok(Date.now() - startedAt < 2000);
  assert.match(missingTree.stderr, /PACKAGE_INVALID/);

  const checklistNoPlan = JSON.parse(await readFile(checklistPath, 'utf8'));
  checklistNoPlan.evidenceTree = 'a'.repeat(64);
  delete checklistNoPlan.qaPlanDigest;
  await writeFile(checklistPath, `${JSON.stringify(checklistNoPlan, null, 2)}\n`);
  const missingPlanDigest = runArgs(dir, ['collect', feature]);
  assert.equal(missingPlanDigest.status, 1);
  assert.match(missingPlanDigest.stderr, /PACKAGE_INVALID/);
});

test('S2-TC02-2 代码树或非交付验证段落修改后未重跑验收时 collect 报 PACKAGE_INVALID 且不落包', async (t) => {
  const codeCase = await freshAcceptanceRepo(t);
  await writeFile(path.join(codeCase.dir, 'tracked.txt'), 'export const value = 2;\n');
  const t0 = Date.now();
  const staleCode = runArgs(codeCase.dir, ['collect', codeCase.feature]);
  assert.equal(staleCode.status, 1);
  assert.ok(Date.now() - t0 < 2000);
  assert.match(staleCode.stderr, /PACKAGE_INVALID/);
  assert.equal(await readFile(path.join(codeCase.feature, '_qa', 'review-package.json'), 'utf8').catch(() => null), null);
  assert.equal(await readFile(path.join(codeCase.feature, '_qa', 'review-challenge.json'), 'utf8').catch(() => null), null);

  const planCase = await freshAcceptanceRepo(t);
  const planPath = path.join(planCase.feature, 'qa-plan.md');
  const updatedPlan = (await readFile(planPath, 'utf8')).replace('| |', '| 手改备注未重跑验收 |');
  await writeFile(planPath, updatedPlan);
  const t1 = Date.now();
  const stalePlan = runArgs(planCase.dir, ['collect', planCase.feature]);
  assert.equal(stalePlan.status, 1);
  assert.ok(Date.now() - t1 < 2000);
  assert.match(stalePlan.stderr, /PACKAGE_INVALID/);
});

test('S2-TC02-3 仅回填 qa-plan 的交付验证段落时 collect 正常通过', async (t) => {
  const { dir, feature } = await freshAcceptanceRepo(t);
  const planPath = path.join(feature, 'qa-plan.md');
  await writeFile(planPath, (await readFile(planPath, 'utf8')).replace('待执行', '`evidence/delivery.log`'));
  const okCollect = runArgs(dir, ['collect', feature]);
  assert.equal(okCollect.status, 0, okCollect.stderr + okCollect.stdout);
});

test('S2-TC03-1 合法 ASSERTION_BLOCKED 且清单与同树验收日志新鲜时 collect 放行', async (t) => {
  const { dir, feature } = await freshAcceptanceRepo(t, { assertionBlocked: true });
  const collectedBlocked = runArgs(dir, ['collect', feature]);
  assert.equal(collectedBlocked.status, 0, collectedBlocked.stderr + collectedBlocked.stdout);
});

test('S2-TC03-2 合法 ASSERTION_BLOCKED 通过 collect 前后 _qa 三个对账与清单文件逐字节不变', async (t) => {
  const { dir, feature } = await freshAcceptanceRepo(t, { assertionBlocked: true });
  const targets = [
    '_qa/reconciliation.md',
    '_qa/spec-review-checklist.json',
    '_qa/spec-review-skeleton.md',
  ];
  const before = await Promise.all(targets.map((rel) => readFile(path.join(feature, rel), 'utf8')));
  const res = runArgs(dir, ['collect', feature]);
  assert.equal(res.status, 0, res.stderr + res.stdout);
  const after = await Promise.all(targets.map((rel) => readFile(path.join(feature, rel), 'utf8')));
  assert.deepEqual(after, before);
});

test('S2-TC03-3 验收日志为 FAIL 或含 STALE_EVIDENCE 时 collect 仍以 PACKAGE_INVALID 阻断', async (t) => {
  for (const body of [
    '[MISSING_EVIDENCE] 缺少日志\n结果: FAIL\n阻塞原因：MISSING_EVIDENCE',
    '[STALE_EVIDENCE] 证据过期\n结果: BLOCKED\n阻塞原因：ASSERTION_BLOCKED、STALE_EVIDENCE',
  ]) {
    const { dir, feature } = await freshAcceptanceRepo(t, { assertionBlocked: true });
    const gatePath = path.join(feature, 'evidence', 'gate-acceptance-1.log');
    const gateRaw = await readFile(gatePath, 'utf8');
    const replaced = gateRaw
      .replace(/\[ASSERTION_BLOCKED\][\s\S]*?# ---/, `${body}\n# ---`);
    await writeFile(gatePath, replaced);
    const blocked = runArgs(dir, ['collect', feature]);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /PACKAGE_INVALID/);
  }

  // [S-H1] 回归：同一 evidenceTree 上存在早期 PASS 日志时，最新 gate-acceptance-*.log 为 FAIL/STALE_EVIDENCE 仍必须阻断
  for (const [body, exitCode] of [
    ['[MISSING_EVIDENCE] 缺少日志\n结果: FAIL\n阻塞原因：MISSING_EVIDENCE', '1'],
    ['[STALE_EVIDENCE] 证据过期\n结果: BLOCKED\n阻塞原因：ASSERTION_BLOCKED、STALE_EVIDENCE', '1'],
  ]) {
    const { dir, feature } = await freshAcceptanceRepo(t);
    const firstGate = await readFile(path.join(feature, 'evidence', 'gate-acceptance-1.log'), 'utf8');
    const newerFail = firstGate
      .replace(/^# label: .+$/m, '# label: gate-acceptance-2')
      .replace(/^# started: .+$/m, '# started: 2099-01-01T00:00:01.000Z')
      .replace(/^# finished: .+$/m, '# finished: 2099-01-01T00:00:02.000Z')
      .replace(/^# exit: \d+$/m, `# exit: ${exitCode}`)
      .replace(/\n\n[\s\S]*?\n# ---/, `\n\n${body}\n# ---`);
    await writeFile(path.join(feature, 'evidence', 'gate-acceptance-2.log'), newerFail);
    const blocked = runArgs(dir, ['collect', feature]);
    assert.equal(blocked.status, 1);
    assert.match(blocked.stderr, /PACKAGE_INVALID/);

    // 追加更晚的同树 PASS 日志后恢复放行
    const newerPass = firstGate
      .replace(/^# label: .+$/m, '# label: gate-acceptance-3')
      .replace(/^# started: .+$/m, '# started: 2099-01-01T00:00:03.000Z')
      .replace(/^# finished: .+$/m, '# finished: 2099-01-01T00:00:04.000Z');
    await writeFile(path.join(feature, 'evidence', 'gate-acceptance-3.log'), newerPass);
    const recovered = runArgs(dir, ['collect', feature]);
    assert.equal(recovered.status, 0, recovered.stderr + recovered.stdout);
  }

  // 端到端验证：仅破坏 qa-plan 证据引用触发真实 qa-check acceptance 失败时，清单被清除且 collect 阻断
  const e2e = await freshAcceptanceRepo(t);
  const planPath = path.join(e2e.feature, 'qa-plan.md');
  await writeFile(planPath, (await readFile(planPath, 'utf8')).replace('evidence/unit-1.log', 'evidence/missing.log'));
  const failedGate = spawnSync(
    process.execPath,
    [QA_RUN, e2e.feature, 'gate-acceptance-2', '--', process.execPath, QA_CHECK, 'acceptance', e2e.feature],
    { cwd: e2e.dir, encoding: 'utf8' },
  );
  assert.equal(failedGate.status, 1);
  assert.equal(await readFile(path.join(e2e.feature, '_qa', 'spec-review-checklist.json'), 'utf8').catch(() => null), null);
  const e2eBlocked = runArgs(e2e.dir, ['collect', e2e.feature]);
  assert.equal(e2eBlocked.status, 1);
  assert.match(e2eBlocked.stderr, /PACKAGE_INVALID/);
});
