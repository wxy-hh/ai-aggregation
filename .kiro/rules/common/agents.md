# 智能体编排（Agent Orchestration）

## 可用智能体（Available Agents）

位于 `~/.claude/agents/`：

| 智能体 (Agent) | 用途 (Purpose) | 何时使用 (When to Use) |
|-------|---------|-------------|
| planner | 实施规划 (Implementation planning) | 复杂功能、重构 |
| architect | 系统设计 (System design) | 架构决策 |
| tdd-guide | 测试驱动开发 (Test-driven development) | 新功能、错误修复 (Bug fixes) |
| code-reviewer | 代码审查 (Code review) | 编写代码后 |
| security-reviewer | 安全分析 (Security analysis) | 提交前 |
| build-error-resolver | 修复构建错误 (Fix build errors) | 构建失败时 |
| e2e-runner | 端到端测试 (E2E testing) | 关键用户流程 |
| refactor-cleaner | 死代码清理 (Dead code cleanup) | 代码维护 |
| doc-updater | 文档更新 (Documentation) | 更新文档 |

## 立即使用智能体（Immediate Agent Usage）

无需用户提示：
1. 复杂功能请求 - 使用 **planner** 智能体
2. 刚刚编写/修改的代码 - 使用 **code-reviewer** 智能体
3. 错误修复或新功能 - 使用 **tdd-guide** 智能体
4. 架构决策 - 使用 **architect** 智能体

## 并行任务执行（Parallel Task Execution）

对于独立操作，始终（ALWAYS）使用并行任务执行：

```markdown
# 推荐：并行执行 (GOOD: Parallel execution)
并行启动 3 个智能体：
1. 智能体 1：认证模块的安全分析
2. 智能体 2：缓存系统的性能审查
3. 智能体 3：工具类的类型检查

# 不推荐：不必要的串行 (BAD: Sequential when unnecessary)
先启动智能体 1，然后智能体 2，最后智能体 3
```

## 多视角分析（Multi-Perspective Analysis）

对于复杂问题，使用分角色的子智能体：
- 事实审查员 (Factual reviewer)
- 资深工程师 (Senior engineer)
- 安全专家 (Security expert)
- 一致性审查员 (Consistency reviewer)
- 冗余检查员 (Redundancy checker)
