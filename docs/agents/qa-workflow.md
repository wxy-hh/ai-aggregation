# 研发与真实浏览器验收闭环工作流 (QA & Browser Testing Workflow)

本规范将 Matt Pocock 工程技能、`qa-test-planner`、真实浏览器验收和双轴审查组合为端到端交付流程。约束由提示词、显式检查、可核查产物和人工终审共同构成；不宣称模型或截图具有不可绕过的绝对保证。

---

## 一、核心闭环

```text
[1. 需求对齐] /grill-with-docs → 领域词汇、边界与 ADR
[2. 规格确立] /to-spec → .scratch/<feature>/spec.md
       ├─[3A. 条件拆票] /to-tickets → issues/*.md
       └─[3B. 测试规划] /qa-test-planner → qa-plan.md → qa-check plan
[4. 串行实现] /implement + TDD → 单测、集成测试、typecheck
[5. 真实验收] 核心链路执行浏览器用例；其他改动运行约定测试 → qa-check acceptance
       └─ FAIL/BLOCKED → diagnosing-bugs → 修复后复验
[6. 双轴审查] code-review → Standards + Spec + 三档分流 → qa-check review
[7. 交付沉淀] 人工终审 → /pr 证据 → /retro 规则与回归资产
```

## 二、适用范围与剪裁

| 改动规模 | 适用流程 |
| --- | --- |
| 大型特性（多会话、跨模块或核心链路） | 完整 7 阶段 |
| 中型改动（单会话独立功能） | 跳过 3A：`/to-spec` → `/qa-test-planner` → `/implement` → 验收 → 双轴审查 → `/pr` |
| 小型修复（文案、样式、单点 Bug） | 直接 `/implement` + TDD；触及核心链路时补 P0 浏览器冒烟与 Standards 快速自查 |

- **3A 触发条件**：仅跨会话/跨人交接，或用户明确选择 `/implement-spec` 并行时拆 `issues/`；单会话冲刺直接从 spec 的 Work Orders 实现，避免多头同步。
- **不可剪裁的浏览器红线**：改动触及认证、流式对话、图像、视频、语音、历史、计费等用户可见核心链路时，阶段 5 不可跳过。移动视口仿真不冒称物理 iOS/Android 真机。
- **时间盒**：交互式浏览器只跑直接受影响链路，默认不超过 5 条用例/15 分钟；存量回归交给 `pnpm --filter @repo/web test:e2e`。超时先诊断或缩小范围，不硬跑全量。
- **无 qa-plan**：核心小改动验收前补 3–5 条 P0 用例；非核心小改动可只跑单测与 typecheck。
- **规则剪裁**：复盘时删除长期没有捕获缺陷或改变决策的规则，避免流程规模债。

## 三、成本与兼容边界

1. **不新增 Hooks**：本流程不依赖 PreToolUse、Stop、SessionStart 或 Git Hook。`qa-check` 只在阶段边界显式运行，一次性聚合问题，不自动重试。
2. **默认 inline**：测试规划由主 Agent 完成，不新增独立 QA。认证、计费、权限、隐私、物理删除/迁移和公共契约可建议独立规划，但不自动派发、不阻断交付。
3. **独立 QA 仅显式选择**：只有 `/qa-test-planner --independent` 才增加 1 个新上下文规划代理；不传模型参数、不自动升配、不嵌套派发，主 Agent 落盘。fresh context 不等于 different model，阶段 5 始终由主 Agent inline 执行。
4. **默认串行**：日常 `/implement` 在单会话中沿依赖连续实现。`/implement-spec` 仅在用户明确选择并行时使用，最多 2 个实现子代理，主 Agent 串行合并并逐次回归；合并确认遵循现有 Git 规则。
5. **共享资源不视为隔离**：Worktree 不隔离数据库、Redis、端口、上游额度或测试账号；迁移、共享状态和相同文件的高耦合任务回退串行。
6. **历史计划不迁移**：无 `QA Schema: 1` 的 qa-plan 返回 LEGACY，退出 0 但仅表示未校验，不得称为 PASS。

## 四、阶段执行规范

### 1. 需求与规格（阶段 1–2）

- 未解决事项已不会改变实现方向和验收标准时即可停止追问，不追求前置覆盖全部细节。
- 人工独占技能（如 `grill-with-docs`、`to-spec`）由用户显式触发；Agent 不伪造调用。需要补充对齐时先完成讨论和 ADR，再进入实现。
- Spec 使用 `## User Stories` 数字列表，保持需求、异常边界、测试接缝和 Out of Scope 可追踪。

### 2. 测试规划（阶段 3B）

标准/慢车道在 spec 后运行 `/qa-test-planner`，默认 inline。新计划采用以下最小契约，完整示例见 `.claude/skills/qa-test-planner/SKILL.md`：

```markdown
QA Schema: 1
QA Mode: inline

### TC01: 场景名称
- Priority: P0
- Covers: 1, 2

#### 验证断言
1. 第一条可量化预期。
2. 第二条可量化预期。

## 执行记录
| 用例 | 断言序号 | 状态 | 证据或原因 |
| --- | --- | --- | --- |
| TC01 | 1 | PASS | `screenshots/TC01-pass.png` |
| TC01 | 2 | BLOCKED | 尚未执行 |
```

- 每条 Spec 数字至少由一个 TC 覆盖；覆盖不等于全部走浏览器，应按 Testing Decisions 选择最高合适接缝。
- 定位器、URL、文案、HTTP 状态、命令退出码和持久化终态必须可量化，禁止从实现现状反向编写业务预期。
- 状态只有 `PASS / FAIL / BLOCKED`。未执行、环境降级和证据不足均为 BLOCKED；不设置 DEGRADED。
- TC 结果由断言推导：全部 PASS 才通过，任一 FAIL 则失败，其余为阻塞。不得只验入口便给整个多断言用例标 PASS。
- 文件证据使用反引号相对路径，位于特性目录且非空；`command:` / `server:` 证据必须来自真实执行。结构检查不判断截图语义，人工仍需抽查证据与原始断言。

规划完成后运行：

```bash
pnpm qa:check -- plan .scratch/<feature>
```

### 3. 实现（阶段 4）

- `/implement` 开工时记录当前 HEAD 到 `.scratch/<feature>/review-base`，并记录路径白名单和既有无关改动。
- 单工单模式完成后停下；无参数或明确要求连续冲刺时，按依赖顺序串行完成全部就绪工单，不逐票询问。
- 每个垂直切片遵循 TDD 红绿循环，定期运行相关测试和 typecheck，最后运行完整测试。
- 并行仅通过用户显式 `/implement-spec` 开启，最多两个实现子代理；主 Agent 串行合并，每次合并后回归，禁止自动指定或升级模型。

### 4. 真实浏览器验收（阶段 5）

- **环境就绪**：先探活首选端口 3030，未通则按 `tooling/scripts/dev-port.mjs` 决议范围扫描 3031–3059；响应 200 后检查目标应用锚点。未就绪时后台运行 `pnpm dev:web`，以 1–2 秒间隔等待 60–90 秒。禁止 kill 占用进程，禁止把连接拒绝当业务 Bug。
- **客户端就绪**：等待客户端水合后才出现的可操作元素，不用 `networkidle` 判断 SSR/HMR/SSE 页面就绪。
- **定位器校准**：允许按真实组件修正“如何找到元素”并记录；禁止修改业务预期迁就实现。
- **工具选择**：遵循宿主工具优先级；macOS 且无更高优先级宿主规则时，先运行 `ego-browser --version`，成功后默认用可见 `ego-browser` 窗口。无 GUI、CLI 不可用或宿主另有明确策略时，说明后使用 Playwright。浏览器验收由主 Agent inline 执行。
- **职责分工**：交互式浏览器用于新行为首次验收；通过的核心行为固化为 `apps/web/e2e/*.spec.ts`，由 `pnpm --filter @repo/web test:e2e` 长期回归。认证夹具以当前登录墙和 `e2e/fixtures.ts` 实际实现为准，不沿用已下线的匿名设备身份。
- **异步终态**：提交成功不等于业务完成，必须等到成功或明确失败终态；先检查 Worker/上游健康，设置等待上限，涉及服务端状态时附日志、DB 或队列证据之一。
- **失败回路**：保留失败截图和 Console/网络证据，调用 `diagnosing-bugs` 定位；修复后重跑原断言，失败证据不覆盖。

验收后运行：

```bash
pnpm qa:check -- acceptance .scratch/<feature>
```

### 5. 双轴审查（阶段 6）

- 中大型改动在验收后调用 `code-review`。Base 优先级为：用户显式值 > 特性 `review-base` > 可说明范围的 upstream/远端默认分支 > 询问一次。
- 使用 `git diff <base>` 覆盖 Base 后的已提交、staged、unstaged 已跟踪改动；相关未跟踪文本用 `git diff --no-index` 生成补丁。禁止为审查 `git add -N` 或自动 commit，空改动不派子代理。
- **Standards 轴**：安全与隐私、移动端红线、仓库工程规范、语言规范、Fowler 坏味道。区分硬违规与判断题。
- **Spec 轴**：每个 User Story 数字必须且只能出现一次在 `## Spec 对账` 中，附 PASS/FAIL/BLOCKED 和证据或原因；遗漏即 FAIL。
- **三档分流**：本次修 / 转专项 / 驳回。转专项写入 `## 遗留事项`，驳回须引用 ADR 或契约理由。
- **复验回路**：本次修触及核心链路时重跑浏览器用例；其他修复重跑相关测试。存在未审查文件或未解决阻断项时不得声称完整通过。

审查后运行：

```bash
pnpm qa:check -- review .scratch/<feature>
```

### 6. 人工终审与交付（阶段 7）

- 先核查 spec、原始断言和证据是否匹配，再看高危审查输出；截图是可核查材料，不是不可伪造证明。
- `/pr` 汇总真实 Before/After、测试结果、爆炸半径和遗留事项；不执行 `/pr` 时不额外制造文档。
- 不自动 commit、push 或合并，遵循 `.claude/rules/git-workflow.md`。复盘优先沉淀为回归测试和精简后的规则，而不是不断叠加提示词。

方案评审与按需清理的快捷指令见 `docs/agents/prompt-shortcuts.md`。
