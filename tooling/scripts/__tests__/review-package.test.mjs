import test from 'node:test';
import assert from 'node:assert/strict';
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
  assert.deepEqual((await readdir(path.join(feature, '_qa'))).sort(), ['prechange', 'review-package.diff', 'review-package.json', 'scope.json']);
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

