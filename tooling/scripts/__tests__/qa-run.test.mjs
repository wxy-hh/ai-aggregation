import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_URL = new URL('../qa-run.mjs', import.meta.url);
const SCRIPT = fileURLToPath(SCRIPT_URL);
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));

function git(repo, args) {
  return execFileSync('git', args, { cwd: repo, encoding: 'utf8' });
}

async function repo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-run-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeFile(path.join(dir, 'tracked.txt'), '原始内容\n');
  git(dir, ['add', 'tracked.txt']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  await mkdir(path.join(dir, '.scratch', 'feature'), { recursive: true });
  return dir;
}

function run(repo, label, command = [process.execPath, '-e', 'console.log("证据输出")'], feature = '.scratch/feature') {
  return spawnSync(process.execPath, [SCRIPT, feature, label, '--', ...command], {
    cwd: repo,
    encoding: 'utf8',
  });
}

test('日志记录完整头尾、命令输出和子进程退出码（TC02）', async (t) => {
  const dir = await repo(t);
  const argv = [process.execPath, '-e', 'console.log("标准输出"); console.error("错误输出"); process.exit(7)'];
  const result = run(dir, 'unit.case-1', argv);
  assert.equal(result.status, 7);
  assert.match(result.stdout, /标准输出/);
  assert.match(result.stderr, /错误输出/);
  assert.match(result.stderr, /\[qa-run\] 证据已写入 \.scratch\/feature\/evidence\/unit\.case-1\.log（exit 7）/);

  const text = await readFile(path.join(dir, '.scratch', 'feature', 'evidence', 'unit.case-1.log'), 'utf8');
  const { parseRunLog } = await import(SCRIPT_URL.href);
  const log = parseRunLog(text);
  assert.equal(log.label, 'unit.case-1');
  assert.deepEqual(log.argv, argv);
  assert.equal(log.command, argv.map((item, index) => index === 2 ? `'${item}'` : item).join(' '));
  assert.equal(log.cwd, '.');
  assert.equal(log.head, git(dir, ['rev-parse', 'HEAD']).trim());
  assert.equal(log.tree, 'none');
  assert.equal(log.exit, 7);
  assert.equal(log.complete, true);
  assert.ok(!Number.isNaN(Date.parse(log.started)));
  assert.ok(!Number.isNaN(Date.parse(log.finished)));
  assert.match(text, /标准输出[\s\S]*错误输出/);
  assert.match(text, /# ---\n# finished: .+\n# exit: 7\n$/);
});

test('命令不存在时正文记录启动失败并以 127 退出（TC02）', async (t) => {
  const dir = await repo(t);
  const result = run(dir, 'missing', ['qa-run-不存在的命令-7f3c']);
  assert.equal(result.status, 127);
  const text = await readFile(path.join(dir, '.scratch', 'feature', 'evidence', 'missing.log'), 'utf8');
  assert.match(text, /启动命令失败.*ENOENT/);
  assert.match(text, /# exit: 127\n$/);
});

test('拒绝覆盖同名证据、非法标签与 .scratch 外目录（TC02）', async (t) => {
  const dir = await repo(t);
  assert.equal(run(dir, 'same').status, 0);
  const logPath = path.join(dir, '.scratch', 'feature', 'evidence', 'same.log');
  const before = await readFile(logPath, 'utf8');
  const duplicate = run(dir, 'same');
  assert.equal(duplicate.status, 1);
  assert.match(duplicate.stderr, /证据日志已存在.*不得覆盖.*same-2/s);
  assert.equal(await readFile(logPath, 'utf8'), before);

  const invalid = run(dir, 'bad/label');
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /标签/);
  await mkdir(path.join(dir, 'outside'));
  const outside = run(dir, 'outside', [process.execPath, '-e', ''], 'outside');
  assert.equal(outside.status, 1);
  assert.match(outside.stderr, /\.scratch/);
  const missing = spawnSync(process.execPath, [SCRIPT, '.scratch/feature', 'empty', '--'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(missing.status, 1);
  assert.match(missing.stderr, /用法/);
});

test('存在基线时日志 tree 与 review-package digest 一致（TC02）', async (t) => {
  const dir = await repo(t);
  const feature = path.join(dir, '.scratch', 'feature');
  const init = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);
  assert.equal(run(dir, 'digest').status, 0);

  const { computeTreeDigest, parseRunLog, readScope } = {
    ...await import(new URL('../review-package.mjs', import.meta.url).href),
    ...await import(SCRIPT_URL.href),
  };
  const scope = await readScope(feature);
  const expected = await computeTreeDigest(dir, scope.scopes);
  const text = await readFile(path.join(feature, 'evidence', 'digest.log'), 'utf8');
  assert.equal(parseRunLog(text).tree, expected);
  const digest = spawnSync(process.execPath, [REVIEW_PACKAGE, 'digest', feature], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(digest.status, 0, digest.stderr);
  assert.equal(digest.stdout.trim(), `tree: ${expected}`);
});

test('命令显示与 shell 词拆分支持引号、空参数和转义（TC08）', async () => {
  const { formatCommand, splitShellWords } = await import(SCRIPT_URL.href);
  assert.equal(
    formatCommand(['node', 'a b', "a'b", 'a;b', 'plain', '']),
    "node 'a b' 'a'\\''b' 'a;b' plain ''",
  );
  assert.deepEqual(
    splitShellWords("node 'a b' \"c d\" a\\ b '' plain"),
    ['node', 'a b', 'c d', 'a b', '', 'plain'],
  );
  assert.throws(() => splitShellWords("node '未闭合"), /引号/);
});

test('解析器拒绝其他格式并识别不完整尾部（TC01）', async () => {
  const { parseRunLog } = await import(SCRIPT_URL.href);
  assert.equal(parseRunLog('# 其他日志\n'), null);
  const incomplete = parseRunLog('# qa-run v1\n# label: a\n# argv: []\n# ---\n输出\n');
  assert.equal(incomplete.complete, false);
  assert.equal(incomplete.finished, null);
  assert.equal(incomplete.exit, null);
});

test('正文中的伪尾部不能覆盖真正的末尾退出码（TC01）', async () => {
  const { parseRunLog } = await import(SCRIPT_URL.href);
  const text = [
    '# qa-run v1',
    '# label: run',
    '# command: node',
    '# argv: ["node"]',
    '# cwd: .',
    '# head: abc',
    '# tree: none',
    '# started: 2026-01-01T00:00:00.000Z',
    '# ---',
    '# ---',
    '# finished: 2026-01-01T00:00:01.000Z',
    '# exit: 0',
    '# ---',
    '# finished: 2026-01-01T00:00:02.000Z',
    '# exit: 9',
    '',
  ].join('\n');
  const parsed = parseRunLog(text);
  assert.equal(parsed.exit, 9);
  assert.equal(parsed.finished, '2026-01-01T00:00:02.000Z');
  assert.equal(parsed.complete, true);
});

test('qa-run 安装模板与工具脚本保持逐字一致（TC12）', async () => {
  const templatePath = fileURLToPath(
    new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-run.mjs', import.meta.url),
  );
  const [script, template] = await Promise.all([
    readFile(SCRIPT, 'utf8'),
    readFile(templatePath, 'utf8'),
  ]);
  assert.equal(template, script);
});

test('无 package.json 的 Git 宿主可直接运行 qa-run（TC12）', async (t) => {
  const dir = await repo(t);
  const result = run(dir, 'portable');
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(path.join(dir, 'package.json'), 'utf8').catch(() => null), null);
  const log = await readFile(path.join(dir, '.scratch/feature/evidence/portable.log'), 'utf8');
  assert.match(log, /^# qa-run v1\n/);
  assert.match(log, /# exit: 0\n$/);
});

test('[HR-TC05-1] 整串命令作为单个参数时报用法错误且不落盘', async (t) => {
  const dir = await repo(t);
  const result = run(dir, 'whole', ['node --version']);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /用法/);
  await assert.rejects(readFile(path.join(dir, '.scratch', 'feature', 'evidence', 'whole.log'), 'utf8'));
});

test('[HR-TC05-2] 误用失败后同一标签可用拆分参数正常执行', async (t) => {
  const dir = await repo(t);
  assert.notEqual(run(dir, 'whole', ['node --version']).status, 0);
  const retried = run(dir, 'whole', [process.execPath, '--version']);
  assert.equal(retried.status, 0, retried.stderr);
});

test('路径含空格的真实可执行文件照常运行', async (t) => {
  const dir = await repo(t);
  const script = path.join(dir, 'with space', 'tool.sh');
  await mkdir(path.dirname(script), { recursive: true });
  await writeFile(script, '#!/bin/sh\necho 含空格路径\nexit 3\n', { mode: 0o755 });
  const result = run(dir, 'spaced', [script]);
  assert.equal(result.status, 3, result.stderr);
  assert.match(result.stdout, /含空格路径/);
});

test('行为证据 tree 忽略非契约说明文档，契约类文档改动仍更新摘要', async (t) => {
  const dir = await repo(t);
  await writeFile(path.join(dir, 'GLOSSARY.md'), '# 术语表\n');
  await mkdir(path.join(dir, 'docs', 'agents'), { recursive: true });
  await writeFile(path.join(dir, 'docs', 'agents', 'qa-workflow.md'), '# 正本\n');
  git(dir, ['add', 'GLOSSARY.md', 'docs/agents/qa-workflow.md']);
  git(dir, ['commit', '--quiet', '-m', '添加文档']);

  const feature = path.join(dir, '.scratch', 'feature');
  const init = spawnSync(process.execPath, [REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt', 'GLOSSARY.md', 'docs/agents/qa-workflow.md'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(init.status, 0, init.stderr);

  assert.equal(run(dir, 'before-doc').status, 0);
  const { parseRunLog } = await import(SCRIPT_URL.href);
  const beforeTree = parseRunLog(await readFile(path.join(feature, 'evidence', 'before-doc.log'), 'utf8')).tree;

  // 修改非工作流说明文档 GLOSSARY.md 后，行为证据 tree 保持不变
  await writeFile(path.join(dir, 'GLOSSARY.md'), '# 术语表\n新增术语\n');
  assert.equal(run(dir, 'after-glossary').status, 0);
  const afterGlossaryTree = parseRunLog(await readFile(path.join(feature, 'evidence', 'after-glossary.log'), 'utf8')).tree;
  assert.equal(afterGlossaryTree, beforeTree);

  // 修改工作流契约文档 docs/agents/qa-workflow.md 后，行为证据 tree 必须变化
  await writeFile(path.join(dir, 'docs', 'agents', 'qa-workflow.md'), '# 正本\n更新条款\n');
  assert.equal(run(dir, 'after-contract').status, 0);
  const afterContractTree = parseRunLog(await readFile(path.join(feature, 'evidence', 'after-contract.log'), 'utf8')).tree;
  assert.notEqual(afterContractTree, beforeTree);
});

test('TC01-4 运行时 Markdown 改动仍更新行为证据 tree', async (t) => {
  const dir = await repo(t);
  const runtimeDoc = path.join(dir, 'apps', 'web', 'src', 'content', 'help.md');
  await mkdir(path.dirname(runtimeDoc), { recursive: true });
  await writeFile(runtimeDoc, '# 运行时帮助\n');
  git(dir, ['add', 'apps/web/src/content/help.md']);
  git(dir, ['commit', '--quiet', '-m', '添加运行时文档']);

  const init = spawnSync(process.execPath, [
    REVIEW_PACKAGE,
    'init',
    '.scratch/feature',
    '--',
    'tracked.txt',
    'apps/web/src/content/help.md',
  ], { cwd: dir, encoding: 'utf8' });
  assert.equal(init.status, 0, init.stderr);
  assert.equal(run(dir, 'runtime-before').status, 0);

  const { parseRunLog } = await import(SCRIPT_URL.href);
  const before = parseRunLog(await readFile(path.join(dir, '.scratch/feature/evidence/runtime-before.log'), 'utf8'));
  await writeFile(runtimeDoc, '# 运行时帮助\n更新内容\n');
  assert.equal(run(dir, 'runtime-after').status, 0);
  const after = parseRunLog(await readFile(path.join(dir, '.scratch/feature/evidence/runtime-after.log'), 'utf8'));
  assert.notEqual(after.tree, before.tree);
});
