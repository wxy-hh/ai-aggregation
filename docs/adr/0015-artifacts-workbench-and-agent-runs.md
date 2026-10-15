# 0015. Artifacts 工作台架构与 Agent 运行记录模型

* **状态**：已接受
* **日期**：2026-10-12
* **决策者**：AI 聚合平台工程团队
* **范围**：`apps/web`（`chat-workspace`、`chat-store`、`message-item`、`agent-runner`、`chat-handler`、`/profile`）、`packages/shared`（`chat-stream-contract`）、`packages/db`（`schema.prisma`、`agent_runs`）

---

## 背景

在 ROADMAP P1 阶段，平台从「聊天机器人」升格为「AI 协作工作台」，主语从「对话（Conversation）」转换为「任务（Task）」。
面临三个核心矛盾：
1. **沟通介质与资产介质混杂**：生成的几千字长调研报告、多维对比表格、复杂代码块挤压在聊天气泡内，纵向滚动刷屏严重，且缺乏专用的全屏阅读、导出 Markdown、复制等资产级操作；
2. **任务过程缺乏持久化审计**：Agent 运行时的步数、工具调用序列与 Quota 消耗仅在前端内存渲染，刷新或事后无法追踪回溯，缺乏可信度与重跑（Re-run）能力；
3. **Webhook 工具供给门槛高**：非技术用户面对 cURL / URL / JSON Schema 配置有门槛，需要通过自然语言对话式降低供给门槛。

## 决策

1. **交付物与交流流物理分离（双轨流式抽取协议）**：
   - 富媒体类工具产物（如 `image_generate` 产出的图像）：继续由工具管道交付，结果统一泛化挂载为 `Artifact`；
   - 文本/代码/表格类长交付物：在 Prompt 中约束模型使用 `<artifact identifier="..." type="markdown|table|code" title="...">...</artifact>` 标签生成，气泡正文仅输出短导读；
   - 扩展 SSE 流式协议：新增 `artifact_start`、`artifact_delta`、`artifact_end` 事件，流式解析器实时从普通 `text-delta` 中剥离长文本并推入右侧工作台，保障用户在右侧看到实时的打字机流式渲染。

2. **会话级多产物池与双向联动交互**：
   - 会话持有 `Artifact[]` 资产池，每条消息记录 `artifactIds` 引用；
   - **流式期**：新产物流式生成时桌面端右侧工作台自动展开并设为活动焦点（Active Artifact）；
   - **回顾期**：点击消息流内的 `ArtifactCard` 平滑切换活动产物；右侧顶部提供产物切换选择器与一键折叠，兼顾单栏与双栏视野。

3. **移动端优先的全屏工作台覆盖层（Full-screen Overlay）**：
   - 窄屏（< 1024px）下严禁压缩双栏；生成中通过消息内卡片呼吸态非侵入提示；
   - 点击卡片呼出全屏工作台覆盖层，顶部提供 ≥44x44 的大热区返回按钮与操作栏，底部严格适配 iOS Home Indicator 安全区（`pb-safe`）。

4. **Agent 运行记录（`agent_runs`）模型与单 Run 粒度**：
   - 单次用户消息触发的智能体多步编排定义为一条独立的 `AgentRun` 实体；
   - 在 `chat-handler.ts` 的 `onFinish` 回调中与配额结算原子同源落库，记录 `goalText`、`steps`、`toolCalls`、`artifactRefs`、`outcome`（`success|partial|failed`）、`quotaCost`、`durationMs`；
   - `/profile` 提供运行记录中心，支持一键「重跑」（将目标与对应场景能力包预填至新建会话）。

5. **自然语言生成 Webhook 工具三步流**：
   - 新增 `POST /api/agent-tools/draft` 结构化生成接口，调用 LLM 产出合法 Draft；
   - 生成草稿强制通过服务端 `validateWebhookUrl` 白名单守卫，防范内网穿透；
   - 前端提供「描述生成 → 表单预览/填入鉴权 Key → 真实 Ping 测试 → 保存入库」防错闭环。

6. **P1 演进编排三工单拆分**：
   - **工单 01（Artifacts 工作台）**：协议扩展、双轨流式抽取、桌面双栏与移动端全屏工作台组件；
   - **工单 02（Agent 运行记录）**：`agent_runs` 表与 Prisma 迁移、`onFinish` 落盘、`/profile` 历史列表与重跑跳转；
   - **工单 03（自然语言生成 Webhook 工具）**：draft 生成接口、安全校验与工具配置三步向导。

## 备选方案及否决理由

1. **纯工具驱动产出长文本（Tool-driven，如 `create_artifact` 工具）**：
   - *否决理由*：模型通过 JSON arguments 输出超大文本需等整段结束才能拿到，用户无法看到流式打字效果；且 JSON 字符串转义超大代码或 Markdown 极易语法错误。
2. **纯前端标签拦截（BFF 不感知）**：
   - *否决理由*：前后端契约模糊，服务端无法在结算与生成完成时提取结构化的产物引用，导致工单 02 的 `agent_runs.artifact_refs` 丢失数据源。
3. **单会话单产物覆盖制**：
   - *否决理由*：深度调研与代码生成常有多轮产物（报告、表格、源码），覆盖制会导致前序产物丢失，破坏多步资产沉淀。

## 后果

- **正面**：
  - 交付物与交流流彻底解耦，桌面端阅读与导出体验达到主流顶级 AI 工作台水准；
  - 窄屏体验得到红线级保障，手势无竞争；
  - 运行记录打通配额账本与审计回放，为重跑和后续 P2 异步架构奠定数据基石。
- **负面 / 注意事项**：
  - 服务端/消费端流式解析器需要严格处理标签跨 chunk 截断和异常未闭合标签容错；
  - 双栏布局在桌面端需要妥善处理输入框与消息列表宽度自适应，避免极端分辨率下的横向溢出。
