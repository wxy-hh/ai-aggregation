# Resources

本清单收录了团队研发与浏览器测试闭环工作流的最高信任度资料源，所有教学与实战均锚定以下事实源。

## 内部核心规范

- **研发与浏览器真机测试闭环工作流**: `docs/agents/qa-workflow.md`
  - 核心定义：7 阶段全景流水线、快慢车道剪裁矩阵、浏览器真机验收红线、时间盒控制与异常排障回路。
- **项目顶层执行准则**: `CLAUDE.md`
  - 核心定义：Monorepo 命令体系、Default Workflow Directive（无需每次念咒语的底层规则）。
- **真实重构与验收实战范本**: `2026-10-08-153816-architecture-review-agenthtml-candidate-01.txt`
  - 核心范本：一次包含网络阻断隔离、欠费排查、人机接管登录、四链路真实验收的教科书级全流程日志。
- **系统架构决策记录**: `docs/adr/0008-tool-execution-pipeline-deep-module.md`
  - 核心范本：深模块设计理念、8项工具治理、9项不对称行为保留的技术决策典范。

## 工具与技能源

- **Matt Pocock AI 软件工程技能集**:
  - `grill-with-docs`、`to-spec`、`implement`、`tdd`、`code-review`
- **浏览器自动化与测试套件**:
  - `ego-browser` 交互式真实浏览器技能
  - `qa-test-planner` 自动化友好测试规划器
  - Playwright 端到端测试套件 (`pnpm --filter @repo/web test:e2e`)
