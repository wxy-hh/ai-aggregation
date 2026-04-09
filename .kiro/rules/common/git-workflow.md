# Git 工作流 (Git Workflow)

## 提交信息格式 (Commit Message Format)
```
<type>: <description>

<optional body>
```

类型 (Types): feat, fix, refactor, docs, test, chore, perf, ci

注意：归属信息已通过 `~/.claude/settings.json` 全局禁用。

## 拉取请求 (Pull Request) 工作流

创建 PR 时：
1. 分析完整提交历史（而不仅仅是最近一次提交）
2. 使用 `git diff [base-branch]...HEAD` 查看所有变更
3. 撰写全面的 PR 摘要
4. 包含带有 TODO 的测试计划
5. 如果是新分支，推送时使用 `-u` 标志

> 关于 Git 操作之前的完整开发流程（规划、TDD、代码审查），请参阅 [development-workflow.md](./development-workflow.md)。
