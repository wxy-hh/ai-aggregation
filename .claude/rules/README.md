# 规则 (Rules)

## 目录结构

```
rules/
├── README.md          # 本文件
├── git-workflow.md    # Git 工作流（始终加载）
├── nextjs.md          # Next.js 约定
├── security.md        # 安全指南
└── ui.md              # UI 约定
```

- **无 paths 限定的 Rule**：全局生效（如 `git-workflow.md`）。
- **有 paths 限定的 Rule**：只在该路径文件被访问时才加载，节省上下文。
- **框架/栈规则**：按需自建（如 `.claude/rules/<stack>.md`）。
