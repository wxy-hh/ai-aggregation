# 研发与真实浏览器验收闭环工作流 (QA & Browser Testing Workflow)

本规范组合规格、TDD、真实验收和独立双轴审查。原则：Agent 自述不算证据；机器只对机械可修的缺口硬失败，语义判断集中到对账表与分流表交给人工终审。

> 模板说明：本文件由 `/setup-qa-workflow` 生成。`{DEV_COMMAND}`、`{WEB_PORT}`、`{E2E_COMMAND}`、`{E2E_DIR}`、`{CORE_LINKS}`、`{TEST_COMMAND}` 为安装时确认的项目参数；后续结构变化时直接编辑本文件，无需重跑技能。
## 一、核心闭环

```text
[1. 需求对齐] /grill-with-docs → 领域词汇、边界与 ADR
[2. 规格确立] /to-spec → .scratch/<feature>/spec.md
       ├─[3A. 慢车道拆票] /to-tickets → issues/*.md
       └─[3B. 测试规划] /qa-test-planner → qa-plan.md → qa-check plan → init 建基线并冻结计划
[4. 实现] /implement（标准）或 /implement-spec（慢）+ add（按需）+ TDD + qa-run → 单元、集成与静态检查
[5. 真实验收] 按接缝执行 → qa-check acceptance（输出对账表）
[6. 双轴审查] collect → 调用 /code-review → review/ 原文落盘 → 三档分流 → 增量复审，自动上限 1 轮（r2，超限入 WAITING_HUMAN）
[7. 交付收口] 最终交付验证 → qa-check review（机器校验通过）→ 人工终审清单
```

## 二、适用范围与剪裁

车道在阶段 1 裁决；实现中事实不再符合判定标准时按车道升级处理：

| 车道 | 判定 | 路线 |
| --- | --- | --- |
| 快车道 | 文案、样式、非核心小修 | `/implement`（不跑审查；非核心不建 qa-plan，核心小改按下文补精简 qa-plan 与阶段 5） |
| 标准车道 | 独立功能，涉及模块少，串行可完成 | `/grill-with-docs` → `/to-spec` → `/qa-test-planner` → `/implement` |
| 慢车道 | 跨多模块的复杂业务或大功能，或需要并行调度多个实现子代理 | `/grill-with-docs` → `/to-spec` → `/to-tickets` → `/qa-test-planner` → `/implement-spec` |

- **车道升级**（ADR-0043）：实现中发现事实不再符合当前车道的判定标准时，Agent 停下，报告依据与建议车道，用户确认后才升级；只升不降，Agent 不提议降级。
- 升级沿用当前特性目录。快车道升标准车道由用户依次运行 `/grill-with-docs`（只问未决事项）、`/to-spec`、`/qa-test-planner`；标准车道升慢车道必须补 `/to-tickets`，即使仍串行实现。
- 升级前的 qa-run 日志只作历史，init 前执行记录不得有 PASS 行；基线标签用 `baseline-upgrade-*`，`## 范围说明` 写明「含在途改动，非原始开工前基线」，基线红灯先问用户，不得记为既有失败。
- 未提交的在途改动在 init 后立即对同一批路径 add；已提交的在 `## 范围说明` 记下起始提交，把 `<起点>..HEAD` 的 diff 作为补充材料交双轴审查，起点不明时停下请用户指定；升级前已实现的工单保持 `ready-for-agent`，正文注明「升级前已实现，待新基线复验」。

- 每个技能收口只写一个「建议下一步」，即本车道路线的下一格。独立规划（`--independent`）只在用户主动提出时使用，不写进建议。跨会话或跨人交接用 `/handoff`，与车道无关。

- 核心小改动仍补 3–5 条 P0 用例和浏览器验收；非核心小修可不建 qa-plan，一旦建立便按 Schema 4 执行。
- 修复已交付特性时新建 `.scratch/<feature>-fix-<n>/`，spec 只列本轮缺陷并引用原 US，使用 `QA Kind: fix`，不改写原特性的执行记录。
- 触及 {CORE_LINKS} 等核心链路时，阶段 5 不可跳过；移动视口仿真不冒称物理设备。
- 阶段 5 默认只规划 1–3 条核心真实浏览器主链路与关键视口；组件测试能覆盖的故障注入与分支矩阵不下放到浏览器。浏览器时间盒默认 ≤5 条/15 分钟，存量回归交给 `{E2E_COMMAND}`，回归文件位于 `{E2E_DIR}`。

## 三、成本与边界

1. 不新增 Hooks 或自动重试，`qa-check` 只在阶段边界显式运行并聚合问题。
2. 默认 inline 规划、单会话串行实现，不自动增加规划或实现代理、选择或升级模型；显式独立规划最多 1 个，显式并行实现最多 2 个。阶段 6 的两个审查子代理不属于可选实现代理。控制单批审查交付面，不一次性捆审多个高风险独立主题；外部顾问 / Advisor 只在设计冻结前寻找核心反例，截断、不可用或额度耗尽时不自动重取；推进过程中状态变化只写一行中文。
3. Worktree 不隔离数据库、Redis、端口、上游额度或测试账号，高耦合任务回退串行。
4. `qa-check.mjs` 的 `CURRENT_SCHEMA = 4`，只接受 Schema 4；其他或未声明的 Schema 报 `UNSUPPORTED_SCHEMA`，按 Schema 4 结构重建，不迁移历史产物。
5. 「自述凭据（弱）」只防跨轮串包与漏执行，不防恶意主代理自导自演；弱档下人工终审需重点对照 `review/` 原文、分流表与默认驳回清单，或按需用 `/retro` 抽查宿主原生会话。
6. 审查来源统一实行宿主无关的 challenge 单轨凭据协议（ADR-0048、ADR-0065、OPT-14）：`collect` 发放 challenge，子代理自写原文并由 `review-package seal` 生成 `.source.json`，`qa-check` 按证据分级——同 nonce 的 Claude Code 转录为「转录（强）」，只有凭据为「自述凭据（弱）」，都没有为「未核验（人工）」；若 Claude Code 主会话目录可读且存在本项目主会话转录，却无 `code-review` 调用也无同 nonce 子代理转录而自称为 Claude `subagent`，阻断为 `REVIEW_PROVENANCE_UNVERIFIED`。只读探索型代理不能担任审查者；Codex 等无子代理宿主由用户手动另开独立会话或终端审查，用同一 nonce seal，主代理不得自动启动无头审查者。缺少或损坏 `_qa/review-challenge.json` 时直接阻断为 `MISSING_REVIEW_CHALLENGE`；个人级同名技能检测在 plan 与 review 执行，流程技能同名且内容不同时 BLOCKED。

## 四、特性目录（Schema 4）

```text
.scratch/<feature>/
├── spec.md、qa-plan.md、review-report.md   # 给人看的三份文档
├── issues/        # 拆票时才有
├── review/        # r<n>-standards.md、r<n>-spec-axis.md 与同名 .source.json；子代理自写原文，新协议不得改原文或重算凭据
├── scripts/       # browser/api 过程脚本与 helper
├── evidence/      # qa-run 日志
├── screenshots/   # 每个 TC 一张验收截图
└── _qa/           # scope.json、prechange/、review-package.*、review-challenge.json、reconciliation.md、spec-review-checklist.json、spec-review-skeleton.md、debug/，禁止手改
```

## 五、阶段执行规范

### 1. 需求与规格（阶段 1–2）

- 未解决事项不会改变实现方向和验收标准时即可停止追问；人工独占技能只由用户显式触发。保留 `grilling` 一次一问协议（不合并多题），选项涉及生产事件、持久化 schema 或公共契约时先读实现再问人；直接删除实现步骤型 US。
- Spec 使用 `## User Stories` 数字列表，必须包含 Testing Decisions、Out of Scope 和 `## 交付命令`（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令）。
- 需要架构取舍时写 ADR。推翻既有 ADR、评测结论或默认值时引用原决策与证据，各选项写出代价，确认后在 ADR 写明取代了什么；宣称质量或性能收益时写明所需效果证据，否则写成机制描述。

### 2. 测试规划（阶段 3B）

标准车道在 spec 后、慢车道在 `/to-tickets` 后运行 `/qa-test-planner`，默认 inline。新计划声明 `QA Review Coverage: 2`（平滑扩展分组 `reviewUnits`、哈希继承与预填骨架 `spec-review-skeleton.md`；旧计划 `QA Review Coverage: 1` 或省略保持兼容）。Schema 4 最小结构：

```markdown
QA Schema: 4
QA Mode: inline
QA Kind: feature
QA Review Coverage: 2

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
- 断言遵循 `qa-test-planner` 的「原子断言」原则：每条只陈述一个可由单一证据单元判定的结论，声称约束或边界的须构造越过边界的情形；`init` 冻结前逐条自查断言之间是否互相矛盾、每条是否可证伪，并确认前置怎么构造与观察什么。
- 交付验证原样复制 spec 的 `## 交付命令`，可追加不可删减；仅 `QA Kind: fix` 时每个 TC 在 `## 修复前复现` 引用同 argv、更早且 tree 不同的红日志，`QA Kind: feature` 不设修复前复现日志门禁；所有 QA Kind 的阶段 4 TDD 垂直切片红灯证据要求不变。
- `qa-plan.md` 只测产品外部可观察行为；禁止把 `qa-check` 结果、截图独立性、`review/`、`review-report.md` 或 `handoff.md` 合规性写成元用例（TC），也不得在 `scripts/` 自写元校验脚本。
- 计划变更不得新增冻结断言之外的呈现要求（如「某几项同屏」）；确需新要求时追加断言。
- 规划后经 qa-run 落盘门禁（标签 `gate-plan-*`），再跑 `baseline-*` 交付命令。基线检查实行「默认只读、一次聚合汇报」：无关既有红灯标注为既有失败后继续；确需修改 git tracked 文件时离开本特性另起任务，不改变 tracked 文件的本机环境恢复（如离线安装依赖）经一次明确确认后可就地执行；计划内基线时尚不存在的新测试路径导致的「No test files」不算红灯但记基线不适用。`No projects matched`、找不到测试或 0 项测试会触发 `EMPTY_EVIDENCE`，不得当绿基线。随后 `review-package init` 建基线并冻结计划；Schema 4 白名单中当前与 base 均不存在的路径必须在 `## 计划新建路径` 逐项声明，否则 `UNKNOWN_SCOPE_PATH`。阶段 1–2 产物按提示 add，共用目录白名单写到具体文件。删改既有断言、Seam、Covers 或交付命令须在 `## 计划变更` 说明。

### 3. 实现（阶段 4）

- 已有 `_qa/scope.json` 时不再 init；没有时在改第一行代码前 init。需要扩大范围时运行 `node tooling/scripts/review-package.mjs add .scratch/<feature> -- <路径...>`。
- 单文件测试使用项目既有测试命令；含 `[id]` 的路径必须加引号，避免被 shell 当作通配符。
- 每个垂直切片遵循 TDD 红绿循环；命令证据统一使用 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>`（过程脚本可用 `--script <path>`，ego-browser 脚本优先用 `--executor ego-browser --script <path>` 淘汰双文件包装），同名日志不得覆盖，失败换新标签。同 argv、同 tree、exit 0 的 qa-run 日志可同时被多个 TC 与交付验证引用；argv 或 tree 变化须换新标签重跑，失败日志保留。qa-run 自身错误统一带 `[qa-run][ERROR]` 前缀；必须检查本次命令退出状态，禁止用管道过滤后只读旧日志 exit 代替本次结果。进入阶段 5 前必须完成一次 `node tooling/scripts/qa-preflight.mjs .scratch/<feature>` 并清除 ERROR；WARN 须逐项核对，不替代语义复核。
- unit/integration 的 PASS 行在「绑定」列写 `` `<测试文件>` › <用例标题> ``（文件相对仓库根，标题取源码叶子标题，参数化按源码字面写法）；绑定写错只改执行记录，不重跑。测试夹具优先使用共享强类型契约和有出处的生产形状样本；不跨 app 强引内部构造器，也不规定所有低风险测试都走真实工厂。

### 4. 真实验收（阶段 5）

- **探活**：使用项目探活命令（没有时按端口决议配置逐个请求并校验应用锚点），首选端口 `{WEB_PORT}`；未就绪时后台运行 `{DEV_COMMAND}`，不得关闭标题不匹配的其他进程。
- **工具**：遵循宿主工具优先级；无更高优先级规则时，轻量 DOM/视口验证或无需复用桌面登录态时优先用 Playwright（直接由 Node 执行 `scripts/*.mjs`，不走 `playwright test`；宿主根目录须将 `playwright` 声明为根级直接开发依赖）；需要复用已登录会话或人工接管登录时用 `ego-browser` 可见窗口。仓库级薄辅助模块 `tooling/scripts/qa-browser-helper.mjs` 只封装仓库根解析、TaskSpace 接管、断言标记与移动视口截图顺序。
- **脚本与截图隔离**：含响应注入的用例必须独立成脚本文件，不与真实主链路混写；截图文件名必须带运行标签或时间戳后缀，禁止覆写历史已绑定截图；触及模型、Embedding 或计费链路前，先做 1 次最小余额/端点探针并确认后台 `node -v >= 18` 且关闭短超时。
- **登录**：登录在脚本外完成，过程脚本从已登录状态开始。已有会话直接用；没有时由用户在可见窗口登录，或 Agent 用用户在对话中提供的专用测试账号在真实登录页用真实输入登录一次；两者都没有时打开登录页并在终端提示用户登录，无人值守记 BLOCKED。脚本内不得出现任何登录行为，不得注入 Cookie、写库造会话、改密码或签发令牌，api 断言复用浏览器会话；凭据不得进入命令行、日志或证据。
- **过程脚本**：放在 `scripts/` 并经 qa-run 以脚本路径运行。每条冻结断言先硬断言，再输出 `[TC01-1] PASS 实测：<观察值>`；失败输出 `[TC01-1] FAIL <原因>` 并非零退出。只打印成功文本不算断言。
- **真实链路冒烟**：触及核心链路时至少一条 browser 用例走真实登录、真实输入与真实后端，只断言本次新产生的用户可见终态（如流式结束、无错误态、控制台无报错），不断言模型非确定性分支，后者由 integration 证明。响应注入（替换或拦截网络响应）只在本次改了对应渲染代码时补充构造前端前置或故障态，备注写明「响应注入」、断言只写端侧结果，不得替代真实链路冒烟。
- **真实输入**：使用真实输入事件；页面内 `dispatchEvent`、`.click()`、`.focus()`、`.value` 赋值只用于读取状态或构造前置条件，并在备注写明。
- **截图**：每个 TC 独立截图，数值在脚本内严格断言。视觉断言先冻结 **VisualTarget**（语义区域 + 稳定定位器），几何硬断言与目标区域截图必须指向同一对象，不得换成标题、状态卡或整页；代表点未遮挡、边界与滚动尺寸按断言硬检查。helper 提供 `captureTargetGeometry` 时，它要求 probe 返回同一 target 与有效矩形，断言成功后优先调用同一元素的 `locator.screenshot()`；元素截图失败才退化为完整视口 PNG 按实际 DPR 裁剪。未提供时按同一契约自写，移动视口同样在 finally 复位。截图仍由 Spec 轴按冻结断言与 VisualTarget 复核。
- **环境不足**：DOM、真实交互或移动几何无法验证时记 BLOCKED，或经计划变更转人工；不得用低接缝证据替代 browser。
- **异步与失败**：等待水合后的可操作元素，不用 `networkidle`；等待成功或明确失败终态并设上限，保留失败截图与 Console/网络证据，修复后重跑原断言。

验收后经 qa-run 运行 `node tooling/scripts/qa-check.mjs acceptance .scratch/<feature>`（标签 `gate-acceptance-*`）。它核对断言标记、用例绑定、脚本位置，并扫描 `scripts/` 及静态导入闭包：绕过或脚本内登录为不可豁免 FAIL；页面内合成输入只给 NOTE 并标注「非真实输入」（放行仅记录诊断的只读控制台采集），响应注入只给 NOTE 并标注「响应注入」。对账表覆盖全状态并列冻结与当前断言；`QA Review Coverage: 1/2` 写 `_qa/spec-review-checklist.json`，v2 另标注 `required` 并生成预填骨架 `_qa/spec-review-skeleton.md`。执行记录变化后重跑 acceptance 再 collect，禁改 `_qa/`。

**证据过期**：执行记录引用的 qa-run 日志 tree 与当前代码不一致时，acceptance 报 `STALE_EVIDENCE`（BLOCKED）。核心实现变化须换新标签重跑受影响验收；能确认仅为非行为文档变化时，在该行备注写「不重跑：<理由>」放行，对账表标注该理由由人工终审核对；理由为空仍阻塞。

### 5. 双轴审查（阶段 6）

`code-review` 使用本仓内聚的单一中文指令，按下列项目规则执行：

1. **collect 与不可变快照**：运行 `node tooling/scripts/review-package.mjs collect .scratch/<feature> -- <路径白名单>`。collect 默认运行 `qa-preflight` 与 2 秒只读可封存性预检：核对 `_qa/spec-review-checklist.json` 中的 `evidenceTree` 与剔除 `## 交付验证` 后的 `qaPlanDigest` 同当前一致，并要求存在同 `evidenceTree` 的完整 `gate-acceptance-*.log`（仅含合法 `ASSERTION_BLOCKED` 的新鲜阻塞计划放行，`FAIL`/`STALE_EVIDENCE`、旧清单或无含真实断言谓词的候选一律报 `PACKAGE_INVALID` 阻断，不派发审查；可用 `--skip-preflight` 仅跳过 `qa-preflight`）；**不在 `collect` 内重跑 acceptance 覆写 `_qa/`**。collect 生成轻量不可变快照 `_qa/round-snapshots/r<n>/`（含 SHA-256 manifest）、搬家 Rename 折叠与全量基线 diff、`r2+` 相邻快照间机器差分 `_qa/review-package-delta.diff` 及 `< 3 KB` `_qa/review-brief.md`，并扫描全历史原文（含未 `seal`）写入 `reservedIds`/`nextIds` 至 `_qa/review-challenge.json`，同步写入含 `qaArtifactsDigest` 的 manifest 与 `specReviewChecklist`。超默认自动上限（`r3+`）时 collect 默认拒绝并提示进入 `WAITING_HUMAN`，仅人工显式 `--allow-manual-round` 放行。再次 collect 换 nonce，旧凭据失效；范围外属于本任务先 add 再 collect，其他记 `## 范围说明`；禁 `git add -N` 或自动 commit。
2. **双轴、错误路由与冻结屏障**：用 Skill 工具调用 `code-review`，参数写明特性目录与轮次（派发、编号、封存只在技能内，不要用 Agent 工具自行派审查子代理）。
   - **全输入双轴终态屏障**：双轴派发后至两轴全达终态前，严禁编辑任何代码、测试、`spec.md`、`scope.json`、`qa-plan.md`、术语或脚本/截图；若 live 工作区偏离当轮快照，子代理仍可基于快照完成 `seal` 留证，但 `qa-check` 必判该轮 **`SUPERSEDED`**（`BLOCKED`）。
   - **封存与三类错误路由**：有 challenge 时子代理基于当轮不可变快照自写 `review/` 原文并运行 `review-package seal` 生成 `.source.json`（拦截无编号、编号撞号 `FINDING_ID_COLLISION`、漏复核、对账或 `±5` 行谓词缺口），返回 `QA_REVIEW_RECEIPT: <nonce>|<sha256>`。错误只分三类：**`REVIEWER_EDITABLE`**（行号/表格错，同轮最多重试 **1 次** `seal`）、**`PACKAGE_INVALID`**（候选/快照/失鲜包错，审查者立刻停交主代理重建包）、**`INFRA_UNAVAILABLE`**（429/配额/宿主失败，立刻停交用户，禁换模型禁重派）。
   - **Spec 对账**：`Coverage: 1` 五列逐项复制；`Coverage: 2` 四列基于按脚本/测试分组的 `reviewUnits` 响应必审/失效单元并写 `## 抽检范围`（未实质改动源码的存量回归机检+抽检，安全/权限/计费/`changed`/非 PASS 永不降级，`r2+` 同哈希自动继承且支持回查全量快照基线；依 `ADR-0068`，低风险 `unit`/`integration` 单元在测试文件、静态导入闭包实现源码 `closureHash` 与断言均未变且当前树覆盖通过时允许继承，日志换名或无关全局 tree 变化不单独归零，安全/权限/隐私/计费含闭包路径、`changed`、`browser`/`api`、非 `PASS` 与「不重跑」永不降级，命中环境变量读取、动态 `import()`、非静态 `require`、运行时注入、外部文件读取/子进程或无法解析模块等不可静态排除影响时强制失效回退 `required`，并受「只改实现、未改测试」变异盲测零误继承约束）；全版本命中 `±5` 行测试/断言谓词（封堵 `:1`）并归一化路径，变更项判 `变更成立`/`变更不成立`。
   - **单轴复用与隔离**：`r1` 双轴齐全；`r2` 审查包 `treeDigest` 未变且仅修改分流或轨迹文字时只需有待复核编号的轴产出原文，另一轴沿用同一 `treeDigest` 旧轮次（执行记录、绑定、日志或截图变化时 Spec 轴必须复审，过程脚本变化时 Standards 与 Spec 双轴必须复审）；审查子代理只读静态核对，不重跑测试套件、`typecheck`、`lint` 或启动服务，不得读取同轮另一轴原文，也不得跨特性读取其他 `.scratch/` 目录；后台或子代理报超时/`no_final_message` 时，先核对同名 `.source.json` 与原文 SHA-256 哈希是否匹配当前 nonce，匹配即作为唯一封存真源认领（`axes` 仅辅助指标），发现已有凭据时禁止重派、禁止手改 `_qa/`。
3. **编号含义**：Standards `[S-H<n>]`（可用性/无障碍/明文禁令与真实行为/生命周期/竞态缺陷）、`[S-J<n>]`（视觉配方与可维护性建议，不做前缀机器硬锁）；Spec `[P-M<n>]`（缺失/部分实现）、`[P-W<n>]`（实现有误）、`[P-X<n>]`（范围蔓延）；无发现写「无发现」，不带编号。测试使用生产不存在事件或形状导致假绿（含用实现声明代替真实可观测结果）按所属轴归 `[P-W<n>]` 或 `[S-H<n>]`，不得归作 `S-J`。跨轮同编号复用不同语义报 `FINDING_ID_COLLISION`。新发现优先用 `## S-H1` 或 `## [S-H1]` 这类标题主编号，历史行首方括号继续兼容；标题中段和正文引用不登记，方括号编号引用仅可作为复审响应，无方括号正文提及不算响应。
4. **三档分流与自动骨架**：两轴落盘后可用 `node tooling/scripts/review-package.mjs scaffold-report .scratch/<feature>` 自动预生成无漏项 `review-report.md` 骨架（含 `审查方式：宿主=<宿主名>；`、`## 三档分流`、`## 默认驳回`、`## 修复尝试记录`、`## 范围说明`）。先分流再修，真实阻断与可维护性 `S-J` 分批不捆绑；分流表是唯一流程状态源，不改写 `review/` 原文。
   - `S-H`、`P-M`、`P-W` 默认本次修，改档须写理由，驳回引用 ADR 或契约。
   - S-J 默认驳回且不必进表（进 `## 默认驳回` 列编号与原文位置，不强制逐条理由）；确需修、转专项或单列风险才进表，仅在只动已触及范围及配套测试且不扩行为时改为本次修。
   - `P-X` 默认本次修（撤回越界改动）；转专项写明证据、本次不修依据与跟踪位置；范围外既改记入 `## 范围说明`。
   - 「已修」行验证证据写修复后 `evidence/` 或 `screenshots/` 路径或 `静态：<理由>`，日志 `started` 须晚于对应缺陷审查返回。
5. **增量复审与 1 轮自动上限（`ADR-0066`）**：有本次修，或有 `S-H`、`P-M`、`P-W` 驳回/转专项时重新 collect 做增量复审，**自动上限 1 轮（`r2`）**。复审默认提供 `review-brief.md`、`review-package-delta.diff`、不可变全量快照基线（按需回查交互）、审查者自己历次原文、spec、待复核编号与理由及 QA 产物变化（Spec 轴另给当前截图，不给修复尝试记录）。对上轮本次修判 `已修`/`未修`/`修错`，对改档判 `改档成立`/`改档不成立`（不成立改为本次修，不得再次改档），新发现只针对本轮修复改过的文件且严格接续登记器 `nextIds`。上轮待复审编号须出现在对应轴其后一轮原文中，否则 `BLOCKED`（`FINDING_NOT_REREVIEWED`）。修复前必读修复尝试记录，不重复失败改法。
6. **正式暂停终态（`WAITING_HUMAN` / `PACKAGE_INVALID` / `WAITING_INFRA`）与停手白名单**：`r2` 后仍有未修、修错、改档不成立或漏复审时，停止自动修复，照常执行阶段 7，`qa-check review` 输出 `BLOCKED`（`UNRESOLVED_FINDINGS`；若将最新轮首次提出且未经独立复审的发现错标「已修」则报 `UNREVIEWED_FIX_CLAIM`）及正式暂停终态 **`WAITING_HUMAN`** 与人工决策包摘要；双轴结论分歧时应在 `review-report.md` 写入 `## 双轴分歧对照` 表格由决策包并列呈现。进入 `WAITING_HUMAN` 停手白名单后仅允许更新 `qa-plan.md` 的 `## 交付验证` 与 `review-report.md` 的状态登记、人工裁决、范围说明及 `## 双轴分歧对照`，禁止改源码、测试、`## 执行记录` 或把未复审发现标为已修。包错停在 **`PACKAGE_INVALID`**、基础设施失败停在 **`WAITING_INFRA`**，均不为拿 PASS 改表。人工在理由列写裁决，或显式授权 `--allow-manual-round` 追加修复轮。
7. **合法暂停**：未实际调用或拿不到两份真实独立返回时保持“待独立审查”；宿主无独立上下文能力时，collect 后只交付审查包，不运行最终 `qa-check review`，由独立会话或人工接续，不自动重试或提出 commit。外部会话必须由用户启动，主代理不得自动启动无头审查者。

### 6. 交付验证（阶段 7）

- 最终交付命令在全部浏览器验收和当前独立审查/必要复审完成后执行；阶段 3B 基线命令与阶段 4 TDD 红绿证据仍按原规则执行。仅 `.scratch/` QA 产物变化报 `STALE_QA_ARTIFACTS`；新版 `evidenceTree` 与 `qaArtifactsDigest` 双指纹均未变时，既有同 tree、`exit 0` 交付日志直接有效，免除 `VERIFICATION_BEFORE_REVIEW` 强制审后重跑（旧包维持原时序校验）；之后重跑验收先探活。
- QA 工作流在最终代码上通过 qa-run 执行每条交付命令并更新 `## 交付验证`，负责最终交付；`code-review` 只返回两轴发现。
- 若因交付命令失败而修改代码或契约文档，必须回到阶段 6 重新 collect、按既有规则复审，并重跑受影响验收与全部交付命令；未改代码的环境重试不触发复审，自动复审上限已用尽时交人工授权。
- 经 qa-run 运行 `node tooling/scripts/qa-check.mjs review .scratch/<feature>`（标签 `gate-review-*`），保存真实门禁输出并核对交付日志、审查包新鲜度、对账覆盖、分流编号与复审轨迹。输出「来源核验」强度行（转录（强）／自述凭据（弱）／未核验（人工））与「原文核对」段（每个编号最后出现的原文行，仅供人工核对，非结论）。本会话输出的 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，汇报须附该行及范围说明。
- 汇报的测试结论与最后一次实际运行一致；人工终审前不把 backlog、计划等文档写成完成态。
- 最终汇报只含门禁结果行、变更摘要、验证结论与待人工裁决编号；分流表、执行记录与 diff 用路径链接，不重贴。

### 7. 人工终审

以 `qa-check acceptance` 的对账表与 `review-report.md` 的分流表为入口：

1. 对账表逐行：状态、冻结原文／当前断言与实测值、失败或阻塞原因、用例标题是否一致，实际谓词能否证伪；「非真实输入」行的模拟输入只用于前置条件；「响应注入」行的断言只写端侧结果，核心链路另有真实链路冒烟。
2. 截图支撑对应断言：结果非空，目标元素在画面内，没有矛盾内容。
3. 分流表与默认驳回清单逐条：对照 `qa-check review` 的「原文核对」段与两轴原文确认真实发现没有漏进对应清单、处置状态忠实于原文；改档成立的驳回与转专项理由确实成立；未修、修错、改档不成立条目做出裁决（接受现状或授权追加修复轮），裁决写入理由列，不改变 BLOCKED 结果。
4. 检查器给出的转录 NOTE：到对应子代理转录核对原文、轮次与事件时间；不核对模型。
5. 推翻既有 ADR、评测结论或默认值时有依据；收益主张有效果证据。

- `/pr` 汇总真实 Before/After、最后一次测试输出、爆炸半径和遗留事项，不自动 commit、push 或合并。
- 复盘以 `review/` 原文与子代理转录为准，优先沉淀回归测试并删除不改变决策的流程负担。
- 发布 QA 工作流自身时，另以干净会话的真实 /implement dogfood 验证独立上下文审查真实发生、无独立上下文能力时合法暂停；工具测试与手动派发 reviewer 不冒充这项发布验收，未完成时保持“待发布验收”，不得写成完成态。

方案评审与按需清理的快捷指令见 `docs/agents/prompt-shortcuts.md`。
