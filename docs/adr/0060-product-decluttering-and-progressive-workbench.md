# 0060. 产品信噪比收敛、双轨制冷冻与渐进式 Agent 工作台决策 (Product Decluttering, Dual-Track Freezing and Progressive Workbench)

- **状态**: Accepted
- **日期**: 2026-11-20
- **决策者**: 架构委员会 (通过 Swarm 多维审问与用户批准)
- **关联文档**: `docs/prd/01-prd-product-decluttering-convergence.md`、`grilling-report.md`、ADR-0015、ADR-0016

---

## 背景 (Context)

平台当前存在 19 个独立页面与 76 个 API 路由，包含八字排盘、紫微斗数、奇门遁甲、文生图、文生视频、实时语音等多个方向，以及 `/ppt`、`/legal` 等点击显示“开发中”的占位项。
文档事实与代码存在严重断层（如宣传通义千问、NestJS，但代码中为 0 接入；`packages/providers` 仅接入讯飞、豆包、DeepSeek 三家）。
在求职面试与生产演示中，琳琅满目的工具堆砌让面试官误以为是“缺乏主线的拼凑玩具站”，而核心资产（自写 Agent Loop、Artifacts 流式解耦、HMAC 审批、RAG 混合检索）被深埋，默认配置中 `agentModeEnabled` 甚至为 `false`。

在针对 PRD-01 展开的高强度审问（`/grill-with-docs`）中，进一步发现了四大技术与产品地雷：
1. **过度承诺风险**：PRD 声称重构为“工业级 AI Agent 工作台中枢”，拉高了面试官对高可用、分布式断点续跑等维度的预期，形成新雷区；
2. **水合覆盖 Bug**：`settings-store.ts` 在 `onRehydrateStorage` 中硬编码了 `state?.setAgentMode(false)`，盲改默认值会被瞬间置回；
3. **无 Key 崩溃**：开启 Agent 模式服务端强制指定 DeepSeek，若未配 Key 首条消息直接抛 500；且最低需预留 4,096 tokens，新用户易被 402 拦截；
4. **主导航死链**：PRD 规划的主导航三柱石包含 `/admin/eval`，但代码中根本未开发该页面，挂上去即 404。

---

## 决策 (Decisions)

### 1. 定调纠偏（消灭 Over-promising）
严禁对外宣传“工业级 AI Agent 工作台中枢”。定调统一修正为：**「面向交付物（Artifacts）与高安全治理的生产级轻量 AI Agent 应用全栈」**。突出状态机有界性、HMAC 防重放、Fail-Closed 等治理深度，绝不盲目吹嘘规模。

### 2. 命理模块双轨制冷冻 (Dual-Track Freezing)
- **UI 层面 100% 抹杀**：侧边栏、顶部导航、应用弹窗、首页推荐卡彻底移除所有算命/命理入口；
- **路由 307 重定向**：在 `next.config.mjs` 中将 `/destiny/*` 等旧路径统一 307 重定向至 `/chat`；
- **底层代码静默冷冻**：严禁暴力物理删除或移动文件目录，避免破坏 `packages/shared` 中的历史报告契约、计费枚举与数据库持久化记录。

### 3. `/labs` 实验室纯净化
`/labs` 仅保留**「多模态实验室」**（Agnes 生图与 CogVideoX 视频生成），作为多模态算法能力的延伸实验田，严禁任何命理模块混入。

### 4. 渐进式工作台 (Progressive Workbench)
- **修复水合 Bug**：移除 `settings-store.ts` 中的 `onRehydrateStorage` 清零逻辑；
- **环境探针与自动降级**：增加模型 Key 与配额探测，未配置 `DEEPSEEK_API_KEY` 或余额低于 4,096 tokens 时，自动优雅降级为极速对话并弹出友好 Toast 引导，严禁直接抛 500/402；
- **首屏任务矩阵卡片**：在 `/chat` 首页提供 3 个高频预设场景卡片，点击在 300ms 内触发 Thought 骨架屏，消除首字延迟（TTFT）等待焦虑。

### 5. 主导航 IA 收敛
Stage 1 严格恪守“零无效占位”准则，主导航仅挂载已上线的核心柱石：**「智能体工作台 (`/chat`)」**与**「知识资产中枢 (`/knowledge`)」**，绝不提前挂载未实现的 `/admin/eval`。首页 `/` 及中间件直接重定向至 `/chat`。

### 6. 悬挂 Worker 与冗余依赖物理剔除
从 `apps/worker/src/index.ts` 的 `workers` 启动数组中彻底移除伪造的 Mock Worker（`sttWorker`, `pptWorker`, `imageWorker`），释放至少 6 条常驻无效 Redis 轮询连接；从 `apps/worker/package.json` 彻底卸载 `pptxgenjs` 依赖，缩短 Docker 镜像构建时间。

### 7. 移动端 Artifacts 交互规范
严守 `CLAUDE.md` 移动端红线：
- 桌面端（≥1024px）动态按需展开右侧 Dock（无产物时不留白）；
- 移动端（<768px）采用**单视图双 Tab 模式 (`[💬 对话] [📄 交付物 (N)]`) + 底部浮动提示条**；
- 点击热区严格 `>= 44x44px`，全面适配 iOS `pb-safe` 安全区。

---

## 影响与权衡 (Consequences & Trade-offs)

### 正向收益 (Pros)
1. **信噪比极大提升**：消除算命与假占位模块，面试官第一眼看到的即为 Agent 工作台与交付物面板；
2. **消灭面试与文档穿帮**：彻底清理通义千问、NestJS 等虚假口径，口径与代码 100% 一致；
3. **系统稳定性增强**：修复水合清零 Bug，消除无 Key 500 级联崩溃，释放常驻 Redis 空连接；
4. **移动端合规**：补齐 Artifacts 在窄屏下的交互规范，严格满足无横向滚动与拇指触达红线。

### 负向代价 (Cons & Risks)
1. **旧命理链接失效**：旧用户直接访问 `/destiny` 将被重定向至 `/chat`，丧失直接入口（属预期减法行为）；
2. **工时调整**：因涉及水合逻辑修复、移动端双 Tab 改造与路由防御，总工时由原 PRD 预估的 2.5 天调整为 **4.5 ~ 5 个工作日**。
