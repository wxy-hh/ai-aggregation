# 外部主流 AI 研发与规格工作流一手调研报告：Superpowers、Matt Pocock Skills 与 OpenSpec 架构与实证对比

> 调研日期：2026-10-24  
> 调研执行：只读外部一手资料独立调研（Subagent）  
> 评定权限说明：根据父代理指引，本报告专注记录可核验事实、代码/文档证据、相对优劣势与未验证局限，**不进行最终主观打分**，最终评分由父代理结合本地工作流统一裁决。

---

## 目录

1. [调研背景与方法论](#1-调研背景与方法论)
2. [项目版本与官方资料访问状态](#2-项目版本与官方资料访问状态)
3. [Superpowers (obra/superpowers) 深度实证解构](#3-superpowers-obrasuperpowers-深度实证解构)
   - 3.1 定位与适用场景
   - 3.2 实际工作流阶段与核心工件
   - 3.3 约束机制：Hook 会话注入与提示词铁律
   - 3.4 验证与 QA 体系：TDD、命令行硬性验证与“浏览器缺失”事实
   - 3.5 审查、串行执行、工作区隔离与工程成熟度
   - 3.6 变更后维护与归档机制
   - 3.7 相对本地闭环工作流的可证实优势与劣势
4. [Matt Pocock Skills (mattpocock/skills) 深度实证解构](#4-matt-pocock-skills-mattpocockskills-深度实证解构)
   - 4.1 定位与适用场景
   - 4.2 实际工作流阶段与核心工件
   - 4.3 约束机制：提示词规约与模型自主调用控制
   - 4.4 验证与 QA 体系：测试切缝、TDD 与“浏览器缺失”事实
   - 4.5 审查、任务图 Frontier 并行、隔离与交接能力
   - 4.6 变更后维护与归档机制
   - 4.7 相对本地闭环工作流的可证实优势与劣势
5. [OpenSpec (Fission-AI/OpenSpec) 深度实证解构](#5-openspec-fission-aiopenspec-深度实证解构)
   - 5.1 定位与适用场景
   - 5.2 实际工作流阶段与核心工件
   - 5.3 约束机制：确定性 CLI、Schema 状态机与 Agent 混合驱动
   - 5.4 变更后规格生命周期与归档体系（Living Specs 与 Stores 跨仓共享）
   - 5.5 验证与 QA 体系：静态三维审计与“运行时/浏览器缺失”事实
   - 5.6 并行执行、隔离与代码审查能力
   - 5.7 相对本地闭环工作流的可证实优势与劣势
6. [三者与本地工作流的多维对比矩阵](#6-三者与本地工作流的多维对比矩阵)
7. [关键未验证项与边界说明](#7-关键未验证项与边界说明)
8. [给父代理的综合研判依据](#8-给父代理的综合研判依据)

---

## 1. 调研背景与方法论

本报告旨在为评估本仓库定义的 QA 研发闭环工作流（`docs/agents/qa-workflow.md`、`docs/agents/qa-workflow-guide.md`）提供外部业界标杆的**一手事实基准**。父代理负责本地工作流的内部审读，本子代理独立检索并核验业界三个代表性开源项目的官方源码与文档。

### 调研原则：
1. **源码与文档为事实源**：拒绝照搬各项目的 README 营销宣传口号，直接基于其代码实现、配置文件、Hook 脚本、Slash 技能定义进行交叉验证；
2. **证据附带精确定位**：所有核心断言均附上官方 GitHub 仓库提交版本对应的源码路径与关键行号或文档锚点；
3. **区分能力层级**：明确区分：
   - **项目内置（Built-in）**：工具/技能开箱即带、有代码或文档规范支持的能力；
   - **可组合第三方实现（Composable Third-party）**：项目本身未实现，但留有标准接口可由外部工具挂载；
   - **仓库外团队流程（Out-of-repo Process）**：仅存在于口头或无技术约束的团队外置习惯。
4. **缺失明确声明**：当某项特性（如真实浏览器验收、视觉截屏断言、移动端设备视口模拟）在源码中无对应实现时，客观表述为**“未见官方内置支持”**，既不夸大为具备，也不臆测为“绝对不可能”。
5. **能力存在性审查而非效果 Benchmark**：本调研聚焦各项目官方源码与规范中是否存在对应功能的设计、机制与约束（能力存在性核查），并非在同一业务任务集下的端到端模型产出质量对照实验（效果 Benchmark）。

---

## 2. 项目版本与官方资料访问状态

本报告基于 2026-10-24 对各项目官方公开仓库与官方网站的实时核验，访问状态与基准版本记录如下：

| 项目标识 | 官方入口 | 调研对应版本 / Commit | 资料获取方式 |
| :--- | :--- | :--- | :--- |
| **Superpowers** | [GitHub: obra/superpowers](https://github.com/obra/superpowers) | Commit `2ce8aa15d05bd57213e6f746f953aafb7ded7a8b`<br>Tag `v7.0.1` (2026-10-21) | 官方源码全量检视、Git 提交树与 Release Notes |
| **Matt Pocock Skills** | [GitHub: mattpocock/skills](https://github.com/mattpocock/skills)<br>[skills.sh](https://skills.sh/mattpocock/skills) | Commit `5beb35b040e3de97e54fa9e386d7e42d15c295c2`<br>Plugin `v1.3.1` (2026-10-19) | 官方源码全量检视、技能清单与 Plugin 规范 |
| **OpenSpec** | [GitHub: Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)<br>[openspec.dev](https://openspec.dev) | Commit `6d04a1b58dedc95729d34e4f223d9d483aae210a`<br>NPM `@fission-ai/openspec` `v1.15.0` (2026-10-24) | 官方源码、CLI TypeScript 源码、官方文档站点 |

---

## 3. Superpowers (obra/superpowers) 深度实证解构

### 3.1 定位与适用场景
- **定位**：面向编码代理（Coding Agents）的**全流程工程方法论与可组合技能框架**（"A complete software development methodology for your coding agents"）。它将经典敏捷工程纪律（TDD、YAGNI、DRY、子代理隔离编排、代码审查）封装为规范化的 AI Skill 集合。
- **适用场景**：中大型功能开发、复杂单任务重构、需要长时间（1-2 小时）自主无人值守执行且依赖单元/集成测试保障的代码库。

### 3.2 实际工作流阶段与核心工件
在源码中，Superpowers 定义了一条明确的瀑布-敏捷混合推进链路：
1. **需求澄清与设计（Brainstorming）**：
   - 源码：[`skills/brainstorming/SKILL.md`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/brainstorming/SKILL.md)
   - 规则要求在写码前必须提出方案选项（Lay out approaches），产生短设计文档或完整设计文档（Short/Full design doc），经用户确认后方可进入计划阶段。
2. **任务计划拆解（Writing Plans）**：
   - 源码：[`skills/writing-plans/SKILL.md:20-55`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/writing-plans/SKILL.md#L20-L55)
   - 工件落盘路径：强制保存至 `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`。
   - 粒度要求：每个任务定义独立测试循环（"Task Right-Sizing"），步骤细化到“写失败测试”、“跑测试确认失败”、“最小化实现”、“跑测试确认通过”、“提交代码”。
3. **隔离与执行（Execution & Isolation）**：
   - 源码：[`skills/subagent-driven-development/SKILL.md:1-60`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/subagent-driven-development/SKILL.md#L1-L60)
   - 核心编排规则：**单一 Plan 级工作树隔离 + 严格串行实现 + 任务级新鲜子代理（Fresh Subagent per Task）**。
   - 串行纪律：原文明确规定 `Never dispatch multiple implementation subagents in parallel (conflicts).`，即实现任务严格串行推进，禁止并发写码以避免代码冲突；并发仅用于只读任务或独立分支。
   - 隔离与分层：在 plan 启动前通过 [`skills/using-git-worktrees/SKILL.md`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/using-git-worktrees/SKILL.md) 建立 Plan 级独立 Git 工作树；每个 task 生成全新实现子代理，由外部 coordinator 通过 ledger 记账并生成 task-brief 传递受控上下文，避免主会话上下文污染。
   - 任务级审查与修复闭环（Fix-Loop）：每个任务实现完成后，立即派发 Task Reviewer（检查 Spec 对齐与代码质量），若发现问题进入修复循环（Fix-Loop），确认通过后方可推进下一任务；全部任务完成后再执行 Whole-Branch 综合审查。
4. **代码审查（Review）**：
   - 源码：[`skills/requesting-code-review/SKILL.md`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/requesting-code-review/SKILL.md) 与 [`code-reviewer.md`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/requesting-code-review/code-reviewer.md)
   - 派发独立的只读 Senior Reviewer 子代理，从需求对齐、代码质量、架构、测试与生产就绪五个维度输出 `Critical`、`Important`、`Minor` 三级缺陷，并给出 `Ready to merge: Yes / No / With fixes`。
5. **分支整合与交付（Finishing）**：
   - 源码：[`skills/finishing-a-development-branch/SKILL.md:1-70`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/finishing-a-development-branch/SKILL.md#L1-L70)
   - 验证全量测试通过后，提供严格的三选一交互菜单：1. 本地合并；2. 推送并提 PR；3. 保持分支原样。

### 3.3 约束机制：Hook 会话注入与提示词铁律
- **机制构成**：**客户端 Hook 事件驱动 + Prompt 强注入 + 纯文本行为规范**。
- **源码实证**：
  - [`hooks/hooks.json:1-17`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/hooks/hooks.json#L1-L17) 声明监听 `SessionStart` 事件（匹配 `startup|clear|compact`）。
  - [`hooks/session-start:45-85`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/hooks/session-start#L45-L85) 脚本在会话启动时读取 `skills/using-superpowers/SKILL.md`，封装为带有 `<EXTREMELY_IMPORTANT>` 标签的 JSON 注入到宿主环境（支持 Claude Code 的 `hookSpecificOutput.additionalContext` 与 Cursor/Copilot 的 `additionalContext`）。
  - [`skills/using-superpowers/SKILL.md:8-25`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/using-superpowers/SKILL.md#L8-L25)：通过极为严苛的文字命令模型“只要有 1% 几率适用就必须调用技能”、“不可谈判（not negotiable）”，并提供心智借口识别表（Red Flags）。
- **确定性判定**：**非底层硬性拦截**。Hook 的作用仅在会话启动或压缩时注入提示词上下文，并非在完成或提交状态处实施二进制或运行时状态机硬拦截；若宿主模型忽略注入文本或处于不支持 Hook 的客户端中，约束将降级为普通提示词。

### 3.4 验证与 QA 体系：TDD、命令行硬性验证与“浏览器缺失”事实
- **验证核心（内置）**：
  - 核心铁律：[`skills/verification-before-completion/SKILL.md:15-35`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/verification-before-completion/SKILL.md#L15-L35) 确立了铁律（The Iron Law: `NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE`）。旨在降低无证据完成声明的风险，严禁使用 "should pass"、"looks good" 等臆测词汇，要求在当前上下文真实执行全量命令，读取 exit code 与失败计数。该机制本质仍属提示词纪律约束。
  - TDD 循环：[`skills/test-driven-development/SKILL.md`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/test-driven-development/SKILL.md) 强调测试驱动。
- **浏览器与前端交互（内置 vs 缺失事实）**：
  - **内置仅限于设计辅助**：在 `brainstorming` 阶段提供了一个 `visual companion`（[`skills/brainstorming/visual-companion.md:1-50`](https://github.com/obra/superpowers/blob/2ce8aa15d05bd57213e6f746f953aafb7ded7a8b/skills/brainstorming/visual-companion.md#L1-L50)），通过启动本地 Node.js HTTP/WebSocket 服务（`skills/brainstorming/scripts/server.cjs`），在浏览器打开静态 HTML 让用户直观对比设计方案或点击选项。
  - **QA 与验证阶段未见浏览器支持**：在实现后（Implementation）、审查前（Review）以及验收完成（Verification）阶段，官方源码中**未见任何端到端真实浏览器驱动（如 Playwright、Puppeteer、ego-browser 等）、未见 DOM 断言、未见移动端多视口断点、未见自动化视觉截屏比对能力**。其验收完全收敛在 CLI 自动化测试用例与退出码。

### 3.5 审查、串行执行、工作区隔离与工程成熟度
- **审查能力**：**项目内置独立子代理审查机制**。通过 `requesting-code-review` 派发新上下文审查员，基于三级严重度输出结构化结论。
- **串行实现与工作区隔离**：**串行实现而非并发写码**。通过 `subagent-driven-development` 编排子代理执行；通过 `using-git-worktrees` 在本地为整个 Plan 创建单一独立工作树。其实际工程成熟度优势体现在：
  1. **Ledger 记账与状态沉淀**：主控代理维护显式账本（Ledger），沉淀每项任务的 Ruling（裁决记录），支持中断后无缝恢复；
  2. **Task-Brief / Review-Package 脚本化传递**：主控代理将任务与审查上下文精简打包后单向传递给子代理，防止主会话膨胀；
  3. **模型分层调度**：针对协调者、实现者与代码审查员按需匹配不同模型或参数配置；
  4. **审查修复循环（Fix-Loop）**：任务审查若发现 Important/Critical 缺陷，直接派发修复子代理并在该任务闭环内再次审查，直至验收通过。
- **交接能力（Handoff）**：未设立单独的会话导出技能，依靠其工件目录 `docs/superpowers/plans/` 中记录的 Ruling、Task 勾选状态实现进度上下文恢复。

### 3.6 变更后维护与归档机制
- **计划与规格归档**：静态累积。所有 implementation plan 永久存放在 `docs/superpowers/plans/` 目录下；
- **长期活化规格维护**：**未见官方维护机制**。Superpowers 关注的是“一次功能交付生命周期（Feature Delivery Cycle）”，没有内置类似反向同步、全系统活化规格库（Living Specs）或 Delta Specs 合并机制。

### 3.7 相对本地闭环工作流的可证实优势与劣势
- **可证实优势**：
  1. **上下文保护与自主冲刺设计成熟**：`subagent-driven-development` 强调“每个任务新鲜子代理 + 串行执行避免冲突 + 任务间不随意向人类停顿问询（Continuous execution）+ 裁决记录（Ruling）”，结合 task-brief / review-package 打包与 fix-loop，形成了一套非常成熟的子代理执行流水线；
  2. **Hook 层级开箱自启动**：利用 `SessionStart` Hook 自动注入，在支持 Hook 的 IDE 中无需用户每次手动键入唤醒词；
  3. **完成前验证纪律性强**：`verification-before-completion` 形成明确的形式化检查纪律，有效降低了模型缺乏执行证据便声称完成的风险。
- **可证实劣势**：
  1. **前端与核心链路端到端真机验收盲区**：完全依赖 CLI 单元/集成测试，未见真实浏览器验收、未见设备视口模拟（如移动端/桌面端断点）、未见真机交互截图留痕；
  2. **缺乏双轨规格联动**：需求阶段只有粗粒度 design doc，没有像本地工作流一样将功能规格与端到端冒烟测试计划（QA Plan）双轨联动；
  3. **规格资产无生命周期维护**：计划文件写完即止，缺乏对长期系统架构文档的动态更新与归档系统。

---

## 4. Matt Pocock Skills (mattpocock/skills) 深度实证解构

### 4.1 定位与适用场景
- **定位**：面向资深软件工程师的**原子化、可插拔工程技能库**（"Agent skills that I use every day to do real engineering - not vibe coding"）。强调不霸占（own）整个软件生命周期、把控制权留给开发者，反对过度沉重的全家桶框架（GSD/BMAD）。
- **适用场景**：中大型敏捷演进项目、微服务或单体架构、需要精细化控制代码坏味道（Code Smells）、领域驱动设计（DDD）以及基于任务依赖图进行并发协作的场景。

### 4.2 实际工作流阶段与核心工件
Matt Pocock 技能集覆盖了软件工程核心生命周期，各阶段技能高度模块化：
1. **环境与基础设施脚手架（Setup）**：
   - 源码：[`skills/engineering/setup-matt-pocock-skills/SKILL.md:1-118`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/setup-matt-pocock-skills/SKILL.md#L1-L118)
   - 初始化目标项目规范：定义 Issue Tracker 存储策略（GitHub / GitLab / 本地 `.scratch/<feature>/`）、Triage 标签字典（5 类角色）、领域模型规范（`GLOSSARY.md` 与 `docs/adr/`）。
2. **需求审问与领域建模（Grilling & Domain Modeling）**：
   - 源码：[`skills/engineering/grill-with-docs/SKILL.md`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/grill-with-docs/SKILL.md)、[`skills/engineering/domain-modeling/SKILL.md`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/domain-modeling/SKILL.md)
   - 强调在写码前严格审问系统边界并落盘架构决策记录（ADR）。
3. **规格生成与任务图切片（To-Spec & To-Tickets）**：
   - 源码：[`skills/engineering/to-spec/SKILL.md:1-75`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-spec/SKILL.md#L1-L75)
   - 工件结构：不直接访谈，基于现有讨论综合生成 `Problem Statement`、`Solution`、`User Stories`（编号且详尽）、`Implementation Decisions`、`Testing Decisions`，并推送到 Issue Tracker。
   - 任务图切片：[`skills/engineering/to-tickets/SKILL.md:1-105`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/to-tickets/SKILL.md#L1-L105) 拆解为垂直切片（Tracer-bullet vertical slices），每个工单显式声明其前置依赖（`Blocked by` 边），并提出用 Expand-Contract 策略处理宽重构（Wide refactor）。
4. **并发实现与 TDD（Implement-Spec & TDD）**：
   - 源码：[`skills/engineering/implement-spec/SKILL.md:1-40`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/implement-spec/SKILL.md#L1-L40)
   - 编排逻辑：基于单个 `integration branch`，通过 Implementer Subagents 在各自的 Git Worktree 中并发开发无阻塞工单（Frontier），调用 `tdd` 在预定切缝（Seams）编写红绿测试，完成后由 Merger Subagent 合并到集成分支。
5. **双轴审查（Code Review）**：
   - 源码：[`skills/engineering/code-review/SKILL.md:1-89`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/code-review/SKILL.md#L1-L89)
   - 核心创新：**双轴并行子代理审查**。一轴为 **Standards 规范轴**（内置 Martin Fowler 12 项经典代码坏味道基准，如 Primitive Obsession、Feature Envy 等，同时遵循仓库本地编码规范），另一轴为 **Spec 需求轴**（审查 diff 是否忠实兑现起源工单）。两轴并行运行、互不污染上下文后聚合输出。
6. **交付、交接与复盘（PR, Handoff, Retro）**：
   - 源码：[`skills/engineering/pr/SKILL.md`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/pr/SKILL.md) 强调 PR 必须携带直观视觉概览、前后验证证据、单向门/双向门爆炸半径；
   - 源码：[`skills/productivity/handoff/SKILL.md:1-16`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/productivity/handoff/SKILL.md#L1-L16) 将长会话压缩为结构化交接文档落盘到系统临时目录（`$TMPDIR`），附带后续建议调用的 Skills 列表。

### 4.3 约束机制：提示词规约与模型自主调用控制
- **机制构成**：**纯 Markdown 技能提示词 + 显式调用门禁（`disable-model-invocation: true`）**。
- **源码实证**：
  - 仓库内**完全无 Hook 配置文件**（无 `hooks.json`）。
  - 在核心前置技能中（如 `setup-matt-pocock-skills`、`to-spec`、`to-tickets`、`implement-spec`、`implement`、`handoff`），Frontmatter 均声明了 `disable-model-invocation: true`。这代表此类技能**严禁模型私自调用**，必须由人类用户显式输入 Slash 命令（如 `/to-spec`）触发，以此防止模型在不确定时发生流程幻觉。
  - 对于 `code-review`，未设置该字段，允许模型在满足条件时自发调用。
- **确定性判定**：**纯提示词与用户意图门禁**。其约束依赖用户的操作习惯或团队制度，不具备 CLI 二进制拦截层。

### 4.4 验证与 QA 体系：测试切缝、TDD 与“浏览器缺失”事实
- **验证核心（内置）**：
  - 系统切缝理念（Seams）：在 `to-spec` 阶段强制要求识别系统的公共可观察边界（Seams，"The fewer seams across the codebase, the better - the ideal number is one"），主张在系统最高切缝处构建测试，而非将测试局限于底层内存单元单测；
  - TDD 循环：源码 [`skills/engineering/tdd/SKILL.md`](https://github.com/mattpocock/skills/blob/5beb35b040e3de97e54fa9e386d7e42d15c295c2/skills/engineering/tdd/SKILL.md) 明确声明 `Refactoring is not part of the loop`。其核心纪律是紧凑的“写失败测试 -> 编写最小实现使之通过”，将重构移出测试红绿循环，保持步长极小。
- **浏览器与真实设备支持情况（实证核对）**：
  - 在 `skills/engineering/diagnosing-bugs/SKILL.md:29` 中，官方文档提及“Headless browser script (Playwright / Puppeteer)”作为复现复杂 Bug 的手段之一（属于**建议外部团队编写脚本**，非技能内置工具）；
  - 在 `skills/engineering/pr/SKILL.md:162` 中提及“Screenshots are S-tier - when the environment is set up for it and the change is visual”（属于**PR 呈现规范**）；
  - 在 `skills/engineering/prototype/UI.md:3` 提及支持单路由多 UI 变体在浏览器切换；
  - **核心事实**：在 `implement-spec`、`tdd`、`code-review` 整个验证主链路中，**未见项目内置的可见浏览器验收卡点**。运行时端到端或集成测试依赖开发者在最高切缝处编写的测试脚本或项目原生流水线驱动，未内置真实可见窗口交互与多端视口仿真断言。

### 4.5 审查、任务图 Frontier 并行、隔离与交接能力
- **审查**：内置双轴审查（Standards + Spec），属于目前 AI 研发审查领域极为成熟的模型设计；
- **并行与隔离**：基于有向无环图（DAG）的 Frontier 并发机制设计优秀，通过 Git Worktree 隔离子代理环境；
- **交接**：内置 `handoff` 技能，支持将长会话提炼为结构化交接文档供后续会话衔接。

### 4.6 变更后维护与归档机制
- **工单流转归档**：依赖关联的 Issue Tracker。当 `implement-spec` 完成后，对应的 tickets 与 spec 随着 PR merge 或 Issue close 动作而关闭；
- **长期活化规格维护**：依靠 `domain-modeling` 维护根目录 `GLOSSARY.md` 与 `docs/adr/`。但对于具体的业务功能行为规格（User Stories / Scenarios），随着工单关闭即沉淀为历史记录，**未见官方针对活化规格的集中增量合并器**。

### 4.7 相对本地闭环工作流的可证实优势与劣势
- **可证实优势**：
  1. **拓扑任务图（DAG Frontier）并发模型设计优雅**：`to-tickets` 与 `implement-spec` 将任务建模为具有 `blocked by` 边的依赖图，前置任务完成后动态解锁后续 frontier，理论并发度极高；
  2. **双轴审查标准结构清晰**：Standards 轴结合 Fowler 代码坏味道与 Spec 轴相结合的范式，直接被本仓库吸收借鉴；
  3. **架构侵入度极低**：纯技能目录分发，开发者可以自由选择只用 `grill-with-docs` 或只用 `code-review`，不捆绑全局运行态。
- **可证实劣势**：
  1. **未见内置可见浏览器与设备端到端卡点**：整个工作流终点在代码测试通过与双轴审查，未定义真实可见浏览器交互测试、缺少真实登录态继承、无移动端/桌面端视口仿真的验收约束；
  2. **缺乏流程自检显式提示（Execution Gate）**：没有类似本地在开工首部强制声明“QA 阶段、核心链路判定、验收计划、审查状态”的结构化自检模板，依赖操作者自发遵循规范。

---

## 5. OpenSpec (Fission-AI/OpenSpec) 深度实证解构

### 5.1 定位与适用场景
- **定位**：**AI 原生的规格驱动开发与规格全生命周期管理系统**（"AI-native system for spec-driven development"）。它不是单纯的提示词库，而是一个包含专用 CLI、规范 Schema、工件状态机计算与跨仓存储的独立工程基础设施。
- **适用场景**：中大型产品研发、复杂领域需求变更频繁、对系统长期功能规格真实度（Living Documentation）要求极高、跨前端/后端/多端微服务仓库协同的场景。

### 5.2 实际工作流阶段与核心工件
在 OpenSpec 中，软件变更严格遵循标准工件生命周期：
1. **探索（Explore）**：
   - 交互指令：`/opsx:explore`（对应技能 `skills/openspec-explore/SKILL.md`）
   - 定位为无负担的思考伙伴，阅读代码、权衡方案、生成 ASCII 架构图，在不创建任何工件的情况下定义问题边界。
2. **提案与增量规格定义（Propose）**：
   - 交互指令：`/opsx:propose <change-name>`（对应技能 `skills/openspec-propose/SKILL.md`）
   - 工件目录机制：在项目或 Store 中建立 `openspec/changes/<change-name>/`。工件产物集合由当前 schema 及其依赖闭包定义（常见为 `proposal.md`、`specs/`、`design.md`、`tasks.md`），但也支持条件裁剪（例如小型改动可不生成可选的 `design.md`，或声明 `skip_specs: true` 仅做任务跟踪），并非所有变更都强绑定固定的四类产物。
   - Delta Specs 语法：包含 specs 的变更采用严格结构化差分语法（`## ADDED Requirements`、`## MODIFIED Requirements`、`## REMOVED Requirements`、`## RENAMED Requirements`），每个 Requirement 必须包含以 `WHEN...THEN...` 描述的具体 `Scenario:`。
3. **实现任务（Apply）**：
   - 交互指令：`/opsx:apply`（对应技能 `skills/openspec-apply-change/SKILL.md`）
   - Agent 读取 `openspec instructions apply --change <name> --json` 计算出的工件依赖图，逐项实现代码并打勾任务复选框。
4. **规格验证（Verify）**：
   - 交互指令：`/opsx:verify`（对应技能 `skills/openspec-verify-change/SKILL.md:1-180`）
   - 源码明确声明 `Verification is advisory`（验证为建议性审计），针对当前实现进行静态三维核对：
     - **完整性（Completeness）**：对照 tasks 勾选状态与 spec 需求覆盖情况；
     - **正确性（Correctness）**：检查代码中是否存在兑现需求与 scenario 的逻辑或测试迹象；
     - **一致性（Coherence）**：检查代码是否遵循设计文档中的架构约定与项目既有模式。
     - **注意**：该验证属于模型对代码和文档的静态审查与推理，并不等于实际运行项目的测试套件。
5. **规格同步与归档（Sync & Archive）**：
   - 交互指令：`/opsx:archive`（对应技能 `skills/openspec-archive-change/SKILL.md:1-220`）
   - 对任务完成度与工件完整性进行检查，将增量 Delta Specs 智能合并进全系统活化规格库（`openspec/specs/`），并将变更目录移动至归档目录。

### 5.3 约束机制：确定性 CLI、Schema 状态机与 Agent 混合驱动
- **机制构成**：**独立编译型 CLI（Node/Rust/Go 原生单二进制） + JSON Schema 校验器 + Agent 提示词协同**。
- **源码实证**：
  - 核心入口：`package.json` 导出 CLI 命令 `openspec`（`bin/openspec.js`）。
  - 确定性校验：[`src/commands/validate.ts:1-745`](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/src/commands/validate.ts#L1-L745) 提供了强类型的静态分析器，检查所有 spec 是否符合规范（是否有未闭合标签、非法操作类型、缺失 scenario 等），不通过直接返回非零退出码阻断后续操作。
  - 状态计算：`src/commands/workflow/status.ts` 提供确定性的 JSON 输出，准确计算工件的存在性与 tasks 的完成百分比（`completedTasks / totalTasks`）。
  - 指令渲染：`src/commands/workflow/instructions.ts:861-932` 动态生成上下文指引。
- **确定性判定**：**边界处确定性强约束，执行中 Agent 驱动，流程保留人工确认（Override）权限**。在工件语法合规、Schema 契约上由 CLI 执行强类型拦截；在归档时，CLI 提供结构化任务计数，若存在未完成任务或未同步规格，系统会发出警告并询问用户是否强制继续（confirm to proceed），同时支持用户选择 "Archive without syncing"（跳过规格同步直接归档）。

### 5.4 变更后规格生命周期与归档体系（Living Specs 与 Stores 跨仓共享）
这是 OpenSpec 相对纯提示词库的显著架构优势：
1. **活化规格库（Living Specs）**：
   - 系统主规格统一存放在 `openspec/specs/<capability>/spec.md`，代表当前代码库被正式采纳与维护的预期能力规格。
2. **Delta Specs 动态差分与合入机制**：
   - 源码：[`skills/openspec-archive-change/SKILL.md:100-180`](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/skills/openspec-archive-change/SKILL.md#L100-L180) 与 [`skills/openspec-sync-specs/SKILL.md:1-120`](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/skills/openspec-sync-specs/SKILL.md#L1-L120)。
   - 在归档同步时，将变更中的 `specs/` 增量合入主规格：
     - `ADDED Requirements`：按标准结构追加到主 spec 的 `## Requirements`；
     - `MODIFIED Requirements`：就地更新已有 requirement 下的描述与 scenario；
     - `REMOVED Requirements`：从主 spec 中剔除（若该 capability 最后一个 requirement 被移除且声明 `retire_capabilities: true`，则连同 spec 文件一同销毁）；
     - 校验清洗：合入后的主 spec 绝不允许残留任何 `## ADDED Requirements` 等 Delta 临时标记，保证主规格格式规范整洁。
3. **归档落盘（Archive）**：
   - 源码：[`skills/openspec-archive-change/SKILL.md:185-205`](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/skills/openspec-archive-change/SKILL.md#L185-L205)
   - 经状态检查与用户确认后，执行目录移动：`mv openspec/changes/<change-name> openspec/changes/archive/YYYY-MM-DD-<change-name>`，形成可追溯的变更历史记录。
4. **跨仓规范共享（Stores 机制，Beta）**：
   - 源码与文档：[`src/commands/store.ts:1-250`](https://github.com/Fission-AI/OpenSpec/blob/6d04a1b58dedc95729d34e4f223d9d483aae210a/src/commands/store.ts#L1-L250)、[openspec.dev/docs/stores](https://openspec.dev/docs/stores)
   - 支持将 `openspec/` 独立成 Git 仓库（如 `team-plans`）。多个工程仓库（如 `web-app`、`api-server`、`mobile-app`）通过在其本地配置 `store: team-plans` 或命令行带 `--store`，即可跨多个仓库共享同一套功能规格与变更方案，有助于多端协同。

### 5.5 验证与 QA 体系：静态三维审计与“运行时/浏览器缺失”事实
- **验证核心（内置）**：
  - 内置仅包含 `openspec validate`（CLI 语法与工件完整性校验）和 `openspec-verify-change`（基于 LLM 的静态代码与文档交叉核对）。
- **浏览器与运行时验证（官方支持事实）**：
  - 源码全面检索结果：在 OpenSpec 的 TypeScript 核心库以及官方技能中，**完全未见任何端到端测试运行器、未见浏览器驱动（Browser Driver）、未见视觉比对或真机模拟逻辑**。
  - 官方定位非常明确：OpenSpec 专注于解决 **"Building the right thing"（规格生命周期）**，而不介入“代码运行时如何测试（How to run code tests）”。它假设具体的单元测试、E2E 测试由项目的测试框架（Vitest/Jest/Playwright）或外部工作流自行组织。

### 5.6 并行执行、隔离与代码审查能力
- **并行与隔离**：单变更内由 `tasks.md` 顺序或独立推进；虽然官方设计了并行合并计划（`openspec-parallel-merge-plan.md`）和 Worksets，但**未见内置类似 Superpowers 那种自动派发多子代理并自动挂载独立 Git Worktree 的编排流水线**；
- **代码审查**：依靠 `verify` 技能做需求对齐审计，但缺少像 Matt Pocock 那样深入 AST 与代码坏味道（Code Smells）的双轴规范审查体系。

### 5.7 相对本地闭环工作流的可证实优势与劣势
- **可证实优势**：
  1. **规格生命周期（Spec Lifecycle）与 Living Docs 体系健全**：拥有完备的“Delta 提议 -> 智能合并 -> 活化主规格 -> 历史归档”流程，能系统性降低项目随迭代导致文档漂移和腐化的风险；
  2. **确定性 CLI 工具与标准化契约**：拥有单二进制/Node CLI，能够通过 `validate` 和 `status --json` 提供机器可读的确定性卡点，易于接入 CI/CD 流水线；
  3. **Stores 跨仓跨端协同能力**：原生支持将产品规格作为独立 Git 仓库分发给多端消费，适合多仓库协同架构。
- **可证实劣势**：
  1. **未见内置运行时端到端真实浏览器与视觉验收**：不验证用户在浏览器中实际渲染的 UI、不执行可见交互验证、不支持移动端断点与触控验收；
  2. **验证体系属于静态文档/代码审计**：`openspec-verify` 本质是 LLM 阅读代码文本对比 spec，无法替代实际运行时的自动化功能测试、真实网络环境下的 API 联调与集成验收；
  3. **缺少开发期子代理并发执行编排**：缺少开箱即用的新鲜子代理隔离与工作树自动化调度机制。

---

## 6. 三者与本地工作流的多维对比矩阵

基于上述实证代码与文档分析，下表将外部三个项目与本地基于 `qa-workflow.md` 的闭环工作流进行严格横向比对：

| 评估维度 | 本地工作流 (`qa-workflow.md`) | Superpowers (`obra/superpowers`) | Matt Pocock Skills (`mattpocock/skills`) | OpenSpec (`Fission-AI/OpenSpec`) |
| :--- | :--- | :--- | :--- | :--- |
| **主要定位** | 全栈闭环交付与严格端到端质量保障工作流 | 通用编码代理全流程工程方法论与技能体系 | 资深工程师可插拔原子化工程技能库 | AI 原生规格驱动开发与规格生命周期管理系统 |
| **约束实现机制** | **流程规则强制 + 自检声明 + disable-model-invocation（支持的宿主）+ 人工终审；未见统一执行状态机** | **Hook 会话注入**（SessionStart 注入 Prompt 规则，非完成状态硬拦截） | **纯提示词** + 关键技能 `disable-model-invocation: true` | **CLI + Schema + Prompt 混合**（CLI 确定性校验与计数，流程保留人工 override） |
| **需求与架构产物** | `ADR` + `spec.md` + 联动 `qa-plan.md` 冒烟用例 | Brainstorming 设计文档 (`docs/.../plans/`) | `GLOSSARY.md` + `docs/adr/` + Tracker Spec (`Problem/Stories`) | `openspec/changes/<name>/` (`proposal/design/tasks/specs`，按需裁剪) |
| **规格生命周期管理** | 按 feature 目录维护 spec 与 qa-plan | 静态保存在 `docs/superpowers/plans/`，无合入机制 | 绑定 Issue Tracker，随 Issue 关闭而结案 | **结构化全流程**：Delta Specs 智能合入 `openspec/specs/` 并归档 |
| **跨多仓规格共享** | 单体/Monorepo 内规范共享，未见独立跨仓机制 | 未见跨仓机制 | 基于 GitHub/GitLab 远程 Tracker 协同 | **项目内置**：Stores 独立 Git 仓库跨仓/多端同步 (Beta) |
| **单元测试与 TDD** | 项目内置/依赖 TDD 技能与项目原生测试脚本 | **项目内置**：测试驱动开发与严格命令行验证纪律 | **项目内置**：最高切缝 (Seams) 理念与 TDD (重构在循环外) | **未内置**：假设由项目原生测试工具自行覆盖 |
| **真实浏览器端到端验收** | **流程强制卡点**（macOS 可见窗口 `ego-browser` 交互与截图） | **未见内置**（仅前期设计有静态 HTML 预览服务） | **未见内置工具**（仅文档提及建议外部编写脚本） | **未见内置**（无浏览器驱动与运行时端到端能力） |
| **真实设备/多视口适配** | **桌面可见 Chromium + 移动视口仿真；不等于真实 iOS/Android 设备** | **未见官方支持** | **未见官方支持** | **未见官方支持** |
| **代码审查 (Review)** | **双轴审查**（Standards 规范轴 + Spec 需求轴）三档结论 | 派发 Senior Reviewer 子代理，出具三级缺陷报告 | **双轴审查原生出处**：内置 Fowler 12 项坏味道基准 | 静态三维审计（Completeness / Correctness / Coherence） |
| **任务隔离与并发** | 单会话批量冲刺 + `implement-spec` 的 DAG Frontier 并发与工单级 Worktree（提示词编排） | **串行实现（禁止并发实现子代理）+ 新子代理上下文隔离 + plan 级 worktree** | **基于 DAG Frontier 的并发子代理 + 工单级 Worktree** | 依赖 tasks.md 组织，未内置子代理调度流水线 |
| **长会话交接能力** | 继承既有 handoff 记录与状态规范 | 依赖计划文件与 Ledger 记录断点续跑 | **内置** `handoff` 技能（压缩会话生成临时结构化交接文档） | 依赖 `status --json` 计算断点，支持 continue change |

---

## 7. 关键未验证项与边界说明

为恪守严谨的调研规范，以下事项在当前环境下**标记为未验证或具备特定边界**，不作为确定性事实采信：
1. **源码检视属于能力存在性审查，而非同任务效果 Benchmark**：本报告核查的是各项目官方源码、配置与规范中是否存在对应的设计与机制，不代表在真实开发任务下的模型执行成功率对照实验。
2. **Superpowers 的商业服务真实表现（未验证）**：
   - Superpowers README 中提及针对企业的商业服务支持（`sales@primeradiant.com`，管理预算与额外工具），其商业闭源组件是否包含更强的浏览器端或企业级 CI 拦截器，外部开源资料中**无法验证**。
3. **OpenSpec Stores 在大规模并发 Git 冲突下的自动合并能力（未验证）**：
   - 官方文档说明 Stores 处于 **Beta** 阶段，其对于数十人团队同时针对同一 capability 提交流程时的底层冲突解决机制，文档明确声明 OpenSpec "never clones, pulls, or pushes"（不替用户做 Git 远端同步），在复杂 Git 冲突场景下的团队维护成本**未在大规模真实团队中验证**。
4. **Matt Pocock Skills 在非 Claude 环境下的完整表现（部分验证）**：
   - 虽然 Matt Pocock 声称适用于任何模型（Any model），但部分高级技能（如 `chief-of-staff`、复杂并发 `implement-spec`）依赖宿主工具对并行 Subagent 和 Git Worktree 的支持能力，在小型或无子代理能力的 CLI 中其实际效果**无法完全验证**。
5. **外部项目组合第三方浏览器工具的可能性（边界说明）**：
   - 必须区分**“项目内置支持”**与**“理论上可自行集成”**：无论是 Superpowers、Matt Pocock 还是 OpenSpec，任何开发者当然都可以在其任务计划或 tasks.md 中手写一条命令 `npx playwright test`。但本报告核验的是其**官方框架与工作流设计本身是否包含该约束或工具**。事实证明，三者官方均未内置类似本地 `ego-browser` 这种在审查交付前弹出可见窗口、继承登录态的人机协同验收环节。

---

## 8. 给父代理的综合研判依据

在父代理对本地工作流进行最终评分与评估时，本一手调研结论可提供以下关键事实支撑：

1. **本地工作流在“运行时可见浏览器验收与视口仿真”上的显著设计差异**：
   - 外部三个项目的内置防护网主要集中在**测试驱动开发（TDD）、编译与构建通过、静态 Lint、代码坏味道审查以及 LLM 静态文档比对**。
   - 本地工作流将“桌面可见 Chromium `ego-browser` 交互验收”、“移动端与桌面多视口仿真截屏落盘”、“继承真实登录态”作为交付前的流程规则要求，旨在降低前端水合失败、样式断点崩塌和交互假死等真实交互缺陷的遗漏风险（需注意视口仿真仍不等于 iOS/Android 真机物理设备测试）。
2. **本地工作流在“审查规范与流程提醒”上的融合吸收**：
   - 本地吸收并复用了 Matt Pocock 的双轴审查（Standards + Spec）设计思路，并细化了三档处置结论；
   - 本地在开工首部设立了显式声明自检门禁（Execution Gate），作为对操作者和模型的一种可视化提醒机制，提醒其遵循流程规范。
3. **本地工作流可向 OpenSpec 借鉴的远期演进方向（规格生命周期）**：
   - 本地目前的 spec 与 qa-plan 主要按特定功能目录存放，随特性开发完成而沉淀为历史档案；
   - OpenSpec 的 **Living Specs（全局活化主规格库） + Delta Specs（增量提议差分智能合并清洗）** 机制具有很高的参考价值。若未来本地能引入规范合并与清洗机制，将验收通过的规格自动合入全平台的活化说明书中，并结合类似 CLI 工具提供自动化语法与状态检测，将有助于长期架构资产的系统化沉淀。
