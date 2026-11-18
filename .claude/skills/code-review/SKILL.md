---
name: code-review
description: "沿两个轴审查自固定点（commit、branch、tag 或 merge-base）以来的改动：Standards（代码是否遵守本仓库成文的编码规范）与 Spec（代码是否符合来源 issue 或 spec 的要求）。两轴在并行子代理中运行并分列汇报。用于审查分支、PR、进行中的改动，或用户要求“审查自某处以来的改动”时。"
---

对 `HEAD` 与调用方给定固定点之间的 diff 做双轴审查（上游为 Matt Pocock Skills）：

- **Standards**：代码是否符合本仓库成文的编码规范？
- **Spec**：代码是否忠实实现了来源 issue 或 spec？

两轴在**并行子代理**中运行，互不污染上下文，再由本技能汇总两份发现。

## 1. 固定审查范围

- **普通审查**：固定点由调用方提供，未提供时询问；先用 `git rev-parse <fixed-point>` 验证，再用 `git diff <fixed-point>...HEAD` 获取 diff，并用 `git log <fixed-point>..HEAD --oneline` 列出提交。固定点无效或 diff 为空时在启动子代理前结束。
- **仅 QA 工作流调用时**：固定点取 `.scratch/<feature>/_qa/scope.json` 的 `base`，提交列表用 `git log <base>..HEAD --oneline`；diff 改用预先 collect 的 `.scratch/<feature>/_qa/review-package.diff`（包含未提交改动和相关未跟踪文件）。`_qa/review-package.json` 中 `changedFiles` 为空且没有 `unreviewed` 时视为空 diff，在启动子代理前结束。
- QA 的 `scope.json`、`review-package.diff` 与 `review-package.json` 均由 QA 工作流维护；审查期间不得执行 `git add`、`git add -N`、commit、stash、reset 或 checkout。

## 2. 识别 spec 来源

按以下顺序查找来源 spec：提交信息中的 issue 引用、调用方传入的路径、`.scratch/` 或 `docs/` 下与分支/特性匹配的 spec。找不到时问用户；用户说没有时，Spec 子代理跳过并报告「没有可用 spec」。

## 3. 识别规范来源

Standards 子代理的规范来源必须包含：根及改动所在子目录的 `CLAUDE.md`、`.claude/rules/` 下与改动相关的规则文件；改动 UI 时加 `DESIGN.md`，改动 QA 工作流自身时加 `docs/agents/qa-workflow.md`。`AGENTS.md` 是符号链接，不重复提供。

规范来源之外，Standards 轴始终携带以下 **Fowler 坏味道基线**（`Refactoring` ch.3）。两条约束：**仓库成文规范优先**，文档认可的做法不报；**每条都只是判断建议**（`S-J`），不是硬违规。工具已强制的项跳过：

- **Mysterious Name**：函数、变量或类型的名字没有揭示它做什么或持有何物。→ 改名；改不出诚实的名字说明设计本身含混。
- **Duplicated Code**：同一逻辑形状出现在多个 hunk 或文件。→ 抽取共享形状，两处调用。
- **Feature Envy**：方法访问另一个对象的数据多于自己的。→ 把方法移到它羡慕的数据上。
- **Data Clumps**：同一组字段或参数总是结伴出现。→ 捆成一个类型传递。
- **Primitive Obsession**：用原始类型或字符串冒充领域概念。→ 给概念一个自己的小类型。
- **Repeated Switches**：同一类型的 `switch`/`if` 级联在改动中反复出现。→ 换成多态，或共享一张映射表。
- **Shotgun Surgery**：一个逻辑变化迫使改动散落多处。→ 把一起变化的东西收进一个模块。
- **Divergent Change**：同一文件因多个不相关原因被改。→ 拆分，使每个模块只因一个原因变化。
- **Speculative Generality**：为 spec 没有的需求增加抽象、参数或钩子。→ 删除，等到真实需求出现。
- **Message Chains**：调用方不应依赖的长链 `a.b().c().d()`。→ 在第一个对象上提供一个方法隐藏这条链。
- **Middle Man**：只做转发的类或函数。→ 去掉，直接调用真实目标。
- **Refused Bequest**：子类或实现者忽略/覆盖了继承来的大部分内容。→ 去掉继承，改用组合。

## 4. 并行启动两个子代理

两轴同时启动，等待两份返回后汇总；前台或后台按宿主与调用方约束执行。

**Standards 子代理 prompt 必须包含**：完整 diff 来源与提交列表、第 3 节的规范来源与坏味道基线全文，以及 brief：

> 只报告有依据的编号发现与实际核对范围：(a) diff 违反成文规范的每一处，引用规范文件与条款；(b) 基线坏味道点名并引用 hunk。硬违规与 S-J 按仓库规则区分。无发现只写「无发现」加实际读取文件/范围，不逐文件、不逐 hunk 重复无发现，不写 Fowler 十二项全无发现矩阵，不用“完全、100%、严格”等无证据总评。

**Spec 子代理 prompt 必须包含**：diff 来源与提交列表、spec 路径或内容，以及下方 brief；仅 QA 工作流调用时另给 `_qa/reconciliation.md`、`_qa/spec-review-checklist.json`（manifest 声明时）与 `qa-plan.md` 执行记录证据列引用的 `screenshots/`。

> 报告 spec 缺失/部分实现、范围蔓延与错误实现，每条引用 spec 原文。逐行核对实测值或绑定是否证明冻结断言：unit/integration 沿绑定查看叶子测试的实际断言，browser/api 查看过程脚本的硬断言，不能只看标题或 PASS。若实现错误而谓词仍会通过，以 `[P-W<n>]` 报告并引用该行。只按冻结断言原文核对截图；截图必须支撑其 **VisualTarget**（语义区域 + 稳定定位器）。单纯取景不全但硬断言与截图仍是同一目标时，沿用「脚本已硬断言、截图只是取景不全时不编号」，只写正文；目标被替换成标题、状态卡或整页时按 `[P-W<n>]` 报告。未核实项对应 spec 的 US 或冻结断言时，必须核实或以 `[P-M<n>]` 编号并写明未核实。manifest 声明 specReviewChecklist 时，原文必须包含 `## 对账覆盖` 五列表：`| 审查项 | 对账实测值或绑定 | 结论 | 源码位置与谓词摘要 | 计划变更复核 |`；逐字复制清单 actual，同绑定可合并 ID，结论写已核实/未核实，引用真实 `path:line`。冻结与当前断言不同写 `变更成立` 或 `变更不成立`，未变化写不适用。响应注入与核心链路真实冒烟沿用正本规则；acceptance 有 BLOCKED 时只能写“无新增审查发现”，不得宣称整体通过。

**审查执行边界（必须写入两个 prompt）**：

- **只读静态核对**：不得重跑测试套件、`typecheck`、`lint` 或启动服务；测试是否通过以 `qa-run` 日志与阶段 7 `qa-check` 为准。仅当怀疑某条叶子测试虚假通过时，打开该测试源码核对谓词。
- **严禁读取同轮另一轴的 `review/` 原文**，保持双轴独立。
- **严禁跨特性读取其他 `.scratch/` 目录**；编号与格式以本技能为准。
- 派发审查子代理前先选定具备写文件与执行命令权限的 profile；审查子代理必须具备写文件与执行命令权限，只读探索型代理不得担任审查者（如 Kimi Code 的 `explore` profile 不能担任，需选可写的 `coder` 等 profile）。quota/配额耗尽、无效模型别名、语言服务不可用、用户取消或无返回时，不自动换模型、不重派同轴同轮代理；保留已落盘内容并保持待独立审查，由用户决定后续会话。

**QA 绑定与封存（仅 QA 工作流调用时）**：每个子代理 prompt 写入两行 `QA_REVIEW_BINDING: .scratch/<feature>|r<n>|standards`（Spec 轴用 `spec`）与 `QA_REVIEW_NONCE: <nonce>`；nonce 从 `_qa/review-challenge.json` 读取，使用仓库相对特性目录与实际轮次，不得省略或复用其他轮次。prompt 同时给出可复制执行的 seal 命令与宿主名。子代理把最终审查内容直接写入 `.scratch/<feature>/review/r<n>-standards.md` 或 `review/r<n>-spec-axis.md`（首轮 n 为 1），再运行 `node tooling/scripts/review-package.mjs seal .scratch/<feature> --round r<n> --axis standards|spec --file review/r<n>-standards.md|review/r<n>-spec-axis.md --reviewer-kind subagent --host "<宿主名>"`（r2 起加 `--pending-ids "<编号,...>"`），让最终返回包含 seal 打印的 `QA_REVIEW_RECEIPT: <nonce>|<sha256>` 一行。

**QA 主代理职责（仅 QA 工作流调用时）**：主代理不转抄、不改写、不重算审查原文；只检查原文与 `.source.json` 是否存在，然后进入三档分流；未进分流表的默认驳回 S-J 在 `## 默认驳回` 中列出编号与原文位置。封存前必须定稿，**禁止封存后删除 `.source.json` 重封**。

**QA 宿主差异（仅 QA 工作流调用时）**：

- 有 challenge 的新协议不再允许同轮原文纠偏；新协议不得改原文或重算凭据。原文有问题时按真实返回保留、保持待独立审查，或按新轮次重新审查。无 challenge 的旧轮次仍按旧规则：子代理只返回、主代理逐字落盘，可按真实最终返回同轮纠偏。
- 无子代理的宿主（如 Codex）由用户手动另开独立会话或终端完成一轴审查，使用同一 challenge 与 nonce 运行 seal，`--reviewer-kind external-session`；主代理不得自动启动 `codex exec` 等无头审查者。外部会话是否真正独立由人工终审确认。
- 子代理报超时或 `no_final_message` 时，主代理先核对 `review/` 原文与同名 `.source.json` 是否已匹配当前 nonce 与哈希；齐全一致即认领为独立审查完成，不追问、不 `resume`。

**QA 单轴复审（r2 起，仅 QA 工作流调用时）**：被审代码或文档未变（审查包 `treeDigest` 未变）且仅修改分流或轨迹文字时，只有存在待复核编号的轴需要产出最新轮原文，另一轴可沿用与当前审查包同一 `treeDigest` 的旧轮次。执行记录、绑定、日志或截图变化时 Spec 轴必须复审，过程脚本变化时 Standards 与 Spec 双轴必须复审；主代理在复审输入列明 QA 产物变化，检查器不猜测变化语义，由人工终审核对。若被审代码或文档变化，仍需双轴对本轮修复改过的文件做增量复审。每轴每轮只派一个子代理，不重派替代代理；返回被截断或不完整时保留已写入内容或按原样处理，在 review-report 审查方式行写明该轴不完整，该轮保持待独立审查，不得追问、续传或让子代理重写；某轴失败或没有返回时同样保持待独立审查，主代理不得代写原文或代 seal。

## 5. 汇总

把两份发现分别放在 `## Standards` 与 `## Spec` 下呈现，**不要合并或跨轴重排**；两轴分离正是为了不让一轴掩盖另一轴。QA 新协议的汇总不得回写或加工审查原文文件。

- 每条发现以编号开头：Standards 轴 `[S-H<n>]` 硬违规、`[S-J<n>]` 判断建议；Spec 轴 `[P-M<n>]` 缺失或部分实现、`[P-W<n>]` 实现有误、`[P-X<n>]` 范围蔓延；同轴序号递增，复审新发现接续编号；一个编号只报一处问题，同类多处分别编号。
- 已证实造成行为错误的问题报 `[P-W<n>]`，不报 S-J；仅有潜在风险的不升级。与本特性无关的既有工作区状态不编号，只在正文提及。
- 无发现时写「无发现」，「无发现」不带编号。S-J 只报有明确当前成本的问题。
- 不得为满足字数限制省略、截断或合并编号发现。不读取、比较或提示模型差异；用户或宿主已配置子代理模型时照用，未配置时按宿主机制继承主会话模型。前台或后台不限。普通审查直接汇总两轴返回；仅 QA 工作流调用时，审查方式行以 `宿主=<宿主名>；` 开头作为说明（如 `审查方式：宿主=Claude Code；…`），qa-check 在有 challenge 的新轮次按证据判定。
- 除旧轮次纠偏外，不得在原文中加头注、还原转义或做任何加工；需要说明的写进 review-report。

## QA 复审（r2 起，仅 QA 工作流调用时）

给子代理完整审查包、它自己的历次原文、spec、主代理列出的**本轮修复改过的文件**与 QA 产物变化，以及全部待复核编号与理由：上轮本次修编号，以及上一轮分流表中 S-H、P-M、P-W 类被驳回或转专项的编号与理由；Spec 子代理另给当前的 `screenshots/`；不给实现者的修复尝试记录。

子代理对上轮每个本次修编号写 `[编号] 已修`、`[编号] 未修` 或 `[编号] 修错`；对每个给出的驳回或转专项编号核对理由引用的 ADR、契约或源码是否属实且支持该档位，写 `[编号] 改档成立` 或 `[编号] 改档不成立`。部分修复写未修，状态词后尽量不加限定语（残留或原因另起一句），新发现只针对本轮修复改过的文件。每个待复核编号都要在原文中写出；检查器只核对编号是否出现，状态以主代理的分流表为准，由人工终审对照原文核对。有 challenge 的新协议还要求子代理把收到的待复核编号原样写入 seal 的 `--pending-ids`，供 qa-check 在自述凭据路径提示复审输入是否完整。
