# 域文档（Domain Docs）

工程技能在探索代码库时，应如何消费本仓库的域文档。

## 探索前先读这些

- 仓库根目录的 **`CONTEXT.md`**，或
- 若存在 **`CONTEXT-MAP.md`** —— 它指向每个上下文各一份的 `CONTEXT.md`。读取与当前主题相关的每一份。
- **`docs/adr/`** —— 阅读与你即将工作的区域相关的 ADR。在多上下文仓库中，还要检查 `src/<context>/docs/adr/` 里的上下文级决策。

若这些文件不存在，**静默继续**。不要标记缺失，也不要建议预先创建它们。`/domain-modeling` 技能（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 触达）会在术语或决策真正被落实时才懒创建它们。

## 文件结构

单上下文仓库（大多数仓库）：

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

多上下文仓库（根目录存在 `CONTEXT-MAP.md`）：

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← 系统级决策
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← 上下文级决策
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## 使用术语表的词汇

当你输出的内容命名一个域概念（issue 标题、重构提案、假设、测试名）时，使用 `CONTEXT.md` 中定义的术语。不要偏离到术语表明确规避的同义词。

如果所需的术语还不在术语表里，这是一个信号——要么你在发明项目不用的语言（重新考虑），要么存在真实缺口（记一笔留给 `/domain-modeling`）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 冲突，显式提出而不是默默覆盖：

> _与 ADR-0007（event-sourced orders）冲突——但值得重新讨论，因为……_
