# 研发与真实浏览器验收闭环工作流 (QA & Browser Testing Workflow)

本规范组合规格、TDD、真实验收和独立双轴审查。原则：Agent 自述不算证据；机器只对机械可修的缺口硬失败，语义判断集中到对账表与分流表交给人工终审。

> 模板说明：本文件由 `/setup-qa-workflow` 生成。`{DEV_COMMAND}`、`{WEB_PORT}`、`{E2E_COMMAND}`、`{E2E_DIR}`、`{CORE_LINKS}`、`{TEST_COMMAND}` 为安装时确认的项目参数；后续结构变化时直接编辑本文件，无需重跑技能。

---

## 一、核心闭环

```text
[1. 需求对齐] /grill-with-docs → 领域词汇、边界与 ADR
[2. 规格确立] /to-spec → .scratch/<feature>/spec.md
       ├─[3A. 慢车道拆票] /to-tickets → issues/*.md
       └─[3B. 测试规划] /qa-test-planner → qa-plan.md → qa-check plan → init 建基线并冻结计划
[4. 实现] /implement（标准）或 /implement-spec（慢）+ add（按需）+ TDD + qa-run → 单元、集成与静态检查
[5. 真实验收] 按接缝执行 → qa-check acceptance（输出对账表）
[6. 双轴审查] collect → 调用 /code-review → review/ 原文落盘 → 三档分流 → 增量复审（自动上限 2 轮）
[7. 交付收口] 最终交付验证 → qa-check review（机器校验通过）→ 人工终审清单
```

## 二、适用范围与剪裁

车道在阶段 1 裁决，后续技能沿用，不重新判定：

| 车道 | 判定 | 路线 |
| --- | --- | --- |
| 快车道 | 文案、样式、非核心小修 | `/implement`（不建 qa-plan，不跑审查） |
| 标准车道 | 独立功能，涉及模块少，串行可完成 | `/grill-with-docs` → `/to-spec` → `/qa-test-planner` → `/implement` |
| 慢车道 | 跨多模块的复杂业务或大功能，或需要并行调度多个实现子代理 | `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/qa-test-planner` → `/implement-spec` |

- 每个技能收口只写一个「建议下一步」，即本车道路线的下一格。独立规划（`--independent`）只在用户主动提出时使用，不写进建议。跨会话或跨人交接用 `/handoff`，与车道无关。

- 核心小改动仍补 3–5 条 P0 用例和浏览器验收；非核心小修可不建 qa-plan，一旦建立便按 Schema 4 执行。
- 修复已交付特性时新建 `.scratch/<feature>-fix-<n>/`，spec 只列本轮缺陷并引用原 US，使用 `QA Kind: fix`，不改写原特性的执行记录。
- 触及 {CORE_LINKS} 等核心链路时，阶段 5 不可跳过；移动视口仿真不冒称物理设备。
- 浏览器时间盒默认 ≤5 条/15 分钟，存量回归交给 `{E2E_COMMAND}`，回归文件位于 `{E2E_DIR}`。

## 三、成本与边界

1. 不新增 Hooks 或自动重试，`qa-check` 只在阶段边界显式运行并聚合问题。
2. 默认 inline 规划、单会话串行实现，不自动增加规划或实现代理、选择或升级模型；显式独立规划最多 1 个，显式并行实现最多 2 个。阶段 6 的两个审查子代理不属于可选实现代理。
3. Worktree 不隔离数据库、Redis、端口、上游额度或测试账号，高耦合任务回退串行。
4. `qa-check.mjs` 的 `CURRENT_SCHEMA = 4`，只接受 Schema 4；其他或未声明的 Schema 报 `UNSUPPORTED_SCHEMA`，按 Schema 4 结构重建，不迁移历史产物。
5. 只保证 Claude Code。个人级技能优先于项目级，`qa-check` 在 plan 与 review 阶段检测个人级同名技能，流程技能同名且内容不同时为 BLOCKED。

## 四、特性目录（Schema 4）

```text
.scratch/<feature>/
├── spec.md、qa-plan.md、review-report.md   # 给人看的三份文档
├── issues/        # 拆票时才有
├── review/        # r<n>-standards.md、r<n>-spec-axis.md，审查子代理原文，不可覆盖
├── scripts/       # browser/api 过程脚本与 helper
├── evidence/      # qa-run 日志
├── screenshots/   # 每个 TC 一张验收截图
└── _qa/           # scope.json、prechange/、review-package.*、reconciliation.md（对账表）、debug/（调试截图），禁止手改
```

## 五、阶段执行规范

### 1. 需求与规格（阶段 1–2）

- 未解决事项不会改变实现方向和验收标准时即可停止追问；人工独占技能只由用户显式触发。
- Spec 使用 `## User Stories` 数字列表，必须包含 Testing Decisions、Out of Scope 和 `## 交付命令`（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令）。
- 需要架构取舍时写 ADR。推翻既有 ADR、评测结论或默认值时引用原决策与证据，各选项写出代价，确认后在 ADR 写明取代了什么；宣称质量或性能收益时写明所需效果证据，否则写成机制描述。

### 2. 测试规划（阶段 3B）

标准车道在 spec 后、慢车道在 `/to-tickets` 后运行 `/qa-test-planner`，默认 inline。Schema 4 最小结构：

```markdown
QA Schema: 4
QA Mode: inline
QA Kind: feature

### TC01: 场景名称
- Priority: P0
- Covers: 1, 2
- Seam: browser

#### 验证断言
1. 第一条可量化预期。

## 执行记录
| 用例 | 断言序号 | 状态 | 证据 | 绑定 | 备注 |
| --- | --- | --- | --- | --- | --- |
| TC01 | 1 | BLOCKED | 尚未执行 | | |

## 交付验证
| 命令 | 证据 |
| --- | --- |
| `{TEST_COMMAND}` | 待执行 |

## 计划变更
- 无
```

- 每条 US 至少由一个 TC 覆盖；Seam 选最高的合适接缝，browser 只用于 DOM、交互和视觉，系统侧结果下沉到 api、integration、unit 或 static。
- 对短路、权限、状态切换、降级等关键决策，按风险核对触发条件、排除条件和降级路径；`Covers` 只承担追踪，不机械要求正反用例。
- browser 断言须关联本次操作新产生的用户可见结果；条件断言写明前置状态与构造方式，给不出构造方式的分支改到能触发它的接缝。
- 交付验证原样复制 spec 的 `## 交付命令`，可追加不可删减；`QA Kind: fix` 时每个 TC 在 `## 修复前复现` 引用同 argv、更早且 tree 不同的红日志。
- 规划后运行 `node tooling/scripts/qa-check.mjs plan .scratch/<feature>`；通过后、init 之前，用 qa-run 跑一遍交付命令（标签 `baseline-*`），有红灯先问用户：修复则作为独立小修提交后再 init，不修则在 `## 范围说明` 记为既有失败并引用基线日志。随后运行 `node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单>` 建立基线并冻结计划，阶段 1–2 产物按提示 add；`tooling/`、`docs/`、`.claude/` 等与工作流共用的目录，白名单写到具体文件。删改既有断言、Seam、Covers 或交付命令须在 `## 计划变更` 说明。

### 3. 实现（阶段 4）

- 已有 `_qa/scope.json` 时不再 init；没有时在改第一行代码前 init。需要扩大范围时运行 `node tooling/scripts/review-package.mjs add .scratch/<feature> -- <路径...>`。
- 单文件测试使用项目既有测试命令；含 `[id]` 的路径必须加引号，避免被 shell 当作通配符。
- 每个垂直切片遵循 TDD 红绿循环；命令证据统一使用 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>`，同名日志不得覆盖，失败换新标签。
- unit/integration 的 PASS 行在「绑定」列写 `` `<测试文件>` › <用例标题> ``（文件相对仓库根，标题取源码叶子标题，参数化按源码字面写法）；绑定写错只改执行记录，不重跑。

### 4. 真实验收（阶段 5）

- **探活**：使用项目探活命令（没有时按端口决议配置逐个请求并校验应用锚点），首选端口 `{WEB_PORT}`；未就绪时后台运行 `{DEV_COMMAND}`，不得关闭标题不匹配的其他进程。
- **工具**：遵循宿主优先级；macOS 无更高优先级规则时默认可见 `ego-browser`，不可用时说明后降级 Playwright。
- **登录**：登录在脚本外完成，过程脚本从已登录状态开始。已有会话直接用；没有时由用户在可见窗口登录，或 Agent 用用户在对话中提供的专用测试账号在真实登录页用真实输入登录一次；两者都没有时打开登录页并在终端提示用户登录，无人值守记 BLOCKED。脚本内不得出现任何登录行为，不得注入 Cookie、写库造会话、改密码或签发令牌，api 断言复用浏览器会话；凭据不得进入命令行、日志或证据。
- **过程脚本**：放在 `scripts/` 并经 qa-run 以脚本路径运行。每条冻结断言先硬断言，再输出 `[TC01-1] PASS 实测：<观察值>`；失败输出 `[TC01-1] FAIL <原因>` 并非零退出。只打印成功文本不算断言。
- **真实输入**：使用真实输入事件；页面内 `dispatchEvent`、`.click()`、`.focus()`、`.value` 赋值只用于读取状态或构造前置条件，并在备注写明。
- **截图**：每个 TC 在自己的场景截图写入 `screenshots/`，调试截图写入 `_qa/debug/`；截图不能证明数值，数值在脚本内严格断言。
- **环境不足**：DOM、真实交互或移动几何无法验证时记 BLOCKED，或经计划变更转人工；不得用低接缝证据替代 browser。
- **异步与失败**：等待水合后的可操作元素，不用 `networkidle`；等待成功或明确失败终态并设上限，保留失败截图与 Console/网络证据，修复后重跑原断言。

验收后运行 `node tooling/scripts/qa-check.mjs acceptance .scratch/<feature>`。它核对断言标记、用例绑定、脚本位置，并扫描 `scripts/`：绕过登录（注入 Cookie、写令牌类本地存储、引入数据库驱动或 BaaS 管理端 SDK）与脚本内登录（密码字面量、登录或注册类接口路径、`window.__*` 上的登录方法）为不可豁免的 FAIL；页面内模拟输入（含 `.setState(` 与 `window.__*` 访问）只给 NOTE 并在对账表标注「非真实输入」。对账表同时写入 `_qa/reconciliation.md` 供 Spec 轴审查；执行记录变化后先重跑 acceptance 再 collect。

**NOTE 处置**：tree 不一致时，核心实现变化重跑受影响验收；能确认仅为非行为文档变化时记录不重跑理由；无法判断时保持 BLOCKED。

### 5. 双轴审查（阶段 6）

`code-review` 使用上游原文，只在“项目定制”段替换 diff 来源与原文落盘方式：

1. **collect**：运行 `node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>`。范围外改动属于本任务时先 add 再 collect，其他来源在 `## 范围说明` 逐项解释。不得为审查 `git add -N` 或自动 commit。
2. **双轴**：用 Skill 工具调用 `code-review`，参数写明特性目录与轮次；审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理。两轴原文位于 `review/`，都落盘后才进入分流。
3. **编号含义**：原文每条发现以 `[S-H<n>]`（规范硬违规）、`[S-J<n>]`（规范判断）、`[P-M<n>]`（缺失或部分实现）、`[P-W<n>]`（实现有误）、`[P-X<n>]`（范围蔓延）开头；无发现写「无发现」。
4. **三档分流**：`review-report.md` 只含 `审查方式：` 一行、`## 三档分流` 表（编号、档位、最终状态、轮次轨迹、验证证据、理由）、按需的 `## 修复尝试记录` 与 `## 范围说明`。原文每个编号都要进表；S-H、P-M、P-W 默认本次修，改档须写理由；驳回引用 ADR 或契约；两轴无发现时表下写「无发现」。最终状态为「已修」的行，验证证据写修复后产生的 `evidence/` 或 `screenshots/` 文件（反引号路径，qa-run 日志须 exit 0），不涉及行为的修复写「静态：<理由>」；其他行可留空。
5. **增量复审**：本次修之后重新 collect，以 r2、r3 复审，自动上限 2 轮。复审输入只给审查者自己的历次原文、新增修复 diff 与 spec，不提供修复尝试记录；复审对上轮本次修编号逐条判 `已修`、`未修` 或 `修错`，状态词后不加限定语（部分修复写未修），只对修复 diff 报新发现，新编号接续。修复前必须读修复尝试记录，不重复已判失败的改法。
6. **用尽上限**：r3 后仍有未修或修错时停止自动修复，照常执行阶段 7，`qa-check review` 输出 BLOCKED（`UNRESOLVED_FINDINGS`），分流表即已修、未修、修错清单交人工裁决。人工授权的追加修复轮不计入自动上限。
7. **合法暂停**：未实际调用或拿不到两份真实独立返回时保持“待独立审查”；宿主无独立上下文能力时，collect 后只交付审查包，不运行最终 `qa-check review`，由独立会话或人工接续，不自动重试或提出 commit。

### 6. 交付验证（阶段 7）

- 交付命令在全部浏览器验收结束后执行；之后需要重跑验收时先探活 dev server。
- QA 工作流在最终代码上通过 qa-run 执行每条交付命令并更新 `## 交付验证`，负责最终交付；`code-review` 只返回两轴发现。
- 运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`，核对交付日志、审查包新鲜度、原文与分流表的编号核对。本会话输出的 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，汇报须附该行及范围说明。
- 汇报的测试结论与最后一次实际运行一致；人工终审前不把 backlog、计划等文档写成完成态。

### 7. 人工终审

以 `qa-check acceptance` 的对账表与 `review-report.md` 的分流表为入口：

1. 对账表逐行：实测值或用例标题确实证明冻结断言原文；「非真实输入」行的模拟输入只用于前置条件。
2. 截图支撑对应断言：结果非空，目标元素在画面内，没有矛盾内容。
3. 分流表逐条：驳回与转专项理由成立；未修、修错条目做出裁决（改档、接受现状或授权追加修复轮）。
4. 检查器给出的转录 NOTE：到对应子代理转录核对原文与模型。
5. 推翻既有 ADR、评测结论或默认值时有依据；收益主张有效果证据。

- `/pr` 汇总真实 Before/After、最后一次测试输出、爆炸半径和遗留事项，不自动 commit、push 或合并。
- 复盘以 `review/` 原文与子代理转录为准，优先沉淀回归测试并删除不改变决策的流程负担。
- 发布 QA 工作流自身时，另以干净会话的真实 /implement dogfood 验证独立上下文审查真实发生、无独立上下文能力时合法暂停；工具测试与手动派发 reviewer 不冒充这项发布验收。

方案评审与按需清理的快捷指令见 `docs/agents/prompt-shortcuts.md`。
