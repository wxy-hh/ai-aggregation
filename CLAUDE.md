# CLAUDE.md — AI 聚合平台 (AI-Aggregation)

> 本文件是 Agent 行为规则的**单一事实源**；`AGENTS.md` 是指向本文件的符号链接（Claude Code 读 CLAUDE.md，Kimi Code 读 AGENTS.md），修改只动本文件。
> 参考资料（快速开始、常用命令、目录结构、技术栈、环境变量明细、FAQ、移动端细则、CodeGraph）见 `docs/project-guide.md`，按需阅读，不要凭记忆引用。

基于 pnpm Workspace + Turborepo 的 Monorepo AI 平台（讯飞星火、火山引擎豆包、DeepSeek 对话，Agnes 图像与智谱 CogVideoX 视频），聚焦面向交付物（Artifacts）与高安全治理的生产级轻量 AI Agent 全栈。结构：`apps/web`（Next.js 15 主应用）+ `apps/worker`（BullMQ）+ `packages/*`（shared/providers/db/queue/storage/logger/config）。

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
- **Domain docs**：领域术语默认只写 `GLOSSARY.md`；`CONTEXT.md` 仅用于跨特性稳定架构背景，按需更新；决策记录见 `docs/adr/`。详见 `docs/agents/domain.md`
- **技能目录**：`.agents/skills` 是指向 `.claude/skills` 的符号链接，技能的安装与修改一律在 `.claude/skills` 中进行（单一事实源），不要直接写入 `.agents/skills`。技能与规则（`.claude/skills/`、`.claude/rules/`）已随 git 入库分发，组员 clone 后无需额外安装；本地配置（`settings.local.json`、`tmp-arch/`、`worktrees/`）仍保持忽略不入库

## QA & 研发闭环默认执行准则 (Default Workflow Directive)

进行特性开发或架构重构时，默认遵循 [qa-workflow.md](docs/agents/qa-workflow.md)（按快/标准/慢车道剪裁）：
1. **规划与基线**：未对齐不写码；标准车道 spec 后、慢车道 `/to-tickets` 后运行 `/qa-test-planner`（默认 inline、Schema 4）；证据只认 `qa-run` 日志、`[TCxx-n]` 标记、`绑定` 与截图，`gate-plan-*`/`gate-acceptance-*`/`gate-review-*` 落盘，不新增 Hooks 或自动重试。
2. **串行与浏览器**：默认单会话串行，仅显式 `--independent`（1 规划）或 `/implement-spec`（最多 2 实现，禁自动选/升模型）；触及认证、对话、图像、视频、语音、历史、计费等核心链路必须完成阶段 5（遵循宿主工具优先级，轻量 DOM/视口且无需桌面登录态优先 Playwright，需复用登录态用 `ego-browser` 可见窗口，默认 1–3 条核心主链路）。
3. **独立双轴与分流**：标准/慢车道经 `collect` 后**仅用 Skill 工具调用 `code-review`**（使用独立上下文，禁直接 Agent 派发与转抄原文）；有 challenge 新轮由子代理自写并运行 `review-package seal`，双轴未全达终态前冻结全部代码与文档/QA 输入。三档分流逐条核对（`S-H、P-M、P-W 驳回须引 ADR 或契约`，改档下轮复核、不成立改为本次修）；默认增量复审自动上限 1 轮（`r2`，超限停在 `WAITING_HUMAN` 交人工决策包）；缺独立返回或凭据时只交付审查包保持待独立审查，禁跑最终 `qa-check review` 或 `git add -N`/自动 commit。

### 流程自检门禁 (Execution Gate)

涉及代码编写或架构重构的任务，只在任务首轮与宣称交付时完整声明以下内容；其他回合不重复，状态变化时只写一行中文：
- **QA 阶段与车道**：[阶段、spec/工单来源、快/标准/慢车道]
- **核心链路与浏览器验收**：[是否触及核心链路；触及时给出 qa-plan 路径与工具，未触及时说明豁免理由]
- **代码审查状态**：首轮写 [未到审查阶段 / 快车道豁免]；交付时不自填，直接引用 `node tooling/scripts/qa-check.mjs review` 结果行（缺独立返回写“待独立审查”）。其 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审；未通过或未豁免时禁提 commit、禁用完成态表述
- **当前动作**：[本轮具体流程动作]

未声明上述状态即直接写码或声称交付完成，视为流程违规。详见 `docs/agents/qa-workflow.md`（实战指南：`docs/agents/qa-workflow-guide.md`）。
