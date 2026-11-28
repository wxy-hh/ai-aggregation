import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSpecReviewChecklist } from '../qa-spec-review.mjs';
import * as specCoverage from '../qa-check/spec-coverage.mjs';

const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));

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

function buildPlan({ cases, rows, coverage = '2', changes = '- 无' }) {
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    `QA Review Coverage: ${coverage}`,
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
    '| `node --version` | 待执行 |',
    '',
    '## 计划变更',
    changes,
    '',
  ].join('\n');
}

/** 构造模拟 eval-real-execution-honest-scoping 多模块结构的脱敏仓库，完成 r1 核实封存 */
async function setupEvalLikeRepo(t, { extraFiles = {}, extraCases = [], extraBlockedRows = [], extraScope = [] } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-step4-inherit-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);

  const baseFiles = {
    'package.json': JSON.stringify({ name: 'desensitized-eval-repo', private: true, workspaces: ['packages/*'] }, null, 2),
    'tsconfig.json': JSON.stringify({
      compilerOptions: {
        baseUrl: '.',
        paths: {
          '@shared/*': ['packages/shared/src/*'],
        },
      },
    }, null, 2),
    'packages/shared/package.json': JSON.stringify({ name: '@repo/shared', main: 'src/index.js' }, null, 2),
    'packages/shared/src/index.js': "export { formatFact } from './facts.js';\n",
    'packages/shared/src/facts.js': 'export function formatFact(name) { return `fact:${name}`; }\n',
    'src/math/add.js': 'export function add(a, b) { return a + b; }\n',
    'src/reports/barrel.js': "export { summarize } from './summarize.js';\n",
    'src/reports/summarize.js': 'export function summarize(n) { return `sum:${n}`; }\n',
    'src/runner/core.js': 'export function runCore() { return 1; }\n',
    'src/runner/unrelated.js': 'export function ping() { return "pong"; }\n',
    'tests/math.test.mjs': [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { add } from '../src/math/add.js';",
      "test('加法结果正确', () => {",
      '  assert.equal(add(1, 2), 3);',
      '});',
      '',
    ].join('\n'),
    'tests/report.test.mjs': [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { summarize } from '../src/reports/barrel.js';",
      "test('摘要输出正常', () => {",
      "  assert.equal(summarize(2), 'sum:2');",
      '});',
      '',
    ].join('\n'),
    'tests/runner.test.mjs': [
      "import test from 'node:test';",
      "import assert from 'node:assert/strict';",
      "import { runCore } from '../src/runner/core.js';",
      "test('运行器核心输出', () => {",
      '  assert.equal(runCore(), 1);',
      '});',
      '',
    ].join('\n'),
    ...extraFiles,
  };

  for (const [rel, content] of Object.entries(baseFiles)) {
    await writeDeep(path.join(dir, rel), content);
  }
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--quiet', '-m', '初始脱敏仓库基线']);

  const cases = [
    '### TC01: 纯单元数学逻辑',
    '- Priority: P0',
    '- Covers: 1',
    '- Seam: unit',
    '#### 验证断言',
    '1. 加法核心函数返回正确求和结果',
    '### TC02: 摘要报告经桶文件导出',
    '- Priority: P0',
    '- Covers: 1',
    '- Seam: unit',
    '#### 验证断言',
    '1. 摘要汇总文本格式符合预期',
    '### TC03: 运行器集成核心调用',
    '- Priority: P0',
    '- Covers: 1',
    '- Seam: integration',
    '#### 验证断言',
    '1. 运行器集成路径返回核心状态 1',
    ...extraCases,
  ];
  const blockedRows = [
    '| TC01 | 1 | BLOCKED | 尚未执行 | | |',
    '| TC02 | 1 | BLOCKED | 尚未执行 | | |',
    '| TC03 | 1 | BLOCKED | 尚未执行 | | |',
    ...extraBlockedRows,
  ];
  const scopePaths = [
    'src/math/add.js',
    'src/reports/barrel.js',
    'src/reports/summarize.js',
    'src/runner/core.js',
    'src/runner/unrelated.js',
    'packages/shared/src/index.js',
    'packages/shared/src/facts.js',
    'tests/math.test.mjs',
    'tests/report.test.mjs',
    'tests/runner.test.mjs',
    ...extraScope,
  ];

  const feature = path.join(dir, '.scratch', 'feature');
  await mkdir(feature, { recursive: true });
  await writeFile(path.join(feature, 'spec.md'), '## User Stories\n1. 多模块断言验证\n\n## 交付命令\n\n```bash\nnode --version\n```\n');
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows: blockedRows }));

  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-plan-01', '--', process.execPath, QA_CHECK, 'plan', feature]).status, 0);
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['init', feature, '--', ...scopePaths]).status, 0);

  // 触发各文件在首轮为新增/修改（确保 r1 均为 required 必审）
  await writeFile(path.join(dir, 'src/math/add.js'), 'export function add(a, b) { return a + b; }\n// r1\n');
  await writeFile(path.join(dir, 'src/reports/summarize.js'), 'export function summarize(n) { return `sum:${n}`; }\n// r1\n');
  await writeFile(path.join(dir, 'src/runner/core.js'), 'export function runCore() { return 1; }\n// r1\n');

  return { dir, feature, cases, scopePaths };
}

/** 运行测试套件、更新执行记录、执行 acceptance，并按需 collect + seal r1 */
function runAllAndAcceptance(dir, feature, cases, label, rows) {
  const testRun = runCli(QA_RUN, dir, [feature, label, '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs']);
  assert.equal(testRun.status, 0, testRun.stdout + testRun.stderr);
  return writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows })).then(() => {
    const gate = runCli(QA_RUN, dir, [feature, `gate-acceptance-${label}`, '--', process.execPath, QA_CHECK, 'acceptance', feature]);
    assert.equal(gate.status, 0, gate.stdout + gate.stderr);
    return parseSpecReviewChecklist(execFileSync('cat', [path.join(feature, '_qa/spec-review-checklist.json')], { encoding: 'utf8' }));
  });
}

function sealR1(dir, feature, extraRows = []) {
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r1']).status, 0);
  return Promise.all([
    writeDeep(path.join(feature, 'review/r1-standards.md'), '无发现\n'),
    writeDeep(path.join(feature, 'review/r1-spec-axis.md'), [
      '[P-M1] 示例未闭环项触发进入 r2',
      '',
      '## 对账覆盖',
      '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
      '| --- | --- | --- | --- |',
      '| TC01-1 | 已核实 | `tests/math.test.mjs:4` `assert.equal(add(1, 2), 3)` | 不适用 |',
      '| TC02-1 | 已核实 | `tests/report.test.mjs:4` `assert.equal(summarize(2), \'sum:2\')` | 不适用 |',
      '| TC03-1 | 已核实 | `tests/runner.test.mjs:4` `assert.equal(runCore(), 1)` | 不适用 |',
      ...extraRows,
      '',
    ].join('\n')),
  ]).then(() => {
    assert.equal(runCli(REVIEW_PACKAGE, dir, ['seal', feature, '--round', 'r1', '--axis', 'standards', '--file', 'review/r1-standards.md', '--reviewer-kind', 'subagent', '--host', 'Antigravity']).status, 0);
    assert.equal(runCli(REVIEW_PACKAGE, dir, ['seal', feature, '--round', 'r1', '--axis', 'spec', '--file', 'review/r1-spec-axis.md', '--reviewer-kind', 'subagent', '--host', 'Antigravity']).status, 0);
  });
}

test('S4-TC01-1 脱敏 r1-r3 快照回放：r3 修改实现沿用 r2 旧验收时 collect 稳定报 PACKAGE_INVALID', async (t) => {
  const { dir, feature, cases } = await setupEvalLikeRepo(t);
  const r1Rows = [
    '| TC01 | 1 | PASS | `evidence/suite-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/suite-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/suite-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
  ];
  await runAllAndAcceptance(dir, feature, cases, 'suite-r1', r1Rows);
  await sealR1(dir, feature);

  // 模拟 r3 只改了实现文件（未重新运行 suite-r3 与 acceptance-r3），直接 collect
  await writeFile(path.join(dir, 'src/runner/core.js'), 'export function runCore() { return 1; }\n// r3 未重新验收的变更\n');
  const collectR2 = runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2']);
  assert.notEqual(collectR2.status, 0);
  assert.match(collectR2.stderr + collectR2.stdout, /PACKAGE_INVALID/);
});

test('S4-TC02-1 低风险 unit 与 integration 在无关文件改动且换新日志标签后按静态闭包自动 inherited 并可跳过重填完成 seal', async (t) => {
  const { dir, feature, cases } = await setupEvalLikeRepo(t);
  const r1Rows = [
    '| TC01 | 1 | PASS | `evidence/suite-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/suite-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/suite-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
  ];
  await runAllAndAcceptance(dir, feature, cases, 'suite-r1', r1Rows);
  await sealR1(dir, feature);

  // r2：仅修改 runner 与无关文件，TC01/TC02 测试文件及静态导入闭包完全未变，且换新标签重跑整个测试集
  await writeFile(path.join(dir, 'src/runner/unrelated.js'), 'export function ping() { return "pong-r2"; }\n');
  await writeFile(path.join(dir, 'src/runner/core.js'), 'export function runCore() { return 1; }\n// r2 仅修改运行器核心\n');
  const r2Rows = [
    '| TC01 | 1 | PASS | `evidence/suite-r2.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/suite-r2.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/suite-r2.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
  ];
  const r2Checklist = await runAllAndAcceptance(dir, feature, cases, 'suite-r2', r2Rows);
  const u1 = r2Checklist.reviewUnits.find((u) => u.rowIds.includes('TC01-1'));
  const u2 = r2Checklist.reviewUnits.find((u) => u.rowIds.includes('TC02-1'));
  const u3 = r2Checklist.reviewUnits.find((u) => u.rowIds.includes('TC03-1'));
  assert.equal(u1?.verificationStatus, 'inherited', JSON.stringify(u1));
  assert.equal(u2?.verificationStatus, 'inherited', JSON.stringify(u2));
  assert.match(u1?.inheritedFrom ?? '', /^r1-spec@/);
  assert.equal(u3?.verificationStatus, 'required', '导入已改动 core.js 的单元必须失效回归 required');

  // r2 Spec 仅核对失效的 TC03-1，跳过继承的 TC01-1/TC02-1 应能顺利完成 seal
  assert.equal(runCli(REVIEW_PACKAGE, dir, ['collect', feature, '--round', 'r2']).status, 0);
  await writeDeep(path.join(feature, 'review/r2-spec-axis.md'), [
    '[P-M1] 已修',
    '',
    '## 对账覆盖',
    '| 审查项 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |',
    '| --- | --- | --- | --- |',
    '| TC03-1 | 已核实 | `tests/runner.test.mjs:4` `assert.equal(runCore(), 1)` | 不适用 |',
    '',
  ].join('\n'));
  const r2Seal = runCli(REVIEW_PACKAGE, dir, [
    'seal', feature, '--round', 'r2', '--axis', 'spec', '--file', 'review/r2-spec-axis.md',
    '--reviewer-kind', 'subagent', '--host', 'Antigravity', '--pending-ids', 'P-M1',
  ]);
  assert.equal(r2Seal.status, 0, r2Seal.stderr + r2Seal.stdout);
});

test('S4-TC03-1 只改实现未改测试变异盲测（M1直接导入 M2传递与桶导出 M3TS映射别名与工作区包）零误继承', async (t) => {
  assert.equal(typeof specCoverage.analyzeStaticImportClosure, 'function', 'spec-coverage 必须导出 analyzeStaticImportClosure');

  // 直接校验 tsconfig 路径别名与传递解析闭包
  const aliasDir = await mkdtemp(path.join(tmpdir(), 'qa-step4-alias-'));
  t.after(() => rm(aliasDir, { recursive: true, force: true }));
  await writeDeep(path.join(aliasDir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['packages/shared/src/*'] } },
  }));
  await writeDeep(path.join(aliasDir, 'packages/shared/src/facts.ts'), 'export const fact = 1;\n');
  await writeDeep(path.join(aliasDir, 'tests/alias.test.mjs'), "import { fact } from '@shared/facts';\nconsole.log(fact);\n");
  const beforeFactsClosure = await specCoverage.analyzeStaticImportClosure(aliasDir, ['tests/alias.test.mjs']);
  assert.equal(beforeFactsClosure.resolvable, true, JSON.stringify(beforeFactsClosure));
  assert.ok(beforeFactsClosure.closureFiles.includes('packages/shared/src/facts.ts'));
  await writeFile(path.join(aliasDir, 'packages/shared/src/facts.ts'), 'export const fact = 2;\n');
  const afterFactsClosure = await specCoverage.analyzeStaticImportClosure(aliasDir, ['tests/alias.test.mjs']);
  assert.notEqual(afterFactsClosure.closureHash, beforeFactsClosure.closureHash, '修改路径别名目标源码必须使 closureHash 失效');

  // 直接校验 TS .js -> .ts 后缀映射与 closureHash 变更
  const tsDir = await mkdtemp(path.join(tmpdir(), 'qa-step4-tsmap-'));
  t.after(() => rm(tsDir, { recursive: true, force: true }));
  await writeDeep(path.join(tsDir, 'src/alias/calc.ts'), 'export function double(n: number): number { return n * 2; }\n');
  await writeDeep(path.join(tsDir, 'tests/ts-map.test.mjs'), "import { double } from '../src/alias/calc.js';\nconsole.log(double(2));\n");
  const beforeTsClosure = await specCoverage.analyzeStaticImportClosure(tsDir, ['tests/ts-map.test.mjs']);
  assert.equal(beforeTsClosure.resolvable, true, JSON.stringify(beforeTsClosure));
  assert.ok(beforeTsClosure.closureFiles.includes('src/alias/calc.ts'));
  assert.match(beforeTsClosure.closureHash ?? '', /^[a-f0-9]{64}$/);
  await writeFile(path.join(tsDir, 'src/alias/calc.ts'), 'export function double(n: number): number { return n * 2 + 0; }\n');
  const afterTsClosure = await specCoverage.analyzeStaticImportClosure(tsDir, ['tests/ts-map.test.mjs']);
  assert.notEqual(afterTsClosure.closureHash, beforeTsClosure.closureHash, '修改 TS 映射目标源码必须使 closureHash 失效');

  // 直接校验工作区包字符串形式的 package.json exports（P-W4）
  const wsExpDir = await mkdtemp(path.join(tmpdir(), 'qa-step4-wsexp-'));
  t.after(() => rm(wsExpDir, { recursive: true, force: true }));
  await writeDeep(path.join(wsExpDir, 'package.json'), JSON.stringify({ name: 'ws-str-exports', private: true, workspaces: ['packages/*'] }));
  await writeDeep(path.join(wsExpDir, 'packages/str-exp/package.json'), JSON.stringify({ name: '@repo/str-exp', exports: './lib/custom-entry.ts' }));
  await writeDeep(path.join(wsExpDir, 'packages/str-exp/lib/custom-entry.ts'), 'export const entryValue = 1;\n');
  await writeDeep(path.join(wsExpDir, 'tests/str-exp.test.mjs'), "import { entryValue } from '@repo/str-exp';\nconsole.log(entryValue);\n");
  const beforeWsExpClosure = await specCoverage.analyzeStaticImportClosure(wsExpDir, ['tests/str-exp.test.mjs']);
  assert.equal(beforeWsExpClosure.resolvable, true, JSON.stringify(beforeWsExpClosure));
  assert.ok(beforeWsExpClosure.closureFiles.includes('packages/str-exp/lib/custom-entry.ts'));
  assert.match(beforeWsExpClosure.closureHash ?? '', /^[a-f0-9]{64}$/);
  await writeFile(path.join(wsExpDir, 'packages/str-exp/lib/custom-entry.ts'), 'export const entryValue = 2;\n');
  const afterWsExpClosure = await specCoverage.analyzeStaticImportClosure(wsExpDir, ['tests/str-exp.test.mjs']);
  assert.notEqual(afterWsExpClosure.closureHash, beforeWsExpClosure.closureHash, '修改字符串 exports 入口源码必须使 closureHash 失效');

  const { dir: d2, feature: f2, cases: c2 } = await setupEvalLikeRepo(t, {
    extraFiles: {
      'src/alias/calc.ts': 'export function double(n) { return n * 2; }\n',
      'ts-js-loader.mjs': [
        "import { register } from 'node:module';",
        'const loaderSource = `',
        "import { access } from 'node:fs/promises';",
        "import { fileURLToPath, pathToFileURL } from 'node:url';",
        'export async function resolve(specifier, context, nextResolve) {',
        "  if (specifier.endsWith('.js') && context.parentURL?.startsWith('file:')) {",
        '    const tsUrl = new URL(specifier.replace(/\\\\.js$/, ".ts"), context.parentURL);',
        '    try { await access(fileURLToPath(tsUrl)); return nextResolve(tsUrl.href, context); } catch {}',
        '  }',
        '  return nextResolve(specifier, context);',
        '}',
        '`;',
        "register(`data:text/javascript;base64,${Buffer.from(loaderSource).toString('base64')}`, pathToFileURL('./'));",
        '',
      ].join('\n'),
      'tests/ws.test.mjs': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { formatFact } from '@repo/shared';",
        "test('工作区包导出用例', () => {",
        "  assert.equal(formatFact('x'), 'fact:x');",
        '});',
        '',
      ].join('\n'),
      'tests/ts-map.test.mjs': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { double } from '../src/alias/calc.js';",
        "test('TS 映射用例', () => {",
        '  assert.equal(double(2), 4);',
        '});',
        '',
      ].join('\n'),
    },
    extraCases: [
      '### TC04: 工作区包导出导入',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '#### 验证断言',
      '1. 工作区包导入结果正确',
      '### TC05: TS 路径后缀映射导入',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '#### 验证断言',
      '1. TS 后缀映射导入结果正确',
    ],
    extraBlockedRows: [
      '| TC04 | 1 | BLOCKED | 尚未执行 | | |',
      '| TC05 | 1 | BLOCKED | 尚未执行 | | |',
    ],
    extraScope: ['src/alias/calc.ts', 'ts-js-loader.mjs', 'tests/ws.test.mjs', 'tests/ts-map.test.mjs'],
  });

  const rowsInit = [
    '| TC01 | 1 | PASS | `evidence/mut-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/mut-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/mut-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
    '| TC04 | 1 | PASS | `evidence/mut-r1.log` | `tests/ws.test.mjs` › 工作区包导出用例 | |',
    '| TC05 | 1 | PASS | `evidence/mut-r1.log` | `tests/ts-map.test.mjs` › TS 映射用例 | |',
  ];
  const mutR1Run = runCli(QA_RUN, d2, [
    f2, 'mut-r1', '--', process.execPath, '--import', './ts-js-loader.mjs', '--test',
    'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/ws.test.mjs', 'tests/ts-map.test.mjs',
  ]);
  assert.equal(mutR1Run.status, 0, mutR1Run.stderr + mutR1Run.stdout);
  await writeFile(path.join(f2, 'qa-plan.md'), buildPlan({ cases: c2, rows: rowsInit }));
  assert.equal(runCli(QA_RUN, d2, [f2, 'gate-acceptance-r1', '--', process.execPath, QA_CHECK, 'acceptance', f2]).status, 0);

  const r1Checklist = parseSpecReviewChecklist(await readFile(path.join(f2, '_qa/spec-review-checklist.json'), 'utf8'));
  for (const id of ['TC01-1', 'TC02-1', 'TC03-1', 'TC04-1', 'TC05-1']) {
    const unit = r1Checklist.reviewUnits.find((u) => u.rowIds.includes(id));
    assert.match(unit?.closureHash ?? '', /^[a-f0-9]{64}$/, `r1 ${id} 必须记录非空 closureHash: ${JSON.stringify(unit)}`);
  }

  await sealR1(d2, f2, [
    '| TC04-1 | 已核实 | `tests/ws.test.mjs:5` `assert.equal(formatFact(\'x\'), \'fact:x\')` | 不适用 |',
    '| TC05-1 | 已核实 | `tests/ts-map.test.mjs:5` `assert.equal(double(2), 4)` | 不适用 |',
  ]);

  // 变异 M1(直接导入 add.js)、M2(传递导入 summarize.js)、M3(工作区包底层 facts.js 与独立 TS 映射目标 calc.ts)：全部测试文件一行未改！
  await writeFile(path.join(d2, 'src/math/add.js'), 'export function add(a, b) { return a + b + 0; }\n// M1 变异\n');
  await writeFile(path.join(d2, 'src/reports/summarize.js'), 'export function summarize(n) { return `sum:${Number(n)}`; }\n// M2 传递变异\n');
  await writeFile(path.join(d2, 'packages/shared/src/facts.js'), 'export function formatFact(name) { return `fact:${String(name)}`; }\n// M3 工作区底层变异\n');
  await writeFile(path.join(d2, 'src/alias/calc.ts'), 'export function double(n) { return n * 2 + 0; }\n// M3 TS 映射独立变异\n');

  const mutR2Run = runCli(QA_RUN, d2, [
    f2, 'mut-r2', '--', process.execPath, '--import', './ts-js-loader.mjs', '--test',
    'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/ws.test.mjs', 'tests/ts-map.test.mjs',
  ]);
  assert.equal(mutR2Run.status, 0, mutR2Run.stderr + mutR2Run.stdout);
  const rowsMut = rowsInit.map((line) => line.replace('evidence/mut-r1.log', 'evidence/mut-r2.log'));
  await writeFile(path.join(f2, 'qa-plan.md'), buildPlan({ cases: c2, rows: rowsMut }));
  assert.equal(runCli(QA_RUN, d2, [f2, 'gate-acceptance-r2', '--', process.execPath, QA_CHECK, 'acceptance', f2]).status, 0);
  const checklistMut = parseSpecReviewChecklist(await readFile(path.join(f2, '_qa/spec-review-checklist.json'), 'utf8'));

  for (const id of ['TC01-1', 'TC02-1', 'TC04-1', 'TC05-1']) {
    const unit = checklistMut.reviewUnits.find((u) => u.rowIds.includes(id));
    assert.equal(unit?.verificationStatus, 'required', `${id} 只改实现未改测试发生变异，绝不允许误继承: ${JSON.stringify(unit)}`);
  }
  assert.equal(checklistMut.reviewUnits.find((u) => u.rowIds.includes('TC03-1'))?.verificationStatus, 'inherited', '未发生任何导入变更的 TC03-1 应可安全继承');
});

test('S4-TC03-2 永不降级红线变异盲测（M4闭包含高风险实现 M10changed browser/api 非PASS 不重跑）零误继承', async (t) => {
  const { dir, feature, cases } = await setupEvalLikeRepo(t, {
    extraFiles: {
      'src/auth/guard.js': 'export function canAccess(ok) { return Boolean(ok); }\n',
      'tests/neutral-helper.test.mjs': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { canAccess } from '../src/auth/guard.js';",
        "test('中性名称测试依赖鉴权实现', () => {",
        '  assert.equal(canAccess(true), true);',
        '});',
        '',
      ].join('\n'),
    },
    extraCases: [
      '### TC04: 中性文件名依赖安全守卫模块',
      '- Priority: P1',
      '- Covers: 1',
      '- Seam: unit',
      '#### 验证断言',
      '1. 访问守卫返回布尔结果',
    ],
    extraBlockedRows: ['| TC04 | 1 | BLOCKED | 尚未执行 | | |'],
    extraScope: ['src/auth/guard.js', 'tests/neutral-helper.test.mjs'],
  });

  const rowsR1 = [
    '| TC01 | 1 | PASS | `evidence/hr-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/hr-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/hr-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
    '| TC04 | 1 | PASS | `evidence/hr-r1.log` | `tests/neutral-helper.test.mjs` › 中性名称测试依赖鉴权实现 | |',
  ];
  assert.equal(runCli(QA_RUN, dir, [feature, 'hr-r1', '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/neutral-helper.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows: rowsR1 }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-r1', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  await sealR1(dir, feature, ['| TC04-1 | 已核实 | `tests/neutral-helper.test.mjs:5` `assert.equal(canAccess(true), true)` | 不适用 |']);

  // r2：仅修改无关文件并重跑新标签日志；TC04-1 虽然本身测试和闭包都未变，但闭包命中 src/auth/guard.js，必须永不降级，保持 required
  await writeFile(path.join(dir, 'src/runner/unrelated.js'), 'export function ping() { return "pong-r2"; }\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'hr-r2', '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/neutral-helper.test.mjs']).status, 0);

  // M10a: TC01 changed=true；M10b: TC02 标「不重跑」备注（保留 r1 日志模拟跳过重跑）；M4: TC04 闭包含 auth
  const casesChanged = cases.map((line) => (line === '1. 加法核心函数返回正确求和结果' ? '1. 加法核心函数严格返回整型求和' : line));
  const rowsR2 = [
    '| TC01 | 1 | PASS | `evidence/hr-r2.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/hr-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | 不重跑：模拟非行为变更跳过 |',
    '| TC03 | 1 | PASS | `evidence/hr-r2.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
    '| TC04 | 1 | PASS | `evidence/hr-r2.log` | `tests/neutral-helper.test.mjs` › 中性名称测试依赖鉴权实现 | |',
  ];
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases: casesChanged, rows: rowsR2, changes: '- TC01 调整断言表述' }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-r2', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));

  assert.equal(checklist.reviewUnits.find((u) => u.rowIds.includes('TC01-1'))?.verificationStatus, 'required');
  assert.equal(checklist.reviewUnits.find((u) => u.rowIds.includes('TC02-1'))?.verificationStatus, 'required');
  assert.equal(checklist.reviewUnits.find((u) => u.rowIds.includes('TC04-1'))?.verificationStatus, 'required');
  assert.equal(checklist.reviewUnits.find((u) => u.rowIds.includes('TC03-1'))?.verificationStatus, 'inherited');
});

test('S4-TC03-3 不可静态排除失效条件变异盲测（M5环境变量 M6动态import与非静态require M7运行时注入 M8外部文件与子进程 M9无法解析别名）强制 fail-closed 零误继承', async (t) => {
  assert.equal(typeof specCoverage.analyzeStaticImportClosure, 'function', 'spec-coverage 必须导出 analyzeStaticImportClosure');

  const invalidCases = [
    ['M5_env', { 'src/dyn/env.js': 'export const mode = () => process.env.QA_MODE;\n', 'tests/dyn.test.mjs': "import { mode } from '../src/dyn/env.js';\nmode();\n" }],
    ['M5_tmpl_env', { 'src/dyn/tmpl-env.js': 'export const host = () => `https://${process.env.API_HOST}/v1`;\n', 'tests/dyn.test.mjs': "import { host } from '../src/dyn/tmpl-env.js';\nhost();\n" }],
    ['M6_dyn_import', { 'src/dyn/imp.js': 'export const load = (p) => import(p);\n', 'tests/dyn.test.mjs': "import { load } from '../src/dyn/imp.js';\nload('./x');\n" }],
    ['M6_tmpl_dyn_import', { 'src/dyn/tmpl-imp.js': 'export const load = async (m) => `val:${await import(m)}`;\n', 'tests/dyn.test.mjs': "import { load } from '../src/dyn/tmpl-imp.js';\nload('./x');\n" }],
    ['M6_dyn_require', { 'src/dyn/req.js': 'export const load = (p) => require(p);\n', 'tests/dyn.test.mjs': "import { load } from '../src/dyn/req.js';\nload('./x');\n" }],
    ['M6_tmpl_dyn_require', { 'src/dyn/tmpl-req.js': 'export const load = (m) => `val:${require(m)}`;\n', 'tests/dyn.test.mjs': "import { load } from '../src/dyn/tmpl-req.js';\nload('./x');\n" }],
    ['M7_runtime_stub', { 'src/dyn/stub.js': "export const read = () => globalThis['__RUNTIME__'];\n", 'tests/dyn.test.mjs': "import { read } from '../src/dyn/stub.js';\nread();\n" }],
    ['M7_tmpl_global', { 'src/dyn/tmpl-global.js': "export const read = () => `flag:${globalThis['__FLAG__']}`;\n", 'tests/dyn.test.mjs': "import { read } from '../src/dyn/tmpl-global.js';\nread();\n" }],
    ['M8_fs_or_exec', { 'src/dyn/io.js': "import { readFileSync } from 'node:fs';\nexport const cfg = () => readFileSync('cfg.json', 'utf8');\n", 'tests/dyn.test.mjs': "import { cfg } from '../src/dyn/io.js';\ncfg();\n" }],
    ['M8_tmpl_fs', { 'src/dyn/tmpl-fs.js': "import { readFileSync } from 'node:fs';\nexport const cfg = () => `cfg:${readFileSync('cfg.json', 'utf8')}`;\n", 'tests/dyn.test.mjs': "import { cfg } from '../src/dyn/tmpl-fs.js';\ncfg();\n" }],
    ['M9_unresolved_alias', { 'tests/dyn.test.mjs': "import { x } from '@unknown/missing-module';\nx();\n" }],
  ];

  for (const [label, files] of invalidCases) {
    const dir = await mkdtemp(path.join(tmpdir(), `qa-failclosed-${label}-`));
    t.after(() => rm(dir, { recursive: true, force: true }));
    for (const [rel, content] of Object.entries(files)) {
      await writeDeep(path.join(dir, rel), content);
    }
    const res = await specCoverage.analyzeStaticImportClosure(dir, ['tests/dyn.test.mjs']);
    assert.equal(res.resolvable, false, `${label} 必须 fail-closed 返回 resolvable=false`);
    assert.equal(res.closureHash, null, `${label} 必须置空 closureHash`);
    assert.ok(Array.isArray(res.invalidationReasons) && res.invalidationReasons.length > 0, `${label} 必须记录失效原因`);
  }

  // 正对照：普通字符串与模板字面量正文中的 process.env 字样不能误报
  const safeLiteralDir = await mkdtemp(path.join(tmpdir(), 'qa-safe-literal-'));
  t.after(() => rm(safeLiteralDir, { recursive: true, force: true }));
  await writeDeep(
    path.join(safeLiteralDir, 'src/dyn/literal-safe.js'),
    "export const doc = () => 'process.env.FAKE';\nexport const tmpl = () => `literal: process.env.FAKE and ${1 + 1}`;\n",
  );
  await writeDeep(path.join(safeLiteralDir, 'tests/safe.test.mjs'), "import { doc, tmpl } from '../src/dyn/literal-safe.js';\ndoc(); tmpl();\n");
  const safeRes = await specCoverage.analyzeStaticImportClosure(safeLiteralDir, ['tests/safe.test.mjs']);
  assert.equal(safeRes.resolvable, true, JSON.stringify(safeRes));
  assert.equal(safeRes.invalidationReasons.length, 0);

  // 端到端检验：含 process.env 模板插值读取的单元测试在日志换名后绝不可走轨道 B 继承
  const { dir, feature, cases } = await setupEvalLikeRepo(t, {
    extraFiles: {
      'src/env-flag.js': "export function apiEndpoint() { return `https://${process.env.API_HOST ?? 'localhost'}/v1`; }\n",
      'tests/env-flag.test.mjs': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { apiEndpoint } from '../src/env-flag.js';",
        "test('环境变量开关测试', () => {",
        "  assert.equal(typeof apiEndpoint(), 'string');",
        '});',
        '',
      ].join('\n'),
    },
    extraCases: [
      '### TC04: 环境变量开关单元测试',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '#### 验证断言',
      '1. 返回字符串端点',
    ],
    extraBlockedRows: ['| TC04 | 1 | BLOCKED | 尚未执行 | | |'],
    extraScope: ['src/env-flag.js', 'tests/env-flag.test.mjs'],
  });
  const rowsR1 = [
    '| TC01 | 1 | PASS | `evidence/fc-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/fc-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/fc-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
    '| TC04 | 1 | PASS | `evidence/fc-r1.log` | `tests/env-flag.test.mjs` › 环境变量开关测试 | |',
  ];
  assert.equal(runCli(QA_RUN, dir, [feature, 'fc-r1', '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/env-flag.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows: rowsR1 }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-r1', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  await sealR1(dir, feature, ['| TC04-1 | 已核实 | `tests/env-flag.test.mjs:5` `assert.equal(typeof apiEndpoint(), \'string\')` | 不适用 |']);

  await writeFile(path.join(dir, 'src/runner/unrelated.js'), 'export function ping() { return "pong-fc"; }\n');
  assert.equal(runCli(QA_RUN, dir, [feature, 'fc-r2', '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/env-flag.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({
    cases,
    rows: rowsR1.map((line) => line.replace('evidence/fc-r1.log', 'evidence/fc-r2.log')),
  }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-r2', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  const tc04Unit = checklist.reviewUnits.find((u) => u.rowIds.includes('TC04-1'));
  assert.equal(tc04Unit?.verificationStatus, 'required');
  assert.equal(tc04Unit?.closureHash, null);
  assert.ok((tc04Unit?.closureInvalidationReasons?.length ?? 0) > 0);

  // S-H2 / P-W2 回归检验：未改动且不在范围变更中的 P0 用例若闭包不可静态排除（含环境变量或未解析模块），绝不可降级为 sampled
  const { dir: dReg, feature: fReg, cases: cReg } = await setupEvalLikeRepo(t, {
    extraFiles: {
      'src/untouched/tmpl-env.js': "export function hostUrl() { return `https://${process.env.UNTOUCHED_HOST ?? 'x'}/api`; }\n",
      'tests/untouched-env.test.mjs': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { hostUrl } from '../src/untouched/tmpl-env.js';",
        "test('未改动含动态闭包用例', () => {",
        "  assert.equal(typeof hostUrl(), 'string');",
        '});',
        '',
      ].join('\n'),
    },
    extraCases: [
      '### TC04: 未改动含环境变量动态闭包的回归用例',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '#### 验证断言',
      '1. 返回 URL 字符串',
    ],
    extraBlockedRows: ['| TC04 | 1 | BLOCKED | 尚未执行 | | |'],
    extraScope: [],
  });
  const regRows = [
    '| TC01 | 1 | PASS | `evidence/reg-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/reg-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/reg-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
    '| TC04 | 1 | PASS | `evidence/reg-r1.log` | `tests/untouched-env.test.mjs` › 未改动含动态闭包用例 | |',
  ];
  assert.equal(runCli(QA_RUN, dReg, [fReg, 'reg-r1', '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/untouched-env.test.mjs']).status, 0);
  await writeFile(path.join(fReg, 'qa-plan.md'), buildPlan({ cases: cReg, rows: regRows }));
  assert.equal(runCli(QA_RUN, dReg, [fReg, 'gate-acceptance-reg', '--', process.execPath, QA_CHECK, 'acceptance', fReg]).status, 0);
  const regChecklist = parseSpecReviewChecklist(await readFile(path.join(fReg, '_qa/spec-review-checklist.json'), 'utf8'));
  const regUnit = regChecklist.reviewUnits.find((u) => u.rowIds.includes('TC04-1'));
  assert.equal(regUnit?.verificationStatus, 'required', `不可静态排除的未改动回归用例禁止降级为 sampled: ${JSON.stringify(regUnit)}`);
  assert.equal(regUnit?.closureHash, null);
  assert.ok((regUnit?.closureInvalidationReasons?.length ?? 0) > 0);
});

test('S4-TC03-4 轨道 A 兼容验证：三哈希未变时既有精确继承保持有效', async (t) => {
  const { dir, feature, cases } = await setupEvalLikeRepo(t, {
    extraFiles: {
      'src/dyn/env.js': 'export const readFlag = () => process.env.QA_KEEP;\n',
      'tests/env-track-a.test.mjs': [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "import { readFlag } from '../src/dyn/env.js';",
        "test('精确三哈希兼容用例', () => {",
        '  assert.equal(typeof readFlag, "function");',
        '});',
        '',
      ].join('\n'),
    },
    extraCases: [
      '### TC04: 轨道 A 精确三哈希继承兼容',
      '- Priority: P0',
      '- Covers: 1',
      '- Seam: unit',
      '#### 验证断言',
      '1. 函数导出存在',
    ],
    extraBlockedRows: ['| TC04 | 1 | BLOCKED | 尚未执行 | | |'],
    extraScope: ['src/dyn/env.js', 'tests/env-track-a.test.mjs'],
  });
  const rows = [
    '| TC01 | 1 | PASS | `evidence/a-r1.log` | `tests/math.test.mjs` › 加法结果正确 | |',
    '| TC02 | 1 | PASS | `evidence/a-r1.log` | `tests/report.test.mjs` › 摘要输出正常 | |',
    '| TC03 | 1 | PASS | `evidence/a-r1.log` | `tests/runner.test.mjs` › 运行器核心输出 | |',
    '| TC04 | 1 | PASS | `evidence/a-r1.log` | `tests/env-track-a.test.mjs` › 精确三哈希兼容用例 | |',
  ];
  assert.equal(runCli(QA_RUN, dir, [feature, 'a-r1', '--', process.execPath, '--test', 'tests/math.test.mjs', 'tests/report.test.mjs', 'tests/runner.test.mjs', 'tests/env-track-a.test.mjs']).status, 0);
  await writeFile(path.join(feature, 'qa-plan.md'), buildPlan({ cases, rows }));
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-r1', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  await sealR1(dir, feature, ['| TC04-1 | 已核实 | `tests/env-track-a.test.mjs:5` `assert.equal(typeof readFlag, "function")` | 不适用 |']);

  // 完全未改代码、同一证据日志重跑 acceptance：轨道 A 精确三哈希仍应继承
  assert.equal(runCli(QA_RUN, dir, [feature, 'gate-acceptance-r2', '--', process.execPath, QA_CHECK, 'acceptance', feature]).status, 0);
  const checklist = parseSpecReviewChecklist(await readFile(path.join(feature, '_qa/spec-review-checklist.json'), 'utf8'));
  assert.equal(checklist.reviewUnits.find((u) => u.rowIds.includes('TC04-1'))?.verificationStatus, 'inherited');
});
