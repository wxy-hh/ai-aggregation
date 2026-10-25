import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkFeature } from '../qa-check.mjs';

const SCRIPT = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const TEMPLATE = fileURLToPath(
  new URL('../../../.claude/skills/setup-qa-workflow/templates/qa-check.mjs', import.meta.url),
);
const SPEC = `## User Stories\n1. 第一条需求\n2. 第二条需求\n`;
const VALID_PLAN = [
  'QA Schema: 1',
  'QA Mode: inline',
  '',
  '### TC01: 示例',
  '- Priority: P0',
  '- Covers: 1, 2',
  '',
  '#### 验证断言',
  '1. 第一条断言',
  '2. 第二条断言',
  '',
  '## 执行记录',
  '| 用例 | 断言序号 | 状态 | 证据或原因 |',
  '| --- | --- | --- | --- |',
  '| TC01 | 1 | PASS | `screenshots/TC01-a.png` |',
  '| TC01 | 2 | PASS | `screenshots/TC01-b.png` |',
].join('\n');

async function workspace(t, { spec = SPEC, plan = VALID_PLAN, evidence } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-check-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  await mkdir(path.join(dir, 'screenshots'));
  if (spec !== null) await writeFile(path.join(dir, 'spec.md'), spec);
  await writeFile(path.join(dir, 'qa-plan.md'), plan);
  for (const [name, content] of Object.entries(evidence ?? {})) {
    await writeFile(path.join(dir, 'screenshots', name), content);
  }
  return dir;
}

test('合法计划和完整非空证据可以通过验收', async (t) => {
  const dir = await workspace(t, {
    evidence: { 'TC01-a.png': '证据甲', 'TC01-b.png': '证据乙' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'PASS');
  assert.equal(result.ok, true);
  assert.deepEqual(result.issues, []);
});

test('任一断言处于 BLOCKED 时整体验收不能通过', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace(
      '| TC01 | 2 | PASS | `screenshots/TC01-b.png` |',
      '| TC01 | 2 | BLOCKED | 尚未执行 |',
    ),
    evidence: { 'TC01-a.png': '证据甲' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.ok, false);
});

test('PASS 引用不存在的文件时返回证据缺失', async (t) => {
  const dir = await workspace(t, { evidence: { 'TC01-a.png': '证据甲' } });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'MISSING_EVIDENCE'));
});

test('PASS 引用零字节文件时返回空证据', async (t) => {
  const dir = await workspace(t, {
    evidence: { 'TC01-a.png': '证据甲', 'TC01-b.png': '' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'EMPTY_EVIDENCE'));
});

test('证据路径越出特性目录时被拒绝', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace('screenshots/TC01-b.png', '../outside.png'),
    evidence: { 'TC01-a.png': '证据甲' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'EVIDENCE_OUT_OF_SCOPE'));
});

test('缺少任一断言执行行时返回缺失结果且不能通过', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace('| TC01 | 2 | PASS | `screenshots/TC01-b.png` |', ''),
    evidence: { 'TC01-a.png': '证据甲' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'BLOCKED');
  assert.ok(result.issues.some((item) => item.code === 'MISSING_RESULT' && item.message.includes('TC01 / 2')));
});

test('同一断言出现重复结果时返回重复错误', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace(
      '| TC01 | 2 | PASS | `screenshots/TC01-b.png` |',
      '| TC01 | 1 | PASS | `screenshots/TC01-a.png` |',
    ),
    evidence: { 'TC01-a.png': '证据甲' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'DUPLICATE_RESULT'));
});

test('完全没有执行结果时状态为 BLOCKED 而不是 PASS', async (t) => {
  const dir = await workspace(t, {
    plan: `${VALID_PLAN.split('## 执行记录')[0]}## 执行记录\n`,
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.ok, false);
});

test('FAIL 与 BLOCKED 同时存在时总体结果为 FAIL', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace(
      '| TC01 | 1 | PASS | `screenshots/TC01-a.png` |',
      '| TC01 | 1 | FAIL | 断言不符 |',
    ).replace(
      '| TC01 | 2 | PASS | `screenshots/TC01-b.png` |',
      '| TC01 | 2 | BLOCKED | 尚未执行 |',
    ),
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'FAIL');
});

test('命令证据不要求额外截图文件', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replaceAll('`screenshots/TC01-a.png`', 'command: node --test（exit 0）').replaceAll('`screenshots/TC01-b.png`', 'command: node --test（exit 0）'),
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'PASS');
});

test('计划外的执行结果必须被指出', async (t) => {
  const dir = await workspace(t, {
    plan: `${VALID_PLAN}\n| TC99 | 1 | PASS | command: 额外结果 |`,
    evidence: { 'TC01-a.png': '证据甲', 'TC01-b.png': '证据乙' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'UNKNOWN_RESULT'));
});

const REVIEW_OK = [
  '## Spec 对账',
  '| US | 状态 | 证据或原因 |',
  '| --- | --- | --- |',
  '| 1 | PASS | TC01 / 断言 1 |',
  '| 2 | PASS | TC01 / 断言 2 |',
].join('\n');

test('规划阶段只校验结构，不要求提前产生执行证据', async (t) => {
  const dir = await workspace(t);

  const result = await checkFeature(dir, 'plan');
  assert.equal(result.status, 'PASS');
});

test('Spec 用户故事未被任何 TC 覆盖时规划失败', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace('- Covers: 1, 2', '- Covers: 1'),
  });

  const result = await checkFeature(dir, 'plan');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'UNCOVERED_US' && item.message.includes('US 2')));
});

test('非法 QA Mode 会被明确拒绝', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace('QA Mode: inline', 'QA Mode: auto'),
  });

  const result = await checkFeature(dir, 'plan');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'INVALID_QA_MODE'));
});

test('Markdown 表格允许省略首尾管道符并使用不规则空格', async (t) => {
  const dir = await workspace(t, {
    plan: VALID_PLAN.replace(
      '| TC01 | 1 | PASS | `screenshots/TC01-a.png` |',
      'TC01|1|PASS|`screenshots/TC01-a.png`',
    ).replace(
      '| TC01 | 2 | PASS | `screenshots/TC01-b.png` |',
      '  TC01  |  2  |  PASS  |  `screenshots/TC01-b.png`  ',
    ),
    evidence: { 'TC01-a.png': '证据甲', 'TC01-b.png': '证据乙' },
  });

  const result = await checkFeature(dir, 'acceptance');
  assert.equal(result.status, 'PASS');
});

test('旧计划返回 LEGACY、未校验和退出 0，且不修改文件', async (t) => {
  const dir = await workspace(t, { spec: null, plan: '# 历史测试计划\n' });
  const planPath = path.join(dir, 'qa-plan.md');
  const before = await stat(planPath);

  const result = await checkFeature(dir, 'acceptance');
  const after = await stat(planPath);
  const cli = spawnSync(process.execPath, [SCRIPT, 'acceptance', dir], { encoding: 'utf8' });

  assert.equal(result.status, 'LEGACY');
  assert.equal(result.ok, false);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /未校验/);
  assert.match(cli.stdout, /结果: LEGACY/);
});

test('完整执行证据和全量 US 对账可以通过 review', async (t) => {
  const dir = await workspace(t, {
    plan: `${VALID_PLAN}\n${REVIEW_OK}`,
    evidence: { 'TC01-a.png': '证据甲', 'TC01-b.png': '证据乙' },
  });

  const result = await checkFeature(dir, 'review');
  assert.equal(result.status, 'PASS');
});

test('review 漏掉任一 US 时返回 MISSING_US', async (t) => {
  const dir = await workspace(t, {
    plan: `${VALID_PLAN}\n${REVIEW_OK.replace('| 2 | PASS | TC01 / 断言 2 |', '')}`,
    evidence: { 'TC01-a.png': '证据甲', 'TC01-b.png': '证据乙' },
  });

  const result = await checkFeature(dir, 'review');
  assert.equal(result.status, 'FAIL');
  assert.ok(result.issues.some((item) => item.code === 'MISSING_US' && item.message.includes('US 2')));
});

test('安装模板与工具脚本保持逐字一致', async () => {
  const [script, template] = await Promise.all([
    readFile(SCRIPT, 'utf8'),
    readFile(TEMPLATE, 'utf8'),
  ]);
  assert.equal(template, script);
});

test('CLI 兼容 pnpm 传入的字面量双横线分隔符', async (t) => {
  const dir = await workspace(t);
  const cli = spawnSync(process.execPath, [SCRIPT, '--', 'plan', dir], { encoding: 'utf8' });

  assert.equal(cli.status, 0);
  assert.match(cli.stdout, /结果: PASS/);
});

for (const prefix of ['command:', 'server:']) {
  test(`${prefix} 后没有任何说明时不能作为有效证据`, async (t) => {
    const dir = await workspace(t, {
      plan: VALID_PLAN.replaceAll('`screenshots/TC01-a.png`', prefix).replaceAll('`screenshots/TC01-b.png`', prefix),
    });

    const result = await checkFeature(dir, 'acceptance');
    assert.equal(result.status, 'FAIL');
    assert.ok(result.issues.some((item) => item.code === 'MISSING_EVIDENCE'));
  });
}
