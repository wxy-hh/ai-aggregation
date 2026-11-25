import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PREFLIGHT = fileURLToPath(new URL('../qa-preflight.mjs', import.meta.url));
const PREFLIGHT_TEMPLATE = fileURLToPath(new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-preflight.mjs', import.meta.url));

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function writeDeep(file, content) {
  return mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, content));
}

async function setupRepo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-preflight-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeDeep(path.join(dir, 'apps/web/src/components/DemoCard.tsx'), [
    'export function DemoCard() {',
    '  return <button className="h-11 px-4 text-primary">确定</button>;',
    '}',
    '',
  ].join('\n'));
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  return { dir, feature };
}

test('识别 scripts 伪断言与交付命令不一致为 ERROR，缺失可选文件不误报', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 需求\n\n## 交付命令\n```bash\npnpm test\n```\n');
  await writeFile(path.join(feature, 'qa-plan.md'), [
    'QA Schema: 4',
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `true` | 待执行 |',
  ].join('\n'));
  await writeDeep(path.join(feature, 'scripts/tc01.mjs'), [
    'function check(cond, msg) { if (!cond) console.log(msg); }',
    "check(true, '[TC01-1] PASS 实测：假通过');",
    "console.log('[TC01-2] PASS 实测：裸打印');",
  ].join('\n'));

  const res = spawnSync(process.execPath, [PREFLIGHT, feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 1, res.stdout + res.stderr);
  assert.match(res.stdout + res.stderr, /PSEUDO_ASSERTION|check\(true\)/);
  assert.match(res.stdout + res.stderr, /DELIVERY_COMMAND_MISMATCH|NOOP_DELIVERY_COMMAND/);
});

test('正常硬断言脚本、白名单色值、中文注释与匹配交付命令通过预检', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 需求\n\n## 交付命令\n```bash\npnpm test\n```\n');
  await writeFile(path.join(feature, 'qa-plan.md'), 'QA Schema: 4\n\n## 交付验证\n| 命令 | 证据 |\n| --- | --- |\n| `pnpm test` | 待执行 |\n');
  await writeDeep(path.join(feature, 'scripts/tc01.mjs'), [
    "import assert from 'node:assert/strict';",
    'const visible = true;',
    'assert.equal(visible, true);',
    "if (!visible) { console.error('[TC01-1] FAIL 不可见'); process.exit(1); }",
    "console.log('[TC01-1] PASS 实测：元素可见');",
  ].join('\n'));
  await writeDeep(path.join(dir, 'apps/web/src/components/DemoCard.tsx'), [
    '// 中文注释：使用 DESIGN.md 白名单品牌色 #4969E9',
    "const sampleString = '/** MCP Server ID */';",
    'export function DemoCard() {',
    '  return <button data-sample={sampleString} className="h-11 px-4 bg-[#4969E9]">确定</button>;',
    '}',
    '',
  ].join('\n'));

  const res = spawnSync(process.execPath, [PREFLIGHT, feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(res.status, 0, res.stdout + res.stderr);
  assert.doesNotMatch(res.stdout, /WARN|ERROR/);
});

test('对 Diff 纯英文注释、非白名单十六进制色值与同文件全量按钮 <44px 行号输出 WARN，--strict 升级为 exit 1', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(dir, 'apps/web/src/components/DemoCard.tsx'), [
    '/** MCP Server ID */',
    'export function DemoCard() {',
    '  return (',
    '    <div>',
    '      <button className="h-11 bg-[#123456]">主按钮</button>',
    '      <button className="h-8 px-2">次按钮一</button>',
    '      <button className="h-10 px-3">次按钮二</button>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n'));

  const warnRes = spawnSync(process.execPath, [PREFLIGHT, feature], { cwd: dir, encoding: 'utf8' });
  assert.equal(warnRes.status, 0, warnRes.stdout + warnRes.stderr);
  assert.match(warnRes.stdout, /ENGLISH_COMMENT/);
  assert.match(warnRes.stdout, /NON_WHITELIST_COLOR.*#123456/);
  assert.match(warnRes.stdout, /SMALL_TOUCH_TARGET/);
  assert.match(warnRes.stdout, /DemoCard\.tsx.*6.*7|第\s*6.*7\s*行/);

  const strictRes = spawnSync(process.execPath, [PREFLIGHT, feature, '--strict'], { cwd: dir, encoding: 'utf8' });
  assert.equal(strictRes.status, 1);
});

test('qa-preflight 安装模板与工具脚本保持逐字一致', async () => {
  const [script, template] = await Promise.all([
    readFile(PREFLIGHT, 'utf8'),
    readFile(PREFLIGHT_TEMPLATE, 'utf8'),
  ]);
  assert.equal(template, script);
});

test('亲自复审补强：拦截 assert(true)/expect(true) 伪断言、注释色值不误报与多行按钮开标签精准识别', async (t) => {
  const { dir, feature } = await setupRepo(t);
  await writeDeep(path.join(feature, 'scripts/pseudo.mjs'), [
    "import assert from 'node:assert/strict';",
    'assert(true);',
    'assert.ok(true);',
    'expect(true).toBe(true);',
  ].join('\n'));
  await writeDeep(path.join(dir, 'apps/web/src/components/DemoCard.tsx'), [
    '// 禁止使用非白名单十六进制色值 #123456',
    'export function DemoCard() {',
    '  return (',
    '    <div>',
    '      <Button',
    '        type="button"',
    '        variant="ghost"',
    '        size="sm"',
    '        disabled={false}',
    '        onClick={() => {}}',
    '        className="h-8 px-2"',
    '      >',
    '        多行小按钮',
    '      </Button>',
    '      <button className="h-11 px-4">正常大按钮</button>',
    '    </div>',
    '  );',
    '}',
    '',
  ].join('\n'));

  const res = spawnSync(process.execPath, [PREFLIGHT, feature], { cwd: dir, encoding: 'utf8' });
  const out = res.stdout + res.stderr;
  assert.equal(res.status, 1, out);
  const pseudoMatches = out.match(/\[ERROR\]\[PSEUDO_ASSERTION\]/g) ?? [];
  assert.equal(pseudoMatches.length, 3, out);
  assert.doesNotMatch(out, /NON_WHITELIST_COLOR.*#123456/);
  assert.match(out, /SMALL_TOUCH_TARGET.*DemoCard\.tsx 第 5 行/);
});
