# 技能定制注入清单（Skill Customizations）

本文件描述 `/setup-qa-workflow` 对既有技能和配置的定制。每项必须带 `项目定制` 标记；已存在相同标记时跳过，不重复注入。`{CORE_LINKS}` 必须替换为安装时确认的核心链路。

## 1. `to-spec` —— 后续动作与成本默认值

在“发布 spec 后告知下一步”处注入：

```text
标准/慢车道立即以 inline 默认运行 /qa-test-planner，快车道无需额外计划；跨会话/跨人交接或用户明确选择 /implement-spec 并行时运行 /to-tickets，单会话串行冲刺直接从 spec 起 /implement。只有用户显式 --independent 才增加一个规划子代理，不自动指定或升级模型。
```

## 2. `implement` —— 基线、串行冲刺、验收与审查交接

在实现步骤中注入或更新项目段：

```text
改代码前执行 node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单> 固化快照并冻结 Schema 3 计划；阶段产物需要纳入时用 add 以 base 为前值扩大范围，禁止手改 scope.json 或 prechange。默认单会话串行完成就绪工单，不自动提交。命令证据经 node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令> 生成；触及 {CORE_LINKS} 时按 qa-workflow 阶段 5 inline 完成真实浏览器验收，并在规划和验收边界运行 node tooling/scripts/qa-check.mjs。验收后实际调用 code-review，由其统一负责 collect、独立双轴、报告、最终交付命令和 qa-check review；未实际调用或没有独立结果时保持待独立审查，不得凭空生成 review-report.md。结果: PASS 只称机器校验通过，不替代独立审查与人工终审。
```

## 3. `implement-spec` —— 显式并行、合并回归与审查交接

在并发实现步骤中注入或更新项目段：

```text
仅用户明确选择并行时执行，最多 2 个实现子代理，不自动指定模型。主 Agent 串行合并并逐次运行集成测试；合并遵循 Git 确认边界。Worktree 不隔离数据库、Redis、端口或上游额度，高耦合任务回退串行。核心链路验收由主编排 Agent inline 完成。随后在 integration 结果上实际调用 code-review，由其统一负责独立双轴和最终交付校验；未实际调用或没有独立结果时保持待独立审查，不得凭空生成 review-report.md。结果: PASS 只称机器校验通过，不替代独立审查与人工终审。
```

## 4. `handoff` —— 工作区交接

在交接路径规范中注入或更新项目段：

```text
同机断点续接写入 .scratch/<feature>/handoff.md；跨人或跨机器交接写入 docs/handoff/<日期>-<slug>.md。只引用 spec、qa-plan、ADR 和 diff 路径，不复制大段正文，不写入 API Key、Token、Cookie 或个人隐私。
```

## 5. `code-review` —— 独立审查、证据审计与交付校验

在完成标志和审查步骤中注入或更新项目段：

```text
中大型改动必须实际执行独立 Standards 与 Spec 审查，主 Agent 只汇总真实返回并保留原结论；没有实际调用或独立结果时保持待独立审查，不得凭空生成 review-report.md。审查来源优先记录真实技能轨迹或子代理、会话 ID；没有此类标识时记录可定位的独立会话或人工审查者，不强制统一 ID、transcript 文件或特定模型。证据审计逐 TC 对照冻结断言与过程脚本，核对实际目标行为和 NOTE 处置；核心实现变化重跑受影响验收，非行为文档变化记录不重跑理由，无法判断时保持 BLOCKED，TC tree 不一致不改为一律 FAIL。最终交付命令和 qa-check review 由本技能统一执行；结果: PASS 只称机器校验通过，不替代独立审查与人工终审。
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
