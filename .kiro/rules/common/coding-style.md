# 编码规范 (Coding Style)

## 不可变性 (Immutability) (至关重要 CRITICAL)

始终创建新对象，切勿修改 (Mutate) 现有对象：

```
// 伪代码 (Pseudocode)
错误 (WRONG):  modify(original, field, value) → 原地修改原对象 (changes original in-place)
正确 (CORRECT): update(original, field, value) → 返回包含更改的新副本 (returns new copy with change)
```

原理 (Rationale)：不可变数据可以防止隐藏的副作用，使调试更容易，并支持安全的并发。

## 文件组织 (File Organization)

倾向于 多个小文件 > 少数大文件：
- 高内聚，低耦合
- 通常 200-400 行，上限 800 行
- 从大型模块中提取工具函数 (Utilities)
- 按功能/领域 (Feature/Domain) 组织，而非按类型 (Type)

## 错误处理 (Error Handling)

始终进行全面的错误处理：
- 在每个层级显式处理错误
- 在面向 UI 的代码中提供用户友好的错误消息
- 在服务端记录详细的错误上下文
- 绝不静默吞掉 (Swallow) 错误

## 输入验证 (Input Validation)

始终在系统边界处进行验证：
- 在处理之前验证所有用户输入
- 尽可能使用基于 Schema 的验证
- 快速失败 (Fail fast) 并提供清晰的错误消息
- 永远不要信任外部数据 (API 响应、用户输入、文件内容)

## 代码质量清单 (Code Quality Checklist)

在标记工作完成前：
- [ ] 代码可读且命名规范
- [ ] 函数短小 (<50 行)
- [ ] 文件聚焦 (<800 行)
- [ ] 无深度嵌套 (>4 层)
- [ ] 妥善的错误处理
- [ ] 无硬编码值 (使用常量或配置)
- [ ] 无修改 (Mutation) (使用不可变模式)
