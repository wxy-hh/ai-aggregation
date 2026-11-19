import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { CURRENT_SCHEMA } from '../qa-check.mjs';

const paths = {
  domain: 'docs/agents/domain.md',
  grill: '.claude/skills/grill-with-docs/SKILL.md',
  toSpec: '.claude/skills/to-spec/SKILL.md',
  qaPlanner: '.claude/skills/qa-test-planner/SKILL.md',
  toTickets: '.claude/skills/to-tickets/SKILL.md',
  implement: '.claude/skills/implement/SKILL.md',
  implementSpec: '.claude/skills/implement-spec/SKILL.md',
  setup: '.claude/skills/setup-qa-workflow/SKILL.md',
  workflow: 'docs/agents/qa-workflow.md',
  workflowTemplate: '.claude/skills/setup-qa-workflow/templates/qa-workflow.md',
  claudeTemplate: '.claude/skills/setup-qa-workflow/templates/claude-qa-directive.md',
  guide: 'docs/agents/qa-workflow-guide.md',
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

test('grill 收口展示当前阶段、车道理由和建议的 to-spec 后继（TC11）', async () => {
  const content = await read(paths.grill);
  assert.match(content, /当前已完成阶段/);
  assert.match(content, /车道及理由/);
  assert.match(content, /本阶段产物/);
  assert.match(content, /建议下一步：`\/to-spec`/);
  assert.match(content, /不把补 ADR 与 `\/to-spec` 并列/);
});

test('to-spec 按车道只给一个建议下一步，慢车道为 to-tickets（TC11）', async () => {
  const content = await read(paths.toSpec);
  assert.match(content, /标准车道\*\*建议下一步：`\/qa-test-planner`/);
  assert.match(content, /慢车道\*\*建议下一步：`\/to-tickets`/);
  assert.match(content, /快车道\*\*建议下一步：`\/implement`/);
  assert.doesNotMatch(content, /先运行 `\/to-tickets`，再进入 `\/implement-spec`/);
});

test('qa planner 将串行 implement 作为规划通过后的建议下一步（TC11、TC12）', async () => {
  const content = await read(paths.qaPlanner);
  assert.match(content, /规划通过后.*建议下一步：`\/implement`/);
  assert.match(content, /QA Schema: 4/);
});

test('to-tickets 拆票后建议 qa-test-planner，不跳过测试规划（TC11）', async () => {
  const content = await read(paths.toTickets);
  assert.match(content, /建议下一步：`\/qa-test-planner`\*\*，只写这一个命令/);
});

test('正本、根规则、规划与实现技能及安装模板引用当前 Schema（TC12）', async () => {
  const documents = await Promise.all([
    read(paths.workflow),
    read(paths.root),
    read(paths.qaPlanner),
    read(paths.implement),
    read(paths.workflowTemplate),
    read(paths.claudeTemplate),
  ]);
  for (const content of documents) {
    assert.match(content, new RegExp(`Schema ${CURRENT_SCHEMA}\\b`));
    assert.doesNotMatch(content, /(新计划|新生成).{0,12}Schema [12]\b/);
  }
  assert.ok(documents[0].trim().split('\n').length <= 180);
});

test('规划器声明 Seam、交付命令、修复轮与计划冻结（TC12）', async () => {
  const content = await read(paths.qaPlanner);
  assert.match(content, /Seam/);
  assert.match(content, /交付验证/);
  assert.match(content, /QA Kind: fix/);
  assert.match(content, /init 时冻结/);
  assert.match(content, /≤5 条/);
});

test('门禁只在任务首轮与宣称交付时完整声明（TC11）', async () => {
  const [root, template] = await Promise.all([read(paths.root), read(paths.claudeTemplate)]);
  for (const content of [root, template]) {
    assert.match(content, /任务首轮/);
    assert.match(content, /宣称交付/);
    assert.match(content, /其他回合不重复/);
  }
  assert.ok(root.trim().split('\n').length <= 69);
});

test('机器校验保留 PASS 输出（TC11、TC12、TC13）', async () => {
  const [root, workflow] = await Promise.all([read(paths.root), read(paths.workflow)]);
  for (const content of [root, workflow]) {
    assert.match(content, /node tooling\/scripts\/qa-check\.mjs review/);
    assert.match(content, /结果: PASS/);
  }
});

test('QA 工作流负责最终交付校验而非 code-review 总控', async () => {
  const contents = await Promise.all([
    read(paths.implement),
    read(paths.implementSpec),
    read(paths.workflow),
    read(paths.workflowTemplate),
    read(paths.guide),
    read('docs/adr/0026-qa-evidence-binding-and-review-integrity.md'),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
  ]);
  for (const content of contents) {
    assert.match(content, /QA 工作流/);
    assert.match(content, /最终交付/);
    assert.doesNotMatch(content, /(?:由 `code-review`|由其统一|由本技能统一)[^\n]*(?:最终交付|qa-check review)/);
  }
});

test('实现收口先真实调用 code-review，再进入机器交付校验（TC13）', async () => {
  const contents = await Promise.all([
    read(paths.implement),
    read(paths.implementSpec),
  ]);
  for (const content of contents) {
    assert.match(content, /调用 `code-review`/);
    assert.match(content, /待独立审查/);
    assert.match(content, /不得凭空生成/);
    assert.match(content, /结果: PASS/);
    assert.ok(content.indexOf('调用 `code-review`') < content.indexOf('结果: PASS'));
  }
});

test('机器 PASS 不替代独立审查和人工终审（TC13）', async () => {
  const [workflow, root, guide] = await Promise.all([
    read(paths.workflow),
    read(paths.root),
    read(paths.guide),
  ]);
  for (const content of [workflow, root, guide]) {
    assert.match(content, /机器校验通过/);
    assert.match(content, /独立审查/);
    assert.match(content, /人工终审/);
  }
});

test('规划覆盖关键分支与合适接缝（TC13）', async () => {
  const planner = await read(paths.qaPlanner);
  assert.match(planner, /触发条件/);
  assert.match(planner, /排除条件/);
  assert.match(planner, /降级路径/);
  assert.match(planner, /合适接缝/);
});

test('正本与 implement 写明探活、单文件测试、qa-run 和合规登录（TC10）', async () => {
  const [workflow, implement] = await Promise.all([read(paths.workflow), read(paths.implement)]);
  for (const content of [workflow, implement]) {
    assert.match(content, /node tooling\/scripts\/dev-port\.mjs/);
    assert.match(content, /pnpm --filter @repo\/web test/);
    assert.match(content, /\[id\]/);
    assert.match(content, /测试账号/);
    assert.match(content, /打开登录页/);
    assert.doesNotMatch(content, /test_user/);
    assert.match(content, /node tooling\/scripts\/qa-run\.mjs/);
  }
  for (const forbidden of ['签发令牌', '写库造会话', '注入 Cookie']) {
    assert.match(workflow, new RegExp(forbidden));
  }
});

test('安装器复制四个工具与浏览器辅助模块并验证直接 Node 调用（TC12）', async () => {
  const content = await read(paths.setup);
  for (const required of ['qa-check.mjs', 'review-package.mjs', 'qa-run.mjs', 'qa-spec-review.mjs', 'templates/qa-browser-helper.mjs', 'node tooling/scripts/qa-run.mjs .scratch/<feature>']) {
    assert.match(content, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('安装流程模板不把未分发模块写死为唯一实现（TC08）', async () => {
  const [template, setup] = await Promise.all([read(paths.workflowTemplate), read(paths.setup)]);
  assert.match(template, /helper 提供 `captureTargetGeometry`/);
  assert.match(template, /未提供时按同一契约自写/);
  assert.match(setup, /templates\/qa-browser-helper\.mjs/);
});

test('工具索引列出全部可分发 QA 工具与视觉目标原语（TC08）', async () => {
  const readme = await read('tooling/scripts/README.md');
  for (const required of ['qa-check.mjs', 'review-package.mjs', 'qa-run.mjs', 'qa-spec-review.mjs', 'qa-browser-helper.mjs', 'captureTargetGeometry', 'gate-plan-*']) {
    assert.match(readme, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(readme, /三个脚本的逐字一致性/);
});

test('没有通过配置新增 Hooks（TC12）', async () => {
  const settings = JSON.parse(await read(paths.settings));
  assert.deepEqual(settings, { enabledPlugins: {}, extraKnownMarketplaces: {} });
});

test('通用安装器不注入宿主 scripts，模板使用可移植调用（TC12）', async () => {
  const [setup, workflow, directive, customizations] = await Promise.all([
    read(paths.setup),
    read(paths.workflowTemplate),
    read(paths.claudeTemplate),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
  ]);
  assert.match(setup, /不得修改[^\n]*package\.json/);
  for (const key of ['"qa:check"', '"qa:run"', '"review:package"', '"dev:probe"', '"test:tooling"']) {
    assert.doesNotMatch(setup, new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const content of [workflow, directive, customizations]) {
    assert.doesNotMatch(content, /pnpm (?:qa:|dev:probe|test:tooling)/);
    assert.doesNotMatch(content, /@repo\/web|test_user|AI 聚合平台/);
  }
  assert.match(workflow, /node tooling\/scripts\/qa-run\.mjs/);
  assert.match(workflow, /node tooling\/scripts\/qa-check\.mjs/);
});

test('通用安装模板同步审查交接与完成语义（TC13）', async () => {
  const [workflow, directive, customizations, setup] = await Promise.all([
    read(paths.workflowTemplate),
    read(paths.claudeTemplate),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
    read(paths.setup),
  ]);
  for (const content of [workflow, directive, customizations]) {
    assert.match(content, /code-review/);
    assert.match(content, /待独立审查/);
    assert.match(content, /机器校验通过/);
    assert.match(content, /人工终审/);
  }
  assert.match(workflow, /触发条件/);
  assert.match(workflow, /证据过期/);
  assert.match(customizations, /## \d+\. `code-review`/);
  assert.match(setup, /注入[^\n]*`code-review`/);
});

test('阶段 6 入口只路由到 code-review 技能，无能力时合法暂停（TC01）', async () => {
  const contents = await Promise.all([
    read(paths.implement),
    read(paths.implementSpec),
    read(paths.workflow),
    read(paths.workflowTemplate),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
  ]);
  for (const content of contents) {
    assert.match(content, /独立上下文/);
    assert.match(content, /Skill 工具调用 `?code-review/);
    assert.match(content, /不要用 Agent 工具自行派审查子代理/);
    assert.match(content, /待独立审查/);
    assert.doesNotMatch(content, /exit 2/);
  }
  // 入口文件不复述子代理行为；skill-customizations 的 code-review 段本身就是规则所在，不在此列
  for (const content of contents.slice(0, 4)) assert.doesNotMatch(content, /继承主会话模型/);
  for (const content of contents.slice(0, 2)) assert.doesNotMatch(content, /r<n>-standards/);
  for (const content of [contents[0], contents[2], contents[3]]) {
    assert.match(content, /不运行最终 `qa-check review`/);
    assert.match(content, /只交付审查包/);
  }

  const [root, directive] = await Promise.all([read(paths.root), read(paths.claudeTemplate)]);
  for (const content of [root, directive]) {
    assert.match(content, /独立上下文/);
    assert.match(content, /Skill 工具调用 `code-review`/);
    assert.doesNotMatch(content, /继承主会话模型/);
    assert.doesNotMatch(content, /exit 2/);
  }
  assert.match(root, /`AGENTS\.md` 是指向本文件的符号链接/);
});

test('浏览器脚本具备失败能力，环境不足不得用低接缝冒充（TC04）', async () => {
  const contents = await Promise.all([
    read(paths.workflow),
    read(paths.workflowTemplate),
    read(paths.guide),
  ]);
  for (const content of contents) {
    assert.match(content, /硬断言/);
    assert.match(content, /非零退出/);
    assert.match(content, /转人工/);
    assert.match(content, /BLOCKED/);
  }
  for (const content of contents.slice(0, 2)) {
    assert.match(content, /不得用低接缝证据替代 browser/);
  }
});

test('发布验收检查真实编排与无能力暂停，而非只查工具（TC01）', async () => {
  const contents = await Promise.all([
    read(paths.workflow),
    read(paths.workflowTemplate),
    read(paths.guide),
  ]);
  for (const content of contents) {
    assert.match(content, /dogfood/);
    assert.match(content, /真实\s+\/implement/);
    assert.match(content, /无独立上下文能力/);
    assert.match(content, /手动派发 reviewer/);
  }
});

test('安装器不按宿主条件开关绕过登录检查（TC09-3）', async () => {
  const contents = await Promise.all([
    read(paths.setup),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
    read(paths.workflowTemplate),
  ]);
  for (const content of contents) {
    assert.doesNotMatch(content, /AUTH_BYPASS_IN_SCRIPT/);
    assert.doesNotMatch(content, /(?:无|没有|不含)数据库[^\n]*(?:跳过|关闭|移除|删除)[^\n]*(?:登录|扫描)/);
  }
});

const customizationsPath = '.claude/skills/setup-qa-workflow/templates/skill-customizations.md';

// 提取 Schema 4 示例代码块，并把示例中的说明性文字规范化，只保留结构
function schemaSkeleton(content) {
  const block = content.match(/```markdown\n(QA Schema: 4[\s\S]*?)```/);
  assert.ok(block, '缺少 Schema 4 示例代码块');
  return block[1]
    .split('\n')
    .map((line) => line.replace(/^(### TC01: ).*/, '$1').replace(/^(1\. ).*/, '$1').trim())
    .filter(Boolean);
}

test('正本与规划器的 Schema 4 示例结构一致', async () => {
  const [workflow, planner] = await Promise.all([read(paths.workflow), read(paths.qaPlanner)]);
  assert.deepEqual(schemaSkeleton(planner), schemaSkeleton(workflow));
});

test('只有 S-H、P-M、P-W 的驳回须引 ADR，复审只复核这三类改档', async () => {
  const [root, directive, customizations, implementSpec] = await Promise.all([
    read(paths.root),
    read(paths.claudeTemplate),
    read(customizationsPath),
    read(paths.implementSpec),
  ]);
  for (const content of [root, directive, customizations]) {
    assert.doesNotMatch(content, /[（，；]驳回须引 ADR/);
    assert.match(content, /S-H、P-M、P-W 驳回须引 ADR 或契约/);
  }
  assert.doesNotMatch(implementSpec, /，驳回或转专项同样由审查者复核/);
  assert.match(implementSpec, /S-H、P-M、P-W 被驳回或转专项同样由审查者复核/);
});

test('implement-spec 缺工单时请用户运行 to-tickets，不由模型调用', async () => {
  const content = await read(paths.implementSpec);
  assert.doesNotMatch(content, /先使用 `to-tickets`/);
  assert.match(content, /请用户运行 `\/to-tickets`/);
});

test('qa-test-planner 不使用无效 trigger 字段，可由模型调用', async () => {
  const [content, yaml] = await Promise.all([
    read(paths.qaPlanner),
    read('.claude/skills/qa-test-planner/agents/openai.yaml'),
  ]);
  assert.doesNotMatch(content, /^trigger:/m);
  assert.doesNotMatch(content, /disable-model-invocation/);
  assert.doesNotMatch(content, /triggered only when explicitly called/);
  assert.match(yaml, /display_name/);
  assert.doesNotMatch(yaml, /allow_implicit_invocation: false/);
});

test('tdd 复用已确认的 Seam，描述与正文的红绿循环一致', async () => {
  const [content, yaml, customizations] = await Promise.all([
    read('.claude/skills/tdd/SKILL.md'),
    read('.claude/skills/tdd/agents/openai.yaml'),
    read(customizationsPath),
  ]);
  assert.doesNotMatch(content.split('\n---')[0], /重构/);
  assert.doesNotMatch(yaml, /refactor/i);
  for (const text of [content, customizations]) {
    assert.match(text, /已确认的 Seam/);
    assert.match(text, /计划变更/);
  }
});

test('code-review 定制段包含规范来源、审查绑定与来源纠偏', async () => {
  const [content, customizations] = await Promise.all([
    read('.claude/skills/code-review/SKILL.md'),
    read(customizationsPath),
  ]);
  for (const text of [content, customizations]) {
    assert.match(text, /Standards 子代理的规范来源必须包含/);
    assert.match(text, /\.claude\/rules\//);
    assert.match(text, /DESIGN\.md/);
    assert.match(text, /不得为满足字数限制省略/);
    assert.match(text, /QA_REVIEW_BINDING/);
    assert.match(text, /不读取、比较或提示模型差异/);
    assert.match(text, /同轮纠偏/);
    assert.match(text, /待复核编号/);
  }
});

test('to-spec 定制段约束 US 粒度并只确认未确认的接缝', async () => {
  const [content, customizations] = await Promise.all([read(paths.toSpec), read(customizationsPath)]);
  for (const text of [content, customizations]) {
    assert.match(text, /外部可区分的行为/);
    assert.match(text, /一个 TC 可覆盖多条 US/);
  }
});

test('handoff 记录 QA 续接快照', async () => {
  const [content, customizations] = await Promise.all([
    read('.claude/skills/handoff/SKILL.md'),
    read(customizationsPath),
  ]);
  for (const text of [content, customizations]) {
    assert.match(text, /QA 续接快照/);
    assert.match(text, /_qa\/scope\.json/);
    assert.match(text, /审查轮次/);
  }
});

test('pr 汇总 qa-check review 结果行与遗留事项', async () => {
  const [content, customizations, setup] = await Promise.all([
    read('.claude/skills/pr/SKILL.md'),
    read(customizationsPath),
    read(paths.setup),
  ]);
  for (const text of [content, customizations]) {
    assert.match(text, /## 遗留事项/);
    assert.match(text, /qa-check\.mjs review/);
    assert.match(text, /待人工裁决编号/);
  }
  assert.match(setup, /注入[^\n]*`tdd`[^\n]*`pr`/);
});

test('implement 交付汇报只附人工终审入口，快车道表格不与核心小改冲突', async () => {
  const [implement, workflow, template] = await Promise.all([
    read(paths.implement),
    read(paths.workflow),
    read(paths.workflowTemplate),
  ]);
  assert.doesNotMatch(implement, /附正本阶段 7 的人工终审清单/);
  assert.match(implement, /人工终审入口/);
  for (const content of [workflow, template]) {
    assert.doesNotMatch(content, /\| 快车道 \|[^\n]*（不建 qa-plan，不跑审查）/);
  }
});

// ADR-0042：证据前置拦截与审查降噪的规则契约
const codeReviewPaths = ['.claude/skills/code-review/SKILL.md', '.claude/skills/setup-qa-workflow/templates/skill-customizations.md'];
const workflowPaths = [paths.workflow, paths.workflowTemplate];

async function eachMatch(files, pattern) {
  for (const file of files) assert.match(await read(file), pattern, file);
}

test('[HR-TC07-1] 最终交付命令只在阶段 7 执行，不再 collect 前预跑', async () => {
  for (const file of workflowPaths) {
    const content = await read(file);
    assert.doesNotMatch(content, /首次 collect 之前先跑一次/, file);
    assert.match(content, /QA 工作流在最终代码上通过 qa-run 执行每条交付命令/, file);
    assert.match(content, /阶段 3B 基线命令与阶段 4 TDD 红绿证据仍按原规则执行/, file);
  }
  assert.match(await read(paths.guide), /不再要求 `collect` 前预跑/);
});

test('[ADR-0054] 正本与安装模板写明单轴复审、只读审查、假失败认领与弱档边界', async () => {
  for (const file of workflowPaths) {
    const content = await read(file);
    assert.match(content, /仅修改分流或轨迹文字/, file);
    assert.match(content, /不重跑测试套件、`typecheck`、`lint` 或启动服务/, file);
    assert.match(content, /不得读取同轮另一轴原文/, file);
    assert.match(content, /`no_final_message` 时，先核对/, file);
    assert.match(content, /`QA Kind: feature` 不设修复前复现日志门禁/, file);
    assert.match(content, /所有 QA Kind 的阶段 4 TDD 垂直切片红灯证据要求不变/, file);
    assert.match(content, /禁止把 `qa-check` 结果、截图独立性、`review\/`、`review-report\.md` 或 `handoff\.md` 合规性写成元用例/, file);
    assert.match(content, /「自述凭据（弱）」只防跨轮串包与漏执行/, file);
    assert.doesNotMatch(content, /`code-review` 使用上游原文/, file);
  }
});

test('[ADR-0054] 交付前校准保留留痕、受影响轴复审与阶段 7 回退闭环', async () => {
  for (const file of workflowPaths) {
    const content = await read(file);
    assert.match(content, /## 默认驳回/, file);
    assert.match(content, /编号与原文位置/, file);
    assert.match(content, /执行记录、绑定、日志或截图变化时 Spec 轴必须复审/, file);
    assert.match(content, /过程脚本变化时 Standards 与 Spec 双轴必须复审/, file);
    assert.match(content, /修改代码或契约文档.*回到阶段 6/, file);
    assert.match(content, /重跑受影响验收与全部交付命令/, file);
    assert.match(content, /阶段 3B 基线命令与阶段 4 TDD 红绿证据仍按原规则执行/, file);
    assert.match(content, /所有 QA Kind 的阶段 4 TDD 垂直切片红灯证据要求不变/, file);
  }
  for (const file of [...workflowPaths, paths.qaPlanner, paths.guide, 'docs/adr/0054-qa-workflow-friction-reduction-and-browser-split.md']) {
    const content = await read(file);
    assert.match(content, /核心真实浏览器主链路/, file);
    assert.doesNotMatch(content, /核心真机主链路/, file);
  }
});

test('[ADR-0054] 浏览器按场景分流并限制 1–3 条核心主链路', async () => {
  for (const file of [...workflowPaths, paths.root, paths.guide]) {
    const content = await read(file);
    assert.match(content, /1–3 条核心/, file);
    assert.match(content, /Playwright/, file);
    assert.match(content, /`ego-browser` 可见窗口/, file);
    assert.match(content, /遵循宿主工具优先级/, file);
  }
  const guide = await read(paths.guide);
  assert.doesNotMatch(guide, /page\.locator\('\[data-testid="edit-button"\]'\)/, '指南不应再提供错位 locator 示例');
  assert.match(guide, /不走 `playwright test`/);
  assert.match(guide, /根级直接开发依赖/);
  assert.match(await read(paths.setup), /根级直接开发依赖/);
});

test('[ADR-0054] code-review 为单一中文指令并限制审查执行边界', async () => {
  const content = await read('.claude/skills/code-review/SKILL.md');
  assert.doesNotMatch(content, /Under 400 words/);
  assert.match(content, /普通审查/);
  assert.match(content, /git diff <fixed-point>\.\.\.HEAD/);
  assert.match(content, /仅 QA 工作流调用时/);
  assert.doesNotMatch(content, /两轴同时以\*\*前台\*\*/);
  assert.match(content, /上游为 Matt Pocock Skills/);
  assert.match(content, /Fowler 坏味道基线/);
  assert.match(content, /不得重跑测试套件、`typecheck`、`lint` 或启动服务/);
  assert.match(content, /严禁读取同轮另一轴的 `review\/` 原文/);
  assert.match(content, /严禁跨特性读取其他 `\.scratch\/` 目录/);
  assert.match(content, /禁止封存后删除 `\.source\.json` 重封/);
});

test('[ADR-0054] retro 要求跨会话检索与真实原件抽查', async () => {
  const content = await read('.claude/skills/retro/SKILL.md');
  assert.match(content, /按特性目录内全部文件与截图的最后修改时间，检索所有晚于特性建档的关联会话/);
  assert.match(content, /必须用宿主图像读取工具抽查真实截图图像与 `scripts\/` 过程脚本逻辑/);
  assert.doesNotMatch(content, /必须用 Read 抽查真实截图图像/);
});

test('[ADR-0054] to-spec 与 qa-test-planner 同步 feature 红灯与元用例规则', async () => {
  const [toSpec, planner] = await Promise.all([read(paths.toSpec), read(paths.qaPlanner)]);
  for (const content of [toSpec, planner]) {
    assert.match(content, /QA Kind: feature/);
    assert.match(content, /红灯/);
    assert.match(content, /元用例/);
  }
  assert.match(toSpec, /不得把 `qa-check`、截图独立性、`review\/` 或 `handoff\.md` 合规性写成元用例/);
  assert.match(planner, /禁止把 `qa-check` 结果、截图独立性、`review\/`、`review-report\.md` 或 `handoff\.md` 合规性写成元用例/);
});

test('[HR-TC07-2] 视觉类断言证据为几何硬断言加目标区域截图', async () => {
  await eachMatch([...workflowPaths, paths.qaPlanner], /几何硬断言.*目标区域截图/s);
});

test('[HR-TC07-3] 计划变更不得新增冻结断言之外的呈现要求', async () => {
  await eachMatch(workflowPaths, /计划变更不得新增冻结断言之外的呈现要求/);
});

test('[HR-TC07-4] Spec 轴只按冻结断言原文核对截图，取景不全不编号', async () => {
  await eachMatch(codeReviewPaths, /只按冻结断言原文核对截图/);
  await eachMatch(codeReviewPaths, /截图只是取景不全时不编号/);
});

test('[HR-TC07-5] 返回截断时保留已有内容并保持待独立审查，禁止追问重写', async () => {
  await eachMatch(codeReviewPaths, /截断或不完整时(?:照原样落盘|保留已写入内容或按原样处理).*待独立审查.*不得追问、续传或让子代理重写/s);
});

test('[HR-TC07-6] 原文不得加头注或还原转义，说明写进 review-report', async () => {
  await eachMatch(codeReviewPaths, /不得在原文中加头注、还原转义.*review-report/s);
});

test('[HR-TC07-7] 复审输入含本轮修复改过的文件，不再要求新增修复 diff', async () => {
  for (const file of [...workflowPaths, ...codeReviewPaths]) {
    const text = await read(file);
    assert.match(text, /本轮修复改过的文件/, file);
    assert.doesNotMatch(text, /上一次 collect 之后新增的修复 diff|新增修复 diff/, file);
  }
});

test('[HR-TC07-8] 无发现不带编号', async () => {
  await eachMatch(codeReviewPaths, /「无发现」不带编号/);
});

test('[HR-TC07-9] S-J 默认驳回且不必进表', async () => {
  await eachMatch(workflowPaths, /S-J 默认驳回且不必进表/);
});

test('[HR-TC07-10] S-J 只报有明确当前成本的问题', async () => {
  await eachMatch(codeReviewPaths, /S-J 只报有明确当前成本的问题/);
});

test('[HR-TC07-11] 对应 spec US 或冻结断言的未核实项必须编号', async () => {
  await eachMatch(codeReviewPaths, /未核实项对应 spec 的 US 或冻结断言时.*\[P-M<n>\]/s);
});

test('[HR-TC07-12] 基线时不存在的新测试路径不算红灯', async () => {
  await eachMatch([...workflowPaths, paths.qaPlanner], /基线时尚不存在的新测试路径.*不算红灯/s);
});

// ---- 车道升级与宿主适用范围（.scratch/qa-workflow-lane-host-scan，ADR-0043、ADR-0044） ----

/** 安装定制段中某个技能的注入段落（从「## N. `技能`」到下一个二级标题） */
async function customizationSection(skill) {
  const text = await read(customizationsPath);
  const start = text.search(new RegExp(`^## \\d+\\. \`${skill}\``, 'm'));
  assert.ok(start >= 0, `${customizationsPath} 缺少 ${skill} 段`);
  const rest = text.slice(start + 1);
  const end = rest.search(/^## /m);
  return end < 0 ? rest : rest.slice(0, end);
}

test('[LH-TC01] 正本、安装正本、implement 与其安装定制段写明车道升级', async () => {
  await eachMatch([...workflowPaths, paths.implement], /车道升级/);
  assert.match(await customizationSection('implement'), /车道升级/);
  for (const file of workflowPaths) {
    const content = await read(file);
    assert.doesNotMatch(content, /后续技能沿用，不重新判定/, file);
    // 只在车道升级要点内查关键词：`/to-tickets` 在车道表格里本来就有
    const points = content.slice(content.indexOf('**车道升级**'), content.indexOf('每个技能收口只写一个'));
    assert.ok(points.length > 0, `${file} 缺少车道升级要点`);
    for (const keyword of ['只升不降', '/to-tickets', 'baseline-upgrade-', '待新基线复验']) {
      assert.ok(points.includes(keyword), `${file} 的车道升级要点缺少 ${keyword}`);
    }
  }
});

test('[LH-TC06] 后续技能收口沿用当前车道，不再沿用阶段 1', async () => {
  for (const file of [paths.toSpec, paths.toTickets, paths.qaPlanner, customizationsPath]) {
    assert.doesNotMatch(await read(file), /沿用阶段 1/, file);
  }
  await eachMatch([paths.toSpec, paths.toTickets, paths.qaPlanner], /沿用当前车道/);
  for (const skill of ['to-spec', 'to-tickets']) assert.match(await customizationSection(skill), /沿用当前车道/, skill);
});

test('[LH-TC07] 正本写明宿主无关凭据协议与审查方式说明字段', async () => {
  for (const file of workflowPaths) {
    const boundary = (await read(file)).split('## 四、')[0].split('## 三、')[1] ?? '';
    assert.match(boundary, /review-package seal/, file);
    assert.match(boundary, /转录（强）/, file);
    assert.match(boundary, /自述凭据（弱）/, file);
    assert.match(boundary, /未核验（人工）/, file);
    assert.match(boundary, /无 challenge 的旧轮次/, file);
  }
  await eachMatch([...workflowPaths, '.claude/skills/code-review/SKILL.md'], /宿主=/);
});

test('planner 与 Spec 对账要求实际谓词可证伪（QA-PROV TC15-1）', async () => {
  const planner = await read(paths.qaPlanner);
  assert.match(planner, /数量、顺序和否定约束/);
  assert.match(planner, /可证伪/);
  for (const file of codeReviewPaths) {
    const content = await read(file);
    assert.match(content, /叶子测试的实际断言/, file);
    assert.match(content, /过程脚本的硬断言/, file);
    assert.match(content, /实现错误[^\n]*仍(?:然)?会通过[^\n]*P-W/, file);
  }
});

test('上游鉴权与额度失败由用户选择处置路径（QA-PROV TC17-1）', async () => {
  const guide = await read(paths.guide);
  assert.match(guide, /阻塞、换 provider、授权当前特性修复或转专项/);
  assert.match(guide, /不得为消除 BLOCKED 擅自修改业务行为/);
});

test('可证伪性补强不新增流程或审查角色（QA-PROV TC15-2）', async () => {
  const [workflow, planner] = await Promise.all([read(paths.workflow), read(paths.qaPlanner)]);
  assert.match(workflow, /\[6\. 双轴审查\]/);
  assert.match(workflow, /Standards[\s\S]*Spec/);
  assert.match(planner, /不额外增加第三名 QA 或裁决代理/);
  assert.doesNotMatch(`${workflow}\n${planner}`, /冻结前独立评审|第三轴|机器语义评分/);
});

test('真实 dogfood 仍是不可冒充的发布门禁（QA-PROV TC17-2）', async () => {
  for (const file of workflowPaths) {
    const content = await read(file);
    assert.match(content, /干净会话的真实 `?\/implement`?/, file);
    assert.match(content, /工具测试与手动派发 reviewer 不冒充/, file);
    assert.match(content, /待发布验收/, file);
  }
});

test('code-review 技能要求子代理自写原文并 seal，主代理不得转抄', async () => {
  for (const file of codeReviewPaths) {
    const content = await read(file);
    assert.match(content, /QA_REVIEW_NONCE/, file);
    assert.match(content, /review-package\.mjs seal/, file);
    assert.match(content, /QA_REVIEW_RECEIPT/, file);
    assert.match(content, /子代理把最终审查内容直接写入/, file);
    assert.match(content, /主代理不转抄、不改写、不重算审查原文/, file);
  }
});

test('新协议取消同轮纠偏且旧轮次明确保留', async () => {
  for (const file of [...codeReviewPaths, ...workflowPaths]) {
    const content = await read(file);
    assert.match(content, /新协议不再允许同轮原文纠偏|新协议不得改原文或重算凭据/, file);
  }
  for (const file of codeReviewPaths) {
    assert.match(await read(file), /无 challenge 的旧轮次仍按旧规则[^\n]*同轮纠偏/, file);
  }
});

test('code-review 技能要求可写审查者并禁止主代理自动无头审查', async () => {
  for (const file of codeReviewPaths) {
    const content = await read(file);
    assert.match(content, /写文件与执行命令权限/, file);
    assert.match(content, /只读探索型代理不得担任审查者/, file);
    assert.match(content, /explore/, file);
    assert.match(content, /coder/, file);
    assert.match(content, /external-session/, file);
    assert.match(content, /主代理不得自动启动 `codex exec`/, file);
    assert.match(content, /派发审查子代理前先选定具备写文件与执行命令权限的 profile/, file);
    assert.match(content, /不重派替代代理/, file);
  }
});

test('工作流文档与安装模板同步凭据协议措辞', async () => {
  const [workflow, template, guide, root, claudeTemplate, glossary] = await Promise.all([
    read(paths.workflow),
    read(paths.workflowTemplate),
    read(paths.guide),
    read(paths.root),
    read(paths.claudeTemplate),
    read('GLOSSARY.md'),
  ]);
  for (const content of [workflow, template]) {
    assert.match(content, /review-challenge\.json/);
    assert.match(content, /review-package seal/);
    assert.match(content, /来源核验/);
  }
  assert.match(guide, /review-challenge\.json|review-package seal/);
  assert.match(guide, /自述凭据（弱）/);
  assert.match(guide, /有 challenge 时子代理自写并 seal/);
  assert.match(guide, /旧轮次由主代理逐字落盘/);
  assert.match(guide, /旧轮次可按真实最终返回同轮纠偏/);
  assert.match(root, /review-package seal/);
  assert.match(claudeTemplate, /review-package seal/);
  assert.match(glossary, /ReviewChallenge/);
  assert.match(glossary, /ReviewSourceReceipt/);
  assert.match(glossary, /SourceVerificationStrength/);
});

test('qa-check 提示把逐字纠偏限定在旧轮次，新协议按新轮次重审', async () => {
  const qaCheck = await read('tooling/scripts/qa-check.mjs');
  assert.match(qaCheck, /旧轮次可按该轮子代理的真实最终返回逐字纠正当轮原文/);
  assert.match(qaCheck, /有 challenge 的新协议按新轮次重新审查/);
  assert.match(qaCheck, /有 challenge 的新协议由子代理自写原文并 seal/);
  assert.doesNotMatch(qaCheck, /只能按该轮子代理的真实最终返回逐字纠正当轮原文/);
});

test('工具脚本与安装模板保持逐字一致且新测试复用既有接缝', async () => {
  for (const name of ['qa-check.mjs', 'review-package.mjs', 'qa-run.mjs', 'qa-spec-review.mjs', 'qa-browser-helper.mjs']) {
    const [tool, template] = await Promise.all([
      read(`tooling/scripts/${name}`),
      read(`.claude/skills/setup-qa-workflow/templates/${name}`),
    ]);
    assert.equal(tool, template, name);
  }
  const schema4 = await read('tooling/scripts/__tests__/qa-check-schema4.test.mjs');
  assert.match(schema4, /receiptRepo/);
  assert.match(schema4, /checkFeature/);
  const reviewPackage = await read('tooling/scripts/__tests__/review-package.test.mjs');
  assert.match(reviewPackage, /seal 生成最小凭据并打印 nonce 与原文哈希/);
});

test('发布契约保留 Claude 强档与 Kimi 弱档真机验收要求', async () => {
  const adr = await read('docs/adr/0048-qa-review-source-receipt.md');
  assert.match(adr, /Claude Code 强档/);
  assert.match(adr, /Kimi Code 弱档/);
  assert.match(adr, /external-session fixture/);
  for (const file of workflowPaths) {
    const content = await read(file);
    assert.match(content, /干净会话的真实 `?\/implement`?/, file);
    assert.match(content, /待发布验收/, file);
  }
});

test('ADR-0057 正本与安装正本同步对账覆盖、视觉目标、空证据和收口门禁', async () => {
  for (const file of [paths.workflow, paths.workflowTemplate]) {
    const content = await read(file);
    for (const required of [
      'QA Review Coverage: 1', 'spec-review-checklist.json', '对账覆盖', '变更成立',
      'VisualTarget', 'EMPTY_EVIDENCE', '计划新建路径', 'VERIFICATION_BEFORE_REVIEW', 'gate-plan-',
    ]) {
      assert.match(content, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), file);
    }
  }
  const workflow = await read(paths.workflow);
  assert.ok(workflow.trim().split('\n').length <= 180);
});

test('ADR-0057 审查与实现技能落实降噪、失败暂停和最终时序', async () => {
  const review = await read('.claude/skills/code-review/SKILL.md');
  assert.match(review, /对账覆盖/);
  assert.match(review, /变更成立/);
  assert.match(review, /quota|配额/);
  assert.match(review, /不自动换模型/);
  assert.match(review, /不逐 hunk|不逐文件/);
  for (const file of [paths.implement, paths.implementSpec]) {
    const content = await read(file);
    assert.match(content, /当前独立审查/);
    assert.match(content, /完成后/);
    assert.match(content, /gate-review-/);
  }
});

test('ADR-0057 门禁日志、backlog 与发布验收状态同步', async () => {
  for (const file of [paths.root, paths.claudeTemplate, paths.qaPlanner]) {
    const content = await read(file);
    assert.match(content, /gate-plan-|gate-acceptance-|gate-review-/);
  }
  const backlog = await read('docs/plans/qa-workflow-backlog.md');
  assert.match(backlog, /QA-WF-05[\s\S]*?已实现/);
  assert.match(backlog, /QA-WF-01[\s\S]*?待发布验收|待执行/);
  const report = await read('docs/reports/qa-workflow-evolution-report.md');
  assert.match(report, /ADR-0057/);
  assert.match(report, /待发布验收/);
});
