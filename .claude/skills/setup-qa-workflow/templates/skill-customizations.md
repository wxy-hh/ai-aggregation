# 技能定制注入清单（Skill Customizations）

本文件描述 `/setup-qa-workflow` 对既有技能和配置的定制。每项必须带 `项目定制` 标记；已存在相同标记时跳过，不重复注入。`{CORE_LINKS}` 必须替换为安装时确认的核心链路。

## 1. `to-spec` —— 后续动作与成本默认值

在“发布 spec 后告知下一步”处注入：

```text
US 按外部可区分的行为完整覆盖，不为实现步骤或参数变体拆条，一个 TC 可覆盖多条 US；已确认的接缝直接引用，未确认时一次性向用户确认。spec 必须包含 Testing Decisions、Out of Scope 和 ## 交付命令（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令，qa-check plan 会核对计划是否原样包含）；推翻既有 ADR、评测结论或默认值时写明被推翻项、依据与各选项代价，宣称质量或性能收益时写明所需效果证据。沿用当前车道，只写一个建议下一步：标准车道 /qa-test-planner，慢车道 /to-tickets，快车道 /implement。只有用户显式 --independent 才增加一个规划子代理，不自动指定或升级模型。
```

## 2. `implement` —— 基线、串行冲刺、验收与审查交接

在实现步骤中注入或更新项目段：

```text
已有 _qa/scope.json（规划收口时已 init）时不再 init；没有时在改代码前执行 node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单> 固化快照并冻结 Schema 4 计划；阶段产物需要纳入时用 add 以 base 为前值扩大范围，禁止手改 _qa/。默认单会话串行完成就绪工单，不自动提交。实现中发现改动已不符合当前车道的判定标准时停下，报告依据与建议车道，按 qa-workflow 车道升级处理。命令证据经 node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令> 生成；触及 {CORE_LINKS} 时按 qa-workflow 阶段 5 inline 完成真实浏览器验收，过程脚本放在 scripts/ 并以脚本路径经 qa-run 运行，每条冻结断言硬断言后输出 [TC01-1] PASS 实测：<值>，失败输出 FAIL 标记并非零退出；unit/integration 的 PASS 行在绑定列写 `<测试文件>` › <用例标题>；登录在脚本外完成，过程脚本从已登录状态开始：已有会话直接用，否则由用户在可见窗口登录或用用户提供的专用测试账号在真实登录页登录一次，脚本内不得出现任何登录行为，不得注入 Cookie、直连数据库或签发令牌；环境无法验证 DOM、真实交互或移动几何时记 BLOCKED 或经计划变更转人工，不用低接缝证据替代；在规划和验收边界运行 node tooling/scripts/qa-check.mjs。验收后按 qa-workflow 阶段 6 串联：先 collect 审查包，再用 Skill 工具调用 code-review（参数写明特性目录与轮次），审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理；三档分流按编号逐条核对，S-H、P-M、P-W 驳回须引 ADR 或契约；本次修或 S-H、P-M、P-W 改档后增量复审，自动上限 2 轮（r2、r3），判改档不成立的改为本次修、不得再次改档，用尽仍有未修、修错或改档不成立时照常完成交付验证并交人工裁决。拿不到两份子代理原文时保持待独立审查，不得凭空生成 review/ 原文或 review-report.md；宿主完全没有独立上下文能力时只交付审查包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。QA 工作流负责最终交付命令和 qa-check review；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 3. `implement-spec` —— 显式并行、合并回归与审查交接

在并发实现步骤中注入或更新项目段：

```text
慢车道由用户调用，按依赖图只对互不阻塞的工单并行，最多 2 个实现子代理，不自动指定模型。已有 _qa/scope.json 时不再 init。主 Agent 串行合并并逐次运行集成测试；合并遵循 Git 确认边界。Worktree 不隔离数据库、Redis、端口或上游额度，高耦合任务回退串行。核心链路验收由主编排 Agent inline 完成。随后在 integration 结果上按 qa-workflow 阶段 6 串联：先 collect 审查包，再用 Skill 工具调用 code-review（参数写明特性目录与轮次），审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理；三档分流按编号逐条核对，S-H、P-M、P-W 驳回须引 ADR 或契约；本次修或 S-H、P-M、P-W 改档后增量复审，自动上限 2 轮（r2、r3），判改档不成立的改为本次修、不得再次改档，用尽仍有未修、修错或改档不成立时照常完成交付验证并交人工裁决。拿不到两份子代理原文时保持待独立审查，不得凭空生成 review/ 原文或 review-report.md；宿主完全没有独立上下文能力时只交付审查包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。QA 工作流负责最终交付命令和 qa-check review；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 4. `to-tickets` —— 拆票后的下一步

在“发布工单后告知下一步”处注入：

```text
发布工单后报告当前已完成阶段 3A、车道（沿用当前车道，只写车道名）、本阶段产物（issues 目录与就绪工单）；建议下一步：/qa-test-planner，只写这一个命令。
```

## 5. `handoff` —— 工作区交接

在交接路径规范中注入或更新项目段：

```text
同机断点续接写入 .scratch/<feature>/handoff.md；处于 QA 工作流中时附 QA 续接快照：阶段与车道、最近一次 qa-check 命令与结果行、审查轮次与待复审编号、_qa/scope.json 是否已 init。跨人或跨机器交接写入 docs/handoff/<日期>-<slug>.md。只引用 spec、qa-plan、ADR 和 diff 路径，不复制大段正文，不写入 API Key、Token、Cookie 或个人隐私。
```

## 6. `code-review` —— QA 调用时的 diff 来源与原文落盘

`code-review` 保持 Matt Pocock 上游原文，只在技能末尾追加以下项目段；collect、三档分流、增量复审上限与交付由 qa-workflow 阶段 6–7 负责：

```markdown
QA 工作流在审查前不提交代码，因此由它调用本技能时替换 diff 来源与原文落盘方式，其余步骤按上文执行：

- Standards 子代理的规范来源必须包含：根及改动所在子目录的 `CLAUDE.md`、`.claude/rules/` 下与改动相关的规则文件；改动 UI 时加 `DESIGN.md`，改动 QA 工作流自身时加 `docs/agents/qa-workflow.md`。`AGENTS.md` 是符号链接，不重复提供。
- 两轴 brief 的 “Under 400 words” 只是简洁建议，不得为满足字数限制省略、截断或合并编号发现。
- 固定点取 `.scratch/<feature>/_qa/scope.json` 的 `base`；commit 列表仍用 `git log <base>..HEAD --oneline`。
- diff 改用 QA 工作流事先 collect 生成的 `.scratch/<feature>/_qa/review-package.diff`（包含未提交改动和相关未跟踪文件），两个子代理的 diff 输入都传这个文件路径，代替 `git diff <fixed-point>...HEAD`。
- `_qa/review-package.json` 中 `changedFiles` 为空且没有 `unreviewed` 时视为空 diff，按上文在启动子代理前结束。
- 两个子代理继承主会话模型，调用时不传 model；用户明确指定审查模型时照做，并在 review-report 的审查方式行写明。前台或后台不限。
- review-report 的审查方式行以 `宿主=<宿主名>；` 开头声明审查所在宿主（如 `审查方式：宿主=Claude Code；…`）；声明为其他宿主时 qa-check 跳过 Claude Code 转录核验，改由人工按该行核对来源。
- 子代理只返回审查内容，不要求它写文件；格式问题不得成为修改原文的理由。主代理把每个子代理的返回逐字写入 `.scratch/<feature>/review/r<n>-standards.md` 或 `review/r<n>-spec-axis.md`（n 为轮次，首轮 1），不删改、不总结、不重排，已存在的文件不得覆盖。两份原文都落盘后主代理才进入三档分流，第 5 步汇总不再粘贴原文。
- 每轴每轮只派一个子代理，不重派替代子代理；返回被截断或不完整时照原样落盘，在 review-report 审查方式行写明该轴不完整，该轮保持待独立审查，不得追问、续传或让子代理重写；某轴失败或没有返回时同样保持待独立审查，主代理不得代写原文。
- 不得在原文中加头注、还原转义或做任何加工；需要说明的写进 review-report。
- Spec 子代理额外输入 `.scratch/<feature>/_qa/reconciliation.md` 与 `qa-plan.md` 执行记录证据列引用的 `screenshots/` 文件，brief 追加：「逐行核对对账表的实测值或绑定是否证明冻结断言，不成立的以 `[P-W<n>]` 报告并引用该行；只按冻结断言原文核对截图：截图证明断言不成立，或暴露真实的遮挡、错位、空白等视觉错误时以 `[P-W<n>]` 报告并写明截图路径；脚本已硬断言、截图只是取景不全时不编号，写在正文；未核实项对应 spec 的 US 或冻结断言时，必须核实或以 `[P-M<n>]` 编号并写明未核实；对账表标注「响应注入」的行，断言涉及工具调用、质检、持久化、计费等服务端行为的以 `[P-W<n>]` 报告；特性触及核心链路却没有任何未标注「响应注入」的 browser 证据时以 `[P-M<n>]` 报告。」
- 每条发现以编号开头：Standards 轴 `[S-H<n>]` 硬违规、`[S-J<n>]` 判断建议；Spec 轴 `[P-M<n>]` 缺失或部分实现、`[P-W<n>]` 实现有误、`[P-X<n>]` 范围蔓延；同轴序号递增，复审新发现接续编号；一个编号只报一处问题，同类多处分别编号。已证实造成行为错误的问题报 `[P-W<n>]`，不报 S-J；仅有潜在风险的不升级。与本特性无关的既有工作区状态不编号，只在正文提及。无发现时写「无发现」，「无发现」不带编号。S-J 只报有明确当前成本的问题。
- 复审（r2 起）给子代理完整审查包、它自己的历次原文、spec、主代理列出的本轮修复改过的文件，以及上一轮分流表中 S-H、P-M、P-W 类被驳回或转专项的行（只给编号与理由两列）；Spec 子代理另给当前的 `screenshots/`；不给实现者的修复尝试记录。子代理对上轮每个本次修编号写 `[编号] 已修`、`[编号] 未修` 或 `[编号] 修错`，对每个给出的驳回或转专项编号核对理由引用的 ADR、契约或源码是否属实且支持该档位，写 `[编号] 改档成立` 或 `[编号] 改档不成立`；部分修复写未修，状态词后尽量不加限定语（残留或原因另起一句），新发现只针对本轮修复改过的文件。每个待复核编号都要在原文中写出；检查器只核对编号是否出现，状态以主代理的分流表为准，由人工终审对照原文核对。
- 审查期间不执行 `git add`、`git add -N`、commit、stash、reset 或 checkout。
```

## 7. `tdd` —— 复用已确认接缝

在技能末尾追加项目段：

```text
spec 的 Testing Decisions 与已冻结 qa-plan 的 Seam 视为已确认的 Seam，直接在其上写测试；只有找不到、与计划冲突或需要新增 Seam 时才停下确认，确认后在 qa-plan 的 ## 计划变更 记录。
```

## 8. `pr` —— 遗留事项

在 Evidence 段的项目约定后追加：

```text
走过 QA 工作流的 PR 在 Merge Danger 之后追加 ## 遗留事项：原样引用 node tooling/scripts/qa-check.mjs review 的结果行（未运行写“待独立审查”及原因），列出分流表中的待人工裁决编号与未验证项，没有则写“无”。
```

## 9. `docs/agents/issue-tracker.md` —— 跨人交接

若无 `## 跨人交接` 小节则追加：

```markdown
## 跨人交接

`.scratch/` 是单机工作区且被 `.gitignore` 排除——工单、spec、qa-plan、截图、执行记录均不出本机。跨人交接时：

- 正式载体为已入库的 `docs/handoff/<日期>-<slug>.md` 和 PR 描述，由交接方提炼关键决策、状态快照与验收证据，而非直接共享工作区；
- Epic 级特性需要共享看板时，在交接文档附工单清单与状态快照；
- 同机会话续接仍直接读写 `.scratch/`。
```
