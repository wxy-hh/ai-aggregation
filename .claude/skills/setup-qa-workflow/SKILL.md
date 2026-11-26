---
name: setup-qa-workflow
description: "为项目安装 QA 工作流、轻量检查器、技能定制和浏览器验收约定；幂等补齐缺失项，不覆盖本地定制。"
disable-model-invocation: true
---

# Setup QA Workflow

在已有 Matt Pocock 基础技能的项目上安装七阶段 QA 闭环：spec → tickets/qa-plan → TDD → 真实验收 → 双轴审查 → PR 证据。

本技能本身是提示词引导的安装流程，不添加 Hooks。`qa-check.mjs` 是独立、零依赖检查器，只在用户或 Agent 显式调用时运行，不自动重试。

## 0. 前置条件（不满足则停止）

- 已安装 `to-spec`、`to-tickets`、`implement`、`implement-spec`、`tdd`、`code-review`、`pr`、`retro`、`handoff`、`grill-with-docs`、`diagnosing-bugs`、`resolving-merge-conflicts`、`improve-codebase-architecture`。
- 已安装 `qa-test-planner`；浏览器技能按宿主能力选择，macOS 可优先 vendor `ego-browser`。
- 已有 `docs/agents/issue-tracker.md`、`domain.md`（`docs/agents/triage-labels.md` 仅安装 `triage` 技能时必选）；缺失时先运行 `/setup-matt-pocock-skills`。

## 1. 探索

只读确认：

- 根 `package.json` 的 dev 命令、包管理器、首选端口与测试命令；
- Playwright 配置、E2E 目录和运行命令；选择原生 Node 驱动时，只读检查宿主根 `package.json` 是否将 `playwright` 声明为根级直接开发依赖，仅安装在工作区子包中不算；
- `CLAUDE.md` / `AGENTS.md` 及其符号链接关系；
- `docs/agents/`、`docs/handoff/`、`.gitignore` 和 `.claude/skills/` 是否入库；
- 用户可见核心链路，以及 `docs/agents/qa-workflow.md`、`tooling/scripts/` 核心工具是否已存在。

向用户汇总 `{DEV_COMMAND}`、`{WEB_PORT}`、`{E2E_COMMAND}`、`{E2E_DIR}`、`{CORE_LINKS}`、`{TEST_COMMAND}` 和技能入库选择，确认后再写入。不得读取或打印秘密值。探索不等于修改，安装过程不得修改宿主 package.json。

## 2. 分层幂等规则

- 已有 `docs/agents/qa-workflow.md` 时**绝不重写任何既有文档**，但仍检查检查器是否缺失，并继续环境检查。
- 已有 `tooling/scripts/qa-check.mjs` 时不覆盖；与模板不一致只报告差异，由用户决定是否升级。
- 通用安装器不得修改宿主 package.json，不注入任何 scripts 别名；项目已有 scripts 保留原样。
- 新安装项目执行完整模板写入；已配置项目只补齐缺失项，不借“更新”覆盖本地定制。

## 3. 写入

所有模板占位符必须替换为确认值，不留 `{PLACEHOLDER}`：

1. 从 `templates/qa-workflow.md` 生成 `docs/agents/qa-workflow.md`，适配核心链路、dev 命令、端口、E2E 参数及测试命令 `{TEST_COMMAND}`。
2. 从 `templates/prompt-shortcuts.md` 复制思维快捷键；已有文件跳过。
3. 向真实 `CLAUDE.md` 或 `AGENTS.md` 注入 `templates/claude-qa-directive.md`，不清空其他段落，不直接编辑符号链接。
4. 按 `templates/skill-customizations.md` 幂等注入 `to-spec`、`to-tickets`、`implement`、`implement-spec`、`code-review`、`handoff`、`tdd`、`pr`、`diagnosing-bugs`、`resolving-merge-conflicts` 和 issue tracker 的项目约定。
5. 将 `templates/qa-check.mjs`、`templates/qa-check/` 子模块目录（`plan.mjs`、`script-scan.mjs`、`provenance.mjs`、`spec-coverage.mjs`、`acceptance.mjs`、`review-triage.mjs`）、`templates/review-package.mjs`、`templates/qa-run.mjs`、`templates/qa-spec-review.mjs` 与 `templates/qa-preflight.mjs` 复制到 `tooling/scripts/`（保持 `qa-check/` 子目录结构）；`templates/qa-browser-helper.mjs` 也复制到同一目录，视觉目标原语按仓库薄辅助模块契约使用。不增加 npm 依赖，不得修改宿主 package.json，不添加任何 scripts；核心工具与辅助模块直接由 Node 调用，新增纯函数 module 与辅助模块也必须同步。
6. 确保 `.scratch/` 被忽略；按用户选择设置 `.claude/skills/` 入库规则，仅忽略本地配置和临时 Worktree。
7. 创建 `docs/handoff/.gitkeep`（目录不存在时）。不得新增 PreToolUse、Stop、SessionStart 或 Git Hook。

## 4. 完成检查

报告实际写入、跳过和冲突项，并检查：

- Node 版本满足项目要求，依赖已安装；
- `implement` / `implement-spec` 能在验收后实际调用 `code-review` 并取得独立上下文的真实独立审查返回；无独立上下文能力时只交付审查包并保持待独立审查，不运行最终 `qa-check review`。`结果: PASS` 只表示机器校验通过，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审；
- `node tooling/scripts/qa-check.mjs --help` 能显示用法（该用法允许退出 1 表示缺少参数）；
- 能用 `node tooling/scripts/qa-run.mjs .scratch/<feature> <标签> -- <命令>` 生成不可覆盖的证据日志，同名标签需换新；
- dev 服务与端口锚点可用；
- 浏览器工具符合宿主优先级，ego-browser 不可用时说明 Playwright 降级；
- 必需环境变量仅报告 SET/UNSET，不显示值；
- 异步链路所需 Worker/队列健康。

后续可直接编辑 `docs/agents/qa-workflow.md`。重复运行只允许补缺和报告，不得覆盖已有文件。
