import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const paths = {
  domain: 'docs/agents/domain.md',
  grill: '.claude/skills/grill-with-docs/SKILL.md',
  toSpec: '.claude/skills/to-spec/SKILL.md',
  qaPlanner: '.claude/skills/qa-test-planner/SKILL.md',
  toTickets: '.claude/skills/to-tickets/SKILL.md',
  codeReview: '.claude/skills/code-review/SKILL.md',
  root: 'CLAUDE.md',
  context: 'CONTEXT.md',
  settings: '.claude/settings.json',
};

async function read(path) {
  return readFile(path, 'utf8');
}

test('领域术语默认只写 GLOSSARY，预览需求不再写入 CONTEXT', async () => {
  const [domain, root, context] = await Promise.all([read(paths.domain), read(paths.root), read(paths.context)]);
  assert.match(domain, /默认只写入 `GLOSSARY\.md`/);
  assert.match(domain, /不默认同步 `CONTEXT\.md`/);
  assert.match(root, /GLOSSARY\.md/);
  assert.doesNotMatch(context, /### 文档全文预览 \(DocumentPreview\)/);
  assert.doesNotMatch(context, /### 切片锚点高亮 \(CitationAnchorHighlight\)/);
  assert.doesNotMatch(context, /### 跨切片导航器 \(ChunkNavigator\)/);
});

test('grill 收口展示当前阶段、车道理由和唯一的 to-spec 后继', async () => {
  const content = await read(paths.grill);
  assert.match(content, /当前已完成阶段/);
  assert.match(content, /车道及理由/);
  assert.match(content, /本阶段产物/);
  assert.match(content, /唯一下一步：`\/to-spec`/);
  assert.match(content, /不把补 ADR 与 `\/to-spec` 并列/);
});

test('to-spec 将 qa-test-planner 作为默认唯一下一步', async () => {
  const content = await read(paths.toSpec);
  assert.match(content, /唯一下一步：`\/qa-test-planner`/);
  assert.match(content, /用户明确选择并行时才改变该默认路径/);
});

test('qa planner 将串行 implement 作为规划通过后的唯一下一步', async () => {
  const content = await read(paths.qaPlanner);
  assert.match(content, /规划通过后.*唯一下一步：`\/implement`/);
  assert.match(content, /QA Schema: 2/);
});

test('to-tickets 将串行 implement 作为默认唯一下一步', async () => {
  const content = await read(paths.toTickets);
  assert.match(content, /唯一下一步：`\/implement`/);
  assert.match(content, /不默认改为并发/);
});

test('code-review 使用快照审查包并要求双轴报告', async () => {
  const content = await read(paths.codeReview);
  assert.match(content, /review-package\.mjs collect/);
  assert.match(content, /review-report\.md/);
  assert.match(content, /开工前已有/);
});

test('没有通过配置新增 Hooks', async () => {
  const settings = JSON.parse(await read(paths.settings));
  assert.deepEqual(settings, { enabledPlugins: {}, extraKnownMarketplaces: {} });
});
