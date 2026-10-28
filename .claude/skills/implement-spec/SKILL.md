---
name: implement-spec
description: "慢车道实现整份技术规格：沿工单依赖图调度，互不阻塞的工单最多两个实现子代理并行，其余串行。"
disable-model-invocation: true
---

本技能用于慢车道（由用户调用）；标准车道使用 `implement` 单会话串行。工单是带阻塞关系的任务图，不是可以无视依赖同时派发的清单。

## 成本与隔离边界

- 同时最多 **2 个实现子代理**，不追求 maximum concurrency，不默认增加 exploration 或 merger 子代理，不自动指定或升级模型。
- 上下文以 spec、工单、研究笔记和 commit 的路径指针为主，避免重复粘贴。
- Worktree 只隔离文件和分支，不隔离数据库、Redis、端口、上游额度或测试账号。DB 迁移、共享状态、相同文件和公共契约高耦合任务必须串行。
- 创建分支、合并、清理 Worktree 等操作遵循 `.claude/rules/git-workflow.md` 的确认边界，不以本技能为名绕过确认。

## 执行步骤

1. 阅读 spec 和 tickets，确认依赖边、任务路径范围和测试命令；没有 tickets 时先使用 `to-tickets`，不要伪造依赖图。
2. 按既有 Git 规则创建或确认 integration branch。已有特性 `_qa/scope.json`（规划收口时已 init）时不再 init，没有时在改代码前执行 `review-package.mjs init` 生成 `_qa/scope.json`、冻结计划。若使用 PR，遵循现有 tracker 与用户授权。
3. 计算无阻塞工单 frontier，仅向彼此独立且资源不冲突的工单最多派发 2 个实现子代理；其他情况串行处理。每个子代理：
   - 在独立 Worktree 和分支中工作，确认基于 integration 当前基线；不得通过 reset 丢弃已有改动；
   - 调用 `tdd` 完成工单及对应测试；
   - 报告修改、测试和共享资源风险，不自行宣称整份 spec 完成。
4. 主 Agent 串行合并完成的分支，不默认另派 Merger。每次合并后运行该特性约定的集成测试；失败时先修复集成结果，不继续解锁后续 frontier。
5. 新 frontier 解锁后重复步骤 3–4，直到全部工单完成。保持实际并发数不超过 2，不在等待时盲目轮询。
6. 主编排 Agent 在 integration 结果上运行全量测试。触及核心链路时，先按 `docs/agents/qa-workflow.md` 阶段 5 inline 完成真实浏览器验收；实现子代理不承担这项验收。
7. 主编排 Agent 在 integration 结果上按 `docs/agents/qa-workflow.md` 阶段 6 串联：先 collect 完整改动范围的审查包，再用 Skill 工具调用 `code-review`（参数写明特性目录与轮次）；审查子代理的派发、编号与落盘规则只在该技能内，不要用 Agent 工具自行派审查子代理。两份原文落盘后，主 Agent 只在 `review-report.md` 按编号对账写三档分流与范围说明。Schema 4 计划按阶段运行 `qa-check`。
8. 未实际调用 `code-review` 或拿不到两份独立返回时保持“待独立审查”，不得凭空生成 `review/` 原文、`review-report.md` 或填写“独立审查”。宿主完全没有独立上下文能力时，只交付待审查材料包并合法暂停，不运行最终 `qa-check review`，由独立会话或人工接续。本次修明确修复后重跑受影响验证，重新 collect 并按正本增量复审，自动上限 2 轮，用尽后交人工裁决；独立审查完成前不得把文档写成完成态。
9. QA 工作流负责最终交付命令与 `qa-check review`，其 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，汇报须附该行及范围说明，不替代独立审查与人工终审。报告集成分支、测试证据、未验证项和实际 Agent 次数；未经授权不 push、不提交 PR、不删除分支或 Worktree。
