# 问题跟踪器：GitHub

本仓库的 Issue 与 PRD 以 GitHub issue 形式存在。所有操作一律使用 `gh` CLI。

## 约定

- **创建 issue**：`gh issue create --title "..." --body "..."`。多行正文使用 heredoc。
- **查看 issue**：`gh issue view <编号> --comments`，用 `jq` 过滤评论，同时获取标签。
- **列出 issues**：`gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'`，配合适当的 `--label` 与 `--state` 过滤器。
- **评论 issue**：`gh issue comment <编号> --body "..."`
- **应用 / 移除标签**：`gh issue edit <编号> --add-label "..."` / `--remove-label "..."`
- **关闭**：`gh issue close <编号> --comment "..."`

仓库信息由 `git remote -v` 推断 —— 在克隆内运行时 `gh` 会自动完成。

## 以 Pull Request 作为分诊入口

**PR 是否作为请求入口：否。** （若本仓库将外部 PR 视为功能请求，改为 `yes`；`/triage` 会读取此标志。）

设为 `yes` 时，PR 与 issue 使用相同的标签和状态，通过 `gh pr` 对应命令操作：

- **查看 PR**：`gh pr view <编号> --comments`，用 `gh pr diff <编号>` 查看差异。
- **列出待分诊的外部 PR**：`gh pr list --state open --json number,title,body,labels,author,authorAssociation,comments`，然后只保留 `authorAssociation` 为 `CONTRIBUTOR`、`FIRST_TIME_CONTRIBUTOR` 或 `NONE` 的（排除 `OWNER`/`MEMBER`/`COLLABORATOR`）。
- **评论 / 打标签 / 关闭**：`gh pr comment`、`gh pr edit --add-label`/`--remove-label`、`gh pr close`。

GitHub 上 issue 和 PR 共用同一编号空间，所以裸的 `#42` 可能是其中之一 —— 先 `gh pr view 42` 判断，失败则回退到 `gh issue view 42`。

## 当技能说"发布到问题跟踪器"

创建一个 GitHub issue。

## 当技能说"获取相关工单"

执行 `gh issue view <编号> --comments`。

## 导航操作

供 `/wayfinder` 使用。**地图**是一个 issue，**子** issue 作为工单。

- **地图**：一个标记为 `wayfinder:map` 的 issue，承载 Notes / Decisions-so-far / Fog 正文。`gh issue create --label wayfinder:map`。
- **子工单**：作为 GitHub 子 issue（通过 sub-issues 端点的 `gh api`）链接到地图的 issue。未启用子 issue 时，将子工单加入地图正文的任务列表，并在子工单正文顶部写上 `Part of #<地图编号>`。标签：`wayfinder:<类型>`（`research`/`prototype`/`grilling`/`task`）。认领后，工单分配给主导开发者。
- **阻塞**：使用 GitHub 的**原生 issue 依赖** —— 这是规范的、UI 可见的表现形式。用 `gh api --method POST repos/<owner>/<repo>/issues/<子工单>/dependencies/blocked_by -F issue_id=<阻塞方数据库id>` 添加边，其中 `<阻塞方数据库id>` 是阻塞方的数字 **数据库 id**（`gh api repos/<owner>/<repo>/issues/<n> --jq .id`，_不是_ `#编号` 或 `node_id`）。GitHub 通过 `issue_dependencies_summary.blocked_by` 报告（仅开放的阻塞方 —— 即实时闸门）。依赖不可用时，回退为在子工单正文顶部写 `Blocked by: #<n>, #<n>` 行。所有阻塞方关闭后工单解除阻塞。
- **前沿查询**：列出地图开放的子项（`gh issue list --state open`，限定在地图的子 issue / 任务列表内），剔除带开放阻塞方（`issue_dependencies_summary.blocked_by > 0`，或 `Blocked by` 行中存在开放 issue）或已有分配人的项；地图顺序中靠前的胜出。
- **认领**：`gh issue edit <n> --add-assignee @me` —— 本次会话的第一次写入。
- **解决**：`gh issue comment <n> --body "<答案>"`，然后 `gh issue close <n>`，最后把上下文指针（gist + 链接）追加到地图的 Decisions-so-far。
