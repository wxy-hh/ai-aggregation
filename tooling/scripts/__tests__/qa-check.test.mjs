import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFeature, formatReport } from '../qa-check.mjs';

// 本文件覆盖与 Schema 版本无关的通用结构检查、安装模板一致性与 CLI 参数兼容
const SCRIPT = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const TEMPLATE = fileURLToPath(
  new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-check.mjs', import.meta.url),
);
const SPEC = '## User Stories\n1. 第一条需求\n2. 第二条需求\n\n## 交付命令\n\n```bash\nnode --version\n```\n';

function plan({ mode = 'inline', covers = '1, 2', rows = [
  '| TC01 | 1 | PASS | `evidence/run.log` | | |',
  '| TC01 | 2 | PASS | `evidence/run.log` | | |',
] } = {}) {
  return [
    'QA Schema: 4',
    `QA Mode: ${mode}`,
    '',
    '### TC01: 示例',
    '- Priority: P0',
    `- Covers: ${covers}`,
    '- Seam: static',
    '',
    '#### 验证断言',
    '1. 第一条断言',
    '2. 第二条断言',
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --version` | 待执行 |',
    '',
    '## 计划变更',
    '- 无',
  ].join('\n');
}

const RUN_LOG = [
  '# qa-run v1',
  '# label: run',
  '# command: node --version',
  '# argv: ["node","--version"]',
  '# cwd: .',
  '# head: 0123456789abcdef',
  '# tree: none',
  '# started: 2026-01-02T00:00:00.000Z',
  '# ---',
  'v24.0.0',
  '# ---',
  '# finished: 2026-01-02T00:00:01.000Z',
  '# exit: 0',
  '',
].join('\n');

async function workspace(t, { spec = SPEC, planText = plan(), files = { 'evidence/run.log': RUN_LOG } } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await writeFile(path.join(dir, 'spec.md'), spec);
  await writeFile(path.join(dir, 'qa-plan.md'), planText);
  for (const [relative, content] of Object.entries(files)) {
    await mkdir(path.dirname(path.join(dir, relative)), { recursive: true });
    await writeFile(path.join(dir, relative), content);
  }
  return dir;
}

function codes(report) {
  return report.issues.map((item) => item.code);
}

test('合法计划与 exit 0 证据可以通过验收', async (t) => {
  const report = await checkFeature(await workspace(t), 'acceptance');
  assert.equal(report.status, 'PASS', formatReport(report));
});

test('证据缺失、为空或越出特性目录时分别报错', async (t) => {
  const cases = [
    ['`evidence/none.log`', {}, 'MISSING_EVIDENCE'],
    ['`evidence/empty.log`', { 'evidence/empty.log': '' }, 'EMPTY_EVIDENCE'],
    ['`../outside.log`', {}, 'EVIDENCE_OUT_OF_SCOPE'],
  ];
  for (const [evidence, files, code] of cases) {
    const dir = await workspace(t, {
      planText: plan({ rows: [`| TC01 | 1 | PASS | ${evidence} | | |`, '| TC01 | 2 | PASS | `evidence/run.log` | | |'] }),
      files: { 'evidence/run.log': RUN_LOG, ...files },
    });
    const report = await checkFeature(dir, 'acceptance');
    assert.equal(report.status, 'FAIL', code);
    assert.ok(codes(report).includes(code), `${code}: ${formatReport(report)}`);
  }
});

test('缺少断言行、重复结果与计划外结果被分别指出', async (t) => {
  const missing = await checkFeature(await workspace(t, {
    planText: plan({ rows: ['| TC01 | 1 | PASS | `evidence/run.log` | | |'] }),
  }), 'acceptance');
  assert.ok(codes(missing).includes('MISSING_RESULT'), formatReport(missing));
  assert.notEqual(missing.status, 'PASS');

  const duplicate = await checkFeature(await workspace(t, {
    planText: plan({ rows: [
      '| TC01 | 1 | PASS | `evidence/run.log` | | |',
      '| TC01 | 1 | FAIL | `evidence/run.log` | | |',
      '| TC01 | 2 | PASS | `evidence/run.log` | | |',
    ] }),
  }), 'acceptance');
  assert.ok(codes(duplicate).includes('DUPLICATE_RESULT'), formatReport(duplicate));

  const unknown = await checkFeature(await workspace(t, {
    planText: plan({ rows: [
      '| TC01 | 1 | PASS | `evidence/run.log` | | |',
      '| TC01 | 2 | PASS | `evidence/run.log` | | |',
      '| TC09 | 1 | PASS | `evidence/run.log` | | |',
    ] }),
  }), 'acceptance');
  assert.ok(codes(unknown).includes('UNKNOWN_RESULT'), formatReport(unknown));
});

test('BLOCKED 存在时不通过，FAIL 与 BLOCKED 同时存在时为 FAIL', async (t) => {
  const blocked = await checkFeature(await workspace(t, {
    planText: plan({ rows: ['| TC01 | 1 | PASS | `evidence/run.log` | | |', '| TC01 | 2 | BLOCKED | 环境不可用 | | |'] }),
  }), 'acceptance');
  assert.equal(blocked.status, 'BLOCKED', formatReport(blocked));

  const failed = await checkFeature(await workspace(t, {
    planText: plan({ rows: ['| TC01 | 1 | FAIL | `evidence/run.log` | | |', '| TC01 | 2 | BLOCKED | 环境不可用 | | |'] }),
  }), 'acceptance');
  assert.equal(failed.status, 'FAIL', formatReport(failed));
});

test('规划阶段只校验结构；用户故事未覆盖或 QA Mode 非法时失败', async (t) => {
  const planned = await checkFeature(await workspace(t, {
    planText: plan({ rows: ['| TC01 | 1 | BLOCKED | 尚未执行 | | |', '| TC01 | 2 | BLOCKED | 尚未执行 | | |'] }),
    files: {},
  }), 'plan');
  assert.equal(planned.status, 'PASS', formatReport(planned));

  const uncovered = await checkFeature(await workspace(t, { planText: plan({ covers: '1' }) }), 'plan');
  assert.ok(codes(uncovered).includes('UNCOVERED_US'), formatReport(uncovered));

  const mode = await checkFeature(await workspace(t, { planText: plan({ mode: 'auto' }) }), 'plan');
  assert.ok(codes(mode).includes('INVALID_QA_MODE'), formatReport(mode));
});

test('缺少 review-report 时 review 不通过', async (t) => {
  const report = await checkFeature(await workspace(t), 'review');
  assert.notEqual(report.status, 'PASS');
  assert.ok(codes(report).includes('MISSING_REVIEW_REPORT'), formatReport(report));
});

test('安装模板与工具脚本保持逐字一致', async () => {
  const [script, template] = await Promise.all([readFile(SCRIPT, 'utf8'), readFile(TEMPLATE, 'utf8')]);
  assert.equal(template, script);
});

test('CLI 兼容 pnpm 传入的字面量双横线分隔符', async (t) => {
  const dir = await workspace(t);
  const cli = spawnSync(process.execPath, [SCRIPT, '--', 'plan', dir], { encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout + cli.stderr);
  assert.match(cli.stdout, /结果: PASS/);
});
