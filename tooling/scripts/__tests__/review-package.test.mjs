import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
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

test('快照只包含开工后的修改、创建和删除，且不改变 index', async (t) => {
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
  const patch = await readFile(path.join(feature, 'review-package.diff'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(feature, 'review-package.json'), 'utf8'));

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
});

test('开工前未跟踪内容未改变时不会进入审查包', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  assert.equal(run(dir, 'init', feature, ['existing-untracked.txt']).status, 0);

  const collect = run(dir, 'collect', feature, ['existing-untracked.txt']);
  assert.equal(collect.status, 0, collect.stderr);
  const patch = await readFile(path.join(feature, 'review-package.diff'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(feature, 'review-package.json'), 'utf8'));
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

  await writeFile(path.join(dir, 'tracked.txt'), '本任务修改\n');
  const collect = run(dir, 'collect', feature, ['.env', 'tracked.txt']);
  assert.equal(collect.status, 0, collect.stderr);
  const patch = await readFile(path.join(feature, 'review-package.diff'), 'utf8');
  const manifest = JSON.parse(await readFile(path.join(feature, 'review-package.json'), 'utf8'));
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

