# 技能定制注入清单（Skill Customizations）

本文件描述 `/setup-qa-workflow` 对既有技能和配置的定制。每项必须带 `项目定制` 标记；已存在相同标记时跳过，不重复注入。`{CORE_LINKS}` 必须替换为安装时确认的核心链路。

## 1. `to-spec` —— 后续动作与成本默认值

在“发布 spec 后告知下一步”处注入：

```text
spec 必须包含 Testing Decisions、Out of Scope 和 ## 交付命令（放在 Testing Decisions 之后，用一个代码块逐行写出最终需要真实运行的完整命令，qa-check plan 会核对计划是否原样包含）；推翻既有 ADR、评测结论或默认值时写明被推翻项、依据与各选项代价，宣称质量或性能收益时写明所需效果证据。标准/慢车道立即以 inline 默认运行 /qa-test-planner，快车道无需额外计划；跨会话/跨人交接或用户明确选择 /implement-spec 并行时运行 /to-tickets，单会话串行冲刺直接从 spec 起 /implement。只有用户显式 --independent 才增加一个规划子代理，不自动指定或升级模型。
```

## 2. `implement` —— 基线、串行冲刺、验收与审查交接

在实现步骤中注入或更新项目段：

```text
已有 scope.json（规划收口时已 init）时不再 init；没有时在改代码前执行 node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单> 固化快照并冻结 Schema 3 计划；阶段产物需要纳入时用 add 以 base 为前值扩大范围，禁止手改 scope.json 或 prechange。默认单会话串行完成就绪工单，不自动提交。命令证据经 node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令> 生成；触及 {CORE_LINKS} 时按 qa-workflow 阶段 5 inline 完成真实浏览器验收，过程脚本放在特性目录并以脚本路径经 qa-run 运行，关键预期必须有硬断言与失败非零退出，环境无法验证 DOM、真实交互或移动几何时记 BLOCKED 或经计划变更转人工，不用低接缝证据替代；在规划和验收边界运行 node tooling/scripts/qa-check.mjs。验收后按 qa-workflow 阶段 6 串联：先 collect 审查包，再实际调用 code-review，由它前台并行启动 Standards / Spec 两个独立上下文子代理；review-report.md 原样保留两份真实独立返回，三档分流由 QA 工作流逐条标注，驳回须引 ADR 或契约，人工终审确认。拿不到两份独立返回时保持待独立审查，不得凭空生成 review-report.md；宿主完全没有独立上下文能力时只交付待审查材料包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。QA 工作流负责最终交付命令和 qa-check review；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 3. `implement-spec` —— 显式并行、合并回归与审查交接

在并发实现步骤中注入或更新项目段：

```text
仅用户明确选择并行时执行，最多 2 个实现子代理，不自动指定模型。已有 scope.json 时不再 init。主 Agent 串行合并并逐次运行集成测试；合并遵循 Git 确认边界。Worktree 不隔离数据库、Redis、端口或上游额度，高耦合任务回退串行。核心链路验收由主编排 Agent inline 完成。随后在 integration 结果上按 qa-workflow 阶段 6 串联：先 collect 审查包，再实际调用 code-review，由它前台并行启动 Standards / Spec 两个独立上下文子代理；review-report.md 原样保留两份真实独立返回，三档分流由 QA 工作流逐条标注，驳回须引 ADR 或契约，人工终审确认。拿不到两份独立返回时保持待独立审查，不得凭空生成 review-report.md；宿主完全没有独立上下文能力时只交付待审查材料包，不运行最终 qa-check review，由独立会话或人工接续。独立审查完成前不把 backlog、计划等文档写成完成态。QA 工作流负责最终交付命令和 qa-check review；结果: PASS 只称机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审。
```

## 4. `handoff` —— 工作区交接

在交接路径规范中注入或更新项目段：

```text
同机断点续接写入 .scratch/<feature>/handoff.md；跨人或跨机器交接写入 docs/handoff/<日期>-<slug>.md。只引用 spec、qa-plan、ADR 和 diff 路径，不复制大段正文，不写入 API Key、Token、Cookie 或个人隐私。
```

## 5. `code-review` —— QA 调用时的 diff 来源适配

`code-review` 保持 Matt Pocock 上游原文，只在技能末尾追加以下项目段；collect、落盘、三档分流、复审与交付由 qa-workflow 阶段 6–7 负责：

```markdown
QA 工作流在审查前不提交代码，因此由它调用本技能时只替换 diff 来源，其余步骤按上文执行：

- 固定点取 `.scratch/<feature>/scope.json` 的 `base`；commit 列表仍用 `git log <base>..HEAD --oneline`。
- diff 改用 QA 工作流事先 collect 生成的 `.scratch/<feature>/review-package.diff`（包含未提交改动和相关未跟踪文件），两个子代理的 diff 输入都传这个文件路径，代替 `git diff <fixed-point>...HEAD`。
- `review-package.json` 中 `changedFiles` 为空且没有 `unreviewed` 时视为空 diff，按上文在启动子代理前结束。
- 审查期间不执行 `git add`、`git add -N`、commit、stash、reset 或 checkout。
```

## 6. `docs/agents/issue-tracker.md` —— 跨人交接

若无 `## 跨人交接` 小节则追加：

```markdown
## 跨人交接

`.scratch/` 是单机工作区且被 `.gitignore` 排除——工单、spec、qa-plan、截图、执行记录均不出本机。跨人交接时：

- 正式载体为已入库的 `docs/handoff/<日期>-<slug>.md` 和 PR 描述，由交接方提炼关键决策、状态快照与验收证据，而非直接共享工作区；
- Epic 级特性需要共享看板时，在交接文档附工单清单与状态快照；
- 同机会话续接仍直接读写 `.scratch/`。
```
