import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import * as qaCheck from '../qa-check.mjs';

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const QA_RUN = fileURLToPath(new URL('../qa-run.mjs', import.meta.url));
const QA_CHECK = fileURLToPath(new URL('../qa-check.mjs', import.meta.url));
const REVIEW_PACKAGE = fileURLToPath(new URL('../review-package.mjs', import.meta.url));

const SIX_SUBMODULES = [
  'plan.mjs',
  'script-scan.mjs',
  'provenance.mjs',
  'spec-coverage.mjs',
  'acceptance.mjs',
  'review-triage.mjs',
];

function runGit(cwd, args) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

async function writeDeep(file, content) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

function collectRelativeImports(source) {
  return [...source.matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
}

async function listFilesRecursive(rootDir, baseDir = rootDir) {
  const entries = await readdir(rootDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFilesRecursive(abs, baseDir));
    } else if (entry.isFile()) {
      files.push(path.relative(baseDir, abs).split(path.sep).join('/'));
    }
  }
  return files;
}

/** 构造已走完 init → acceptance → collect → writeReview 的最小可复现特性仓库 */
async function createCollectedReviewRepo(t) {
  const dir = await mkdtemp(path.join(tmpdir(), 'qa-opt14-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  runGit(dir, ['init', '--quiet']);
  runGit(dir, ['config', 'user.email', 'qa@example.internal']);
  runGit(dir, ['config', 'user.name', 'QA Test']);
  await writeDeep(path.join(dir, 'tracked.txt'), '初始内容\n');
  await writeDeep(
    path.join(dir, 'tests/sample.test.mjs'),
    "import test from 'node:test';\ntest('样例断言通过', () => {});\n",
  );
  runGit(dir, ['add', 'tracked.txt', 'tests/sample.test.mjs']);
  runGit(dir, ['commit', '--quiet', '-m', '初始提交']);

  const feature = path.join(dir, '.scratch', 'opt14-feature');
  await writeDeep(path.join(feature, 'spec.md'), [
    '# 示例规格',
    '',
    '## User Stories',
    '1. 核心行为测试',
    '',
    '## 交付命令',
    '```bash',
    'node --test tests/sample.test.mjs',
    '```',
  ].join('\n'));
  const planBody = [
    'QA Schema: 4',
    'QA Mode: inline',
    'QA Kind: feature',
    '',
    '### TC01: 样例验证',
    '- Priority: P1',
    '- Covers: 1',
    '- Seam: unit',
    '',
    '#### 验证断言',
    '1. 样例测试正常通过',
    '',
    '## 执行记录',
    '| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| TC01 | 1 | PASS | `evidence/run.log` | `tests/sample.test.mjs` › 样例断言通过 | |',
    '',
    '## 交付验证',
    '| 命令 | 证据 |',
    '| --- | --- |',
    '| `node --test tests/sample.test.mjs` | `evidence/run.log` |',
    '',
    '## 计划变更',
    '- 无',
  ].join('\n');
  await writeDeep(path.join(feature, 'qa-plan.md'), planBody.replace('| PASS |', '| BLOCKED |'));

  const runNode = (args) => {
    const res = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr || res.stdout);
  };
  runNode([REVIEW_PACKAGE, 'init', feature, '--', 'tracked.txt']);
  await writeFile(path.join(feature, 'tracked.txt'), '已修改内容\n');
  await writeFile(path.join(feature, 'qa-plan.md'), planBody);
  runNode([QA_RUN, feature, 'run', '--', 'node', '--test', 'tests/sample.test.mjs']);
  runNode([QA_RUN, feature, 'gate-plan-01', '--', 'node', QA_CHECK, 'plan', feature]);
  runNode([QA_RUN, feature, 'gate-acceptance-01', '--', 'node', QA_CHECK, 'acceptance', feature]);
  runNode([REVIEW_PACKAGE, 'collect', feature]);
  await writeDeep(path.join(feature, 'review', 'r1-standards.md'), '无发现\n');
  await writeDeep(path.join(feature, 'review', 'r1-spec-axis.md'), '无发现\n');
  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Antigravity；独立双轴子代理',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '',
    '无发现',
    '',
    '## 范围说明',
    '- 无范围外改动',
  ].join('\n'));
  return { dir, feature };
}

test('[v2.2-OPT14-TC01-1] 日落无 challenge 旧双轨：缺少或损坏 challenge 返回 MISSING_REVIEW_CHALLENGE 且零残留死代码', async (t) => {
  const { feature } = await createCollectedReviewRepo(t);
  const challengePath = path.join(feature, '_qa', 'review-challenge.json');

  await rm(challengePath, { force: true });
  const missingReport = await qaCheck.checkFeature(feature, 'review');
  assert.equal(missingReport.status, 'BLOCKED', qaCheck.formatReport(missingReport, 'review'));
  assert.ok(missingReport.issues.some((item) => item.code === 'MISSING_REVIEW_CHALLENGE'));
  assert.ok(!missingReport.notes.some((note) => note.includes('旧协议（转录全等比对）')));

  await writeFile(challengePath, '{ broken json');
  const brokenReport = await qaCheck.checkFeature(feature, 'review');
  assert.equal(brokenReport.status, 'BLOCKED', qaCheck.formatReport(brokenReport, 'review'));
  assert.ok(brokenReport.issues.some((item) => item.code === 'MISSING_REVIEW_CHALLENGE'));

  const subDir = path.join(REPO_ROOT, 'tooling', 'scripts', 'qa-check');
  const subFiles = await listFilesRecursive(subDir);
  const allSources = await Promise.all([
    readFile(QA_CHECK, 'utf8'),
    ...subFiles.map((rel) => readFile(path.join(subDir, rel), 'utf8')),
  ]);
  for (const source of allSources) {
    assert.doesNotMatch(source, /\bauditTranscriptProvenance\b/);
    assert.doesNotMatch(source, /\bnormalizeForTranscript\b/);
    assert.doesNotMatch(source, /旧协议（转录全等比对）/);
  }
});

test('[v2.2-OPT14-TC02-1] qa-check 拆分为 6 个严格无环子模块，薄入口保持导出契约且无 matchesGlob', async () => {
  const subDir = path.join(REPO_ROOT, 'tooling', 'scripts', 'qa-check');
  const entries = await listFilesRecursive(subDir);
  assert.deepEqual([...entries].sort(), [...SIX_SUBMODULES].sort());

  const entrySource = await readFile(QA_CHECK, 'utf8');
  assert.match(entrySource, /from\s+['"]\.\/qa-check\//);
  assert.ok(entrySource.split(/\r?\n/).length <= 180, '薄入口 qa-check.mjs 应保持精简（<= 180 行）');

  for (const symbol of ['CURRENT_SCHEMA', 'splitMarkdownRow', 'parseSpec', 'deriveCaseStatus', 'parsePlan', 'checkFeature', 'formatReport']) {
    assert.ok(symbol in qaCheck, `qa-check.mjs 缺少兼容性导出 ${symbol}`);
  }

  // 构建静态依赖图并检测循环依赖与禁止特性
  const graph = new Map();
  for (const name of entries) {
    const content = await readFile(path.join(subDir, name), 'utf8');
    assert.doesNotMatch(content, /matchesGlob/, `${name} 不得依赖 matchesGlob`);
    for (const match of content.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('.'), `${name} 引入外部依赖 ${match[1]}`);
    }
    const deps = collectRelativeImports(content)
      .filter((spec) => !spec.startsWith('../'))
      .map((spec) => spec.replace(/^\.\//, ''));
    graph.set(name, deps);
  }
  assert.doesNotMatch(entrySource, /matchesGlob/, 'qa-check.mjs 不得依赖 matchesGlob');

  const visiting = new Set();
  const visited = new Set();
  function dfs(node) {
    assert.ok(!visiting.has(node), `检测到循环依赖：${node}`);
    if (visited.has(node)) return;
    visiting.add(node);
    for (const next of graph.get(node) ?? []) dfs(next);
    visiting.delete(node);
    visited.add(node);
  }
  for (const node of graph.keys()) dfs(node);
});

test('[v2.2-OPT14-TC03-1] S-J1~S-J3 单源导出复用，消除跨文件重复正则与哈希助手', async () => {
  const specReview = await import('../qa-spec-review.mjs');
  const reviewPackage = await import('../review-package.mjs');

  assert.ok(specReview.PREDICATE_KEYWORDS instanceof RegExp, 'qa-spec-review 须导出 PREDICATE_KEYWORDS');
  assert.equal(typeof specReview.hasPredicateInText, 'function', 'qa-spec-review 须导出 hasPredicateInText');
  assert.ok(specReview.REREVIEW_STATUS_PATTERN instanceof RegExp, 'qa-spec-review 须导出 REREVIEW_STATUS_PATTERN');
  assert.equal(typeof reviewPackage.sha256, 'function', 'review-package 须导出 sha256');
  assert.equal(typeof reviewPackage.sha256FileOrNull, 'function', 'review-package 须导出 sha256FileOrNull');

  const rpSource = await readFile(REVIEW_PACKAGE, 'utf8');
  assert.doesNotMatch(rpSource, /const\s+PREDICATE_KEYWORDS\s*=/);
  assert.doesNotMatch(rpSource, /function\s+fileHasPredicate\b/);
  assert.doesNotMatch(rpSource, /const\s+REREVIEW_STATUS_PATTERN\s*=/);

  const subDir = path.join(REPO_ROOT, 'tooling', 'scripts', 'qa-check');
  for (const name of SIX_SUBMODULES) {
    const content = await readFile(path.join(subDir, name), 'utf8');
    assert.doesNotMatch(content, /const\s+REREVIEW_STATUS_PATTERN\s*=/, `${name} 不得重复定义 REREVIEW_STATUS_PATTERN`);
    assert.doesNotMatch(content, /async function\s+sha256FileOrNull\b/, `${name} 不得重复实现 sha256FileOrNull`);
  }
});

test('[v2.2-OPT14-TC04-1] 安装模板目录级递归校验与 setup-qa-workflow 同步声明', async () => {
  const srcSubDir = path.join(REPO_ROOT, 'tooling', 'scripts', 'qa-check');
  const tplSubDir = path.join(REPO_ROOT, '.claude', 'skills', 'setup-qa-workflow', 'templates', 'qa-check');

  const srcFiles = await listFilesRecursive(srcSubDir);
  const tplFiles = await listFilesRecursive(tplSubDir);
  assert.deepEqual(tplFiles, srcFiles, '模板 qa-check/ 目录文件列表必须与 tooling/scripts/qa-check/ 完全一致');

  for (const rel of srcFiles) {
    const [srcText, tplText] = await Promise.all([
      readFile(path.join(srcSubDir, rel), 'utf8'),
      readFile(path.join(tplSubDir, rel), 'utf8'),
    ]);
    assert.equal(tplText, srcText, `templates/qa-check/${rel} 必须与 tooling/scripts/qa-check/${rel} 逐字节一致`);
    assert.doesNotMatch(tplText, /@repo\/web|AI 聚合平台|test_user/, `templates/qa-check/${rel} 不得包含本仓私货`);
  }

  const setupSkill = await readFile(path.join(REPO_ROOT, '.claude', 'skills', 'setup-qa-workflow', 'SKILL.md'), 'utf8');
  assert.match(setupSkill, /templates\/qa-check\//);
});

test('[v2.2-OPT14-TC05-1] 权威文档、技能、README 与蓝图同步单轨与 Phase 2.5 状态', async () => {
  const docPaths = [
    'docs/agents/qa-workflow.md',
    '.claude/skills/setup-qa-workflow/templates/qa-workflow.md',
    'docs/agents/qa-workflow-guide.md',
    '.claude/skills/code-review/SKILL.md',
    '.claude/skills/setup-qa-workflow/templates/skill-customizations.md',
    'tooling/scripts/README.md',
  ];
  for (const rel of docPaths) {
    const text = await readFile(path.join(REPO_ROOT, rel), 'utf8');
    assert.doesNotMatch(text, /无 challenge 的旧轮次|旧轮次由主代理逐字落盘|旧轮次可按真实最终返回同轮纠偏/, `${rel} 不得残留旧双轨措辞`);
  }
  const readme = await readFile(path.join(REPO_ROOT, 'tooling/scripts/README.md'), 'utf8');
  assert.match(readme, /MISSING_REVIEW_CHALLENGE/);
  assert.match(readme, /tooling\/scripts\/qa-check\//);

  for (const planPath of [
    'docs/plans/gemini4-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md',
    'docs/plans/2026-11-22-qa-workflow-optimization-plan.md',
  ]) {
    const header = (await readFile(path.join(REPO_ROOT, planPath), 'utf8')).split('\n').slice(0, 14).join('\n');
    assert.match(header, /07ef09d/, planPath);
    assert.match(header, /d463e90/, planPath);
    assert.match(header, /待发布验收/, planPath);
    assert.match(header, /当前推进 Phase 2\.5/, planPath);
    assert.doesNotMatch(header, /Phase 2\.5 已完成|Phase 3 已完成/, planPath);
  }
});

test('[v2.2-OPT14-TC06-1] 新单轨下 6 项核心溯源与自查防线继续生效', async (t) => {
  const { createHash } = await import('node:crypto');
  const { realpath } = await import('node:fs/promises');
  const { dir, feature } = await createCollectedReviewRepo(t);
  const runSeal = (round, axis, file, host = 'Claude Code', pending = []) => {
    const args = [
      REVIEW_PACKAGE, 'seal', feature,
      '--round', round, '--axis', axis, '--file', file,
      '--reviewer-kind', 'subagent', '--host', host,
    ];
    if (pending.length) args.push('--pending-ids', pending.join(','));
    const res = spawnSync(process.execPath, args, { cwd: dir, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr || res.stdout);
  };
  const sha = async (rel) => createHash('sha256').update(await readFile(path.join(feature, rel))).digest('hex');

  const configDir = await mkdtemp(path.join(tmpdir(), 'qa-opt14-prov-'));
  const prevConfig = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = configDir;
  t.after(async () => {
    if (prevConfig === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevConfig;
    await rm(configDir, { recursive: true, force: true });
  });
  const projectDir = path.join(configDir, 'projects', (await realpath(dir)).replace(/[^A-Za-z0-9]/g, '-'));
  const subagentsDir = path.join(projectDir, 'session-1', 'subagents');
  const writeMain = async (skill) => {
    const entries = [{ type: 'assistant', message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: '主会话' }] } }];
    if (skill) {
      entries.push({
        type: 'assistant',
        timestamp: new Date().toISOString(),
        message: { model: 'claude-opus-5-5', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Skill', input: { skill, args: '阶段 6' } }] },
      });
    }
    await writeDeep(path.join(projectDir, 'session-1.jsonl'), `${entries.map((e) => JSON.stringify(e)).join('\n')}\n`);
  };

  // 1. 先封存 r1 双轴（Claude Code），主会话无 code-review 调用且无同 nonce 转录 -> REVIEW_PROVENANCE_UNVERIFIED
  runSeal('r1', 'standards', 'review/r1-standards.md', 'Claude Code');
  runSeal('r1', 'spec', 'review/r1-spec-axis.md', 'Claude Code');
  await writeMain(null);
  const unverified = await qaCheck.checkFeature(feature, 'review');
  assert.equal(unverified.status, 'BLOCKED');
  assert.ok(unverified.issues.some((i) => i.code === 'REVIEW_PROVENANCE_UNVERIFIED'));

  // 2. 独立仓库验证非 Claude 宿主 + 非 Claude 凭据 -> 跳过 Claude 转录扫描且 PASS
  const nonClaudeRepo = await createCollectedReviewRepo(t);
  const sealNonClaude = (axis, file) => {
    const res = spawnSync(process.execPath, [
      REVIEW_PACKAGE, 'seal', nonClaudeRepo.feature,
      '--round', 'r1', '--axis', axis, '--file', file,
      '--reviewer-kind', 'subagent', '--host', 'Kimi Code',
    ], { cwd: nonClaudeRepo.dir, encoding: 'utf8' });
    assert.equal(res.status, 0, res.stderr || res.stdout);
  };
  sealNonClaude('standards', 'review/r1-standards.md');
  sealNonClaude('spec', 'review/r1-spec-axis.md');
  await writeFile(
    path.join(nonClaudeRepo.feature, 'review-report.md'),
    (await readFile(path.join(nonClaudeRepo.feature, 'review-report.md'), 'utf8')).replace('宿主=Antigravity', '宿主=Kimi Code'),
  );
  const nonClaude = await qaCheck.checkFeature(nonClaudeRepo.feature, 'review');
  assert.equal(nonClaude.status, 'PASS', qaCheck.formatReport(nonClaude, 'review'));
  assert.ok(nonClaude.notes.some((n) => n.includes('跳过 Claude 转录扫描')));

  // 3. 声明自查 -> SELF_REVIEW
  await writeFile(
    path.join(feature, 'review-report.md'),
    (await readFile(path.join(feature, 'review-report.md'), 'utf8')).replace('宿主=Antigravity；独立双轴子代理', '宿主=Kimi Code；自查'),
  );
  const selfReview = await qaCheck.checkFeature(feature, 'review');
  assert.ok(selfReview.issues.some((i) => i.code === 'SELF_REVIEW'));

  // 4. 改写 r1-spec-axis.md 内容而不经新轮次 -> REVIEW_SOURCE_MISMATCH
  await writeFile(
    path.join(feature, 'review-report.md'),
    (await readFile(path.join(feature, 'review-report.md'), 'utf8')).replace('宿主=Kimi Code；自查', '宿主=Claude Code；独立双轴子代理'),
  );
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), '篡改后无发现\n');
  const mismatch = await qaCheck.checkFeature(feature, 'review');
  assert.ok(mismatch.issues.some((i) => i.code === 'REVIEW_SOURCE_MISMATCH'));

  // 5. 切回原文并配对同 nonce 过期转录 -> REVIEW_SOURCE_STALE
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), '无发现\n');
  const c1 = JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
  await writeMain('code-review');
  await writeDeep(path.join(subagentsDir, 'agent-spec-r1.jsonl'), [
    JSON.stringify({ type: 'user', message: { content: `QA_REVIEW_BINDING: .scratch/opt14-feature|r1|spec\nQA_REVIEW_NONCE: ${c1.nonce}` } }),
    JSON.stringify({ type: 'assistant', timestamp: '2000-01-01T00:00:00.000Z', message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: `QA_REVIEW_RECEIPT: ${c1.nonce}|${await sha('review/r1-spec-axis.md')}` }] } }),
  ].join('\n') + '\n');
  const stale = await qaCheck.checkFeature(feature, 'review');
  assert.ok(stale.issues.some((i) => i.code === 'REVIEW_SOURCE_STALE'));

  // 6. r2 复审转录实际输入缺待复核编号 P-W1 -> REVIEW_REINPUT_MISSING
  await writeFile(path.join(feature, 'review', 'r1-spec-axis.md'), '[P-W1] 需修复\n');
  const col2 = spawnSync(process.execPath, [REVIEW_PACKAGE, 'collect', feature, '--round', 'r2'], { cwd: dir, encoding: 'utf8' });
  assert.equal(col2.status, 0, col2.stderr || col2.stdout);
  const c2 = JSON.parse(await readFile(path.join(feature, '_qa', 'review-challenge.json'), 'utf8'));
  await writeDeep(path.join(feature, 'review', 'r2-standards.md'), '无发现\n');
  await writeDeep(path.join(feature, 'review', 'r2-spec-axis.md'), '[P-W1] 已修\n');
  runSeal('r2', 'standards', 'review/r2-standards.md', 'Claude Code');
  runSeal('r2', 'spec', 'review/r2-spec-axis.md', 'Claude Code', ['P-W1']);
  await writeFile(path.join(feature, 'review-report.md'), [
    '审查方式：宿主=Claude Code；独立双轴子代理',
    '',
    '## 三档分流',
    '| 编号 | 档位 | 处置状态 | 轮次轨迹 | 验证证据 | 理由 |',
    '| --- | --- | --- | --- | --- | --- |',
    '| P-W1 | 本次修 | 已修 | r1 → r2 已修 | 静态：测试夹具 | |',
    '',
    '## 范围说明',
    '- 无范围外改动',
  ].join('\n'));
  await writeDeep(path.join(subagentsDir, 'agent-spec-r2.jsonl'), [
    JSON.stringify({ type: 'user', message: { content: `QA_REVIEW_BINDING: .scratch/opt14-feature|r2|spec\nQA_REVIEW_NONCE: ${c2.nonce}\n待复核：无` } }),
    JSON.stringify({ type: 'assistant', timestamp: new Date().toISOString(), message: { model: 'claude-opus-5-5', content: [{ type: 'text', text: `QA_REVIEW_RECEIPT: ${c2.nonce}|${await sha('review/r2-spec-axis.md')}` }] } }),
  ].join('\n') + '\n');
  const reinput = await qaCheck.checkFeature(feature, 'review');
  assert.ok(reinput.issues.some((i) => i.code === 'REVIEW_REINPUT_MISSING'));
});
