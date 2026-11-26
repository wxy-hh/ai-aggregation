import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeature, formatReport } from '../qa-check.mjs';
import {
  parseSpecReviewChecklist,
  specReviewChecklistDocument,
} from '../qa-spec-review.mjs';

const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));
// 合法的最小 1x1 透明 PNG 数据，仅用于模拟截图文件内容
const PNG_1X1_A = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);
const PNG_1X1_B = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=',
  'base64',
);

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

function writeDeep(file, content) {
  return mkdir(path.dirname(file), { recursive: true }).then(() => writeFile(file, content));
}

function runCli(script, cwd, args, env = process.env) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: 'utf8',
  });
}

function buildPlan({
  cases,
  rows,
  delivery = '`node --version` | `evidence/delivery.log`',
  coverage = '2',
  changes = '- 无',
} = {}) {
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    ...(coverage ? [`QA Review Coverage: ${coverage}`] : []),
    '',
    ...cases,
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rows,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    `| ${delivery} |`,
    '',
    '## 计划变更',
    changes,
    '',
  ].join('\n');
}

async function setupFeatureRepo(t, {
  spec = '## User Stories\n1. 第一条能力\n\n## 交付命令\n\n```bash\nnode --version\n```\n',
  files = {},
  scopePaths = ['src/app.js', 'GLOSSARY.md'],
  cases = [
    '### TC01: 核心流程验证',
    '- Priority: P0',
    '- Covers: 1',
    '- Seam: unit',
    '',
    '#### 验证断言',
    '1. 核心函数返回值符合预期',
  ],
  blockedRows = ['| TC01 | 1 | BLOCKED | 尚未执行 | | |'],
  coverage = '2',
} = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-v22-reg-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);

  await writeDeep(path.join(dir, 'GLOSSARY.md'), '# 术语表\n');
  await writeDeep(path.join(dir, 'src/app.js'), 'export const value = 1;\n');
  await writeDeep(
    path.join(dir, 'tests/app.test.mjs'),
    "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('核心函数返回正确', () => {\n  assert.equal(1, 1);\n});\n",
  );
  for (const [rel, content] of Object.entries(files)) {
    await writeDeep(path.join(dir, rel), content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '初始基线']);

  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  await writeFile(path.join(feature, 'spec.md'), spec);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows: blockedRows, coverage }));

  const gatePlan = runCli(QA_RUN, dir, [feature, 'gate-plan-01', '--', process.execPath, QA_CHECK, 'plan', feature]);
  assert.equal(gatePlan.status, 0, gatePlan.stdout + gatePlan.stderr);
  const initRes = runCli(REVIEW_PACKAGE, dir, ['init', feature, '--', ...scopePaths]);
  assert.equal(initRes.status, 0, initRes.stdout + initRes.stderr);
  return { dir, feature };
}

test('[v2.2-TC03-1] P0-1 collect 生成轻量不可变快照并支持工作区变化后基于快照完成 seal', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js', 'tests/app.test.mjs'],
    cases: [
      '### TC01: 浏览器核验',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 页面渲染主标题',
    ],
  });

  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  await writeDeep(path.join(feature, 'scripts/tc01.mjs'), [
    "import assert from 'node:assert/strict';",
    'const ok = true;',
    'assert.ok(ok);',
    "console.log('[TC01-1] PASS 实测：主标题可见');",
    '',
  ].join('\n'));
  await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);

  const runLog = runCli(QA_RUN, dir, [feature, 'tc01', '--script', path.join(feature, 'scripts/tc01.mjs')]);
  assert.equal(runLog.status, 0, runLog.stderr);

  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 浏览器核验',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 页面渲染主标题',
    ],
    rows: ['| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01.log` | | |'],
  }));

  const gateAcc = runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]);
  assert.equal(gateAcc.status, 0, gateAcc.stdout + gateAcc.stderr);

  const collected = runCli(REVIEW_PACKAGE, dir, ['collect', feature]);
  assert.equal(collected.status, 0, collected.stdout + collected.stderr);

  const snapshotManifestPath = path.join(feature, '_qa', 'round-snapshots', 'r1', 'manifest.json');
  const snapshotManifest = JSON.parse(await readFile(snapshotManifestPath, 'utf8'));
  assert.equal(snapshotManifest.round, 'r1');
  assert.ok(snapshotManifest.files['src/app.js']);
  assert.ok(snapshotManifest.featureFiles['scripts/tc01.mjs']);

  // 审查途中故意破坏 live 脚本第 3 行断言并删除其内容为占位注释，子代理仍应可凭 r1 快照完成 seal
  await writeFile(path.join(feature, 'scripts/tc01.mjs'), '// 审查期间被意外修改的 live 文件\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `scripts/tc01.mjs:3` `assert.ok(ok)` 硬断言 | 不适用 |',
    '',
  ].join('\n'));
  const sealRes = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature,
    '--round', 'r1',
    '--axis', 'spec',
    '--file', 'review/r1-spec-axis.md',
    '--reviewer-kind', 'subagent',
    '--host', 'Claude Code',
  ]);
  assert.equal(sealRes.status, 0, sealRes.stdout + sealRes.stderr);
  assert.match(sealRes.stdout, /QA_REVIEW_RECEIPT:/);
});

test('[v2.2-TC03-2] P0-1 审查途中修改术语、源码或 spec 均触发 SUPERSEDED 且不放行 PASS', async (t) => {
  for (const scenario of ['r1-glossary', 'r2-source', 'r4-spec']) {
    const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js', 'GLOSSARY.md'] });
    await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
    const unitLog = runCli(QA_RUN, dir, [feature, 'unit-01', '--', process.execPath, '--test', 'tests/app.test.mjs']);
    assert.equal(unitLog.status, 0, unitLog.stderr);

    await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
      cases: [
        '### TC01: 核心流程验证',
        '- Priority: P0',
        '- Covers: 1',
        '- Seam: unit',
        '',
        '#### 验证断言',
        '1. 核心函数返回值符合预期',
      ],
      rows: ['| TC01 | 1 | PASS | `evidence/unit-01.log` | `tests/app.test.mjs` › 核心函数返回正确 | |'],
    }));
    assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);

    const targetRound = scenario === 'r1-glossary' ? 'r1' : scenario === 'r2-source' ? 'r2' : 'r4';
    if (scenario !== 'r1-glossary') {
      await writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n');
      await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
        '无发现',
        '',
        '## 对账覆盖',
        '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
        '| --- | --- | --- | --- |',
        '| TC01-1 | 已核实 | `tests/app.test.mjs:4` `assert.equal(1, 1)` | 不适用 |',
        '',
      ].join('\n'));
    }
    const collectArgs = ['collect', feature, '--round', targetRound, ...(targetRound === 'r4' ? ['--allow-manual-round'] : [])];
    const col = runCli(REVIEW_PACKAGE, dir, collectArgs);
    assert.equal(col.status, 0, col.stdout + col.stderr);

    await writeDeep(path.join(feature, `review/${targetRound}-standards.md`), '无发现\n');
    await writeDeep(path.join(feature, `review/${targetRound}-spec-axis.md`), [
      '无发现',
      '',
      '## 对账覆盖',
      '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
      '| --- | --- | --- | --- |',
      '| TC01-1 | 已核实 | `tests/app.test.mjs:4` `assert.equal(1, 1)` | 不适用 |',
      '',
    ].join('\n'));
    assert.equal(runCli(REVIEW_PACKAGE, dir, [
      'seal', feature, '--round', targetRound, '--axis', 'standards',
      '--file', `review/${targetRound}-standards.md`, '--reviewer-kind', 'external-session', '--host', 'Kimi Code',
    ]).status, 0);
    assert.equal(runCli(REVIEW_PACKAGE, dir, [
      'seal', feature, '--round', targetRound, '--axis', 'spec',
      '--file', `review/${targetRound}-spec-axis.md`, '--reviewer-kind', 'external-session', '--host', 'Kimi Code',
    ]).status, 0);

    // 分别重放 r1 改 GLOSSARY、r2 改源码、r4 改 spec
    if (scenario === 'r1-glossary') {
      await writeFile(path.join(dir, 'GLOSSARY.md'), '# 术语表\n新增抢跑改动\n');
    } else if (scenario === 'r2-source') {
      await writeFile(path.join(dir, 'src/app.js'), 'export const value = 999;\n');
    } else {
      await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 第一条能力\n\n## 交付命令\n\n```bash\nnode --version\n```\n\n## Out of Scope\n- 抢跑新增说明\n');
    }

    await writeFile(path.join(feature, 'review-report.md'), [
      '审查方式：宿主=Kimi Code；双轴外部独立会话',
      '',
      '## 三档分流',
      '无发现',
      '',
    ].join('\n'));
    runCli(QA_RUN, dir, [feature, 'delivery', '--', 'node', '--version']);
    const report = await checkFeature(feature, 'review');
    assert.equal(report.status, 'BLOCKED', scenario);
    assert.ok(report.issues.some((item) => item.code === 'SUPERSEDED'), `${scenario}: ${formatReport(report)}`);
  }
});

test('[v2.2-TC04-1] P0-2 qa-run --executor ego-browser --script 通过 stdin 直接运行并在日志写入执行器与真实脚本路径', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: [
      '### TC01: 原生 executor 验收',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 断言日志直接识别真实脚本',
    ],
  });
  const fakeBinDir = await mkdtemp(path.join(tmpdir(), 'fake-ego-'));
  t.after(() => rm(fakeBinDir, { recursive: true, force: true }));
  const fakeBin = path.join(fakeBinDir, 'fake-ego-browser.sh');
  await writeFile(fakeBin, [
    '#!/bin/sh',
    'if [ "$1" != "nodejs" ]; then exit 2; fi',
    'node --input-type=module -',
    '',
  ].join('\n'));
  await chmod(fakeBin, 0o755);

  const scriptPath = path.join(feature, 'scripts/tc01-native.browser.mjs');
  await writeDeep(scriptPath, [
    "import assert from 'node:assert/strict';",
    'const ok = true;',
    'assert.ok(ok);',
    "console.log('[TC01-1] PASS 实测：原生 executor 执行成功');",
    '',
  ].join('\n'));
  await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);

  const runRes = runCli(
    QA_RUN,
    dir,
    [feature, 'tc01-exec', '--executor', 'ego-browser', '--script', scriptPath],
    { ...process.env, QA_EGO_BROWSER_BIN: fakeBin },
  );
  assert.equal(runRes.status, 0, runRes.stdout + runRes.stderr);

  const logText = await readFile(path.join(feature, 'evidence/tc01-exec.log'), 'utf8');
  assert.match(logText, /^# executor: ego-browser$/m);
  assert.match(logText, /^# script: \.scratch\/feature\/scripts\/tc01-native\.browser\.mjs$/m);

  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 原生 executor 验收',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 断言日志直接识别真实脚本',
    ],
    rows: ['| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01-exec.log` | | |'],
  }));
  const gateAcc = runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]);
  assert.equal(gateAcc.status, 0, gateAcc.stdout + gateAcc.stderr);
  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  assert.deepEqual(checklist.rows[0].sourceCandidates, ['scripts/tc01-native.browser.mjs']);
});

test('[v2.2-TC04-2] P0-2 SCRIPT_DIR + BROWSER_SCRIPT 变量赋值包装器闭包解析出真实 .browser.mjs 并一次 seal 通过', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: [
      '### TC01: 包装器闭包',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 按钮可见并响应点击',
    ],
  });

  await writeDeep(path.join(feature, 'scripts/tc01.browser.mjs'), [
    "import assert from 'node:assert/strict';",
    'const clicked = true;',
    'assert.equal(clicked, true);',
    "console.log('[TC01-1] PASS 实测：clicked=true');",
    '',
  ].join('\n'));
  const wrapper = path.join(feature, 'scripts/tc01.sh');
  await writeFile(wrapper, [
    '#!/usr/bin/env sh',
    'set -eu',
    'SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"',
    'BROWSER_SCRIPT="${SCRIPT_DIR}/tc01.browser.mjs"',
    'node "${BROWSER_SCRIPT}"',
    '',
  ].join('\n'));
  await chmod(wrapper, 0o755);
  await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);

  const runLog = runCli(QA_RUN, dir, [feature, 'tc01-wrap', '--script', wrapper]);
  assert.equal(runLog.status, 0, runLog.stdout + runLog.stderr);

  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 包装器闭包',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 按钮可见并响应点击',
    ],
    rows: ['| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01-wrap.log` | | |'],
  }));
  const gateAcc = runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]);
  assert.equal(gateAcc.status, 0, gateAcc.stdout + gateAcc.stderr);

  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  assert.ok(checklist.rows[0].sourceCandidates.includes('scripts/tc01.browser.mjs'), JSON.stringify(checklist.rows[0].sourceCandidates));

  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature]).status, 0);
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `scripts/tc01.browser.mjs:3` `assert.equal(clicked, true)` | 不适用 |',
    '',
  ].join('\n'));
  const seal = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature, '--round', 'r1', '--axis', 'spec',
    '--file', 'review/r1-spec-axis.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code',
  ]);
  assert.equal(seal.status, 0, seal.stderr);
});

test('[v2.2-TC04-3] P0-2 collect 2 秒可封存性预检拦截无谓词候选并输出三类类型化错误码', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: [
      '### TC01: 无谓词包装',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 断言检查',
    ],
  });
  await writeDeep(path.join(feature, 'scripts/only-shell.sh'), [
    '#!/usr/bin/env sh',
    'echo "[TC01-1] PASS 实测：仅空壳"',
    '',
  ].join('\n'));
  await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);

  await writeDeep(path.join(feature, '_qa/spec-review-checklist.json'), specReviewChecklistDocument([{
    id: 'TC01-1',
    status: 'PASS',
    priority: 'P0',
    seam: 'browser',
    assertion: '断言检查',
    actual: '仅空壳',
    sourceCandidates: ['scripts/only-shell.sh'],
    changed: false,
  }], { version: 2 }));

  const startedAt = Date.now();
  const collectBlocked = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--skip-preflight']);
  const elapsedMs = Date.now() - startedAt;
  assert.equal(collectBlocked.status, 1);
  assert.ok(elapsedMs < 2000, `预检耗时过长：${elapsedMs}ms`);
  assert.match(collectBlocked.stderr, /PACKAGE_INVALID/);

  // 修复为可打包状态后再测 seal 的 REVIEWER_EDITABLE 与 PACKAGE_INVALID 路由
  await writeFile(path.join(feature, 'scripts/only-shell.sh'), "echo '[TC01-1] PASS 实测：ok'\n");
  await writeDeep(path.join(feature, 'scripts/real.mjs'), "import assert from 'node:assert/strict';\nassert.ok(true);\nconsole.log('[TC01-1] PASS 实测：ok');\n");
  await writeDeep(path.join(feature, '_qa/spec-review-checklist.json'), specReviewChecklistDocument([{
    id: 'TC01-1',
    status: 'PASS',
    priority: 'P0',
    seam: 'browser',
    assertion: '断言检查',
    actual: 'ok',
    sourceCandidates: ['scripts/real.mjs'],
    changed: false,
  }], { version: 2 }));
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--skip-preflight']).status, 0);

  await writeDeep(path.join(feature, 'review/r1-standards.md'), '没有规范编号也没写无结果\n');
  const editableFail = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature, '--round', 'r1', '--axis', 'standards',
    '--file', 'review/r1-standards.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code',
  ]);
  assert.equal(editableFail.status, 1);
  assert.match(editableFail.stderr, /REVIEWER_EDITABLE/);

  const challengePath = path.join(feature, '_qa/review-challenge.json');
  const challenge = JSON.parse(await readFile(challengePath, 'utf8'));
  await writeFile(challengePath, `${JSON.stringify({ ...challenge, round: 'r2' }, null, 2)}\n`);
  await writeFile(path.join(feature, 'review/r1-standards.md'), '无发现\n');
  const packageFail = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature, '--round', 'r1', '--axis', 'standards',
    '--file', 'review/r1-standards.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code',
  ]);
  assert.equal(packageFail.status, 1);
  assert.match(packageFail.stderr, /PACKAGE_INVALID/);

  // 场景 (a)：required PASS browser 行缺少 sourceCandidates 时 2 秒内报 PACKAGE_INVALID
  await writeDeep(path.join(feature, '_qa/spec-review-checklist.json'), specReviewChecklistDocument([{
    id: 'TC01-1',
    status: 'PASS',
    priority: 'P0',
    seam: 'browser',
    assertion: '断言检查',
    actual: 'ok',
    sourceCandidates: [],
    changed: false,
  }], { version: 2 }));
  const emptyStarted = Date.now();
  const emptyBlocked = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2', '--skip-preflight']);
  const emptyElapsed = Date.now() - emptyStarted;
  assert.equal(emptyBlocked.status, 1);
  assert.ok(emptyElapsed < 2000, `空候选预检耗时过长：${emptyElapsed}ms`);
  assert.match(emptyBlocked.stderr, /PACKAGE_INVALID/);

  // 场景 (b)：已有 _qa/reconciliation.md 时若 qa-plan 执行记录被改弱与产物失鲜，collect 2 秒内报 PACKAGE_INVALID
  await writeDeep(path.join(feature, '_qa/spec-review-checklist.json'), specReviewChecklistDocument([{
    id: 'TC01-1',
    status: 'PASS',
    priority: 'P0',
    seam: 'browser',
    assertion: '断言检查',
    actual: 'ok',
    sourceCandidates: ['scripts/real.mjs'],
    changed: false,
  }], { version: 2 }));
  await writeDeep(path.join(feature, '_qa/reconciliation.md'), '# 验收对账表\n\n| 断言 | 状态 | 冻结断言 | 实测值或绑定 | 标记 |\n| --- | --- | --- | --- | --- |\n| TC01-1 | PASS | 断言检查 | ok | 无 |\n');
  const stalePlan = (await readFile(path.join(feature, 'qa-plan.md'), 'utf8')).replace('| TC01 | 1 | BLOCKED | 尚未执行 | | |', '| TC01 | 1 | FAIL | 手改失鲜 | | |');
  await writeFile(path.join(feature, 'qa-plan.md'), stalePlan);
  const staleStarted = Date.now();
  const staleBlocked = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2', '--skip-preflight']);
  const staleElapsed = Date.now() - staleStarted;
  assert.equal(staleBlocked.status, 1);
  assert.ok(staleElapsed < 2000, `失鲜产物预检耗时过长：${staleElapsed}ms`);
  assert.match(staleBlocked.stderr, /PACKAGE_INVALID/);
});

test('[v2.2-TC05-1] P0-3 Coverage 2 平滑扩展分组 reviewUnits 且兼容旧 v1/v2 清单', async (t) => {
  // 旧格式解析向后兼容
  const legacyV2 = parseSpecReviewChecklist(specReviewChecklistDocument([{
    id: 'TC01-1', status: 'PASS', priority: 'P0', seam: 'unit',
    assertion: '旧格式兼容', actual: '`tests/a.test.mjs` › 用例', sourceCandidates: ['tests/a.test.mjs'], changed: false,
  }], { version: 2 }));
  assert.equal(legacyV2.version, 2);
  assert.equal(legacyV2.reviewUnits, undefined);

  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: [
      '### TC01: 同脚本多断言',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 首屏渲染标题',
      '2. 次级面板折叠切换',
    ],
    blockedRows: [
      '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
      '| TC01 | 2 | BLOCKED | 尚未执行 | | |',
    ],
  });
  await writeDeep(path.join(feature, 'scripts/tc01-multi.mjs'), [
    "import assert from 'node:assert/strict';",
    'const heading = true; const collapsed = true;',
    'assert.ok(heading); console.log("[TC01-1] PASS 实测：标题可见");',
    'assert.ok(collapsed); console.log("[TC01-2] PASS 实测：折叠切换");',
    '',
  ].join('\n'));
  await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);
  assert.equal(runCli(QA_RUN, dir, [feature, 'tc01', '--script', path.join(feature, 'scripts/tc01-multi.mjs')]).status, 0);

  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 同脚本多断言',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '',
      '#### 验证断言',
      '1. 首屏渲染标题',
      '2. 次级面板折叠切换',
    ],
    rows: [
      '| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01.log` | | |',
      '| TC01 | 2 | PASS | `screenshots/tc01.png`、`evidence/tc01.log` | | |',
    ],
  }));
  const gateAcc = runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]);
  assert.equal(gateAcc.status, 0, gateAcc.stdout + gateAcc.stderr);

  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  assert.ok(Array.isArray(checklist.reviewUnits) && checklist.reviewUnits.length === 1);
  assert.deepEqual(checklist.reviewUnits[0].rowIds, ['TC01-1', 'TC01-2']);
  assert.equal(checklist.reviewUnits[0].verificationStatus, 'required');

  const skeleton = await readFile(path.join(feature, '_qa/spec-review-skeleton.md'), 'utf8');
  assert.match(skeleton, /TC01-1、TC01-2/);
});

test('[v2.2-TC05-2] P0-3 未实质改动源码的存量回归标 sampled，高风险安全/权限/计费/changed 永不降级', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    files: {
      'tests/reg.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('常规回归标题', () => {\n  assert.equal(2, 2);\n});\n",
      'tests/auth-permission.test.mjs': "import test from 'node:test';\nimport assert from 'node:assert/strict';\ntest('未登录拦截访问权限', () => {\n  assert.equal(401, 401);\n});\n",
    },
    cases: [
      '### TC01: 未改常规回归单测',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '',
      '#### 验证断言',
      '1. 普通列表顺序不变',
      '',
      '### TC02: 存量安全与权限红线',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '',
      '#### 验证断言',
      '1. 未认证用户无权读取私密计费配置',
    ],
    blockedRows: [
      '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
      '| TC02 | 1 | BLOCKED | 尚未执行 | | |',
    ],
  });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 3;\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'unit-all', '--', process.execPath, '--test', 'tests/reg.test.mjs', 'tests/auth-permission.test.mjs']).status, 0);

  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 未改常规回归单测',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '',
      '#### 验证断言',
      '1. 普通列表顺序不变',
      '',
      '### TC02: 存量安全与权限红线',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '',
      '#### 验证断言',
      '1. 未认证用户无权读取私密计费配置',
    ],
    rows: [
      '| TC01 | 1 | PASS | `evidence/unit-all.log` | `tests/reg.test.mjs` › 常规回归标题 | |',
      '| TC02 | 1 | PASS | `evidence/unit-all.log` | `tests/auth-permission.test.mjs` › 未登录拦截访问权限 | |',
    ],
  }));

  const gateAcc = runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]);
  assert.equal(gateAcc.status, 0, gateAcc.stdout + gateAcc.stderr);
  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  const tc01Row = checklist.rows.find((row) => row.id === 'TC01-1');
  const tc02Row = checklist.rows.find((row) => row.id === 'TC02-1');
  assert.equal(tc01Row.required, false, '未改源码与测试的普通存量回归应进抽检');
  assert.equal(tc02Row.required, true, '权限/安全/计费高风险行严禁被抽检规则降级');
  assert.equal(checklist.reviewUnits.find((unit) => unit.rowIds.includes('TC01-1'))?.verificationStatus, 'sampled');
  assert.equal(checklist.reviewUnits.find((unit) => unit.rowIds.includes('TC02-1'))?.verificationStatus, 'required');
});

test('[v2.2-TC05-3] P0-3 r2 未变化 reviewUnit 自动 inherited，修改 1 个脚本只精准失效该 unit', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: [
      '### TC01: 脚本一',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '#### 验证断言',
      '1. 卡片一渲染',
      '### TC02: 脚本二',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: browser',
      '#### 验证断言',
      '1. 卡片二渲染',
    ],
    blockedRows: [
      '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
      '| TC02 | 1 | BLOCKED | 尚未执行 | | |',
    ],
  });

  await writeDeep(path.join(feature, 'scripts/tc01.mjs'), "import assert from 'node:assert/strict';\nconst ok = true;\nassert.ok(ok);\nconsole.log('[TC01-1] PASS 实测：一');\n");
  await writeDeep(path.join(feature, 'scripts/tc02.mjs'), "import assert from 'node:assert/strict';\nconst ok = true;\nassert.ok(ok);\nconsole.log('[TC02-1] PASS 实测：二');\n");
  await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);
  await writeDeep(path.join(feature, 'screenshots/tc02.png'), PNG_1X1_B);
  assert.equal(runCli(QA_RUN, dir, [feature, 'tc01', '--script', path.join(feature, 'scripts/tc01.mjs')]).status, 0);
  assert.equal(runCli(QA_RUN, dir, [feature, 'tc02', '--script', path.join(feature, 'scripts/tc02.mjs')]).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 脚本一', '- Priority: P0', '- Covers: 1', '- Seam: browser', '#### 验证断言', '1. 卡片一渲染',
      '### TC02: 脚本二', '- Priority: P0', '- Covers: 1', '- Seam: browser', '#### 验证断言', '1. 卡片二渲染',
    ],
    rows: [
      '| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01.log` | | |',
      '| TC02 | 1 | PASS | `screenshots/tc02.png`、`evidence/tc02.log` | | |',
    ],
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r1']).status, 0);

  await writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
    '[P-M1] TC02 缺少边界检查说明',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `scripts/tc01.mjs:2` `assert.ok(true)` | 不适用 |',
    '| TC02-1 | 已核实 | `scripts/tc02.mjs:2` `assert.ok(true)` | 不适用 |',
    '',
  ].join('\n'));
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['seal', feature, '--round', 'r1', '--axis', 'standards', '--file', 'review/r1-standards.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code']).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['seal', feature, '--round', 'r1', '--axis', 'spec', '--file', 'review/r1-spec-axis.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code']).status, 0);

  // 仅修改脚本二并重跑 tc02（tc01 完全未改）
  await writeFile(path.join(feature, 'scripts/tc02.mjs'), "import assert from 'node:assert/strict';\nconst edge = true; assert.ok(edge);\nconsole.log('[TC02-1] PASS 实测：二增强');\n");
  assert.equal(runCli(QA_RUN, dir, [feature, 'tc02-r2', '--script', path.join(feature, 'scripts/tc02.mjs')]).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: [
      '### TC01: 脚本一', '- Priority: P0', '- Covers: 1', '- Seam: browser', '#### 验证断言', '1. 卡片一渲染',
      '### TC02: 脚本二', '- Priority: P0', '- Covers: 1', '- Seam: browser', '#### 验证断言', '1. 卡片二渲染',
    ],
    rows: [
      '| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01.log` | | |',
      '| TC02 | 1 | PASS | `screenshots/tc02.png`、`evidence/tc02-r2.log` | | |',
    ],
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acc-02', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);

  const r2Checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  const u1 = r2Checklist.reviewUnits.find((unit) => unit.rowIds.includes('TC01-1'));
  const u2 = r2Checklist.reviewUnits.find((unit) => unit.rowIds.includes('TC02-1'));
  assert.equal(u1?.verificationStatus, 'inherited');
  assert.match(u1?.inheritedFrom ?? '', /^r1-spec@/);
  assert.equal(u2?.verificationStatus, 'required');

  // r2 Spec 原文仅填写 TC02-1（unchanged TC01-1 重写为 0），应顺利通过 seal！
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2']).status, 0);
  await writeDeep(path.join(feature, 'review/r2-spec-axis.md'), [
    '[P-M1] 已修',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC02-1 | 已核实 | `scripts/tc02.mjs:2` `assert.ok(edge)` | 不适用 |',
    '',
  ].join('\n'));
  const r2Seal = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature, '--round', 'r2', '--axis', 'spec',
    '--file', 'review/r2-spec-axis.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code',
    '--pending-ids', 'P-M1',
  ]);
  assert.equal(r2Seal.status, 0, r2Seal.stderr);
});

test('[v2.2-P2-TC04-4] 截图三要素未变才允许继承，任一变化精准失效', async (t) => {
  for (const variant of ['same', 'image', 'target', 'assertion']) {
    const cases = [
      '### TC01: 截图目标',
      '- Priority: P1',
      '- Covers: 1',
      '- Seam: browser',
      '- Target: 卡片 | `#card`',
      '#### 验证断言',
      '1. 卡片目标区域非空',
    ];
    const { dir, feature } = await setupFeatureRepo(t, {
      scopePaths: ['src/app.js'],
      cases,
      blockedRows: ['| TC01 | 1 | BLOCKED | 尚未执行 | | |'],
    });
    await writeDeep(path.join(feature, 'scripts/tc01.mjs'), "import assert from 'node:assert/strict';\nconst ok = true;\nassert.ok(ok);\nconsole.log('[TC01-1] PASS 实测：非空');\n");
    await writeDeep(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_A);
    assert.equal(runCli(QA_RUN, dir, [feature, 'tc01', '--script', path.join(feature, 'scripts/tc01.mjs')]).status, 0);
    const rows = ['| TC01 | 1 | PASS | `screenshots/tc01.png`、`evidence/tc01.log` | | |'];
    await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows }));
    assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acc-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
    assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r1']).status, 0);
    await writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n');
    await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
      '无发现',
      '',
      '## 对账覆盖',
      '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
      '| --- | --- | --- | --- |',
      '| TC01-1 | 已核实 | `scripts/tc01.mjs:3` `assert.ok(ok)` | 不适用 |',
      '',
    ].join('\n'));
    assert.equal(runCli(REVIEW_PACKAGE, dir, ['seal', feature, '--round', 'r1', '--axis', 'standards', '--file', 'review/r1-standards.md', '--reviewer-kind', 'external-session', '--host', 'Kimi Code']).status, 0);
    assert.equal(runCli(REVIEW_PACKAGE, dir, ['seal', feature, '--round', 'r1', '--axis', 'spec', '--file', 'review/r1-spec-axis.md', '--reviewer-kind', 'external-session', '--host', 'Kimi Code']).status, 0);

    if (variant === 'image') await writeFile(path.join(feature, 'screenshots/tc01.png'), PNG_1X1_B);
    const changedCases = cases.map((line) => {
      if (variant === 'target' && line.includes('#card')) return line.replace('#card', '#other');
      if (variant === 'assertion' && line.startsWith('1. ')) return '1. 卡片目标区域包含两种颜色';
      return line;
    });
    const changes = variant === 'target'
      ? '- TC01：VisualTarget 定位器变化，重新核验目标。'
      : variant === 'assertion'
        ? '- TC01：断言语义变化，重新核验目标像素。'
        : '- 无';
    await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases: changedCases, rows, changes }));
    const r2 = runCli(QA_RUN, dir, [feature, 'gate-acc-02', '--', process.execPath, QA_CHECK, 'acceptance', feature]);
    assert.equal(r2.status, 0, `${variant}: ${r2.stdout}${r2.stderr}`);
    const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
    const unit = checklist.reviewUnits.find((item) => item.rowIds.includes('TC01-1'));
    assert.equal(unit?.verificationStatus, variant === 'same' ? 'inherited' : 'required', variant);
  }
});

test('[v2.2-TC06-1] P0-4 Rename 折叠压缩迁移 Diff >= 80% 且保留真实逻辑修改', async (t) => {
  const blockLines = Array.from({ length: 180 }, (_, idx) => `export const unchangedLine${idx} = ${idx};`).join('\n');
  const files = {
    'src/old/a.ts': `${blockLines}\nexport const realBehavior = () => 'v1';\n`,
    'src/old/b.ts': `${blockLines}\nexport const helperB = 1;\n`,
    'src/old/c.ts': `${blockLines}\nexport const helperC = 2;\n`,
  };
  const { dir, feature } = await setupFeatureRepo(t, {
    files,
    scopePaths: ['src'],
    coverage: '',
  });
  const naiveBytes = Object.values(files).reduce((sum, text) => sum + Buffer.byteLength(text, 'utf8'), 0) * 2;

  await rm(path.join(dir, 'src/old/a.ts'));
  await rm(path.join(dir, 'src/old/b.ts'));
  await rm(path.join(dir, 'src/old/c.ts'));
  await writeDeep(path.join(dir, 'src/new/a.ts'), `${blockLines}\nexport const realBehavior = () => 'v2-fixed-bug';\n`);
  await writeDeep(path.join(dir, 'src/new/b.ts'), `${blockLines}\nexport const helperB = 1;\n`);
  await writeDeep(path.join(dir, 'src/new/c.ts'), `${blockLines}\nexport const helperC = 2;\n`);

  const collected = runCli(REVIEW_PACKAGE, dir, ['collect', feature]);
  assert.equal(collected.status, 0, collected.stdout + collected.stderr);

  const diffText = await readFile(path.join(feature, '_qa/review-package.diff'), 'utf8');
  const diffBytes = Buffer.byteLength(diffText, 'utf8');
  const compressionRatio = 1 - diffBytes / naiveBytes;
  assert.ok(compressionRatio >= 0.8, `期望压缩 >= 80%，实测 ${(compressionRatio * 100).toFixed(1)}%（diffBytes=${diffBytes}, naiveBytes=${naiveBytes}）`);
  assert.match(diffText, /rename from src\/old\/a\.ts/);
  assert.match(diffText, /rename to src\/new\/a\.ts/);
  assert.match(diffText, /v2-fixed-bug/);

  const manifest = JSON.parse(await readFile(path.join(feature, '_qa/review-package.json'), 'utf8'));
  assert.equal(manifest.renames?.length, 3);
});

test('[v2.2-TC06-2] P0-4 r2 基于相邻快照生成 delta.diff 与 < 3 KB review-brief.md，且保留全量基线', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js'], coverage: '' });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\nexport const extra = 10;\n');
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r1']).status, 0);
  await writeDeep(path.join(feature, 'review/r1-standards.md'), '[S-H1] 缺少注释\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), '无发现\n');

  await writeFile(path.join(dir, 'src/app.js'), '// 中文说明\nexport const value = 2;\nexport const extra = 10;\n');
  const r2Collect = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2']);
  assert.equal(r2Collect.status, 0, r2Collect.stdout + r2Collect.stderr);

  const deltaDiff = await readFile(path.join(feature, '_qa/review-package-delta.diff'), 'utf8');
  const fullDiff = await readFile(path.join(feature, '_qa/review-package.diff'), 'utf8');
  const briefPath = path.join(feature, '_qa/review-brief.md');
  const briefText = await readFile(briefPath, 'utf8');
  const briefStat = await stat(briefPath);

  assert.match(deltaDiff, /\+\/\/ 中文说明/);
  assert.doesNotMatch(deltaDiff, /\+export const value = 2;/);
  assert.match(fullDiff, /\+export const value = 2;/);
  assert.ok(briefStat.size < 3072, `review-brief.md 超出 3KB：${briefStat.size}`);
  assert.doesNotMatch(briefText, /需必读 DESIGN\.md/);
});

test('[v2.2-TC07-1] P0-5 全历史编号登记器（含未 seal 原文）与 FINDING_ID_COLLISION 拦截', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js'], coverage: '' });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r1']).status, 0);
  await writeDeep(path.join(feature, 'review/r1-standards.md'), '[S-H1] 硬违规\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), '[P-M1] 缺项一\n[P-M4] 缺项四\n');
  await writeDeep(path.join(feature, 'review/r2-standards.md'), '[S-H1] 已修\n');
  // r2 Spec 原文未 seal，且包含 P-M5（失鲜）和 P-M6（截图问题）
  await writeDeep(path.join(feature, 'review/r2-spec-axis.md'), '[P-M1] 已修\n[P-M4] 已修\n[P-M5] 审查包失鲜\n[P-M6] 截图空白\n');

  const r3Collect = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r3', '--allow-manual-round']);
  assert.equal(r3Collect.status, 0, r3Collect.stdout + r3Collect.stderr);

  const challenge = JSON.parse(await readFile(path.join(feature, '_qa/review-challenge.json'), 'utf8'));
  assert.ok(challenge.reservedIds.includes('P-M5'));
  assert.ok(challenge.reservedIds.includes('P-M6'));
  assert.equal(challenge.nextIds['P-M'], 'P-M7');

  // 如果 r3 在非待复核情况下再次起新号 [P-M5] 描述另一个问题，seal 与 qa-check review 必报 FINDING_ID_COLLISION
  await writeDeep(path.join(feature, 'review/r3-spec-axis.md'), '[P-M5] 新增截图取景错误问题\n');
  const sealCollision = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature, '--round', 'r3', '--axis', 'spec',
    '--file', 'review/r3-spec-axis.md', '--reviewer-kind', 'subagent', '--host', 'Claude Code',
  ]);
  assert.equal(sealCollision.status, 1);
  assert.match(sealCollision.stderr, /FINDING_ID_COLLISION/);

  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Claude Code；双轴子代理',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| S-H1 | 本次修 | 已修 | r1 → r2 已修 | 静态：已改 | |',
    '| P-M1 | 本次修 | 已修 | r1 → r2 已修 | 静态：已改 | |',
    '| P-M4 | 本次修 | 已修 | r1 → r2 已修 | 静态：已改 | |',
    '| P-M5 | 本次修 | 未修 | r2 → r3 | | |',
    '',
  ].join('\n'));
  const checkReport = await checkFeature(feature, 'review');
  assert.ok(checkReport.issues.some((item) => item.code === 'FINDING_ID_COLLISION'), formatReport(checkReport));
});

test('[v2.2-TC07-2] P0-5 scaffold-report 自动从全部原文生成无漏项分流表与默认驳回骨架', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js'], coverage: '' });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r1']).status, 0);
  await writeDeep(path.join(feature, 'review/r1-standards.md'), '[S-H1] 硬违规\n[S-H2] 表单提交后未能维持原值\n[S-J1] 局部常量建议\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), '[P-M1] 缺项\n[P-W1] 错项\n');
  await writeDeep(path.join(feature, 'review/r2-spec-axis.md'), '[P-M5] 失鲜\n[P-M6] 截图缺项\n');

  const res = runCli(REVIEW_PACKAGE, dir, ['scaffold-report', feature, '--host', 'Claude Code', '--overwrite']);
  assert.equal(res.status, 0, res.stderr);
  const reportText = await readFile(path.join(feature, 'review-report.md'), 'utf8');
  assert.match(reportText, /^审查方式：宿主=Claude Code；/m);
  for (const id of ['S-H1', 'S-H2', 'P-M1', 'P-W1', 'P-M5', 'P-M6']) {
    assert.match(reportText, new RegExp(`\\| ${id} \\|`));
  }
  assert.match(reportText, /\| S-H2 \| 本次修 \| 未修 \| r1 \|/);
  for (const token of ['本次修', '转专项', '驳回', '已修', '未修', '修错', '改档成立', '改档不成立']) {
    assert.match(reportText, new RegExp(token), `缺少合法枚举提示 ${token}`);
  }
  assert.match(reportText, /## 默认驳回[\s\S]*S-J1/);
});

test('[v2.2-TC08-1] P0-6 collect 默认拒绝 r3+ 超上限轮次，显式 --allow-manual-round 才放行', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js'], coverage: '' });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  await writeDeep(path.join(feature, 'review/r1-standards.md'), '[S-H1] 问题\n');
  await writeDeep(path.join(feature, 'review/r2-standards.md'), '[S-H1] 未修\n');

  const blocked = runCli(REVIEW_PACKAGE, dir, ['collect', feature]);
  assert.equal(blocked.status, 1);
  assert.match(blocked.stderr, /WAITING_HUMAN/);
  assert.match(blocked.stderr, /--allow-manual-round/);

  const allowed = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--allow-manual-round']);
  assert.equal(allowed.status, 0, allowed.stdout + allowed.stderr);
  assert.equal(JSON.parse(await readFile(path.join(feature, '_qa/review-challenge.json'), 'utf8')).round, 'r3');
});

test('[v2.2-TC08-2] P0-6 r2 仍有未闭环项时 qa-check review 保持 BLOCKED 并输出 WAITING_HUMAN 与人工决策包', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: ['### TC01: 核心验证', '- Priority: P0', '- Covers: 1', '- Seam: unit', '#### 验证断言', '1. 返回值符合预期'],
  });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  const unitLog = runCli(QA_RUN, dir, [feature, 'unit-01', '--', process.execPath, '--test', 'tests/app.test.mjs']);
  assert.equal(unitLog.status, 0, unitLog.stderr);

  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: ['### TC01: 核心验证', '- Priority: P0', '- Covers: 1', '- Seam: unit', '#### 验证断言', '1. 返回值符合预期'],
    rows: ['| TC01 | 1 | PASS | `evidence/unit-01.log` | `tests/app.test.mjs` › 核心函数返回正确 | |'],
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2']).status, 0);

  await writeDeep(path.join(feature, 'review/r1-standards.md'), '[S-H1] 硬违规\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `tests/app.test.mjs:4` `assert.equal(1, 1)` | 不适用 |',
    '',
  ].join('\n'));
  await writeDeep(path.join(feature, 'review/r2-standards.md'), '[S-H1] 未修\n');
  await writeDeep(path.join(feature, 'review/r2-spec-axis.md'), [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `tests/app.test.mjs:4` `assert.equal(1, 1)` | 不适用 |',
    '',
  ].join('\n'));

  for (const [axis, file, extra] of [
    ['standards', 'review/r2-standards.md', ['--pending-ids', 'S-H1']],
    ['spec', 'review/r2-spec-axis.md', []],
  ]) {
    assert.equal(runCli(REVIEW_PACKAGE, dir, [
      'seal', feature, '--round', 'r2', '--axis', axis, '--file', file,
      '--reviewer-kind', 'external-session', '--host', 'Kimi Code', ...extra,
    ]).status, 0);
  }
  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Kimi Code；外部独立会话',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| S-H1 | 本次修 | 未修 | r1 → r2 未修 | | |',
    '',
  ].join('\n'));
  runCli(QA_RUN, dir, [feature, 'delivery', '--', 'node', '--version']);

  const report = await checkFeature(feature, 'review');
  const rendered = formatReport(report, 'review');
  assert.equal(report.status, 'BLOCKED');
  assert.match(rendered, /暂停终态:\s*WAITING_HUMAN/);
  assert.match(rendered, /人工决策包/);
  assert.match(rendered, /S-H1/);
  assert.match(rendered, /review-package\.mjs collect \.scratch\/feature --allow-manual-round/);

  // 验证 WAITING_INFRA 正式暂停终态真实可达
  await writeDeep(path.join(feature, '_qa/infra-pause.json'), JSON.stringify({ code: 'INFRA_UNAVAILABLE', reason: '子代理配额耗尽' }));
  const infraReport = await checkFeature(feature, 'review');
  assert.equal(infraReport.status, 'BLOCKED');
  assert.ok(infraReport.issues.some((item) => item.code === 'INFRA_UNAVAILABLE'));
  assert.match(formatReport(infraReport, 'review'), /暂停终态:\s*WAITING_INFRA/);
});

test('[v2.2-TC09-1] 来源诚实门禁：缺少双轴原文或有效 .source.json 时保持待独立审查不伪造 PASS', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, {
    scopePaths: ['src/app.js'],
    cases: ['### TC01: 核心验证', '- Priority: P0', '- Covers: 1', '- Seam: unit', '#### 验证断言', '1. 返回值符合预期'],
  });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'unit-01', '--', process.execPath, '--test', 'tests/app.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: ['### TC01: 核心验证', '- Priority: P0', '- Covers: 1', '- Seam: unit', '#### 验证断言', '1. 返回值符合预期'],
    rows: ['| TC01 | 1 | PASS | `evidence/unit-01.log` | `tests/app.test.mjs` › 核心函数返回正确 | |'],
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-01', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature]).status, 0);
  await writeFile(path.join(feature, 'review-report.md'), '审查方式：宿主=Claude Code；双轴子代理\n\n## 三档分流\n无发现\n');
  runCli(QA_RUN, dir, [feature, 'delivery', '--', 'node', '--version']);

  const report = await checkFeature(feature, 'review');
  assert.notEqual(report.status, 'PASS');
  assert.ok(report.issues.some((item) => item.code === 'REVIEW_RAW_MISSING'));
});

test('[v2.2-P2-TC09-1] OBS-1 collect 与 seal 写入可机读度量字段', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js'] });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'unit-obs', '--', process.execPath, '--test', 'tests/app.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: ['### TC01: 核心流程验证', '- Priority: P0', '- Covers: 1', '- Seam: unit', '', '#### 验证断言', '1. 核心函数返回值符合预期'],
    rows: ['| TC01 | 1 | PASS | `evidence/unit-obs.log` | `tests/app.test.mjs` › 核心函数返回正确 | |'],
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-obs', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature]).status, 0);

  const challengePath = path.join(feature, '_qa/review-challenge.json');
  const manifestPath = path.join(feature, '_qa/review-package.json');
  const challenge = JSON.parse(await readFile(challengePath, 'utf8'));
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(challenge.nonce, manifest.nonce);
  assert.equal(challenge.round, 'r1');
  assert.match(challenge.snapshotHash, /^[0-9a-f]{64}$/);
  assert.equal(challenge.snapshotHash, manifest.snapshotHash);
  assert.ok(!Number.isNaN(Date.parse(challenge.dispatchedAt)));
  assert.equal(manifest.diffBytes, (await readFile(path.join(feature, '_qa/review-package.diff'))).length);
  assert.deepEqual(manifest.reviewUnits, { total: 1, inherited: 0, verified: 0 });
  assert.equal(manifest.repairAndWaitMs, 0);

  await writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
    '无发现',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `tests/app.test.mjs:4` `assert.equal(1, 1)` | 不适用 |',
    '',
  ].join('\n'));
  for (const [axis, file] of [['standards', 'review/r1-standards.md'], ['spec', 'review/r1-spec-axis.md']]) {
    const sealed = runCli(REVIEW_PACKAGE, dir, [
      'seal', feature, '--round', 'r1', '--axis', axis, '--file', file,
      '--reviewer-kind', 'external-session', '--host', 'Kimi Code',
    ]);
    assert.equal(sealed.status, 0, sealed.stdout + sealed.stderr);
  }
  const receipt = JSON.parse(await readFile(path.join(feature, 'review/r1-spec-axis.source.json'), 'utf8'));
  assert.equal(receipt.nonce, challenge.nonce);
  assert.equal(receipt.round, 'r1');
  assert.equal(receipt.axis, 'spec');
  assert.equal(receipt.snapshotHash, challenge.snapshotHash);
  assert.equal(receipt.dispatchedAt, challenge.dispatchedAt);
  assert.ok(Date.parse(receipt.dispatchedAt) <= Date.parse(receipt.startedAt));
  assert.ok(Date.parse(receipt.startedAt) <= Date.parse(receipt.completedAt));
  assert.equal(receipt.terminalState, 'returned');
  assert.equal(receipt.errorClass, null);
  assert.equal(receipt.sealAttempts, 1);
  assert.ok(Number.isInteger(receipt.diffBytes) && receipt.diffBytes > 0);
  assert.deepEqual(receipt.reviewUnits, { total: 1, inherited: 0, verified: 1 });
  assert.ok(Number.isInteger(receipt.repairAndWaitMs) && receipt.repairAndWaitMs >= 0);

  const sealedChallenge = JSON.parse(await readFile(challengePath, 'utf8'));
  assert.equal(sealedChallenge.axes.spec.terminalState, 'returned');
  assert.equal(sealedChallenge.axes.spec.sealAttempts, 1);
  const sealedManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  assert.equal(sealedManifest.axes.spec.terminalState, 'returned');
  assert.equal(sealedManifest.reviewUnits.verified, 1);
});

test('[v2.2-P2-TC09-3] OBS-1 新字段不破坏旧审查包与模板兼容', async (t) => {
  const { dir, feature } = await setupFeatureRepo(t, { scopePaths: ['src/app.js'] });
  await writeFile(path.join(dir, 'src/app.js'), 'export const value = 2;\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'unit-old', '--', process.execPath, '--test', 'tests/app.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases: ['### TC01: 核心流程验证', '- Priority: P0', '- Covers: 1', '- Seam: unit', '', '#### 验证断言', '1. 核心函数返回值符合预期'],
    rows: ['| TC01 | 1 | PASS | `evidence/unit-old.log` | `tests/app.test.mjs` › 核心函数返回正确 | |'],
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-old', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature]).status, 0);
  await writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n');
  await writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
    '无发现', '', '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC01-1 | 已核实 | `tests/app.test.mjs:4` `assert.equal(1, 1)` | 不适用 |', '',
  ].join('\n'));
  for (const [axis, file] of [['standards', 'review/r1-standards.md'], ['spec', 'review/r1-spec-axis.md']]) {
    assert.equal(runCli(REVIEW_PACKAGE, dir, [
      'seal', feature, '--round', 'r1', '--axis', axis, '--file', file,
      '--reviewer-kind', 'external-session', '--host', 'Kimi Code',
    ]).status, 0);
  }

  const optionalFields = [
    'snapshotHash', 'dispatchedAt', 'startedAt', 'terminalState', 'errorClass',
    'sealAttempts', 'diffBytes', 'reviewUnits', 'repairAndWaitMs', 'axes',
  ];
  for (const axis of ['standards', 'spec-axis']) {
    const receiptPath = path.join(feature, `review/r1-${axis}.source.json`);
    const receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
    for (const field of optionalFields) delete receipt[field];
    await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }
  for (const relative of ['_qa/review-challenge.json', '_qa/review-package.json']) {
    const file = path.join(feature, relative);
    const value = JSON.parse(await readFile(file, 'utf8'));
    for (const field of [...optionalFields, 'nonce']) {
      if (relative.endsWith('review-package.json') || field !== 'nonce') delete value[field];
    }
    await writeFile(file, `${JSON.stringify(value, null, 2)}\n`);
  }
  await writeFile(path.join(feature, 'review-report.md'), '审查方式：宿主=Kimi Code；旧包兼容\n\n## 三档分流\n无发现\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'delivery', '--', 'node', '--version']).status, 0);
  const report = await checkFeature(feature, 'review');
  assert.equal(report.status, 'PASS', formatReport(report));

  for (const name of ['qa-run.mjs', 'qa-check.mjs', 'qa-spec-review.mjs', 'review-package.mjs', 'qa-preflight.mjs', 'qa-browser-helper.mjs']) {
    const [tool, template] = await Promise.all([
      readFile(path.join('tooling/scripts', name), 'utf8'),
      readFile(path.join('.claude/skills/setup-qa-workflow/templates', name), 'utf8'),
    ]);
    assert.equal(template, tool, `${name} 与模板不一致`);
  }
});
