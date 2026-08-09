# Issue tracker: 本地 Markdown

本仓库的 issue 与 spec 以 Markdown 文件形式存放在 `.scratch/` 下。

## 约定

- 每个功能一个目录：`.scratch/<feature-slug>/`
- spec 为 `.scratch/<feature-slug>/spec.md`
- 实现 issue 为每张 ticket 一个文件，位于 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 开始编号——绝不要合并成一个综合文件
- Triage 状态记录在 issue 文件顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与会话记录追加到文件末尾的 `## Comments` 标题下

## 当技能说"publish to the issue tracker"

在 `.scratch/<feature-slug>/` 下新建文件（必要时先创建目录）。

## 当技能说"fetch the relevant ticket"

读取引用路径下的文件。用户通常会直接给出路径或 issue 编号。

## Wayfinding 操作

供 `/wayfinder` 使用。**map** 是一个文件，每个 ticket 对应一个**子文件**。

- **Map**：`.scratch/<effort>/map.md` —— Notes / Decisions-so-far / Fog 正文。
- **子 ticket**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 开始编号，问题写在正文中。`Type:` 行记录 ticket 类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **Blocking**：顶部附近的一行 `Blocked by: NN, NN`。当它列出的每个文件都是 `resolved` 时，ticket 解除阻塞。
- **Frontier**：扫描 `.scratch/<effort>/issues/` 中打开、未阻塞、未认领的文件；编号小的优先。
- **Claim**：开始工作前先把 `Status: claimed` 保存好。
- **Resolve**：在 `## Answer` 标题下追加答案，设置 `Status: resolved`，然后在 `map.md` 的 Decisions-so-far 中追加一个上下文指针（gist + 链接）。
