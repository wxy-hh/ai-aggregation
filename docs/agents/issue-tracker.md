# 问题跟踪器：本地 Markdown

本仓库的 Issue 与 spec 以 markdown 文件形式存放在 `.scratch/` 下（仓库托管在 Gitee，无可用 `gh` CLI，不采用 GitHub Issues）。

## 约定

- 一个特性一个目录：`.scratch/<feature-slug>/`
- spec 位于 `.scratch/<feature-slug>/spec.md`（若 spec 已按仓库惯例落在 `docs/features/<日期>-<slug>/spec.md`，此处放指针文件，唯一权威以被指向的文档为准）
- 实现工单一题一文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 `01` 起按依赖顺序编号（阻塞方在前）——绝不合并为单一工单文件
- 分诊状态记录在工单文件顶部的 `Status:` 行（角色字符串见 `triage-labels.md`）
- 评论与对话记录追加到文件底部 `## Comments` 标题下

## 当技能说"发布到问题跟踪器"

在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则创建）。

## 当技能说"获取相关工单"

读取对应路径的文件。用户通常会直接传入路径或工单编号。

## 导航操作

供 `/wayfinder` 使用。**地图**是一个文件，每个**子**工单一个文件。

- **地图**：`.scratch/<effort>/map.md`——承载 Notes / Decisions-so-far / Fog 正文。
- **子工单**：`.scratch/<effort>/issues/NN-<slug>.md`，从 `01` 起编号，正文写清问题。`Type:` 行记录工单类型（`research`/`prototype`/`grilling`/`task`）；`Status:` 行记录 `claimed`/`resolved`。
- **阻塞**：文件顶部附近写 `Blocked by: NN, NN` 行。所列工单全部 `resolved` 时本工单解除阻塞。
- **前沿**：扫描 `.scratch/<effort>/issues/` 中开放、未阻塞、未认领的文件；编号小者优先。
- **认领**：开工前先把 `Status:` 改为 `claimed` 并保存。
- **解决**：在 `## Answer` 标题下追加答案，`Status:` 改为 `resolved`，再把上下文指针追加到 `map.md` 的 Decisions-so-far。
