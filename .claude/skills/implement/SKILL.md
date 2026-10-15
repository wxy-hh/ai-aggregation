---
name: implement
description: "依据技术规格或任务工单逐步实现功能，在代码接缝处驱动 TDD 开发并在提交前执行审查。"
disable-model-invocation: true
---

Implement the work described by the user in the spec or tickets.

Call the Skill tool with "tdd" where possible, at pre-agreed seams.

Run typechecking regularly, single test files regularly, and the full test suite once at the end.

若改动触及用户可见核心链路（认证、流式对话、图像/视频生成提交、语音录制、历史记录），在 code-review 前按 `docs/agents/qa-workflow.md` 阶段 5 完成真实浏览器验收；无 qa-plan 时按该文档「无 qa-plan 时的验收」规则推导 3–5 条 P0 冒烟用例。

Once done, call the Skill tool with "code-review" to review the work.

Commit your work to the current branch.
