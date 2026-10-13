---
name: setup-qa-workflow
description: "在已配置 Matt Pocock 基础技能的项目上 scaffold qa-workflow 研发闭环定制层：流水线规范、CLAUDE.md 门禁指令、技能定制钩子与浏览器验收约定。跨项目推广时使用，每个新项目运行一次。"
disable-model-invocation: true
---

# Setup QA Workflow

Scaffold the **qa-workflow customization layer** (the 7-stage closed-loop pipeline: spec → tickets/qa-plan → TDD → real-browser acceptance → dual-axis review → PR evidence) onto a repo that already uses Matt Pocock's engineering skills.

This skill is self-contained: to adopt the workflow in another project, copy this skill folder into that repo's `.claude/skills/` (or the agent runtime's equivalent skills directory) and run it there.

This is a prompt-driven skill, not a deterministic script. Explore, present what you found, confirm with the user, then write.

## 0. Prerequisites (hard stop)

Check all of these before doing anything; report what's missing and stop:

- **Matt Pocock base skills installed** in this repo's skills directory: `to-spec`, `to-tickets`, `implement`, `implement-spec`, `tdd`, `code-review`, `pr`, `retro`, `handoff`, `grill-with-docs`, `diagnosing-bugs`, `improve-codebase-architecture`.
- **Project skills installed**: `qa-test-planner`, `ego-browser` (if the source repo that shared this skill is available, these can be vendored from its `.claude/skills/`).
- **Base tracker config exists**: `docs/agents/issue-tracker.md`, `docs/agents/triage-labels.md`, `docs/agents/domain.md` — the output of `/setup-matt-pocock-skills`. If absent, tell the user to run `/setup-matt-pocock-skills` first (local-markdown tracker recommended for repos without GitHub/GitLab).

**Idempotency guard**: if `docs/agents/qa-workflow.md` already exists, do NOT regenerate or overwrite anything. Report that the layer is already configured, and instead run the environment checklist from step 4 and exit.

## 1. Explore

Read whatever exists; don't assume:

- `package.json` scripts: the **dev command** that starts the user-facing web app (e.g. `pnpm dev`, `pnpm dev:web`) and its **preferred port** (look at `-p` flags, port-resolution scripts, env files, docs).
- E2E setup: is there a Playwright config and an e2e directory (e.g. `apps/web/e2e/`, `e2e/`)? What command runs it?
- `CLAUDE.md` and `AGENTS.md` at the repo root: which exists? Is either a symlink? (Edit the real file, never the symlink target's copy.) Is there already a QA directive block?
- `docs/agents/`: which files already exist?
- `.gitignore`: is `.scratch/` ignored? Is `.claude/` tracked or ignored?
- `docs/handoff/` exists?

## 2. Present findings and ask

Summarize the detected parameters and confirm them with the user before writing anything:

- `{DEV_COMMAND}` — command that starts the dev server
- `{WEB_PORT}` — preferred local dev port
- `{E2E_COMMAND}` / `{E2E_DIR}` — headless regression command and spec directory (if none exists yet, propose a sensible default for the stack and note it must be created on first use)
- `{CORE_LINKS}` — the project's user-visible core journeys that can never skip real-browser acceptance. Offer examples from the domain (e.g. 认证、核心对话/提交流程、支付、历史记录); the user must confirm the final list.

Also ask one question: should `.claude/skills/` be **tracked in git** (recommended for team rollout, so customizations version with the repo) or kept local?

## 3. Write

Use the templates in this skill folder. Replace every `{PLACEHOLDER}` with the confirmed values; never leave a placeholder in a written file.

1. **`docs/agents/qa-workflow.md`** — from [templates/qa-workflow.md](./templates/qa-workflow.md). Adaptation points: core-links list, environment self-healing block (dev command, port, drift-range source), e2e command/dir, the P0 frozen-case list (starts empty — cases are registered there as they get固化).
2. **`docs/agents/prompt-shortcuts.md`** — copy [templates/prompt-shortcuts.md](./templates/prompt-shortcuts.md) verbatim. Skip if the file already exists.
3. **CLAUDE.md / AGENTS.md** — inject the QA directive block from [templates/claude-qa-directive.md](./templates/claude-qa-directive.md). If a QA directive block already exists, update it in place; never clobber surrounding user sections. Edit whichever of `CLAUDE.md`/`AGENTS.md` already exists; if both exist via symlink, edit the real file.
4. **Skill customization hooks** — apply the injections in [templates/skill-customizations.md](./templates/skill-customizations.md) to `to-spec`, `implement`, `implement-spec`, `handoff`, and `docs/agents/issue-tracker.md`. Each injection carries a `项目定制` marker: skip any whose marker is already present (idempotent re-runs). Do not modify any other skill files.
5. **`.gitignore`** — ensure `.scratch/` is ignored (the working area must never be committed). If the user chose tracked skills, ensure `.claude/skills/` is NOT ignored (ignore only `.claude/settings.local.json`, `.claude/tmp-arch/`, `.claude/worktrees/`).
6. **`docs/handoff/`** — create the directory (with a `.gitkeep`) if absent; it is the tracked cross-person handoff channel referenced by the workflow.

## 4. Done

Report what was written, then output the **environment checklist** for whoever runs the pipeline on this machine, probing each item and marking ready/missing:

- Runtime version manager file (`.nvmrc` / `.node-version`) satisfied; dependencies installed
- `{DEV_COMMAND}` boots and the probe port returns 200
- Browser tooling: `ego-browser` CLI installed (macOS preferred), otherwise Playwright browsers installed (`playwright install`) as the degradation path
- Environment variables / secrets file present per the project's own docs
- Async chains (queues/workers) running, if the product has any

Mention they can edit `docs/agents/qa-workflow.md` directly later; re-running this skill is safe (idempotent guard) and only reports status once configured.
