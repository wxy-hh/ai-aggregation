# 技能定制注入清单（Skill Customizations）

本文件描述 `/setup-qa-workflow` 对既有技能和配置的定制。每项必须带 `项目定制` 标记；已存在相同标记时跳过，不重复注入。`{CORE_LINKS}` 必须替换为安装时确认的核心链路。

## 1. `to-spec` —— 后续动作与成本默认值

在“发布 spec 后告知下一步”处注入：

```text
spec 必须包含 Testing Decisions、Out of Scope 和 ## 交付命令（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令，qa-check plan 会核对计划是否原样包含）；推翻既有 ADR、评测结论或默认值时写明被推翻项、依据与各选项代价，宣称质量或性能收益时写明所需效果证据。沿用阶段 1 的车道，只写一个建议下一步：标准车道 /qa-test-planner，慢车道 /to-tickets，快车道 /implement。只有用户显式 --independent 才增加一个规划子代理，不自动指定或升级模型。
```

## 2. `implement` —— 基线、串行冲刺、验收与审查交接

在实现步骤中注入或更新项目段：

```text
已有 _qa/scope.json（规划收口时已 init）时不再 init；没有时在改代码前执行 node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单> 固化快照并冻结 Schema 4 计划；阶段产物需要纳入时用 add 以 base 为前值扩大范围，禁止手改 _qa/。默认单会话串行完成就绪工单，不自动提交。命令证据经 node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令> 生成；触及 {CORE_LINKS} 时按 qa-workflow 阶段 5 inline 完成真实浏览器验收，过程脚本放在 scripts/ 并以脚本路径经 qa-run 运行，每条冻结断言硬断言后输出 [TC01-1] PASS 实测：<值>，失败输出 FAIL 标记并非零退出；unit/integration 的 PASS 行在绑定列写 `<测试文件>` › <用例标题>；登录在脚本外完成，过程脚本从已登录状态开始：已有会话直接用，否则由用户在可见窗口登录或用用户提供的专用测试账号在真实登录页登录一次，脚本内不得出现任何登录行为，不得注入 Cookie、直连数据库或签发令牌；环境无法验证 DOM、真实交互或移动几何时记 BLOCKED 或经计划变更转人工，不用低接缝证据替代；在规划和验收边界运行 node tooling/scripts/qa-check.mjs。验收后按 qa-workflow 阶段 6 串联：先 collect 审查包，再用 Skill 工具调用 code-review（参数写明特性目录与轮次），审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理；三档分流按编号逐条核对，驳回须引 ADR 或契约；本次修后增量复审，自动上限 2 轮，用尽仍有未修或修错时照常完成交付验证并交人工裁决。拿不到两份子代理原文时保持待独立审查，不得凭空生成 review/ 原文或 review-report.md；宿主完全没有独立上下文能力时只交付审查包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。QA 工作流负责最终交付命令和 qa-check review；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 3. `implement-spec` —— 显式并行、合并回归与审查交接

在并发实现步骤中注入或更新项目段：

```text
慢车道由用户调用，按依赖图只对互不阻塞的工单并行，最多 2 个实现子代理，不自动指定模型。已有 _qa/scope.json 时不再 init。主 Agent 串行合并并逐次运行集成测试；合并遵循 Git 确认边界。Worktree 不隔离数据库、Redis、端口或上游额度，高耦合任务回退串行。核心链路验收由主编排 Agent inline 完成。随后在 integration 结果上按 qa-workflow 阶段 6 串联：先 collect 审查包，再用 Skill 工具调用 code-review（参数写明特性目录与轮次），审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理；三档分流按编号逐条核对，驳回须引 ADR 或契约；本次修后增量复审，自动上限 2 轮，用尽仍有未修或修错时照常完成交付验证并交人工裁决。拿不到两份子代理原文时保持待独立审查，不得凭空生成 review/ 原文或 review-report.md；宿主完全没有独立上下文能力时只交付审查包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。QA 工作流负责最终交付命令和 qa-check review；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 4. `to-tickets` —— 拆票后的下一步

在“发布工单后告知下一步”处注入：

```text
发布工单后报告当前已完成阶段 3A、车道（沿用阶段 1，只写车道名）、本阶段产物（issues 目录与就绪工单）；建议下一步：/qa-test-planner，只写这一个命令。
```

## 5. `handoff` —— 工作区交接

在交接路径规范中注入或更新项目段：

```text
同机断点续接写入 .scratch/<feature>/handoff.md；跨人或跨机器交接写入 docs/handoff/<日期>-<slug>.md。只引用 spec、qa-plan、ADR 和 diff 路径，不复制大段正文，不写入 API Key、Token、Cookie 或个人隐私。
```

## 6. `code-review` —— QA 调用时的 diff 来源与原文落盘

`code-review` 保持 Matt Pocock 上游原文，只在技能末尾追加以下项目段；collect、三档分流、增量复审上限与交付由 qa-workflow 阶段 6–7 负责：

```markdown
QA 工作流在审查前不提交代码，因此由它调用本技能时替换 diff 来源与原文落盘方式，其余步骤按上文执行：

- 固定点取 `.scratch/<feature>/_qa/scope.json` 的 `base`；commit 列表仍用 `git log <base>..HEAD --oneline`。
- diff 改用 QA 工作流事先 collect 生成的 `.scratch/<feature>/_qa/review-package.diff`（包含未提交改动和相关未跟踪文件），两个子代理的 diff 输入都传这个文件路径，代替 `git diff <fixed-point>...HEAD`。
- `_qa/review-package.json` 中 `changedFiles` 为空且没有 `unreviewed` 时视为空 diff，按上文在启动子代理前结束。
- 两个子代理继承主会话模型，调用时不传 model；用户明确指定审查模型时照做，并在 review-report 的审查方式行写明。前台或后台不限。
- 子代理只返回审查内容，不要求它写文件；主代理把每个子代理的返回逐字写入 `.scratch/<feature>/review/r<n>-standards.md` 或 `review/r<n>-spec-axis.md`（n 为轮次，首轮 1），不删改、不总结、不重排，已存在的文件不得覆盖。两份原文都落盘后主代理才进入三档分流，第 5 步汇总不再粘贴原文。
- 每轴每轮只派一个子代理，不重派替代子代理；返回不完整时照原样落盘，某轴失败或没有返回时该轮保持待独立审查，主代理不得代写原文。
- Spec 子代理额外输入 `.scratch/<feature>/_qa/reconciliation.md`，brief 追加：「逐行核对对账表的实测值或绑定是否证明冻结断言，不成立的以 `[P-W<n>]` 报告并引用该行。」
- 每条发现以编号开头：Standards 轴 `[S-H<n>]` 硬违规、`[S-J<n>]` 判断建议；Spec 轴 `[P-M<n>]` 缺失或部分实现、`[P-W<n>]` 实现有误、`[P-X<n>]` 范围蔓延；同轴序号递增，复审新发现接续编号；一个编号只报一处问题，同类多处分别编号。无发现时写「无发现」。
- 复审（r2 起）只给子代理它自己的历次原文、上一次 collect 之后新增的修复 diff 与 spec，不给实现者的修复尝试记录；子代理对上轮每个本次修编号写 `[编号] 已修`、`[编号] 未修` 或 `[编号] 修错`，状态词后不加限定语（部分修复写未修，残留另起一句），只对修复 diff 报告新发现。
- 审查期间不执行 `git add`、`git add -N`、commit、stash、reset 或 checkout。
```

## 7. `docs/agents/issue-tracker.md` —— 跨人交接

若无 `## 跨人交接` 小节则追加：

```markdown
## 跨人交接

`.scratch/` 是单机工作区且被 `.gitignore` 排除——工单、spec、qa-plan、截图、执行记录均不出本机。跨人交接时：

- 正式载体为已入库的 `docs/handoff/<日期>-<slug>.md` 和 PR 描述，由交接方提炼关键决策、状态快照与验收证据，而非直接共享工作区；
- Epic 级特性需要共享看板时，在交接文档附工单清单与状态快照；
- 同机会话续接仍直接读写 `.scratch/`。
```
