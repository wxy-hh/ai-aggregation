# Resources

本清单收录了团队研发与浏览器测试闭环工作流的最高信任度资料源，所有教学与实战均锚定以下事实源。

## 内部核心规范

- **研发与真实浏览器验收闭环工作流**: `docs/agents/qa-workflow.md`
  - 核心定义：7 阶段全景流水线、快/标准/慢三车道剪裁矩阵、Playwright/`ego-browser` 浏览器分流验收红线、时间盒控制与默认 `r2` 上限复审回路。
- **研发闭环实战讲解指南**: `docs/agents/qa-workflow-guide.md`
  - 核心定义：团队落地实战教学、配置与使用方法、协同机制、排障踩坑心法与速查清单。
- **项目顶层执行准则**: `CLAUDE.md`（单一事实源，`AGENTS.md` 为其符号链接）
  - 核心定义：Default Workflow Directive（无需每次念咒语的底层规则）与行为红线；命令体系等参考信息见 `docs/project-guide.md`。
- **系统架构决策记录**: `docs/adr/`
  - 核心范本：深模块设计理念、工具治理、严格行为保持与 `ADR-0066` 增量闭环的技术决策典范。

## 工具与技能源

- **Matt Pocock AI 软件工程技能集**:
  - `grill-with-docs`、`to-spec`、`to-tickets`、`implement`、`implement-spec`、`tdd`、`code-review`
- **浏览器自动化与测试套件**:
  - `Playwright`（原生 Node 过程脚本，优先用于轻量 DOM/视口验证与无需桌面登录态场景）
  - `ego-browser` 交互式真实浏览器技能（用于需复用桌面登录态或人工接管登录场景）
  - `qa-test-planner` 自动化友好测试规划器
  - Playwright 端到端测试套件 (`pnpm --filter @repo/web test:e2e`)
