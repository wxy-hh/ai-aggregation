# Handoff：qa-workflow 流程优化（承接 dev-flow 对比分析结论）

日期：2026-10-09

## 下一会话目标

**优化 qa-workflow 流程**。用户已拍板：dev-flow 对比分析的结论保留（见「已定结论」），不要在结论本身上重新展开辩论；把精力放在 qa-workflow 的打磨与实证上。

## 仓库

- 工作仓库：`/Users/weixiaoyu/Desktop/practice/AI-aggregation`（Next.js 15 + pnpm + turbo monorepo）
- dev-flow 仓库：`/Users/weixiaoyu/Desktop/practice/dev-flow`（Claude Code 插件，v0.2.7，拟冷冻，只读对待）

## 已定结论（本轮分析产出，勿推翻，按需引用）

1. **分层定位**：dev-flow = HOW 层执行治理（hook 硬门禁 / done 咽喉 / 证据链）；qa-workflow = WHAT 层规格 + UX 真机验收。两者不互斥，但用户已决定日常开发走 qa-workflow。
2. **dev-flow 方向合同 §3.1 已预判软约束失守**（"Matt Pocock Skills 押模型自觉，失守概率高"）；qa-workflow 的软约束失守点已确认并做了提示词级硬化（仍非硬保障）。
3. **决策**：dev-flow 冷冻不删除；敏感路径/不可逆操作拦截改用宿主原生 `permissions.deny` 替代（待办）；e2e 套件是唯一跨宿主、可进 CI 的硬保障。
4. **文档分工**：`qa-workflow.md`（8KB）为流程正本；`qa-workflow-guide.md`（29KB）降级为参考书（查坑/查话术/交接模板），防止流程文档患规模债。
5. **dev-flow 复活判据**：Claude Code 成为唯一主力宿主 且 出现真实协作审计需求，二者同时满足再解冻。

参考出处（勿复制内容，按路径引用）：
- dev-flow 方向合同：`dev-flow/docs/2026-08-19-下一代工作流设计方向.md`
- Gemini 对比分析 transcript：`dev-flow/2026-10-09-161821-userswei.txt`（注意：其混用了已删除的旧版概念 rollbackUnit/contract.json/dev_flow_finalize，且夸大了 qa-workflow 的实证程度——三处偏差已在当时纠正）

## 当前流程资产现状（勿重复创建，按需修改）

- 流程正本：`docs/agents/qa-workflow.md` —— 7 阶段闭环 + 快慢车道剪裁表 + 核心链路红线 + 时间盒（≤5 条用例/≤15 分钟）+ 无 qa-plan 兜底规则 + 探活防呆 + 就绪锚点（禁 networkidle）+ 截图落盘 `.scratch/<feature>/screenshots/`
- 参考书：`docs/agents/qa-workflow-guide.md` —— 正本没有的内容：技能权限矩阵、三层隔离探针、跨会话交接契约、速查清单
- 入口索引：`CLAUDE.md` 末尾 + `AGENTS.md` 末尾的「## Agent skills」块（Kimi Code 读 AGENTS.md，Claude Code 读 CLAUDE.md，两处需同步）
- 技能定制点（`.claude/skills/`，均有「项目定制，上游升级时保留」标注，共 5 处）：
  - `qa-test-planner/SKILL.md`：四条项目约定（定位器/可量化断言/P0-P2 分级/视口意识）
  - `implement/SKILL.md`：核心链路浏览器验收前置指令
  - `implement-spec/SKILL.md`：主编排 Agent 承担验收、子代理不承担
  - `to-spec/SKILL.md`：结尾下一步导流（/to-tickets + /qa-test-planner）
  - `pr/SKILL.md`：Evidence 优先取 `.scratch/<feature>/screenshots/`
- 技能目录：`.agents/skills` 是指向 `.claude/skills` 的软链，安装/修改只动 `.claude/skills`
- e2e 套件：`apps/web/e2e/` 下 fixtures + home/chat/image/history/login/constellation-universe 六个 spec，14 项（7 用例 × 桌面/移动双视口）全绿（2026-10-08 验证）

## e2e 环境踩坑速查

- `apps/web/playwright.config.ts`：baseURL 3030，webServer 自动起 `next dev -p 3030`；projects = chromium + mobile-chrome（Pixel 7）
- 固定匿名设备指纹：`e2e/fixtures.ts` 的 `seedFixedDevice`（防匿名账号创建限流：每 IP 每小时 30 次）
- `/image` 页桌面/移动面板双份渲染（互斥隐藏）→ 选择器必须 `.filter({ visible: true })`
- 聊天消息文本会同时出现在气泡/h1 标题/侧栏三处 → 断言定位 `div.whitespace-pre-wrap`
- 图像失败文案映射链：响应带 `error` 字段 → 原文回显；无 `error` 的 500 →「服务连接异常，请检查网络后重试」
- 打桩约定：LLM/上游一律 `page.route` 拦截返回确定性数据；认证走真实匿名链路；历史页用 localStorage→Dexie 一次性迁移播种
- 运行：`pnpm --filter @repo/web test:e2e`（或根目录 `pnpm test:e2e`）

## 下一步候选任务（按优先级）

1. **正本/参考书关系落地**：裁决 guide 独有内容（权限矩阵、三层隔离探针、跨会话交接契约、速查清单）哪些回流 `qa-workflow.md` 正本、哪些留参考书。约束：正本保持精简（规模债教训），回流需改写为规则形态而非教程形态。
2. **全流程实证**：拿一个真实小需求完整跑一遍 7 阶段流程，结束后 `/retro` 校准时间盒与规则有效性（流程至今零次真实全流程实证，这是最大欠账）。
3. **dev-flow 冷冻行动项**：把敏感路径/不可逆操作拦截写成 Claude Code 原生 `permissions.deny`（`settings.json`），验证后 dev-flow 转只读冷冻。
4. **P1 遗留**：`CLAUDE.md` ↔ `AGENTS.md` 全面对齐（技术栈 Kolors/Agnes、常用命令、目录结构已分化）；CI 集成（当前无任何 CI 配置，测试靠自觉）。

## Suggested skills

- `/grill-with-docs`：任务 1（正本/参考书取舍）启动前对齐
- `/implement`（内含 TDD 与验收前置指令）：落地流程文档与配置改动
- `/qa-test-planner`：任务 2 真实需求演练时的测试规划
- `code-review`：改动收口双轴审查
- `/retro`：任务 2 跑完后复盘，校准时间盒
- `/diagnosing-bugs`：e2e 或流程执行出现异常时
