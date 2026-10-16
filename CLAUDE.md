# CLAUDE.md — AI 聚合平台 (AI-Aggregation)

> 本文件是 Agent 行为规则的**单一事实源**；`AGENTS.md` 是指向本文件的符号链接（Claude Code 读 CLAUDE.md，Kimi Code 读 AGENTS.md），修改只动本文件。
> 参考资料（快速开始、常用命令、目录结构、技术栈、环境变量明细、FAQ、移动端细则、CodeGraph）见 `docs/project-guide.md`，按需阅读，不要凭记忆引用。

基于 pnpm Workspace + Turborepo 的 Monorepo AI 聚合平台（通义千问、智谱 GLM、DeepSeek、Agnes），提供对话、图像、视频、语音转写功能。结构：`apps/web`（Next.js 15 主应用）+ `apps/worker`（BullMQ）+ `packages/*`（shared/providers/db/queue/storage/logger/config）。

---

## 语言与注释（强制）

- 全局提问和回答必须使用中文；所有 UI 文本、提示、错误消息必须使用中文
- 所有代码注释必须使用中文；修改文件时同步翻译文件中已有的英文注释
- 仅在必要的技术术语或 API 调用时使用英文
- 做最小的正确改动，不重构无关代码

## 代码规范

- **组件结构**：页面 `app/<功能>/page.tsx`；复杂子组件 `app/<功能>/_components/`；复用组件 `components/<功能分类>/`
- **状态管理**：Zustand + `useShallow`；Store 用直接路径导入（如 `@/stores/auth-store`），不走 `@/stores` barrel
- **导入规范**：直接路径导入，避免 barrel 文件（如 `@/components/ui/button`）；路径别名 `@/` → `apps/web/src/`
- **包引用**：跨 app 共享代码必须经 `packages/`（`@repo/shared`、`@repo/db` 等）；禁止 apps 之间直接引用
- **性能**：独立异步操作用 `Promise.all()` 并发；重量级组件用 `next/dynamic`；用 `React.cache()` 做请求级去重

## UI 设计规范（默认强制）

- 新增或修改 `apps/web` 下任何 UI 前，必须先读根目录 `DESIGN.md`——全局视觉与交互设计系统的唯一标准
- 仅当用户明确要求「自由发挥」或指定具体效果时才可偏离，偏离点需在交付时显式说明
- Tailwind/shadcn 工程纪律见 `.claude/rules/ui.md`；与 `DESIGN.md` 冲突时以 `DESIGN.md` 为准
- `DESIGN.md` 与代码冲突时不得长期分叉：改代码对齐文档，或改文档记录新决策

## 移动端红线（摘要）

- 默认移动端优先：先手机端布局，再增强到平板/桌面；高频操作放拇指易触达区域，底部区域优先于侧边栏
- 点击热区 ≥ `44x44`；安全区适配完整；文案短且可换行；不依赖 hover 暴露关键信息
- 改动 `AppLayout`、底部输入区、消息列表、历史列表、媒体预览、弹层抽屉时，必须同时评估窄屏表现
- 完整细则见 `docs/project-guide.md`「移动端设计细则」

## Agent skills

- **Issue tracker**：`.scratch/<feature>/` 本地 markdown tracker（仓库托管 Gitee，无 `gh` CLI）。详见 `docs/agents/issue-tracker.md`
- **Triage labels**：默认五态 `needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。详见 `docs/agents/triage-labels.md`
- **Domain docs**：single-context：根目录 `CONTEXT.md` + `docs/adr/`。详见 `docs/agents/domain.md`
- **技能目录**：`.agents/skills` 是指向 `.claude/skills` 的符号链接，技能的安装与修改一律在 `.claude/skills` 中进行（单一事实源），不要直接写入 `.agents/skills`。技能与规则（`.claude/skills/`、`.claude/rules/`）已随 git 入库分发，组员 clone 后无需额外安装；本地配置（`settings.local.json`、`tmp-arch/`、`worktrees/`）仍保持忽略不入库

## QA & 研发闭环默认执行准则 (Default Workflow Directive)

进行任何特性开发或架构重构时，Agent **默认必须主动遵循 `docs/agents/qa-workflow.md` 全流程**，无需用户每次显式提醒：
1. **未对齐不写码**：面对新特性或重构任务，第一步默认主动触发 `/grill-with-docs` 审问接口边界并落盘 ADR；
2. **双轨规格联动**：规格产出（`/to-spec`）后，主动联动 `/qa-test-planner` 规划端到端冒烟用例；
3. **真实浏览器卡点（macOS 强制 ego-browser）**：凡触及用户可见核心链路，审查交付前必须完成阶段 5 的真实浏览器验收与截图落盘。在 macOS 环境下**必须且唯一强制使用 `ego-browser` 弹出真实可见窗口**进行端到端交互验收，继承真实登录态并支持人机接管；**严禁因为存在 Playwright MCP 工具而擅自降级**；只有且仅当通过命令行执行 `ego-browser --version` 报错或显式无 GUI 环境时，才允许经说明后降级至 Playwright。未经命令行探活直接调 Playwright 视为严重流程违规；
4. **双轴审查卡点**：大型与中型改动在真机验收通过、声称交付或发起提交前，必须主动触发 `code-review` 技能完成双轴审查（Standards 规范轴 + Spec 需求轴）并出具三档分流结论，严禁真机通过后直接提交；小型快车道修复豁免，触及 P0 核心链路时降级为 Standards 轴快速自查；
5. **快慢车道自适应**：严格按照 `qa-workflow.md`「适用范围与剪裁」规则执行，小型单点修复走快车道，不搞教条化瀑布流。

### 流程自检门禁 (Execution Gate)

涉及代码编写或架构重构的任务，在首轮回复或关键动作开始前（含阶段 4 编码实现开工的首轮回复；若进入批量冲刺模式，在首张工单开工时声明冲刺工单范围并在内部连续推进），必须显式在回复首部声明以下自检状态（防止模型受直接答题偏置绕过规范）：
- **QA 阶段与车道**：[例如：阶段 1 需求对齐 / 阶段 4 编码实现（spec 直驱 / 单工单 NN / 批量工单 01-NN 连续冲刺）/ 慢车道全流程 / 快车道单点修复]
- **核心链路判定**：[是否触及对话/图像/视频/语音/认证/历史等核心链路：是/否]
- **浏览器验收计划**：[触及核心链路时声明对应的 `qa-plan.md` 路径，并明确声明必须使用 `ego-browser` 可见窗口验收（声明已探活）；未触及时说明豁免理由]
- **代码审查状态**：[未到审查阶段 / 已执行双轴审查（Standards+Spec 轴通过）/ 豁免说明]。**该项非「通过」或「豁免」时，禁止发起 commit 提议，交付汇报不得使用完成态表述**——本项与「git 提交需用户确认」的既有约定联动，构成用户拒绝确认的制度依据
- **当前动作**：[本轮执行的具体流程动作]

未声明上述状态即直接写码或声称交付完成，视为严重流程违规。

详见 `docs/agents/qa-workflow.md`（参考书：`docs/agents/qa-workflow-guide.md`）。
