# QA 对账覆盖与收口证据 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. 本仓默认单会话串行，本次实际使用 inline + `tdd`，不派实现子代理。
**Goal:** 为 QA 工作流补齐 Spec 对账覆盖、显式视觉目标、非空证据、计划路径校验、交付时序和门禁日志。
**Architecture:** 新增零依赖纯函数 module 处理清单与覆盖表；qa-check 负责文件系统/Git 事实核验；review-package 只声明清单版本与校验开工范围；浏览器 Helper 复用单一显式目标截图原语。新 manifest 声明启用新门禁，旧审查包保持兼容。
**Tech Stack:** Node.js ESM、`node:test`、Vitest 无关、Playwright、现有 qa-run/qa-check/review-package。

## Global Constraints

- 只使用 QA Schema 4，不新增依赖、Hook、HMAC、自动重试或语义正则裁判。
- 所有代码注释与文档使用中文，做最小正确改动。
- 每个实现切片先 qa-run 红灯后绿灯；同名日志不覆盖。
- 不自动 commit/push，不改 C8/C9 历史产物，不把工具测试冒充发布 dogfood。
- 正本不超过 180 行，三个既有核心脚本与安装模板逐字一致，新 module 同步分发。

### Task 1: SpecReviewChecklist 纯函数与审查覆盖门禁

**Files:**
- Create: `tooling/scripts/qa-spec-review.mjs`
- Create: `tooling/scripts/__tests__/qa-spec-review.test.mjs`
- Modify: `tooling/scripts/qa-check.mjs`
- Modify: `tooling/scripts/review-package.mjs`
- Create: `.claude/skills/setup-qa-workflow/templates/qa-spec-review.mjs`

**Interfaces:**
- Produces: `SPEC_REVIEW_CHECKLIST_FILE`、`SPEC_REVIEW_CHECKLIST_VERSION`、`specReviewChecklistDocument(table)`、`parseSpecReviewChecklist(text)`、`parseSpecReviewCoverage(markdown)`。
- Consumes: reconciliation 内部行增加 `seam`、`sourceCandidates`、`changed`，不改变 Markdown 对账表列。

- [ ] **Step 1: 写纯函数失败测试**

```js
const checklist = JSON.parse(specReviewChecklistDocument([{ id: 'TC01-1', actual: '`a.test.mjs` › 用例', changed: false }]));
assert.equal(checklist.version, 1);
assert.deepEqual(parseSpecReviewCoverage(`## 对账覆盖
| 审查项 | 对账实测值或绑定 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |
| --- | --- | --- | --- | --- |
| TC01-1 | \`a.test.mjs\` › 用例 | 已核实 | \`a.test.mjs:3\` 比较实际值 | 不适用 |`).rows[0].ids, ['TC01-1']);
```

- [ ] **Step 2: 运行红灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity red-ticket-01 -- node --test tooling/scripts/__tests__/qa-spec-review.test.mjs
```

预期：模块不存在或缺少覆盖表解析，exit 非零。

- [ ] **Step 3: 实现最小纯函数 module**

```js
export const SPEC_REVIEW_CHECKLIST_VERSION = 1;
export const SPEC_REVIEW_CHECKLIST_FILE = '_qa/spec-review-checklist.json';
export function specReviewChecklistDocument(table) {
  return `${JSON.stringify({ version: 1, rows: table.map(({ id, status, assertion, actual, seam, sourceCandidates = [], changed }) => ({ id, status, assertion, actual, seam, sourceCandidates, changed })) }, null, 2)}\n`;
}
export function parseSpecReviewChecklist(text) {
  const value = JSON.parse(text);
  if (value?.version !== 1 || !Array.isArray(value.rows)) throw new Error('无效 Spec 审查清单');
  return value;
}
export function parseSpecReviewCoverage(markdown) {
  // 只解析 ## 对账覆盖 中五列表格；支持反斜杠管道符和顿号合并 ID。
  // 返回 { rows: [{ ids, actual, verdict, source, change }] }，结构错误抛异常。
}
```

- [ ] **Step 4: 接入 acceptance、collect 与 review**

```js
const manifest = { /* 既有字段 */, specReviewChecklist: { version: 1, path: '_qa/spec-review-checklist.json' } };
// acceptance 同时写 reconciliation.md 与 spec-review-checklist.json。
// 新 manifest：缺行/重复/未知/未核实 => BLOCKED；绑定不等/引用错误/变更不成立 => FAIL。
// 旧 manifest：只增加人工 NOTE，不要求补写原文。
```

- [ ] **Step 5: 运行绿灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity green-ticket-01 -- node --test tooling/scripts/__tests__/qa-spec-review.test.mjs tooling/scripts/__tests__/qa-check-control-points.test.mjs
```

预期：新增覆盖、引用、计划变更和旧包兼容用例全部 PASS。

### Task 2: VisualTarget 与非空证据

**Files:**
- Modify: `tooling/scripts/qa-browser-helper.mjs`
- Modify: `tooling/scripts/__tests__/qa-browser-helper.test.mjs`
- Modify: `tooling/scripts/qa-run.mjs`
- Modify: `tooling/scripts/__tests__/qa-run.test.mjs`
- Create: `.scratch/qa-review-integrity/scripts/visual-target-smoke.mjs`

**Interfaces:**
- Produces: `captureTargetGeometry(page, { target, screenshotPath, probe, assert })`、`emptyEvidenceReason(output)`。
- Adapter: `page.evaluate(probe, target)` 返回 `{ target, rect: { x, y, width, height } }`；`page.screenshot({ path, clip })`。

- [ ] **Step 1: 写 Helper 与空运行失败测试**

```js
await captureTargetGeometry(page, {
  target: 'assistant-message', screenshotPath: 'shot.png', probe,
  assert: (geometry) => assert.equal(geometry.rect.width, 120),
});
assert.deepEqual(screenshot.clip, { x: 10, y: 20, width: 120, height: 80 });
assert.equal(emptyEvidenceReason('No projects matched the filters'), '没有匹配任何项目');
assert.equal(emptyEvidenceReason('Test Files  0 passed (0)'), '测试文件数为 0');
```

- [ ] **Step 2: 运行红灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity red-ticket-02-visual -- node --test tooling/scripts/__tests__/qa-browser-helper.test.mjs tooling/scripts/__tests__/qa-run.test.mjs
```

预期：缺少显式目标原语和空运行识别。

- [ ] **Step 3: 实现显式目标截图和空运行诊断**

```js
export async function captureTargetGeometry(page, { target, screenshotPath, probe, assert: verify }) {
  if (!target?.trim() || typeof probe !== 'function' || typeof verify !== 'function') throw new TypeError('必须提供视觉目标、probe 与几何硬断言');
  const geometry = await page.evaluate(probe, target);
  await verify(geometry);
  if (geometry.target !== target) throw new Error('几何目标与截图目标不一致');
  const clip = geometry.rect;
  if (![clip?.x, clip?.y, clip?.width, clip?.height].every(Number.isFinite) || clip.width <= 0 || clip.height <= 0) throw new Error('视觉目标矩形无效');
  await page.screenshot({ path: screenshotPath, clip });
  return geometry;
}
```

qa-run 在子进程 exit 0 时检查输出尾部；命中空运行模式则写 `[qa-run] EMPTY_EVIDENCE：...` 并以 1 退出。移动函数在 `finally` 中复位视口。

- [ ] **Step 4: 真实 Playwright 冒烟**

```js
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
await page.setContent('<div id="target">目标</div>');
await captureTargetGeometry(page, { target: '#target', screenshotPath, probe, assert });
```

运行 qa-run 标签 `tc09-visual-target`，脚本硬断言 PNG IHDR 尺寸与目标矩形一致并输出 `[TC09-n] PASS 实测：...`。

### Task 3: Schema 4 计划新建路径

**Files:**
- Modify: `tooling/scripts/review-package.mjs`
- Modify: `tooling/scripts/__tests__/review-package.test.mjs`

**Interfaces:**
- Consumes: qa-plan 可选段 `## 计划新建路径`，每项为 `- \`repo/relative/path\``。
- Produces: `UNKNOWN_SCOPE_PATH`；无 Schema 4 计划时保持原行为。

- [ ] **Step 1: 写临时 Git 仓库失败测试**

```js
await writeFile(path.join(feature, 'qa-plan.md'), 'QA Schema: 4\n## 计划新建路径\n- `planned.txt`\n');
assert.match(run(dir, 'init', feature, ['tracked.txt', 'typo.txt']).stderr, /UNKNOWN_SCOPE_PATH/);
assert.equal(run(dir, 'init', feature, ['tracked.txt', 'planned.txt']).status, 0);
```

- [ ] **Step 2: 运行红灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity red-ticket-03-scope -- node --test tooling/scripts/__tests__/review-package.test.mjs
```

- [ ] **Step 3: 实现 base/current/计划三方核对**

```js
if (schema4 && !await pathInfo(path.join(root, scope)) && !baseTreeFiles(root, base, [scope]).length && !plannedNew.has(scope)) {
  throw new Error(`UNKNOWN_SCOPE_PATH：${scope} 当前与 base 均不存在，且未在 ## 计划新建路径 声明`);
}
```

- [ ] **Step 4: 运行绿灯并覆盖 base 已删除文件与普通无计划新文件**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity green-ticket-03-scope -- node --test tooling/scripts/__tests__/review-package.test.mjs
```

### Task 4: 交付时序与 GateEvidence

**Files:**
- Modify: `tooling/scripts/qa-check.mjs`
- Modify: `tooling/scripts/__tests__/qa-check-control-points.test.mjs`

**Interfaces:**
- Consumes: 当前有效两轴 `.source.json.completedAt`、`evidence/gate-plan-*.log`、`evidence/gate-acceptance-*.log`。
- Produces: `VERIFICATION_BEFORE_REVIEW`、`GATE_EVIDENCE_MISSING`。

- [ ] **Step 1: 写新 manifest 时序和门禁缺失失败测试**

```js
assert.ok(codes(await checkFeature(feature, 'review')).includes('VERIFICATION_BEFORE_REVIEW'));
assert.ok(codes(await checkFeature(featureWithoutGates, 'review')).includes('GATE_EVIDENCE_MISSING'));
```

- [ ] **Step 2: 运行红灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity red-ticket-04-order -- node --test tooling/scripts/__tests__/qa-check-control-points.test.mjs
```

- [ ] **Step 3: 实现最晚有效审查时间和前置 gate 检查**

```js
if (manifest.specReviewChecklist && log.started < latestReviewCompletedAt) {
  issues.push(issue('VERIFICATION_BEFORE_REVIEW', 'FAIL', '最终交付命令早于当前独立审查完成时间'));
}
```

plan 至少一条 exit 0 的 gate 日志；acceptance 至少一条完整且 tree 等于当前行为树的 gate 日志。review 继续由外层 qa-run 保存，不在内部要求自身日志。

- [ ] **Step 4: 运行绿灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity green-ticket-04-order -- node --test tooling/scripts/__tests__/qa-check-control-points.test.mjs
```

### Task 5: 文档、技能与安装模板

**Files:**
- Modify: `docs/agents/qa-workflow.md`、`docs/agents/qa-workflow-guide.md`、`CLAUDE.md`、`GLOSSARY.md`
- Modify: `.claude/skills/{code-review,qa-test-planner,implement,implement-spec,setup-qa-workflow}/SKILL.md`
- Modify: `.claude/skills/setup-qa-workflow/templates/{qa-workflow.md,skill-customizations.md,claude-qa-directive.md,qa-check.mjs,qa-run.mjs,review-package.mjs}`
- Modify: `docs/plans/qa-workflow-backlog.md`、`docs/reports/qa-workflow-evolution-report.md`
- Test: `tooling/scripts/__tests__/qa-workflow-contract.test.mjs`

**Interfaces:**
- Produces: 单一中文规则；安装器复制四个核心 module；所有脚本模板逐字一致。

- [ ] **Step 1: 增加文档契约失败测试**

```js
for (const file of [workflow, planner, codeReview, implement, template]) {
  assert.match(file, /对账覆盖|VisualTarget|gate-plan|计划新建路径/);
}
assert.match(setup, /qa-spec-review\.mjs/);
```

- [ ] **Step 2: 运行红灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity red-ticket-05-docs -- node --test tooling/scripts/__tests__/qa-workflow-contract.test.mjs
```

- [ ] **Step 3: 同步文档和模板**

用 `cp` 同步三个既有脚本和新增纯函数 module；不手改副本制造差异。正本替换旧句而不是无限追加，保持 ≤180 行。QA-WF-05 记“已实现、待独立审查/人工终审”，QA-WF-01 保持待发布验收。

- [ ] **Step 4: 运行绿灯**

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity green-ticket-05-docs -- node --test tooling/scripts/__tests__/qa-workflow-contract.test.mjs
```

### Task 6: 验收、独立审查与最终交付

- [ ] 运行 `gate-acceptance-*`，生成最新 reconciliation 与 checklist。
- [ ] collect 后通过 Skill 调用 `code-review`，两轴独立写原文并 seal；主代理不代写。
- [ ] 修复发现并按规则复审；最终交付命令必须晚于最晚审查 completedAt。
- [ ] 用 `gate-review-*` 保存最终机器输出；弱凭据和 dogfood 未完成事项如实保留。

```bash
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity final-tooling-tests -- node --test 'tooling/scripts/__tests__/*.test.mjs'
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity final-tooling-eslint -- pnpm exec eslint tooling/scripts
node tooling/scripts/qa-run.mjs .scratch/qa-review-integrity gate-review-final -- node tooling/scripts/qa-check.mjs review .scratch/qa-review-integrity
```

不自动 commit；发布 dogfood 和人工终审保持未完成。
