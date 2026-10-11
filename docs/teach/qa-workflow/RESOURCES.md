# Resources

本清单收录了团队研发与浏览器测试闭环工作流的最高信任度资料源，所有教学与实战均锚定以下事实源。

## 内部核心规范

- **研发与浏览器真机测试闭环工作流**: `docs/agents/qa-workflow.md`
  - 核心定义：7 阶段全景流水线、快慢车道剪裁矩阵、浏览器真机验收红线、时间盒控制与异常排障回路。
- **研发闭环实战讲解指南**: `docs/agents/qa-workflow-guide.md`
  - 核心定义：团队落地实战教学、配置与使用方法、协同机制、排障踩坑心法与速查清单。
- **项目顶层执行准则**: `CLAUDE.md`（单一事实源，`AGENTS.md` 为其符号链接）
  - 核心定义：Default Workflow Directive（无需每次念咒语的底层规则）与行为红线；命令体系等参考信息见 `docs/project-guide.md`。
- **系统架构决策记录**: `docs/adr/`
  - 核心范本：深模块设计理念、工具治理、严格行为保持的技术决策典范。

## 工具与技能源

- **Matt Pocock AI 软件工程技能集**:
  - `grill-with-docs`、`to-spec`、`implement`、`tdd`、`code-review`
- **浏览器自动化与测试套件**:
  - `ego-browser` 交互式真实浏览器技能
  - `qa-test-planner` 自动化友好测试规划器
  - Playwright 端到端测试套件 (`pnpm --filter @repo/web test:e2e`)
