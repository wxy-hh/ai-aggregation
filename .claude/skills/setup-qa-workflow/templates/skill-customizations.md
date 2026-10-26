# 技能定制注入清单（Skill Customizations）

本文件描述 `/setup-qa-workflow` 对既有技能和配置的定制。每项必须带 `项目定制` 标记；已存在相同标记时跳过，不重复注入。`{CORE_LINKS}` 必须替换为安装时确认的核心链路。

## 1. `to-spec` —— 后续动作与成本默认值

在“发布 spec 后告知下一步”处注入：

```text
标准/慢车道立即以 inline 默认运行 /qa-test-planner，快车道无需额外计划；跨会话/跨人交接或用户明确选择 /implement-spec 并行时运行 /to-tickets，单会话串行冲刺直接从 spec 起 /implement。只有用户显式 --independent 才增加一个规划子代理，不自动指定或升级模型。
```

## 2. `implement` —— 基线、串行冲刺与验收

在实现步骤中注入或更新项目段：

```text
改代码前执行 node tooling/scripts/review-package.mjs init .scratch/<feature> -- <路径白名单> 固化快照并冻结 Schema 3 计划；阶段产物需要纳入时用 add 以 base 为前值扩大范围，禁止手改 scope.json 或 prechange。默认单会话串行完成就绪工单，不自动提交。命令证据经 node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令> 生成；触及 {CORE_LINKS} 时按 qa-workflow 阶段 5 inline 完成真实浏览器验收，并在规划、验收和审查边界运行 node tooling/scripts/qa-check.mjs。
```

## 3. `implement-spec` —— 显式并行与合并回归

在并发实现步骤中注入或更新项目段：

```text
仅用户明确选择并行时执行，最多 2 个实现子代理，不自动指定模型。主 Agent 串行合并并逐次运行集成测试；合并遵循 Git 确认边界。Worktree 不隔离数据库、Redis、端口或上游额度，高耦合任务回退串行。核心链路验收由主编排 Agent inline 完成。
```

## 4. `handoff` —— 工作区交接

在交接路径规范中注入或更新项目段：

```text
同机断点续接写入 .scratch/<feature>/handoff.md；跨人或跨机器交接写入 docs/handoff/<日期>-<slug>.md。只引用 spec、qa-plan、ADR 和 diff 路径，不复制大段正文，不写入 API Key、Token、Cookie 或个人隐私。
```

## 5. `docs/agents/issue-tracker.md` —— 跨人交接

若无 `## 跨人交接` 小节则追加：

```markdown
## 跨人交接

`.scratch/` 是单机工作区且被 `.gitignore` 排除——工单、spec、qa-plan、截图、执行记录均不出本机。跨人交接时：

- 正式载体为已入库的 `docs/handoff/<日期>-<slug>.md` 和 PR 描述，由交接方提炼关键决策、状态快照与验收证据，而非直接共享工作区；
- Epic 级特性需要共享看板时，在交接文档附工单清单与状态快照；
- 同机会话续接仍直接读写 `.scratch/`。
```
