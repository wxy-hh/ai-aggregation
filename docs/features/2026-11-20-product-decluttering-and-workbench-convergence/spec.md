# 技术规格：产品信噪比收敛、双轨制冷冻与渐进式 Agent 工作台架构

Spec Authority: `docs/features/2026-11-20-product-decluttering-and-workbench-convergence/spec.md`（唯一事实源）
Status: `ready-for-agent`
ADR: `docs/adr/0060-product-decluttering-and-progressive-workbench.md`
Glossary: `GLOSSARY.md`（ProductDecluttering、ProgressiveWorkbench、DualTrackFreezing、MultimodalLabs）
QA Kind: `feature`

---

## Problem Statement

从用户体验、系统稳定性与工程可信度视角，平台当前存在三大核心痛点：

1. **信息过载与心智稀释（拼凑玩具站错觉）**：
   当前仓库堆积了 19 个独立页面与 76 个 API 路由，包含八字排盘、紫微斗数、奇门遁甲、星座、生图、生视频等大量浅层试验功能；应用弹窗中充斥着 `/ppt`、`/legal`、`/code`、`/3d` 等点击后提示“功能开发中”的假占位卡片。新访客与面试官进入系统时，第一直觉是“东拼西凑的玩具聚合站”，而系统最具竞争力的核心资产（自写 Agent Loop、前后端 SSE 状态机、HMAC 审批、RAG 混合检索）被深埋在二级菜单中，甚至默认配置中 `agentModeEnabled` 处于关闭（`false`）状态。
2. **文档与代码事实断层（消灭面试穿帮点）**：
   项目文档长期宣传接入了通义千问、智谱对话、NestJS 独立后端以及 100% 评测覆盖；但实际代码审查证实：`packages/providers` 仅接入讯飞星火、火山豆包、深度求索（DeepSeek）三家对话 Provider，通义千问为 0 接入纯虚构，智谱仅为独立视频 Service，Agnes 仅为独立生图 Service；后端实质为现代 Next.js 15 全栈架构；且 `apps/worker` 中常驻启动了 `sttWorker`、`pptWorker`、`imageWorker` 三个虚假 Mock 空转 Worker，持续占用 6 条 Redis 连接轮询空队列，严重损害工程信誉。
3. **Agent 模式默认开启的技术地雷与断崖崩溃**：
   - **水合清零 Bug**：`settings-store.ts` 在 `onRehydrateStorage` 中硬编码了 `state?.setAgentMode(false)`，盲改默认值会被 LocalStorage 水合瞬间置回；
   - **无 Key 500 级联报错**：Agent 模式强制绑定 `deepseek-flash`，若服务端未配置 `DEEPSEEK_API_KEY`，用户发首条消息即触发 500 报错；
   - **配额门槛拦截**：Agent 模式最低预留 4,096 tokens，新注册或低配额用户首发即遭遇 402 拦截；
   - **移动端与首屏断裂**：无交付物时右侧面板强行隐藏或留白，且移动端（390px 视口）直接 `hidden`，违背 `CLAUDE.md` 移动端红线。

---

## Solution

实施产品做减法与渐进式工作台重构，将 90% 的工程表达力聚焦于王牌生态位，定调为**「面向交付物（Artifacts）与高安全治理的生产级轻量 AI Agent 应用全栈」**：

1. **渐进式工作台（Progressive Workbench）**：
   - 彻底修复 `settings-store` 水合清零逻辑，使 `agentModeEnabled` 默认启用（`true`）且持久化记忆用户自主切换；
   - 引入环境探针与自动优雅降级：在未配置 `DEEPSEEK_API_KEY` 或 Token 余额低于 4,096 tokens 时，自动降级为极速对话并弹出轻量 Toast 友好提示，绝不抛出 500 或 402 错误；
   - `/chat` 首页提供 3 个高频 Agent 场景矩阵卡片，用户触发后 300ms 内渲染 Thought 思考流骨架屏，消除首字延迟（TTFT）焦虑；
   - 移动端适配单视图双 Tab 模式（`[💬 对话] [📄 交付物 (N)]`）与底部浮动提示，点击热区严格 `>= 44x44px`，无横向滚动且适配 iOS `pb-safe` 安全区。
2. **信息架构做减法与双轨制冷冻（Dual-Track Freezing）**：
   - 彻底从 `apps-modal.tsx` 与类型中物理移除 `DISABLED_APP_IDS`（PPT/法律/代码/3D）；
   - 主 UI（侧边栏、顶部导航、应用弹窗、首页推荐卡）100% 抹杀算命入口，旧路由 `/destiny/*` 在 `next.config.mjs` 中统一 307 重定向至 `/chat`；底层数据结构与契约静默冷冻，不破坏历史数据与共享包；
   - 设立纯多模态实验室 `/labs`（仅限 Agnes 生图与 CogVideoX 视频生成），严禁任何命理排盘内容混入；
   - 主导航 Stage 1 仅挂载真实可用的「智能体工作台 (`/chat`)」与「知识资产中枢 (`/knowledge`)」，绝不提前挂载未实现的 `/admin/eval`；中间件 `/` 重定向至 `/chat`。
3. **文档与 Worker 事实对齐**：
   - 全仓更新 `README.md`、`CLAUDE.md`、`DEPLOYMENT.md` 及构建脚本，彻底清除通义千问（`DASHSCOPE_API_KEY`）与 NestJS 虚构口径；
   - 从 `apps/worker/src/index.ts` 彻底移除 3 个空转 Worker（`sttWorker`, `pptWorker`, `imageWorker`），释放常驻 Redis 空连接，并卸载 `pptxgenjs` 冗余依赖。

---

## User Stories

1. 作为一名新访客，当我无缓存访问站点根路径 `/` 时，系统自动重定向至 `/chat` 智能体工作台，首屏展现核心生产力场景矩阵，且完全看不到任何算命模块或未完成占位卡片，以便我第一眼建立严肃生产力平台的专业认知。
2. 作为一名智能对话用户，当我首次打开 `/chat` 页面时，系统默认处于智能体模式，输入框上方提供明确的模式切换按钮（`⚡ 智能体模式 (推荐)` 与 `💬 极速对话`），以便我能够直观感知并自主选择对话形态。
3. 作为一名智能对话用户，当我在界面上主动将模式切换为极速对话或智能体模式后，页面刷新与重新进入时能忠实保留我最近选择的状态，而不会被系统强制重置回非智能体模式，以便我的使用偏好得到尊重。
4. 作为一名未配置 `DEEPSEEK_API_KEY` 的本地开发者或新访客，当我在智能体模式下发送首条提问时，系统通过环境探针检测到缺少依赖凭据并自动优雅降级为极速对话，同时弹出友好的中文 Toast 提示，以便我能继续获得对话答复而不遭遇 500 级联报错。
5. 作为一名 Token 配额余额较低（低于 4,096 tokens）的注册用户，当我在智能体模式下发送提问时，系统自动识别配额不足以支撑多步智能体运行并平滑降级为单轮极速对话，以便我的提问仍能得到响应，而不是直接被拦截并显示生硬的 402 错误。
6. 作为一名智能对话用户，当我点击首屏预设的智能体场景矩阵卡片（如“知识深度调研”）时，输入框自动填充并发送任务，系统在 300ms 内展示 Thought 思考流骨架屏，以便我直观感知 Agent 正在规划拆解，消除长时间首字延迟带来的系统卡死疑虑。
7. 作为一名智能对话用户，当 Agent 在会话中生成第一个交付物（Artifact）时，桌面端（≥1024px）右侧面板平滑展开联动展示产物大纲与代码高亮；当会话中尚无任何交付物时，右侧不强行展示空白面板，以便主输入区域与消息流保持充裕的可读宽度。
8. 作为一名使用手机端浏览器（<768px）的用户，当 Agent 在会话中生成交付物时，页面顶部以清晰的双 Tab 切换器（`[💬 对话] [📄 交付物 (1)]`）及底部浮动提示条呈现，以便我在小屏下通过单指点击（热区 ≥ 44x44px）在对话流与交付物之间顺畅切换，且不会产生横向滚动条或被虚拟键盘遮挡。
9. 作为一名平台用户，当我点击顶部导航栏中的应用网格弹窗时，列表中仅展示真实可用的功能模块，完全不包含任何点击后提示“功能开发中”的假占位卡片（如 PPT、法律咨询、代码生成、3D 建模），以便我不被无效入口干扰。
10. 作为一名收藏了历史排盘链接的用户，当我直接在浏览器地址栏输入旧命理路径（如 `/destiny` 或 `/destiny/bazi`）时，系统自动执行 307 重定向至 `/chat`，以便我能平滑过渡到主线工作台，而不是看到破损的 404 页面。
11. 作为一名对多模态生成感兴趣的用户，我可以通过侧边栏的「实验室 (Labs)」入口访问 `/labs`，在专属的多模态试验田体验文生图与视频生成功能，且该页面内绝对不混杂任何算命排盘内容，以便我专注于多模态算法的体验。
12. 作为一名平台运维与资源审视者，在启动 Worker 服务时，系统仅常驻监听真实有生产消费的队列（`memory-index`, `rag-index`, `qimen-base`, `qimen-section`, `maintenance`），不再为无生产者的假队列（`stt`, `ppt`, `image`）创建无意义的 Redis 轮询连接，以便降低生产环境的 Redis 负载与网络消耗。
13. 作为一名工程规范审视者，当我检阅项目 `README.md`、`CLAUDE.md` 与配置脚本时，系统技术栈与模型供应商描述与实际代码仓库 100% 吻合（仅列出讯飞、豆包、DeepSeek 三大对话供应商，多模态准确标注为 Agnes 与智谱，移除千问与 NestJS 虚构表述），以便建立真实可信的工程形象。

---

## Implementation Decisions

### 1. 渐进式工作台与状态持久化架构
- **水合覆盖逻辑移除**：
  修改 `apps/web/src/stores/settings-store.ts`：
  - 将 `agentModeEnabled` 纳入持久化字段（或从非持久化黑名单中移除）；
  - 彻底删除 `onRehydrateStorage` 回调中执行的 `state?.setAgentMode(false)`，确保水合完成后忠实保留用户选择；
  - 默认值 `agentModeEnabled` 设置为 `true`。
- **环境探针与自动降级契约（ProgressiveWorkbench）**：
  - 在 `apps/web/src/app/api/chat/_lib/agent-config.ts` 或 `chat-handler.ts` 中前置执行探针检查：
    1. 检查环境变量 `DEEPSEEK_API_KEY` 是否有效配置；
    2. 检查当前会话配额预留是否达到 `AGENT_MIN_STEPS (2) * AGENT_STEP_OUTPUT_LIMIT (2048) = 4,096 tokens` 门槛；
  - 若任一条件不满足且用户开启了 Agent 模式，服务端不抛出 500 / 402，而是自动将执行模式转换为普通单轮对话，并在 SSE 响应头或首个状态帧注入 `x-agent-fallback: true` 与中文降级原因（如“未配置 DeepSeek 密钥，已为您自动切换为极速对话”）；
  - 前端收到降级标记后弹出友好的轻量 Toast 提示，引导用户体验。
- **首屏场景矩阵与 Thought 骨架屏**：
  - 在 `chat-workspace.tsx` 中，当 `messages.length === 0` 时，渲染 3 个精选 Agent 能力卡片；点击直接填入预设目标并触发执行；
  - 用户触发请求后，前端立即展示 300ms 规划中骨架屏（“🧠 正在规划任务切片...”），直至接收到首个服务端流式数据块。

### 2. 移动端 Artifacts 交互重构契约
- **响应式视口断点隔离**：
  - 桌面端（视口宽度 `>= 1024px`）：保持双栏或分屏 Dock。当 `validArtifacts.length > 0` 且 `isWorkspaceOpen` 为 true 时渲染右侧面板；无产物时不留空白面板。
  - 移动端（视口宽度 `< 768px`）：
    - 废弃原有的 `hidden md:flex` 暴力隐藏逻辑；
    - 引入顶部视图切换器：`activeTab: 'chat' | 'artifacts'`；
    - 当有产物生成时，顶部显示交付物 Tab 徽标（如 `[📄 交付物 (1)]`），并在底部输入框上方弹出轻量横幅提示“已生成交付物，点击查看”；
    - 点击热区严格 `>= 44x44px`，容器底部增加 `pb-safe` 安全区 padding，避免与系统手势条或键盘冲突。

### 3. 信息架构收敛与双轨制冷冻（Dual-Track Freezing）
- **占位模块清理**：
  - 清理 `apps/web/src/components/layout/apps-modal.tsx`：删除 `DISABLED_APP_IDS = ['ppt', 'legal', 'code', '3d']` 及对应的卡片映射与未使用的图标导入；
  - 确保弹窗中每个可见 App 点击均导航至可用路由。
- **命理入口物理抹杀与 307 重定向**：
  - 侧边栏 `sidebar.tsx`、顶部栏 `header.tsx`、首页大卡片推荐区彻底删除命理模块入口（八字、紫微、奇门、星座）；
  - 在 `apps/web/next.config.ts` 中配置 `redirects` 规则：
    ```typescript
    async redirects() {
      return [
        {
          source: '/destiny/:path*',
          destination: '/chat',
          permanent: false, // HTTP 307
        },
      ];
    }
    ```
  - `middleware.ts` 根路径重定向由 `/home` 调整为 `/chat`。
- **纯多模态实验室 (`/labs`)**：
  - 新建 `apps/web/src/app/labs/page.tsx`，仅聚合展示：
    1. AI 文生图 / 图生图（基于 Agnes Service）；
    2. AI 视频生成（基于 CogVideoX 异步任务）；
  - 附带严谨产品说明：“多模态前沿生成模型试验田”，彻底屏蔽算命内容。

### 4. Worker 瘦身与文档纠偏
- **假 Worker 物理剔除**：
  - 修改 `apps/worker/src/index.ts`：从 `workers` 启动数组中彻底移除 `sttWorker`, `pptWorker`, `imageWorker` 实例；
  - 修改 `apps/worker/package.json`：移除 `"pptxgenjs": "^3.12.0"` 依赖并重新生成锁文件。
- **文档全量清虚**：
  - 全面更新 `README.md`、`CLAUDE.md`、`docs/project-guide.md`、`DEPLOYMENT.md` 与 `tooling/scripts/check-env.sh`：
    - 对话模型统一修正为：讯飞星火 Spark、火山引擎豆包 Doubao、深度求索 DeepSeek；
    - 图像标注为 Agnes，视频标注为智谱 CogVideoX；
    - 架构表述统一修正为 Next.js 15 Monorepo 全栈；
    - 全仓彻底删除 `DASHSCOPE_API_KEY` 与通义千问描述。

### 5. 推翻既有决策与权衡说明
- **被推翻项**：推翻 PRD-01 初稿中关于“将命理模块折叠归入 `/labs`”以及“在主导航挂载 `/admin/eval`”的设想。
- **决策依据**：
  - 命理模块放入 Labs 仍会被面试官感知为拼凑玩具站，必须在 UI 彻底抹杀；
  - `/admin/eval` 属于 Stage 3，Stage 1 挂载即 404，严重违背“零无效占位”准则。
- **代价与权衡**：
  - 旧命理链接无法直接访问，被 307 重定向至 `/chat`；
  - 工时预估由 2.5 天客观调整为 4.5 ~ 5 个工作日。

---

## Testing Decisions

1. **良好测试的标准**：
   - 聚焦于外部可观察行为（UI 渲染状态、HTTP 状态码、重定向目标、探针降级结果），不测试私有变量；
   - 核心链路覆盖：设置存储水合、降级探针、Worker 启动健康、路由重定向与移动端双 Tab 视口。
2. **测试模块与接缝设计**：
   - **接缝 1 (设置水合与模式切换)**：`apps/web/src/stores/settings-store.test.ts`
     - 验证 `agentModeEnabled` 默认值为 `true`；
     - 验证在触发水合生命周期后，`agentModeEnabled` 不被置回 `false`；
     - 验证调用 `setAgentMode(false)` 能正确切换为极速对话并保持。
   - **接缝 2 (环境探针与自动降级)**：`apps/web/src/app/api/chat/_lib/agent-probe.test.ts`
     - 验证未配置 `DEEPSEEK_API_KEY` 时探针返回降级标记；
     - 验证 Token 额度不足 4,096 tokens 时探针返回降级标记；
     - 验证降级时注入的响应头与中文提示格式。
   - **接缝 3 (Worker 注册与健康扫描)**：`apps/worker/src/__tests__/workers-registry.test.ts`
     - 验证 `workers` 数组中仅包含 5 个真实业务 Worker，绝无 `stt`、`ppt`、`image` 队列监听。
   - **接缝 4 (路由与重定向拦截)**：`apps/web/src/__tests__/redirects.test.ts`
     - 验证访问 `/destiny` 及 `/destiny/bazi` 返回 307 重定向至 `/chat`；
     - 验证根路径 `/` 重定向至 `/chat`。
   - **接缝 5 (真实浏览器端到端冒烟 RealLinkSmoke)**：Playwright E2E
     - 桌面端：验证打开首页无算命入口，应用弹窗无占位禁用卡片；
     - 移动端（390px）：验证产物生成后出现双 Tab 切换器，点击热区满足 `>= 44x44px` 且无横向滚动。
3. **已有测试前例**：
   - `apps/web/src/stores/__tests__/`
   - `apps/web/e2e/`

---

## 交付命令

```bash
pnpm --filter @repo/web exec vitest run src/stores/__tests__/settings-store.test.ts
pnpm --filter @repo/web exec vitest run src/app/api/chat/_lib/__tests__/agent-probe.test.ts
pnpm --filter @repo/web exec vitest run src/__tests__/redirects.test.ts
pnpm --filter @repo/worker exec vitest run src/__tests__/workers-registry.test.ts
pnpm --filter @repo/web typecheck
pnpm --filter @repo/worker typecheck
```

---

## Out of Scope

1. 不进行命理排盘算法代码与数据库字段的物理删除（维持底层静默冷冻）；
2. 不开发 Stage 3 的评测与可观测控制台（`/admin/eval`）；
3. 不重构 Agnes 与 CogVideoX 的底层模型推理协议；
4. 不修改 `packages/shared` 中的历史计费契约；
5. 不引入分布式 Redis Checkpoint 事件溯源持久化（属于 Stage 2）。

---

## Further Notes

### 降级流转与状态矩阵

| 场景 | `agentModeEnabled` 状态 | DeepSeek Key 状态 | 配额水位 | 最终执行链路 | 用户感知 |
|---|---|---|---|---|---|
| 标准智能体体验 | `true` | 已配置有效 | ≥ 4,096 | Full Agent Pipeline | 300ms 骨架屏 + Thought 折叠卡 + Artifacts |
| 无 Key 环境新访客 | `true` | **未配置** | 任意 | 优雅降级为极速对话 | 极速首字返回 + 提示“自动切换为极速对话” |
| 低余额注册用户 | `true` | 已配置有效 | **< 4,096** | 优雅降级为极速对话 | 极速首字返回 + 提示“额度不足，已切极速模式” |
| 用户主动选择极速 | `false` | 任意 | 任意 | 单轮极速对话 | 纯文本/Markdown 对话，无工具调用 |
