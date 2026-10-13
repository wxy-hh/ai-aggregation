# 技能定制钩子注入清单（Skill Customization Hooks）

本文件描述 `/setup-qa-workflow` 对既有技能与配置文件的四处定制注入。每处注入都带 `项目定制` 标记，便于上游技能升级时保留本节；重复执行时若标记已存在则跳过（幂等）。

注入文本中的 `{CORE_LINKS}` 占位符须替换为 scaffold 时确认的核心链路清单。

---

## 1. `to-spec` —— 下一步提示条件式化

**注入位置**：`to-spec/SKILL.md` 中「发布 spec 后告知用户下一步」的指令句（上游原文为笼统建议运行 `/to-tickets` 拆解工单）。

**目标文本**（替换或改写原指令句）：

```
发布 spec 后告知用户下一步（项目定制，上游升级时保留本节）：若预估跨会话/跨人交接、或计划用 `/implement-spec` 并发派发，运行 `/to-tickets` 拆解工单；单会话冲刺则直接从 spec 起 `/implement`，跳过拆票；若特性涉及用户可见核心链路，同时运行 `/qa-test-planner` 规划浏览器验收用例（见 `docs/agents/qa-workflow.md` 阶段 3B）。
```

**理由**：`/to-tickets` 拆出的 `issues/` 碎文件与 spec 内 Work Orders 小节存在多头同步摩擦，仅跨会话交接或并发派发场景才值得付出该成本。

---

## 2. `implement` —— 阶段 5 浏览器验收钩子

**注入位置**：`implement/SKILL.md` 中 "Once done, call the Skill tool with code-review" 之前。

**注入文本**：

```
若改动触及用户可见核心链路（{CORE_LINKS}），在 code-review 前按 `docs/agents/qa-workflow.md` 阶段 5 完成真实浏览器验收；无 qa-plan 时按该文档「无 qa-plan 时的验收」规则推导 3–5 条 P0 冒烟用例。
```

**理由**：`/implement` 技能本身不含浏览器验收步骤，此钩子确保跨会话单独执行 `/implement` 时阶段 5 不被跳过。

---

## 3. `implement-spec` —— 验收职责归属主编排 Agent

**注入位置**：`implement-spec/SKILL.md` 步骤 7（"Once all tickets are complete, call the Skill tool with code-review..."）的句尾追加。

**注入文本**：

```
若 spec 触及用户可见核心链路（{CORE_LINKS}），在 code-review 前由主编排 Agent 按 `docs/agents/qa-workflow.md` 阶段 5 完成真实浏览器验收——实现子代理不承担验收职责。
```

**理由**：并发派发的实现子代理各自在独立 worktree 工作，浏览器验收必须由主编排 Agent 在集成分支上统一执行。

---

## 4. `handoff` —— 跨人交接落盘入库

**注入位置**：`handoff/SKILL.md` 中 "Save to the temporary directory of the user's OS - not the current workspace." 句尾追加。

**注入文本**：

```
（项目定制，上游升级时保留本节：若交接对象是**其他组员或需跨机器可见**，改为落盘入库的 `docs/handoff/<日期>-<slug>.md`；同机会话续接仍用系统临时目录。）
```

**理由**：上游默认存系统临时目录，对跨人交接无意义；`docs/handoff/` 是入库的正式交接通道。

---

## 5. `docs/agents/issue-tracker.md` —— 追加跨人交接小节

**注入条件**：仅当 issue tracker 为 local markdown（`.scratch/`）变体且文件中没有 `## 跨人交接` 小节时，在文件末尾追加。

**注入文本**：

```markdown
## 跨人交接

`.scratch/` 是单机工作区且被 `.gitignore` 排除——工单、spec、qa-plan、截图、执行记录均不出本机。跨人交接时：

- 正式载体为**已入库**的 `docs/handoff/<日期>-<slug>.md` 交接文档 + PR 描述：由交接方从 `.scratch` 提炼关键决策、工单状态快照与验收证据写入，而非直接共享工作区；
- Epic 级特性的工单看板如需跨人可见，在交接文档中附工单清单与状态快照；
- 同机会话续接不受此限，仍直接读写 `.scratch/`。
```

**理由**：`.scratch/` 被 gitignore 排除，若不在规范中写明入库交接通道，「跨人交接才拆工单」的规则会与「工单不出本机」的事实自相矛盾。
