## QA & 研发闭环默认执行准则 (Default Workflow Directive)

进行特性开发或架构重构时，默认遵循 `docs/agents/qa-workflow.md`（按快/标准/慢车道剪裁）：
1. **规划与基线**：未对齐不写码；标准车道 spec 后、慢车道 `/to-tickets` 后运行 `/qa-test-planner`（默认 inline、Schema 4）；证据只认 `qa-run` 日志、`[TCxx-n]` 标记、`绑定` 与截图，`gate-plan-*`/`gate-acceptance-*`/`gate-review-*` 落盘，不新增 Hooks 或自动重试。
2. **串行与浏览器**：默认单会话串行，仅显式 `--independent`（1 规划）或 `/implement-spec`（最多 2 实现，禁自动选/升模型）；触及 {CORE_LINKS} 等核心链路必须完成阶段 5（遵循宿主工具优先级，轻量 DOM/视口且无需桌面登录态优先 Playwright，需复用登录态用 `ego-browser` 可见窗口，默认 1–3 条核心主链路）。
3. **独立双轴与分流**：标准/慢车道经 `collect` 后**仅用 Skill 工具调用 `code-review`**（使用独立上下文，禁直接 Agent 派发与转抄原文）；有 challenge 新轮由子代理自写并运行 `review-package seal`，双轴未全达终态前冻结全部代码与文档/QA 输入。三档分流逐条核对（`S-H、P-M、P-W 驳回须引 ADR 或契约`，改档下轮复核、不成立改为本次修）；默认增量复审自动上限 1 轮（`r2`，超限停在 `WAITING_HUMAN` 交人工决策包）；缺独立返回或凭据时只交付审查包保持待独立审查，禁跑最终 `qa-check review` 或 `git add -N`/自动 commit。

### 流程自检门禁 (Execution Gate)

涉及代码编写或架构重构的任务，只在任务首轮与宣称交付时完整声明以下内容；其他回合不重复，状态变化时只写一行中文：
- **QA 阶段与车道**：[阶段、spec/工单来源、快/标准/慢车道]
- **核心链路与浏览器验收**：[是否触及 {CORE_LINKS} 等核心链路；触及时给出 qa-plan 路径与工具，未触及时说明豁免理由]
- **代码审查状态**：首轮写 [未到审查阶段 / 快车道豁免]；交付时不自填，直接引用 `node tooling/scripts/qa-check.mjs review` 结果行（缺独立返回写“待独立审查”）。其 `结果: PASS` 只称“机器校验通过”，不证明独立来源、不判断证据语义、不构成交付授权，不替代独立审查与人工终审；未通过或未豁免时禁提 commit、禁用完成态表述
- **当前动作**：[本轮具体流程动作]

未声明上述状态即直接写码或声称交付完成，视为流程违规。详见 `docs/agents/qa-workflow.md`。
