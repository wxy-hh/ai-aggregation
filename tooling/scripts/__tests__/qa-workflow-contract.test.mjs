import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
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
  assert.ok(root.trim().split('\n').length <= 65);
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
  for (const required of ['qa-check.mjs', 'review-package.mjs', 'qa-run.mjs', 'qa-spec-review.mjs', 'qa-preflight.mjs', 'qa-browser-helper.mjs', 'captureTargetGeometry', 'gate-plan-*']) {
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
    assert.match(text, /不允许同轮原文纠偏|不再允许同轮原文纠偏/);
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

test('[ADR-0066] 取代 HR-TC07-7：复审启用相邻快照机器 delta.diff 并保留全量快照基线', async () => {
  for (const file of [...workflowPaths, ...codeReviewPaths]) {
    const text = await read(file);
    assert.match(text, /review-package-delta\.diff/, file);
    assert.match(text, /全量/, file);
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
    assert.match(boundary, /MISSING_REVIEW_CHALLENGE/, file);
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

test('统一 challenge 单轨协议禁止同轮原文纠偏且写明缺 challenge 阻断', async () => {
  for (const file of [...codeReviewPaths, ...workflowPaths]) {
    const content = await read(file);
    assert.match(content, /不再允许同轮原文纠偏|不允许同轮原文纠偏|不得改原文或重算凭据/, file);
  }
  for (const file of codeReviewPaths) {
    assert.match(await read(file), /MISSING_REVIEW_CHALLENGE/, file);
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
  assert.match(guide, /由子代理自写原文并 `seal`/);
  assert.match(guide, /MISSING_REVIEW_CHALLENGE/);
  assert.match(root, /review-package seal/);
  assert.match(claudeTemplate, /review-package seal/);
  assert.match(glossary, /ReviewChallenge/);
  assert.match(glossary, /ReviewSourceReceipt/);
  assert.match(glossary, /SourceVerificationStrength/);
});

test('qa-check 提示禁止同轮改写或重算凭据，缺 challenge 时阻断为 MISSING_REVIEW_CHALLENGE', async () => {
  const [provenance, triage] = await Promise.all([
    read('tooling/scripts/qa-check/provenance.mjs'),
    read('tooling/scripts/qa-check/review-triage.mjs'),
  ]);
  const combined = `${provenance}\n${triage}`;
  assert.match(combined, /凭据不得由主代理改写或重算/);
  assert.match(combined, /不得自行补写原文或编号/);
  assert.match(combined, /MISSING_REVIEW_CHALLENGE/);
  assert.match(combined, /无 challenge 旧双轨已日落/);
  assert.doesNotMatch(combined, /只能按该轮子代理的真实最终返回逐字纠正当轮原文|旧轮次可按该轮子代理的真实最终返回/);
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
  assert.match(backlog, /QA-WF-05[\s\S]*?(?:已实现|已完成)/);
  assert.match(backlog, /QA-WF-01[\s\S]*?已完成[\s\S]*?Phase 3/);
  const report = await read('docs/reports/qa-workflow-evolution-report.md');
  assert.match(report, /ADR-0057/);
  assert.match(report, /ADR-0066[\s\S]*?Phase 3|Phase 3[\s\S]*?ADR-0066/);
});

test('P0-TC06-1 setup-qa-workflow 将 triage-labels.md 标为仅安装 triage 时必选', async () => {
  const setup = await read(paths.setup);
  assert.match(setup, /docs\/agents\/issue-tracker\.md.*domain\.md/);
  assert.match(setup, /仅.*安装.*`?triage`?.*必选[\s\S]*triage-labels\.md|triage-labels\.md.*仅.*安装.*`?triage`?.*必选/);
});

test('P0-TC06-2 qa-workflow-guide 人工独占表包含 to-tickets 与 retro，自动调用表不再含 retro', async () => {
  const guide = await read(paths.guide);
  const manualMatch = guide.match(/\| 只能人工敲的命令 \|[\s\S]*?\n\n/);
  const autoMatch = guide.match(/\| 模型可自动调用、人也可手动调用 \|[\s\S]*?\n\n/);
  assert.ok(manualMatch, '缺少「只能人工敲的命令」表');
  assert.ok(autoMatch, '缺少「模型可自动调用、人也可手动调用」表');
  assert.match(manualMatch[0], /\/to-tickets/);
  assert.match(manualMatch[0], /\/retro/);
  assert.doesNotMatch(autoMatch[0], /\bretro\b/);
  assert.match(autoMatch[0], /qa-test-planner/);
});

test('P0-TC06-3 qa-check 与模板逐字一致且不再残留不存在的 qa:run 提示', async () => {
  const [script, template] = await Promise.all([
    read('tooling/scripts/qa-check.mjs'),
    read('.claude/skills/setup-qa-workflow/templates/qa-check.mjs'),
  ]);
  assert.equal(script, template, 'qa-check.mjs 与安装模板须逐字一致');
  assert.doesNotMatch(script, /\bqa:run\b/);
});

test('P0-TC06-4 security 与 git-workflow 规则清理失效智能体、未使用语言和错误大小写引用', async () => {
  const [security, gitWorkflow] = await Promise.all([
    read('.claude/rules/security.md'),
    read('.claude/rules/git-workflow.md'),
  ]);
  assert.doesNotMatch(security, /security-reviewer/);
  for (const unused of ['.vue', '.svelte', '.astro', '.py', '.go', '.java', '.kt', '.cs', '.php', '.rb', '.rs']) {
    assert.ok(!security.includes(unused), `security.md 仍残留未使用扩展名 ${unused}`);
  }
  assert.doesNotMatch(gitWorkflow, /Agents\.md/);
  assert.match(gitWorkflow, /AGENTS\.md/);
});

test('P1-TC07-1 diagnosing-bugs 与 resolving-merge-conflicts 尾部补齐项目定制并同步 skill-customizations', async () => {
  const [diag, merge, custom] = await Promise.all([
    read('.claude/skills/diagnosing-bugs/SKILL.md'),
    read('.claude/skills/resolving-merge-conflicts/SKILL.md'),
    read(customizationsPath),
  ]);
  assert.match(diag, /上游升级时保留/);
  assert.match(diag, /QA Kind:\s*fix/);
  assert.match(diag, /修复前复现/);
  assert.match(diag, /qa-run/);
  assert.match(merge, /上游升级时保留/);
  assert.match(merge, /用户确认/);
  assert.match(merge, /git-workflow\.md/);
  assert.match(custom, /diagnosing-bugs[\s\S]*?QA Kind:\s*fix[\s\S]*?修复前复现/);
  assert.match(custom, /resolving-merge-conflicts[\s\S]*?用户确认/);
});

test('P1-TC07-2 deploy-prod 预检核对终审状态，to-tickets 与 code-review 补齐上游升级保留标记', async () => {
  const [deploy, tickets, review] = await Promise.all([
    read('.claude/skills/deploy-prod/SKILL.md'),
    read(paths.toTickets),
    read('.claude/skills/code-review/SKILL.md'),
  ]);
  assert.match(deploy, /qa-check review[\s\S]*?人工终审|人工终审[\s\S]*?qa-check review/);
  assert.match(tickets, /上游升级时保留/);
  assert.match(review, /上游升级时保留/);
});

test('P1-TC07-3 ask-matt 清理不存在的上游技能并收录本仓核心技能，teach GLOSSARY 修正为 GLOSSARY.md', async () => {
  const [askMatt, teachGlossary] = await Promise.all([
    read('.claude/skills/ask-matt/SKILL.md'),
    read('docs/teach/qa-workflow/GLOSSARY.md'),
  ]);
  for (const obsolete of ['/to-questionnaire', '/wait-what', '/writing-for-agents']) {
    assert.ok(!askMatt.includes(obsolete), `ask-matt 仍包含本仓不存在技能 ${obsolete}`);
  }
  for (const present of ['writing-great-skills', 'qa-test-planner', 'setup-qa-workflow', 'deploy-prod']) {
    assert.ok(askMatt.includes(present), `ask-matt 缺少本仓核心技能 ${present}`);
  }
  assert.doesNotMatch(teachGlossary, /落盘至\s*CONTEXT\.md/);
  assert.match(teachGlossary, /落盘至\s*GLOSSARY\.md/);
});

test('P1-TC07-4 qa-check、qa-spec-review、qa-preflight 与 qa-browser-helper 脚本均与安装模板逐字一致', async () => {
  for (const name of ['qa-check.mjs', 'qa-spec-review.mjs', 'qa-preflight.mjs', 'qa-browser-helper.mjs']) {
    const [tool, template] = await Promise.all([
      read(`tooling/scripts/${name}`),
      read(`.claude/skills/setup-qa-workflow/templates/${name}`),
    ]);
    assert.equal(tool, template, `${name} 与安装模板不一致`);
  }
});

test('ADR-0065 v2.1 正本、模板与技能同步对账 v2、双指纹免重跑、preflight 与 0 子代理硬拦截', async () => {
  const adr = await read('docs/adr/0065-qa-workflow-v2-review-ergonomics.md');
  assert.match(adr, /修订并局部取代 ADR-0057/);
  for (const file of [paths.workflow, paths.workflowTemplate]) {
    const content = await read(file);
    for (const token of [
      'QA Review Coverage: 2',
      'spec-review-skeleton.md',
      'qa-preflight',
      'qaArtifactsDigest',
      'STALE_QA_ARTIFACTS',
      'REVIEW_PROVENANCE_UNVERIFIED',
      'ADR-0065',
    ]) {
      assert.match(content, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), file);
    }
  }
  const setup = await read(paths.setup);
  assert.match(setup, /templates\/qa-preflight\.mjs/);
  const reviewSkill = await read('.claude/skills/code-review/SKILL.md');
  assert.match(reviewSkill, /抽检范围/);
  assert.match(reviewSkill, /±5/);
});

test('[v2.2-TC01-1] ADR-0066 确立上限 r2、三暂停终态、DESIGN 分层并取代 HR-TC07-7 与 180 行上限', async () => {
  const adr = await read('docs/adr/0066-qa-workflow-v2-2-immutable-review-and-incremental-closure.md');
  for (const token of [
    'HR-TC07-7',
    'WAITING_HUMAN',
    'PACKAGE_INVALID',
    'WAITING_INFRA',
    'SUPERSEDED',
    'FINDING_ID_COLLISION',
    'reviewUnits',
    '--allow-manual-round',
    '180 行',
    'DESIGN.md',
  ]) {
    assert.match(adr, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('[v2.2-TC01-2] 正本、模板与核心技能同步 Batch 0 冻结屏障、错误路由、r2 上限与删无限重试', async () => {
  for (const file of [
    ...workflowPaths,
    ...codeReviewPaths,
    paths.implement,
    paths.implementSpec,
    paths.guide,
  ]) {
    const content = await read(file);
    assert.doesNotMatch(content, /直至打印\s*`?QA_REVIEW_RECEIPT`?/, `${file} 不得保留无限 seal 重试措辞`);
    assert.match(content, /WAITING_HUMAN/, file);
    assert.match(content, /--allow-manual-round|人工显式授权|人工授权/, file);
  }
  for (const file of [...workflowPaths, ...codeReviewPaths]) {
    const content = await read(file);
    assert.match(content, /SUPERSEDED/, file);
    assert.match(content, /REVIEWER_EDITABLE/, file);
    assert.match(content, /PACKAGE_INVALID/, file);
    assert.match(content, /INFRA_UNAVAILABLE/, file);
    assert.match(content, /FINDING_ID_COLLISION/, file);
    assert.match(content, /scaffold-report/, file);
    assert.match(content, /reviewUnits/, file);
    assert.match(content, /--executor/, file);
  }
  for (const file of [paths.implement, paths.implementSpec]) {
    const content = await read(file);
    assert.match(content, /REVIEWER_EDITABLE/, file);
    assert.match(content, /PACKAGE_INVALID/, file);
    assert.match(content, /INFRA_UNAVAILABLE/, file);
    assert.match(content, /WAITING_INFRA/, file);
  }
  const customizations = await read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md');
  const implementSec = customizations.slice(customizations.indexOf('## 2.'), customizations.indexOf('## 3.'));
  const implementSpecSec = customizations.slice(customizations.indexOf('## 3.'), customizations.indexOf('## 4.'));
  for (const [label, sec] of [['implement 定制段', implementSec], ['implement-spec 定制段', implementSpecSec]]) {
    assert.match(sec, /REVIEWER_EDITABLE/, label);
    assert.match(sec, /PACKAGE_INVALID/, label);
    assert.match(sec, /INFRA_UNAVAILABLE/, label);
    assert.match(sec, /WAITING_INFRA/, label);
  }
  assert.match(await read(paths.workflow), /自动上限\s*1\s*轮/);
  assert.match(await read(paths.workflowTemplate), /自动上限\s*1\s*轮/);
});

test('[v2.2-TC02-1] OPT-15 瘦身 CLAUDE 门禁段且 OPT-17 清零教学文档真机旧词与安装器技能清单', async () => {
  for (const file of [paths.root, paths.claudeTemplate]) {
    const content = await read(file);
    assert.match(content, /自动上限\s*1\s*轮/);
    assert.match(content, /WAITING_HUMAN/);
  }
  for (const teachFile of [
    'docs/teach/qa-workflow/MISSION.md',
    'docs/teach/qa-workflow/RESOURCES.md',
    'docs/teach/qa-workflow/GLOSSARY.md',
  ]) {
    const text = await read(teachFile);
    assert.doesNotMatch(text, /真机/, `${teachFile} 不得残留「真机」旧词`);
    assert.match(text, /Playwright|标准车道|上限/, teachFile);
  }
  const setup = await read(paths.setup);
  assert.match(setup, /diagnosing-bugs/);
  assert.match(setup, /resolving-merge-conflicts/);
});

test('[v2.2-TC02-2] DESIGN.md 与 code-review 显式分层 S-H 阻断红线与 S-J 建议，不做前缀硬锁', async () => {
  const design = await read('DESIGN.md');
  assert.match(design, /审查分级指引/);
  assert.match(design, /S-H/);
  assert.match(design, /S-J/);
  const reviewSkill = await read('.claude/skills/code-review/SKILL.md');
  assert.match(reviewSkill, /真实产品行为|生命周期/);
  assert.match(reviewSkill, /默认驳回/);
  assert.doesNotMatch(reviewSkill, /机器硬锁所有\s*S-J/);
});

test('[v2.2-TC09-2] v2.2 四个核心工具脚本与安装模板逐字节一致且 README 同步新契约', async () => {
  for (const name of ['qa-run.mjs', 'qa-check.mjs', 'qa-spec-review.mjs', 'review-package.mjs']) {
    const [tool, template] = await Promise.all([
      read(`tooling/scripts/${name}`),
      read(`.claude/skills/setup-qa-workflow/templates/${name}`),
    ]);
    assert.equal(tool, template, `${name} 与安装模板不一致`);
  }
  const readme = await read('tooling/scripts/README.md');
  for (const token of [
    '--executor',
    'round-snapshots',
    'SUPERSEDED',
    'review-package-delta.diff',
    'review-brief.md',
    'reviewUnits',
    'scaffold-report',
    'FINDING_ID_COLLISION',
    '--allow-manual-round',
    'WAITING_HUMAN',
  ]) {
    assert.match(readme, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `README.md 缺少契约 ${token}`);
  }
});

test('[v2.2-P2-TC01-1] 规划期减法约束 P0 与 browser 成本边界', async () => {
  const content = await read(paths.qaPlanner);
  assert.match(content, /保持契约 \+ 既有回归测试集合/);
  assert.match(content, /安全、权限、计费、核心主链路与不可恢复风险/);
  assert.match(content, /不得[^\n]*存量[^\n]*(?:自动|泛化)[^\n]*P0/);
  assert.match(content, /1–3 条核心主链路/);
  assert.match(content, /15 分钟[^\n]*换接缝[^\n]*停损/);
});

test('[v2.2-P2-TC03-1] handoff 同路径交接保留唯一历史快照', async () => {
  for (const file of ['.claude/skills/handoff/SKILL.md', '.claude/skills/setup-qa-workflow/templates/skill-customizations.md']) {
    const content = await read(file);
    assert.match(content, /写入前[^\n]*(?:已存在|同路径)/, file);
    assert.match(content, /时间戳[^\n]*历史快照/, file);
    assert.match(content, /不得覆写|禁止覆写/, file);
    assert.match(content, /连续两次[^\n]*(?:保留|可读)[^\n]*(?:两份|早期|历史)/, file);
  }
});

test('[v2.2-P2-TC03-2] handoff 强绑定 qa-check 与单测原始日志', async () => {
  for (const file of ['.claude/skills/handoff/SKILL.md', '.claude/skills/setup-qa-workflow/templates/skill-customizations.md']) {
    const content = await read(file);
    assert.match(content, /最新[^\n]*qa-check[^\n]*单测/, file);
    assert.match(content, /命令[^\n]*日志相对路径[^\n]*原始结果行/, file);
    assert.match(content, /缺少任一项[^\n]*不得宣称[^\n]*完整/, file);
  }
});

test('[v2.2-P2-TC07-1] implement 阶段 5 前强制预检并推荐局部切片编辑', async () => {
  for (const file of [paths.implement, '.claude/skills/setup-qa-workflow/templates/skill-customizations.md']) {
    const content = await read(file);
    assert.match(content, /进入阶段 5 前[^\n]*qa-preflight/, file);
  }
  const guide = await read(paths.guide);
  assert.match(guide, /多全角标点[^\n]*局部切片编辑/);
});

test('[v2.2-P2-TC10-1] 两份蓝图同步记录 v2.2 全周期提交链与 Phase 3 发布验收完成', async () => {
  for (const file of [
    'docs/plans/gemini4-2026-11-26-qa-workflow-v2.2-code-review-root-cause-and-optimization.md',
    'docs/plans/2026-11-22-qa-workflow-optimization-plan.md',
  ]) {
    const header = (await read(file)).split('\n').slice(0, 12).join('\n');
    assert.match(header, /Phase 1[^\n]*07ef09d/, file);
    assert.match(header, /Phase 2[^\n]*d463e90/, file);
    assert.match(header, /Phase 2\.5[^\n]*9be2aa9/, file);
    assert.match(header, /Phase 3[^\n]*(?:发布验收|双对照)/, file);
    assert.doesNotMatch(header, /当前推进 Phase 2|均待发布验收|暂标「待发布验收」/, file);
  }
});

test('[v2.2-P2-TC10-2] 核心脚本保持模板逐字一致、零外部依赖与 OBS 文档', async () => {
  for (const name of ['qa-run.mjs', 'qa-check.mjs', 'qa-spec-review.mjs', 'review-package.mjs', 'qa-preflight.mjs', 'qa-browser-helper.mjs']) {
    const tool = await read(`tooling/scripts/${name}`);
    const template = await read(`.claude/skills/setup-qa-workflow/templates/${name}`);
    assert.equal(template, tool, `${name} 与模板不一致`);
    assert.doesNotMatch(template, /@repo\/web|AI 聚合平台|test_user/, `${name} 模板含本仓私货`);
    for (const match of template.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('.'), `${name} 引入外部依赖 ${match[1]}`);
    }
  }
  const check = await read('tooling/scripts/qa-check.mjs');
  assert.match(check, /export async function checkFeature/);
  const [srcModules, tplModules] = await Promise.all([
    readdir('tooling/scripts/qa-check').then((names) => names.filter((n) => n.endsWith('.mjs')).sort()),
    readdir('.claude/skills/setup-qa-workflow/templates/qa-check').then((names) => names.filter((n) => n.endsWith('.mjs')).sort()),
  ]);
  assert.deepEqual(tplModules, srcModules, 'qa-check 子模块目录与模板不一致');
  for (const mod of srcModules) {
    const [toolMod, tplMod] = await Promise.all([
      read(`tooling/scripts/qa-check/${mod}`),
      read(`.claude/skills/setup-qa-workflow/templates/qa-check/${mod}`),
    ]);
    assert.equal(tplMod, toolMod, `qa-check/${mod} 与模板不一致`);
    assert.doesNotMatch(tplMod, /@repo\/web|AI 聚合平台|test_user/, `qa-check/${mod} 模板含本仓私货`);
    for (const match of tplMod.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('.'), `qa-check/${mod} 引入外部依赖 ${match[1]}`);
    }
  }
  const readme = await read('tooling/scripts/README.md');
  for (const token of ['snapshotHash', 'dispatchedAt', 'sealAttempts', 'diffBytes', 'repairAndWaitMs', 'assertNoRateLimit', 'cropPngViewport', 'DESIGN_ROUTE_UNREGISTERED']) {
    assert.match(readme, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `README 缺少 ${token}`);
  }
});


test('[v2.2-P2-TC10-4] 截图与预检的权威文档和模块注释保持同义', async () => {
  const [workflow, guide, helper, readme] = await Promise.all([
    read('docs/agents/qa-workflow.md'),
    read('docs/agents/qa-workflow-guide.md'),
    read('tooling/scripts/qa-browser-helper.mjs'),
    read('tooling/scripts/README.md'),
  ]);
  for (const text of [workflow, guide, helper]) {
    assert.match(text, /locator\.screenshot\(\)/);
    assert.match(text, /退化/);
  }
  assert.match(workflow, /必须完成一次 `node tooling\/scripts\/qa-preflight\.mjs/);
  assert.match(helper, /resolveBaseUrl\(\)/);
  assert.match(helper, /assertNoRateLimit\(\)/);
  assert.match(readme, /`durationMs`/);
});

test('TC07-1 核心脚本与安装模板保持逐字节一致', async () => {
  const names = ['qa-spec-review.mjs', 'review-package.mjs', 'qa-run.mjs', 'qa-check/review-triage.mjs'];
  for (const name of names) {
    const [tool, template] = await Promise.all([
      read(`tooling/scripts/${name}`),
      read(`.claude/skills/setup-qa-workflow/templates/${name}`),
    ]);
    assert.equal(template, tool, name);
    for (const match of template.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('.'), `${name} 引入外部依赖 ${match[1]}`);
    }
  }
});

test('TC07-2 审查格式错误处理与 startedAt 指引同步', async () => {
  const [review, customizations, workflow, workflowTemplate, guide, readme] = await Promise.all([
    read('.claude/skills/code-review/SKILL.md'),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
    read('docs/agents/qa-workflow.md'),
    read('.claude/skills/setup-qa-workflow/templates/qa-workflow.md'),
    read('docs/agents/qa-workflow-guide.md'),
    read('tooling/scripts/README.md'),
  ]);
  for (const content of [review, customizations]) {
    assert.match(content, /## S-H1/);
    assert.match(content, /## \[S-H1\]/);
    assert.match(content, /方括号编号引用/);
  }
  for (const content of [workflow, workflowTemplate, guide]) {
    assert.match(content, /\[qa-run\]\[ERROR\]/);
    assert.match(content, /本次.*退出状态/);
  }
  assert.match(guide, /旧日志/);
  assert.match(readme, /startedAt[\s\S]*不冒称模型真实派发、开始工作或推理时长/);
});

test('S2-TC05-1 步骤 2 修改的全部核心脚本与安装模板逐字节一致且无外部依赖', async () => {
  const names = [
    'qa-spec-review.mjs',
    'qa-run.mjs',
    'qa-check.mjs',
    'review-package.mjs',
    'qa-check/spec-coverage.mjs',
    'qa-check/review-triage.mjs',
  ];
  for (const name of names) {
    const [tool, template] = await Promise.all([
      read(`tooling/scripts/${name}`),
      read(`.claude/skills/setup-qa-workflow/templates/${name}`),
    ]);
    assert.equal(template, tool, `${name} 与安装模板不一致`);
    for (const match of template.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      assert.ok(match[1].startsWith('node:') || match[1].startsWith('.'), `${name} 引入外部依赖 ${match[1]}`);
    }
  }
});

test('S2-TC05-2 工作流正本指南技能与说明同步新鲜度预检 WAITING_HUMAN 停手白名单双轴分歧与真源认领', async () => {
  const [workflow, workflowTemplate, guide, reviewSkill, implementSkill, customizations, readme] = await Promise.all([
    read(paths.workflow),
    read(paths.workflowTemplate),
    read(paths.guide),
    read('.claude/skills/code-review/SKILL.md'),
    read(paths.implement),
    read('.claude/skills/setup-qa-workflow/templates/skill-customizations.md'),
    read('tooling/scripts/README.md'),
  ]);

  for (const text of [workflow, workflowTemplate]) {
    assert.match(text, /evidenceTree/);
    assert.match(text, /qaPlanDigest/);
    assert.match(text, /ASSERTION_BLOCKED/);
    assert.match(text, /不在 `collect`[^\n]*重跑/);
    assert.match(text, /WAITING_HUMAN[^\n]*白名单|停手白名单/);
    assert.match(text, /双轴分歧对照/);
    assert.match(text, /UNREVIEWED_FIX_CLAIM/);
    assert.match(text, /\.source\.json[^\n]*哈希|SHA-256/);
  }
  assert.match(guide, /evidenceTree/);
  assert.match(guide, /ASSERTION_BLOCKED/);
  assert.match(guide, /停手白名单/);
  assert.match(guide, /双轴分歧对照/);
  assert.match(guide, /UNREVIEWED_FIX_CLAIM/);
  assert.match(guide, /\.source\.json/);

  for (const text of [reviewSkill, customizations]) {
    assert.match(text, /\.source\.json[^\n]*(?:哈希|SHA-256)[^\n]*真源/);
    assert.match(text, /禁止重派/);
  }
  for (const text of [implementSkill, customizations]) {
    assert.match(text, /WAITING_HUMAN[^\n]*停手白名单/);
    assert.match(text, /双轴分歧对照/);
  }
  for (const token of ['evidenceTree', 'qaPlanDigest', 'isFreshAcceptanceGateLog', 'UNREVIEWED_FIX_CLAIM', '双轴分歧对照']) {
    assert.match(readme, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('S3-TC01-1 基线默认只读、一次聚合汇报与 tracked/本机环境分界（保留车道升级红灯规则）', async () => {
  const targets = [
    paths.workflow,
    paths.workflowTemplate,
    paths.qaPlanner,
    paths.implement,
    customizationsPath,
    paths.guide,
  ];
  for (const file of targets) {
    const content = await read(file);
    assert.match(content, /默认只读/, file);
    assert.match(content, /一次聚合汇报/, file);
    assert.match(content, /tracked/, file);
    assert.match(content, /本机环境恢复/, file);
    assert.match(content, /一次(?:明确)?确认/, file);
  }
  for (const file of [paths.workflow, paths.workflowTemplate, paths.guide]) {
    assert.match(await read(file), /baseline-upgrade-\*[^\n]*基线红灯先问用户/, file);
  }
});

test('S3-TC02-1 测试使用生产不存在事件或形状导致假绿定级为 P-W 或 S-H 且不得归作 S-J', async () => {
  const targets = [
    '.claude/skills/code-review/SKILL.md',
    customizationsPath,
    paths.workflow,
    paths.workflowTemplate,
    paths.guide,
  ];
  for (const file of targets) {
    const content = await read(file);
    assert.match(content, /生产不存在[^\n]*(?:事件|形状)/, file);
    assert.match(content, /假绿/, file);
    assert.match(content, /不得归作\s*`?S-J`?/, file);
    assert.match(content, /P-W.*S-H|S-H.*P-W/, file);
  }
});

test('S3-TC02-2 测试夹具优先共享强类型契约与有出处生产形状样本，不跨 app 强引内部构造器且不泛化要求低风险测试走真实工厂', async () => {
  const targets = [
    '.claude/skills/code-review/SKILL.md',
    customizationsPath,
    paths.qaPlanner,
    paths.workflow,
    paths.workflowTemplate,
    paths.guide,
  ];
  for (const file of targets) {
    const content = await read(file);
    assert.match(content, /共享强类型契约/, file);
    assert.match(content, /有出处的生产形状样本/, file);
    assert.match(content, /不跨 app 强引[^\n]*构造器/, file);
    assert.match(content, /不(?:规定|泛化)[^\n]*低风险测试[^\n]*真实工厂/, file);
  }
});

test('S3-TC03-1 保留 grilling 一次一问协议且选项涉及生产事件持久化公共契约时先读实现再问人', async () => {
  const grilling = await read('.claude/skills/grilling/SKILL.md');
  assert.match(grilling, /Ask the questions one at a time, waiting for feedback on each question before continuing\./);
  assert.doesNotMatch(grilling, /合并多题/);
  const targets = [paths.grill, paths.workflow, paths.workflowTemplate, paths.guide];
  for (const file of targets) {
    const content = await read(file);
    assert.match(content, /一次一问/, file);
    assert.match(content, /不合并多题/, file);
    assert.match(content, /先读(?:对应)?实现再问人|先查阅对应实现[^\n]*再向用户提问/, file);
    assert.match(content, /生产事件/, file);
    assert.match(content, /持久化/, file);
    assert.match(content, /公共契约/, file);
  }
});

test('S3-TC03-2 to-spec 与工作流明确删除实现步骤型 US，qa-test-planner 与工作流要求 init 前检查断言互斥与可证伪', async () => {
  for (const file of [paths.toSpec, customizationsPath, paths.workflow, paths.workflowTemplate]) {
    assert.match(await read(file), /删除实现步骤型/, file);
  }
  for (const file of [paths.qaPlanner, paths.workflow, paths.workflowTemplate]) {
    const content = await read(file);
    assert.match(content, /互相矛盾/, file);
    assert.match(content, /可证伪/, file);
  }
});

test('S3-TC04-1 工作流技能与指南控制单批审查交付面不一次性捆审多个高风险独立主题', async () => {
  for (const file of [paths.workflow, paths.workflowTemplate, paths.toSpec, customizationsPath, paths.guide]) {
    const content = await read(file);
    assert.match(content, /单批审查交付面/, file);
    assert.match(content, /不[^\n]*(?:一次性)?捆(?:绑)?审[^\n]*高风险独立主题/, file);
  }
});

test('S3-TC04-2 prompt-shortcuts 与工作流限定 Advisor 仅在设计冻结前找核心反例且截断不可用额度耗尽不自动重取', async () => {
  const targets = [
    'docs/agents/prompt-shortcuts.md',
    '.claude/skills/setup-qa-workflow/templates/prompt-shortcuts.md',
    paths.workflow,
    paths.workflowTemplate,
    paths.guide,
  ];
  for (const file of targets) {
    const content = await read(file);
    assert.match(content, /Advisor/, file);
    assert.match(content, /设计冻结前/, file);
    assert.match(content, /核心反例/, file);
    assert.match(content, /截断[^\n]*不可用[^\n]*额度耗尽[^\n]*不自动(?:重试|重取)/, file);
  }
});

test('S3-TC04-3 CLAUDE 根规则模板工作流与实现技能收口状态变化只写一行中文且 CLAUDE 不超 65 行', async () => {
  const root = await read(paths.root);
  assert.ok(root.trim().split('\n').length <= 65);
  const targets = [
    paths.root,
    paths.claudeTemplate,
    paths.workflow,
    paths.workflowTemplate,
    paths.implement,
    customizationsPath,
    paths.guide,
  ];
  for (const file of targets) {
    assert.match(await read(file), /状态变化[^\n]*只写一行中文/, file);
  }
});

test('S3-TC05-1 步骤 3 修改的安装模板不含本仓私货且保留模板专有占位符与段落', async () => {
  const [directive, workflowTpl, shortcutsTpl, customTpl] = await Promise.all([
    read(paths.claudeTemplate),
    read(paths.workflowTemplate),
    read('.claude/skills/setup-qa-workflow/templates/prompt-shortcuts.md'),
    read(customizationsPath),
  ]);
  for (const content of [directive, workflowTpl, shortcutsTpl, customTpl]) {
    assert.doesNotMatch(content, /@repo\/web|test_user|AI 聚合平台|pnpm (?:qa:|dev:probe|test:tooling)/);
  }
  for (const token of ['{DEV_COMMAND}', '{WEB_PORT}', '{E2E_COMMAND}', '{TEST_COMMAND}']) {
    assert.match(workflowTpl, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(workflowTpl, /默认只读/);
  assert.match(workflowTpl, /不得归作\s*`?S-J`?/);
  assert.match(shortcutsTpl, /### 批量冲刺/);
  assert.match(shortcutsTpl, /Advisor/);
  assert.match(directive, /\{CORE_LINKS\}/);
  assert.match(directive, /状态变化[^\n]*只写一行中文/);
  assert.match(customTpl, /\{CORE_LINKS\}/);
  assert.match(customTpl, /删除实现步骤型/);
  assert.match(customTpl, /共享强类型契约/);
});
