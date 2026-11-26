import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkFeature, formatReport } from '../qa-check.mjs';

const SPEC = '## User Stories\n1. 第一条需求\n\n## 交付命令\n\n```bash\nnode --version\n```\n';
const DB_PACKAGE = { name: '@fixture/db', version: '0.0.0', dependencies: { '@prisma/client': '^6.0.0' } };

function codes(report) {
  return report.issues.map((item) => item.code);
}

function git(cwd, args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8' });
}

async function writeDeep(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function runLog(argv) {
  return [
    '# qa-run v1',
    '# label: tc01',
    `# command: ${argv.join(' ')}`,
    `# argv: ${JSON.stringify(argv)}`,
    '# cwd: .',
    '# head: 0123456789abcdef',
    '# tree: none',
    '# started: 2026-01-02T00:00:00.000Z',
    '# ---',
    '[TC01-1] PASS 实测：状态码 200',
    '# ---',
    '# finished: 2026-01-02T00:00:01.000Z',
    '# exit: 0',
    '',
  ].join('\n');
}

function planText({ status = 'PASS', changes = '- 无' } = {}) {
  const evidence = status === 'PASS' ? '`evidence/tc01.log`' : '尚未执行';
  return [
    'QA Schema: 4',
    'QA Mode: inline',
    '',
    '### TC01: 示例',
    '- Priority: P0',
    '- Covers: 1',
    '- Seam: api',
    '',
    '#### 验证断言',
    '1. 接口返回 200。',
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    `| TC01 | 1 | ${status} | ${evidence} | | |`,
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --version` | 待执行 |',
    '',
    '## 计划变更',
    changes,
  ].join('\n');
}

/**
 * 临时 Git 仓库：files 为仓库根下的文件（工作区配置与包），特性目录位于 .scratch/feature，
 * 过程脚本写入特性目录的 scripts/tc01.mjs；status 为 PASS 时附一份引用该脚本的 api 日志。
 */
async function scanRepo(t, { files = {}, script, status = 'PASS', changes } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-host-scan-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  for (const [relative, content] of Object.entries(files)) {
    await writeDeep(path.join(dir, relative), typeof content === 'string' ? content : `${JSON.stringify(content, null, 2)}\n`);
  }
  const feature = path.join(dir, '.scratch', 'feature');
  const scriptFile = path.join(feature, 'scripts', 'tc01.mjs');
  await writeDeep(path.join(feature, 'spec.md'), SPEC);
  await writeDeep(path.join(feature, 'qa-plan.md'), planText({ status, changes }));
  await writeDeep(scriptFile, typeof script === 'function' ? script({ dir, feature }) : script);
  if (status === 'PASS') await writeDeep(path.join(feature, 'evidence', 'tc01.log'), runLog(['node', scriptFile]));
  return { dir, feature };
}

const PNPM_WORKSPACE = "packages:\n  - 'packages/*'\n";
const DB_WORKSPACE = {
  'pnpm-workspace.yaml': PNPM_WORKSPACE,
  'packages/db/package.json': DB_PACKAGE,
  'packages/db/src/index.ts': "export { prisma } from './client';\n",
  'packages/db/prisma/schema.prisma': 'model User { id String @id }\n',
};

function bypassMessage(report) {
  return report.issues.find((item) => item.code === 'AUTH_BYPASS_IN_SCRIPT')?.message ?? '';
}

test('过程脚本以包名导入直接依赖驱动的工作区包时报 AUTH_BYPASS_IN_SCRIPT（TC04-1）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: "import { prisma } from '@fixture/db';\nconsole.log(prisma);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
  assert.match(bypassMessage(report), /@fixture\/db/);
});

test('以工作区数据存储包的子路径导入时报 AUTH_BYPASS_IN_SCRIPT（TC04-2）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: "import { prisma } from '@fixture/db/src/client';\nconsole.log(prisma);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('以相对路径导入工作区数据存储包目录下的文件时报 AUTH_BYPASS_IN_SCRIPT（TC04-3）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: "const db = await import('../../../packages/db/src/index.ts');\nconsole.log(db);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
  assert.match(bypassMessage(report), /@fixture\/db/);
});

test('以绝对路径导入工作区数据存储包目录下的文件时报 AUTH_BYPASS_IN_SCRIPT（TC04-4）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: ({ dir }) => `const db = await import('${path.join(dir, 'packages', 'db', 'src', 'index.ts')}');\nconsole.log(db);\n`,
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
  assert.match(bypassMessage(report), /@fixture\/db/);
});

test('计划变更写明人工豁免也不能消除工作区数据存储包的 AUTH_BYPASS_IN_SCRIPT（TC04-5）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: "import { prisma } from '@fixture/db';\nconsole.log(prisma);\n",
    changes: '- 已获人工豁免：脚本需要直接写库',
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.equal(report.status, 'FAIL', formatReport(report, 'acceptance'));
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('用文件读取函数读取工作区数据存储包目录下的文本时不报 AUTH_BYPASS_IN_SCRIPT（TC04-6）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: "import { readFileSync } from 'node:fs';\nconst schema = readFileSync('packages/db/prisma/schema.prisma', 'utf8');\nconsole.log(schema.includes('model User'));\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('导入不直接依赖数据库驱动的工作区包时不报 AUTH_BYPASS_IN_SCRIPT（TC04-7）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: {
      ...DB_WORKSPACE,
      'packages/queue/package.json': { name: '@fixture/queue', version: '0.0.0', dependencies: { bullmq: '^5.0.0' } },
    },
    script: "import { queue } from '@fixture/queue';\nconsole.log(queue);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('只在 devDependencies 中依赖驱动的工作区包不算数据存储包（TC04-8）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: {
      ...DB_WORKSPACE,
      'packages/shared/package.json': { name: '@fixture/shared', version: '0.0.0', devDependencies: { ioredis: '^5.0.0' } },
    },
    script: "import { types } from '@fixture/shared';\nconsole.log(types);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('执行记录没有 PASS 行时仍按工作区推导扫描过程脚本（TC04-9）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: DB_WORKSPACE,
    script: "import { prisma } from '@fixture/db';\nconsole.log(prisma);\n",
    status: 'BLOCKED',
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('没有工作区配置时导入同名包不报 AUTH_BYPASS_IN_SCRIPT，也不输出工作区提示（TC05-1）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: {
      'packages/db/package.json': DB_PACKAGE,
      'packages/db/src/index.ts': "export { prisma } from './client';\n",
    },
    script: "import { prisma } from '@fixture/db';\nconsole.log(prisma);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(!codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
  assert.ok(!report.notes.some((note) => note.includes('工作区')), formatReport(report, 'acceptance'));
});

test('根 package.json 的 workspaces 同样作为工作区来源（TC05-2）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: {
      'package.json': { name: 'fixture-root', private: true, workspaces: ['packages/*'] },
      'packages/db/package.json': DB_PACKAGE,
      'packages/db/src/index.ts': "export { prisma } from './client';\n",
    },
    script: "import { prisma } from '@fixture/db';\nconsole.log(prisma);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

test('根 package.json 无法解析时输出工作区推导未完全生效的 NOTE，检查不中断（TC05-3）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: { 'package.json': '{ "name": "broken", ' },
    script: "console.log('只做只读检查');\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  const workspaceNotes = report.notes.filter((note) => /工作区推导未完全生效/.test(note));
  assert.equal(workspaceNotes.length, 1, formatReport(report, 'acceptance'));
});

test('工作区配置无法解析时基础名单仍然生效（TC05-4）', async (t) => {
  const { feature } = await scanRepo(t, {
    files: { 'package.json': '{ "name": "broken", ' },
    script: "import { PrismaClient } from '@prisma/client';\nconsole.log(PrismaClient);\n",
  });
  const report = await checkFeature(feature, 'acceptance');
  assert.ok(codes(report).includes('AUTH_BYPASS_IN_SCRIPT'), formatReport(report, 'acceptance'));
});

// ---- 审查方式行的宿主声明与转录核验 ----

const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));
const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const TEST_FILE = 'tests/a.test.mjs';
const TEST_SOURCE = "import test from 'node:test';\ntest('传入过滤条件时两路均收到', () => {});\n";
const REVIEW_PLAN = [
  'QA Schema: 4',
  'QA Mode: inline',
  '',
  '### TC01: 示例',
  '- Priority: P0',
  '- Covers: 1',
  '- Seam: unit',
  '',
  '#### 验证断言',
  '1. 第一条断言',
  '',
  '## 执行记录',
  '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
  '| --- | --- | --- | --- | --- | --- |',
  `| TC01 | 1 | PASS | \`evidence/run.log\` | \`${TEST_FILE}\` › 传入过滤条件时两路均收到 | |`,
  '',
  '## 交付验证',
  '| 命令 | 证据 |',
  '| --- | --- |',
  '| `node --version` | `evidence/delivery.log` |',
  '',
  '## 计划变更',
  '- 无',
].join('\n');

function reportWith(method) {
  return [
    '# 审查报告',
    '',
    method,
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '',
    '无发现',
    '',
    '## 范围说明',
    '无范围外改动。',
  ].join('\n');
}

/** 完整走过 init、qa-run、acceptance、collect 并封存双轴的审查仓库；两轴原文均为「无发现」 */
async function reviewRepo(t, method, { receiptHost = 'Claude Code' } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-host-review-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'qa@example.internal']);
  git(dir, ['config', 'user.name', 'QA Test']);
  await writeDeep(path.join(dir, 'tracked.txt'), '原始内容\n');
  await writeDeep(path.join(dir, TEST_FILE), TEST_SOURCE);
  git(dir, ['add', 'tracked.txt', TEST_FILE]);
  git(dir, ['commit', '--quiet', '-m', '初始提交']);
  const feature = path.join(dir, '.scratch', 'feature');
  await writeDeep(path.join(feature, 'spec.md'), SPEC);
  await writeDeep(path.join(feature, 'qa-plan.md'), REVIEW_PLAN.replace('| PASS |', '| BLOCKED |'));
  const run = (args) => {
    const result = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  };
  run([REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt']);
  await writeFile(path.join(feature, 'qa-plan.md'), REVIEW_PLAN);
  run([QA_RUN, feature, 'run', '--', 'node', '--test', TEST_FILE]);
  run([QA_RUN, feature, 'delivery', '--', 'node', '--version']);
  spawnSync(process.execPath, [QA_CHECK, 'acceptance', feature], { cwd: dir, encoding: 'utf8' });
  run([REVIEW_PACKAGE, 'collect', feature]);
  await writeFile(path.join(feature, 'review-report.md'), reportWith(method));
  await writeDeep(path.join(feature, 'review', 'r1-standards.md'), '规范轴：无发现\n');
  await writeDeep(path.join(feature, 'review', 'r1-spec-axis.md'), '需求轴：无发现\n');
  run([REVIEW_PACKAGE, 'seal', feature, '--round', 'r1', '--axis', 'standards', '--file', 'review/r1-standards.md', '--reviewer-kind', 'subagent', '--host', receiptHost]);
  run([REVIEW_PACKAGE, 'seal', feature, '--round', 'r1', '--axis', 'spec', '--file', 'review/r1-spec-axis.md', '--reviewer-kind', 'subagent', '--host', receiptHost]);
  return { dir, feature };
}

/** 临时 CLAUDE_CONFIG_DIR，写入主会话与一份不含原文的子代理转录；测试结束恢复环境变量 */
async function claudeTranscripts(t, repoDir) {
  const configDir = await mkdtemp(path.join(tmpdir(), 'qa-host-config-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  t.after(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(configDir, { recursive: true, force: true });
  });
  const project = path.join(configDir, 'projects', (await realpath(repoDir)).replace(/[^A-Za-z0-9]/g, '-'));
  const model = 'claude-opus-5-5';
  const main = [
    { type: 'assistant', message: { model, content: [{ type: 'text', text: '主会话' }] } },
    {
      type: 'assistant',
      timestamp: new Date().toISOString(),
      message: { model, content: [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill: 'code-review', args: '阶段 6' } }] },
    },
  ];
  await writeDeep(path.join(project, 'session-1.jsonl'), `${main.map((line) => JSON.stringify(line)).join('\n')}\n`);
  const subagent = [
    { type: 'user', message: { content: '审查' } },
    { type: 'assistant', message: { model, content: [{ type: 'text', text: '别的会话里的内容' }] } },
  ];
  await writeDeep(path.join(project, 'session-1', 'subagents', 'agent-1.jsonl'), `${subagent.map((line) => JSON.stringify(line)).join('\n')}\n`);
}

function sourceNotes(report) {
  return report.notes.filter((note) => note.startsWith('来源核验'));
}

test('审查方式行与凭据 host 均非 Claude Code 时跳过转录扫描并记为自述凭据（弱）（TC02-1、TC02-2、TC02-3）', async (t) => {
  const { dir, feature } = await reviewRepo(t, '审查方式：宿主=Kimi Code；两轴独立子代理', { receiptHost: 'Kimi Code' });
  await claudeTranscripts(t, dir);
  const report = await checkFeature(feature, 'review');
  const notes = sourceNotes(report);
  assert.ok(notes.some((note) => note.includes('Kimi Code') && note.includes('跳过 Claude 转录扫描')), formatReport(report, 'review'));
  assert.ok(notes.some((note) => note.includes('自述凭据（弱）')), formatReport(report, 'review'));
  assert.equal(report.status, 'PASS', formatReport(report, 'review'));
});

test('审查方式行只在说明文字中提到其他宿主、没有宿主字段时沿用 Claude 转录扫描（TC02-4）', async (t) => {
  const { dir, feature } = await reviewRepo(t, '审查方式：两轴独立子代理（Kimi Code reviewer 类型）');
  await claudeTranscripts(t, dir);
  const report = await checkFeature(feature, 'review');
  assert.ok(report.notes.some((note) => note.includes('自述凭据（弱）')), formatReport(report, 'review'));
  assert.ok(!report.notes.some((note) => note.includes('跳过 Claude 转录扫描')), formatReport(report, 'review'));
});

test('审查方式行声明宿主为 Claude Code 时转录核验照常进行（TC02-5）', async (t) => {
  const { dir, feature } = await reviewRepo(t, '审查方式：宿主=Claude Code；两轴独立子代理');
  await claudeTranscripts(t, dir);
  const report = await checkFeature(feature, 'review');
  assert.ok(report.notes.some((note) => note.includes('自述凭据（弱）')), formatReport(report, 'review'));
  assert.ok(!report.notes.some((note) => note.includes('跳过 Claude 转录扫描')), formatReport(report, 'review'));
});

test('宿主声明为小写 claude code 时同样照常核验（TC02-6）', async (t) => {
  const { dir, feature } = await reviewRepo(t, '审查方式：宿主=claude code；两轴独立子代理');
  await claudeTranscripts(t, dir);
  const report = await checkFeature(feature, 'review');
  assert.ok(report.notes.some((note) => note.includes('自述凭据（弱）')), formatReport(report, 'review'));
  assert.ok(!report.notes.some((note) => note.includes('跳过 Claude 转录扫描')), formatReport(report, 'review'));
});

test('声明其他宿主不影响自查拦截（TC02-7）', async (t) => {
  const { feature } = await reviewRepo(t, '审查方式：宿主=Kimi Code；自查');
  const report = await checkFeature(feature, 'review');
  assert.ok(codes(report).includes('SELF_REVIEW'), formatReport(report, 'review'));
});

// ---- 个人级同名技能检测在任何宿主下保持原级别 ----

function skill(name, body) {
  return `---\nname: ${name}\ndescription: 示例\n---\n\n${body}\n`;
}

/** 个人级技能写入临时 CLAUDE_CONFIG_DIR；项目技能随首个提交进入临时仓库 */
async function shadowRepo(t, { personal, project }) {
  const configDir = await mkdtemp(path.join(tmpdir(), 'qa-host-personal-'));
  const previous = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  t.after(async () => {
    if (previous === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = previous;
    await rm(configDir, { recursive: true, force: true });
  });
  for (const [name, body] of Object.entries(personal)) {
    await writeDeep(path.join(configDir, 'skills', name, 'SKILL.md'), skill(name, body));
  }
  const files = Object.fromEntries(Object.entries(project).map(([name, body]) => [`.claude/skills/${name}/SKILL.md`, skill(name, body)]));
  const { feature } = await scanRepo(t, { files, script: "console.log('只读');\n", status: 'BLOCKED' });
  return feature;
}

test('流程技能被个人级同名技能遮蔽时仍为 BLOCKED，提示写明其他宿主同样检查（TC03-1）', async (t) => {
  const feature = await shadowRepo(t, { personal: { 'code-review': '个人版' }, project: { 'code-review': '项目版' } });
  const report = await checkFeature(feature, 'plan');
  assert.equal(report.status, 'BLOCKED', formatReport(report, 'plan'));
  const shadowed = report.issues.find((item) => item.code === 'SHADOWED_WORKFLOW_SKILL');
  assert.ok(shadowed, formatReport(report, 'plan'));
  assert.match(shadowed.hint, /在其他宿主运行时同样检查/);
});

test('非流程技能同名时只给 NOTE，NOTE 写明其他宿主同样检查（TC03-2）', async (t) => {
  const feature = await shadowRepo(t, { personal: { 'ego-browser': '个人版' }, project: { 'ego-browser': '项目版' } });
  const report = await checkFeature(feature, 'plan');
  assert.equal(report.status, 'PASS', formatReport(report, 'plan'));
  const note = report.notes.find((item) => item.includes('同名'));
  assert.match(note ?? '', /在其他宿主运行时同样检查/);
});
