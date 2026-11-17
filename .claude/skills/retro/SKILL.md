---
name: retro
description: "编码会话复盘，排查开发过程中的环境阻力与规范缺失，提出针对性的环境改进建议。"
disable-model-invocation: true
---

The user has asked for a **retrospective**. You are suggesting improvements to the coding agent's **environment** to improve future runs.

## Steps

1. Read the primary sources for the session the user specifies. This may mean searching through session logs on this machine. If the user doesn't specify a session, default to the current one.

2. Look for candidates for improvement in these categories.

- **Navigation**: how easy was it for the agent to find the right files? Are there hidden dependencies between files? Would a **navigation pointer** make it easier? _Use when_ the session took a long time to find a piece of information.
- **Automated checks**: are there automated checks that could catch errors the agent made? Linting, typing, tests, filesystem linters? Read the repo's own check command first (its `package.json`/build-tool `lint`/`check` scripts, its CI workflow), so a check that already exists but sits unwired or silently broken is the finding, not a reinvention. A repo with no **guardrail** (no pre-commit hook and no CI job running its lint/typecheck/test command) is itself a finding: an un-linted repo is a standing missed opportunity, not a neutral default. _Use when_ the agent made a mistake an automated check could have caught, or the repo has no guardrail at all.
- **Coding standards**: should the **reviewer agent** be given a new rule to enforce? Should an existing rule be removed or clarified? Classify the violation first: a **mechanical** one (a fixed syntactic pattern, a banned API, an import shape, a file-location rule) gets a deterministic check, full stop: a custom rule in the repo's own linter, a new pre-commit hook, or a new CI job, whichever the repo's language and existing guardrail make cheapest. Default to building the check over writing the rule. Reserve `CODING_STANDARDS.md` for genuine **judgement calls** (cross-file consistency, "matches the surrounding style," anything no guardrail could ever substitute for). _Use when_ the reviewer agent failed to catch a mistake.
- **Global AGENTS.md**: are there any steering instructions that should be moved to coding standards (or automated checks) instead? _Use when_ the AGENTS.md file is particularly large - in the repo OR the user's global scope.
- **Tool economy**: did the agent make expensive tool calls that could be streamlined? Is there any custom tooling (CLI's, MCP's) that is particularly token-inefficient? _Use when_ the agent made an expensive tool call.
- **No-ops**: look for instructions in steering files that don't modify the agent's behavior. _Use when_ the steering files are large and unwieldy.
- **Workflow friction（流程摩擦）**：`docs/agents/qa-workflow.md` 中哪些流程步骤消耗了轮次/token 却没有产出（没抓到缺陷、没改变决策）？每次都执行但永远全绿的检查是噪声，不是 no-op——提案降级或删除。_Use when_ 会话按 QA 工作流执行后，某个强制步骤感觉纯属仪式。
- **Information access**: look for opportunities to increase the agent's access to information. Teeing dev server logs, readonly access to third-party services. _Use when_ a crucial piece of information was not available to the agent.

3. Present these candidates to the user, in order of severity.

## Reference

### Implementation vs Review

Remember that all work goes through two stages: implementation and review. The implementation agent has the most **context pressure**. They are responsible for exploration, writing code, and debugging failures.

The review agent has the least context pressure - it receives a diff, so no exploration needed. It often does not need to write code or debug.

This means that the review agent should be responsible for imposing coding standards, not the implementation agent.

### Files

You have access to several files in the repo:

- `CLAUDE.md`/`AGENTS.md`: these files are pushed to the context window of any agent working in this repo. They should be used incredibly sparingly, usually only for **navigation pointers** to other files.
- `CODING_STANDARDS.md`: this file is read during review, not implementation. Add **navigation pointers** to docs folders if the standards file gets more than 1,000 lines long.
- Docs: use docs as references files, pointed to by other files. Look for existing docs before writing new ones.
- Skills: use skills for docs (since their description goes into the agent's context window), or for user-invoked commands.

## 项目定制（上游升级时保留本节）

- 以工具轨迹（命令、技能加载行、子代理调用）和实际产物（spec、qa-plan、`_qa/prechange/`、`scripts/`、证据日志、截图）为准，不以交付汇报或自检门禁的自述为准。
- 按特性目录内全部文件与截图的最后修改时间，检索所有晚于特性建档的关联会话（含跨天续跑与交付后复验），不只分析用户指定的单个会话。
- 必须用宿主图像读取工具抽查真实截图图像与 `scripts/` 过程脚本逻辑（如 Kimi Code 用 `ReadMediaFile`、Claude Code 用 `Read`），不能只核对 `wire.jsonl`、日志文本或 `qa-check` 输出。
- 审查结论以 `review/` 原文与子代理转录（Claude Code 会话目录下 `subagents/agent-*.jsonl`）为准，不以 review-report 为准；逐个编号核对分流表有无漏列、改档或编造。
- 只列带出处（文件与行号、命令或日志路径）的事实与偏差，不给百分比、“完全符合”“标杆”这类结论。
- 建议在新会话复盘，但不强制。
