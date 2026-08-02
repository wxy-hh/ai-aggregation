# 领域文档

说明工程技能在探索代码库时，应如何消费本仓库的领域文档。

## 探索前，先读这些

- 仓库根目录下的 **`CONTEXT.md`**，或
- 仓库根目录下若存在 **`CONTEXT-MAP.md`** —— 它指向每个上下文各一份的 `CONTEXT.md`。按主题逐个阅读相关文件。
- **`docs/adr/`** —— 阅读与你即将改动区域相关的 ADR。多上下文仓库中，还要查看 `src/<上下文>/docs/adr/` 里的上下文级决策记录。

如果这些文件不存在，**静默跳过**。不要提示缺失，也不要主动建议预先创建它们。`/domain-modeling` 技能（通过 `/grill-with-docs` 和 `/improve-codebase-architecture` 触达）会在术语或决策真正落地时惰性创建这些文件。

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

当你的输出提到领域概念时（在 issue 标题、重构提案、假设、测试名称中），请使用 `CONTEXT.md` 中定义的术语。不要偏离到术语表明确规避的同义词。

如果你需要的概念尚未出现在术语表中，这是一个信号 —— 要么你在发明项目并未使用的语言（请重新考虑），要么确实存在空白（记录给 `/domain-modeling`）。

## 标记 ADR 冲突

如果你的输出与现有 ADR 相矛盾，请显式提出而不是静默覆盖：

> _与 ADR-0007（事件溯源订单）矛盾 —— 但值得重新讨论，因为…_
