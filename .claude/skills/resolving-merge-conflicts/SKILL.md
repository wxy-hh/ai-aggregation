---
name: resolving-merge-conflicts
description: 解决进行中的 git merge/rebase 冲突。
---

1. **See the current state** of the merge/rebase. Check git history, and the conflicting files.

2. **Find the primary sources** for each conflict. Understand deeply why each change was made, and what the original intent was. Read the commit messages, check the PRs, check original issues/tickets.

3. **Resolve each hunk.** Preserve both intents where possible. Where incompatible, pick the one matching the merge's stated goal and note the trade-off. Do **not** invent new behaviour. Always resolve; never `--abort`.

4. Discover the project's **automated checks** and run them — typically typecheck, then tests, then format. Fix anything the merge broke.

5. **Finish the merge/rebase.** Stage everything and commit. If rebasing, continue the rebase process until all commits are rebased.

---

## 项目定制（上游升级时保留本节）

- 遵守 `.claude/rules/git-workflow.md` 的提交与推送边界：完成冲突解决与自动化检查后，先向用户展示变更文件、检查结果与建议提交说明，**须经用户确认后再执行 `git add` / `git commit` 或 `git rebase --continue` 提交**；不得未经确认自动 commit 或 push。
