---
name: code-review
description: "沿两个轴审查自固定点（commit、branch、tag 或 merge-base）以来的改动：Standards（代码是否遵守本仓库成文的编码规范）与 Spec（代码是否符合来源 issue 或 spec 的要求）。两轴在并行子代理中运行并分列汇报。用于审查分支、PR、进行中的改动，或用户要求“审查自某处以来的改动”时。"
---

Two-axis review of the diff between `HEAD` and a fixed point the user supplies:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

Both axes run as **parallel sub-agents** so they don't pollute each other's context, then this skill aggregates their findings.

The issue tracker should have been provided to you. If not, tell the user to run `/setup-matt-pocock-skills`.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Capture the diff command once: `git diff <fixed-point>...HEAD` (three-dot, so the comparison is against the merge-base). Also note the list of commits via `git log <fixed-point>..HEAD --oneline`.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and the diff is non-empty. A bad ref or empty diff should fail here, not inside two parallel sub-agents.

### 2. Identify the spec source

Look for the originating spec, in this order:

1. Issue references in the commit messages (`#123`, `Closes #45`, GitLab `!67`, etc.), fetched via the workflow in the tracker doc.
2. A path the user passed as an argument.
3. A spec file under `docs/`, `specs/`, or `.scratch/` matching the branch name or feature.
4. If nothing is found, ask the user where the spec is. If they say there isn't one, the **Spec** sub-agent will skip and report "no spec available".

### 3. Identify the standards sources

Search the repo for every file that documents how code should be written. When `CODING_STANDARDS.md` or `CONTRIBUTING.md` exists, it must be on the list.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** Each smell is a labelled heuristic ("possible Feature Envy"), never a hard violation. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Spawn both sub-agents in parallel

Issue both sub-agent calls together, in the foreground, and aggregate the reports they return.

**Standards sub-agent prompt** should include:

- The full diff command and commit list.
- The list of standards-source files you found in step 3, **plus the smell baseline from step 3** pasted in full (the sub-agent has no other access to it).
- The brief: "Report, per file/hunk where relevant, (a) every place the diff violates a documented standard: cite the standard (file + the rule); and (b) any baseline smell you spot: name it and quote the hunk. Distinguish hard violations from judgement calls: documented-standard breaches can be hard, but baseline smells are always judgement calls, and a documented repo standard overrides the baseline. Skip anything tooling enforces. Under 400 words."

**Spec sub-agent prompt** should include:

- The diff command and commit list.
- The path or fetched contents of the spec.
- The brief: "Report: (a) requirements the spec asked for that are missing or partial; (b) behaviour in the diff that wasn't asked for (scope creep); (c) requirements that look implemented but where the implementation looks wrong. Quote the spec line for each finding. Under 400 words."

If the spec is missing, skip the Spec sub-agent and note this in the final report.

### 5. Aggregate

Present the two reports under `## Standards` and `## Spec` headings, verbatim or lightly cleaned. Do **not** merge or rerank findings, because the two axes are deliberately separate (see _Why two axes_).

End with a one-line summary: total findings per axis, and the worst issue _within each axis_ (if any). Don't pick a single winner across axes: that's the reranking the separation exists to prevent.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.

## 项目定制（QA 工作流调用时）

QA 工作流在审查前不提交代码，因此由它调用本技能时替换 diff 来源与原文落盘方式，其余步骤按上文执行：

- Standards 子代理的规范来源必须包含：根及改动所在子目录的 `CLAUDE.md`、`.claude/rules/` 下与改动相关的规则文件；改动 UI 时加 `DESIGN.md`，改动 QA 工作流自身时加 `docs/agents/qa-workflow.md`。`AGENTS.md` 是符号链接，不重复提供。
- 两轴 brief 的 “Under 400 words” 只是简洁建议，不得为满足字数限制省略、截断或合并编号发现。
- 固定点取 `.scratch/<feature>/_qa/scope.json` 的 `base`；commit 列表仍用 `git log <base>..HEAD --oneline`。
- diff 改用 QA 工作流事先 collect 生成的 `.scratch/<feature>/_qa/review-package.diff`（包含未提交改动和相关未跟踪文件），两个子代理的 diff 输入都传这个文件路径，代替 `git diff <fixed-point>...HEAD`。
- `_qa/review-package.json` 中 `changedFiles` 为空且没有 `unreviewed` 时视为空 diff，按上文在启动子代理前结束。
- 两个子代理继承主会话模型，调用时不传 model；用户明确指定审查模型时照做，并在 review-report 的审查方式行写明。前台或后台不限。
- 子代理只返回审查内容，不要求它写文件；格式问题不得成为修改原文的理由。主代理把每个子代理的返回逐字写入 `.scratch/<feature>/review/r<n>-standards.md` 或 `review/r<n>-spec-axis.md`（n 为轮次，首轮 1），不删改、不总结、不重排，已存在的文件不得覆盖。两份原文都落盘后主代理才进入三档分流，第 5 步汇总不再粘贴原文。
- 每轴每轮只派一个子代理，不重派替代子代理；返回被截断或不完整时照原样落盘，在 review-report 审查方式行写明该轴不完整，该轮保持待独立审查，不得追问、续传或让子代理重写；某轴失败或没有返回时同样保持待独立审查，主代理不得代写原文。
- 不得在原文中加头注、还原转义或做任何加工；需要说明的写进 review-report。
- Spec 子代理额外输入 `.scratch/<feature>/_qa/reconciliation.md` 与 `qa-plan.md` 执行记录证据列引用的 `screenshots/` 文件，brief 追加：「逐行核对对账表的实测值或绑定是否证明冻结断言，不成立的以 `[P-W<n>]` 报告并引用该行；只按冻结断言原文核对截图：截图证明断言不成立，或暴露真实的遮挡、错位、空白等视觉错误时以 `[P-W<n>]` 报告并写明截图路径；脚本已硬断言、截图只是取景不全时不编号，写在正文；未核实项对应 spec 的 US 或冻结断言时，必须核实或以 `[P-M<n>]` 编号并写明未核实；对账表标注「响应注入」的行，断言涉及工具调用、质检、持久化、计费等服务端行为的以 `[P-W<n>]` 报告；特性触及核心链路却没有任何未标注「响应注入」的 browser 证据时以 `[P-M<n>]` 报告。」
- 每条发现以编号开头：Standards 轴 `[S-H<n>]` 硬违规、`[S-J<n>]` 判断建议；Spec 轴 `[P-M<n>]` 缺失或部分实现、`[P-W<n>]` 实现有误、`[P-X<n>]` 范围蔓延；同轴序号递增，复审新发现接续编号；一个编号只报一处问题，同类多处分别编号。已证实造成行为错误的问题报 `[P-W<n>]`，不报 S-J；仅有潜在风险的不升级。与本特性无关的既有工作区状态不编号，只在正文提及。无发现时写「无发现」，「无发现」不带编号。S-J 只报有明确当前成本的问题。
- 复审（r2 起）给子代理完整审查包、它自己的历次原文、spec、主代理列出的本轮修复改过的文件，以及上一轮分流表中 S-H、P-M、P-W 类被驳回或转专项的行（只给编号与理由两列）；Spec 子代理另给当前的 `screenshots/`；不给实现者的修复尝试记录。子代理对上轮每个本次修编号写 `[编号] 已修`、`[编号] 未修` 或 `[编号] 修错`，对每个给出的驳回或转专项编号核对理由引用的 ADR、契约或源码是否属实且支持该档位，写 `[编号] 改档成立` 或 `[编号] 改档不成立`；部分修复写未修，状态词后尽量不加限定语（残留或原因另起一句），新发现只针对本轮修复改过的文件。每个待复核编号都要在原文中写出；检查器只核对编号是否出现，状态以主代理的分流表为准，由人工终审对照原文核对。
- 审查期间不执行 `git add`、`git add -N`、commit、stash、reset 或 checkout。
