# 岗位匹配度评估：AI 聚合平台 vs「Agent 开发工程师」与「AI 前端开发工程师」

> 评估日期：2026-11-09。方式：只读源码与配置核查 + 当日招聘 JD 检索。
> 与 `docs/research/agent-job-market-fit-2026.md`（2026-10-30）的关系：那份只评估 Agent 岗与 52 条大厂 JD，本份**新增 AI 前端岗、两类岗位横向对比、岗位方向排序**；凡与该报告口径冲突处，以本次源码核查为准，并显式标注。
> 前提：按题设假设已掌握本项目全部技术栈，评估的是「项目体现的能力指向哪类岗位」，不评估个人学习成本。
> 所有「项目有」的结论均附文件路径；「项目没有」的结论基于 `apps/`、`packages/`、`infra/`、`tooling/` 全量检索与目录检查，是「未发现」，不是「证明不存在」。

---

## 0. 结论先行

1. **项目形态**：一个 Next.js 15 全栈单体应用，**前端壳 + 服务端 Agent 内核一体**。既不是纯 AI 前端（AI 逻辑在 `app/api` 里由同一人写），也不是 Agent 平台（无独立 Runtime、无 MCP、无多 Agent）。这个形态决定了它的岗位去向。
2. **两岗对比**：**AI 前端开发工程师匹配度高于 Agent 开发工程师**。按本报告 14 维口径，AI 前端「完整命中 10 / 部分 1 / 缺失 3」，Agent 开发「完整 6 / 部分 5 / 缺失 3」。差距不在能力深度，而在**硬门槛错位**：Agent 岗普遍点名 Python、LangGraph/Dify、MCP、多 Agent，项目在这四项上全部为零；AI 前端岗点名的流式渲染、状态管理、Agent 过程可视化、RAG 界面、组件库，项目逐条有代码。
3. **但最适合的不是这两者中的任何一个，而是它们的交集**：**AI 应用 / Agent 应用全栈工程师（偏前端的 LLM 应用方向）**。因为两类岗位各自只用得到项目的一半，只有交集岗位能把「10 项前端命中」与「6 项 Agent 命中」同时兑现，且不触发 Python/框架硬门槛。
4. **按匹配度从高到低的岗位排序**见 §4.2：AI 应用全栈 > AI 前端（LLM 交互向）> Agent 应用开发（应用层，非平台）> Node/Next 全栈（AI 团队）> Agent 平台/Runtime（不建议）> 算法/端侧/纯前端（不建议）。

---

## 1. 项目事实清单

### 1.1 核心功能（代码实现）

`apps/web/src/app` 下 19 个 `page.tsx`、76 个 `route.ts`。

| 功能 | 入口 | 实现要点 |
|---|---|---|
| 多模型对话 / 并行对比 | `app/chat/page.tsx`、`src/stores/comparison-store.ts` | 6 个模型变体，`Promise.allSettled` 并行、独立 `AbortController`、批额度预留 `api/chat/batch-reserve/route.ts` |
| Agent 模式对话（默认关闭） | `src/stores/settings-store.ts:87`、`components/chat/chat-input.tsx` | 开关 `agentModeEnabled: false`，开启后走 `api/chat/_lib/agent/agent-runner.ts` |
| 图像生成 | `app/image/page.tsx` → `lib/services/agnes-image.ts` | 同步请求 + 429/5xx 退避重试，`MediaTask` 幂等 |
| 视频生成 | `app/video/route.ts`、`_components/use-video-generation.ts` | 智谱 CogVideoX / Agnes，异步任务 + 3s/5s 前端轮询 |
| 语音转写 | `app/api/voice/transcribe/route.ts`、`hooks/use-rtasr-realtime.ts` | 上传走 SiliconFlow 同步；实时走 Cloudflare Worker WebSocket 网关 `infra/worker-rtasr/` |
| 知识库 / RAG | `app/knowledge/page.tsx`、`_components/retrieval-debugger.tsx` | 文档上传/URL 摄取、`rag-index` 队列、检索调试台 |
| 统一历史 / 额度 / 认证 / 反馈 / 管理后台 | `app/history`、`app/profile`、`app/api/auth/*`、`app/feedback`、`app/admin/users` | 自研 JWT + bcrypt + QQ/微信 OAuth + 邮箱验证码 |
| 命理（八字/紫微/奇门/星座） | `app/destiny/` | `lunar-javascript`、`iztro`、`qimen-dunjia`、R3F WebGL 星盘 |
| 简历 / 首页 / 调试 | `app/resume`、`app/home`、`app/debug-history` | — |

`/ppt`、`/legal`、`/code`、`/3d` 在 `components/layout/apps-modal.tsx:133` 中被列为 `DISABLED_APP_IDS`，**是占位禁用项，无对应页面**。

### 1.2 主要模块（12 个 workspace 包，`pnpm-workspace.yaml`）

| 包 | 职责 | 关键文件 |
|---|---|---|
| `apps/web` | Next.js 全栈：UI + 全部 BFF/API（含 Agent 运行时） | `app/api/chat/_lib/`、`src/stores/`、`src/lib/agent/`、`src/lib/rag/` |
| `apps/worker` | BullMQ 常驻消费进程 | `src/workers/{rag-index,memory-index,qimen-*,maintenance}.ts` |
| `infra/worker-rtasr` | 讯飞实时语音 WebSocket 网关（Cloudflare Worker） | `src/index.ts`、`wrangler.toml` |
| `packages/providers` | 模型适配层：工厂 + 3 家协议兼容 + Embedding + Rerank | `src/factory.ts`、`embedding.ts`、`rerank.ts`、`xunfei.ts` |
| `packages/shared` | SSE 事件契约、能力包、Agent 计划、RAG 配置、限流、用量归一化 | `src/chat-stream-contract.ts`、`capability-pack.ts`、`agent-plan.ts`、`rag-config.ts` |
| `packages/db` | Prisma schema（21 model）、21 个迁移、配额账本、RAG chunk-store raw SQL | `prisma/schema.prisma`、`src/billing/`、`src/rag/chunk-store.ts` |
| `packages/queue` | 7 个 BullMQ 队列与 Job 类型 | `src/queues.ts`、`jobs.ts` |
| `packages/storage` | S3 兼容 + 本地双实现 | `src/index.ts`、`local-provider.ts` |
| `packages/redis` | ioredis 连接、Worker 心跳、限流器工厂 | `src/worker-heartbeat.ts`、`factories.ts` |
| `packages/logger` | 结构化 JSON 日志（很薄，纯 console） | `src/index.ts` |
| `packages/config-typescript` / `config-eslint` | 共享 tsconfig / flat ESLint | `base.json`、`nextjs.json` |

依赖方向：`apps/web`、`apps/worker` → `db/logger/providers/queue/redis/shared/storage`；`providers` → `logger/shared`；`shared` → `logger`。`CLAUDE.md:22` 强制「跨 app 共享代码必须经 packages/，禁止 apps 互相引用」。

**注意**：`README.md:24` 写了 `apps/api/`，`README.md:13` 写了「NestJS」，实际 `apps/` 下只有 `web` 与 `worker`，全仓无 `@nestjs/*` 依赖。文档是旧设想。

### 1.3 技术栈（`package.json` 声明 / `pnpm-lock.yaml` 解析）

| 层 | 技术 |
|---|---|
| 运行时 / 工程 | Node 22、pnpm 10、Turborepo 2.8.10、TypeScript 5.9.3（strict）、ESLint 9 flat config |
| 前端 | Next.js 15.5.12（`output: 'standalone'`）、React 19.2.4、Tailwind 3.4、shadcn/ui（16 个原语 + 13 个 Radix 包）、Zustand 5 + `useShallow`、TanStack Query 5、Dexie(IndexedDB)、react-window、react-markdown + rehype-highlight、framer-motion、ECharts 6、Three.js/R3F |
| AI | **Vercel AI SDK `ai` 6.0.78** + `@ai-sdk/openai` 3.0.26；`@langchain/textsplitters` 仅作无状态切分零件；`@node-rs/jieba`；Langfuse 3 |
| 模型 / 服务 | 对话：讯飞星火、豆包（火山 Ark Responses API）、DeepSeek；图像：Agnes；视频：智谱 CogVideoX / Agnes；Embedding：SiliconFlow `BAAI/bge-m3` / 豆包；Rerank：`bge-reranker-v2-m3`；语音：SiliconFlow SenseVoiceSmall / 讯飞 RTASR |
| 后端 / 数据 | Prisma 6.19.2 + PostgreSQL 16（**pgvector** 扩展，HNSW + GIN + `tsvector`）、Redis 7 + BullMQ 5.67.3、S3/MinIO、自研 HS256 JWT + bcrypt |
| 测试 / 质量 | Vitest 4、Playwright（chromium + Pixel 7）、Testing Library、fast-check、`tooling/scripts/qa-check.mjs` 等 27 个脚本、48 篇 ADR |
| 部署 | Web → Vercel（`hkg1`）/ 腾讯云单机 Docker Compose（nginx + web + worker）；Worker → Railway/Render；RTASR → Cloudflare Workers；Langfuse + ClickHouse 仅开发 compose |

### 1.4 技术实现特点（最能支撑岗位判断的 8 条）

1. **自写有界多步 Agent Loop**：`app/api/chat/_lib/agent/agent-runner.ts` 用 AI SDK `streamText({ tools, stopWhen: stepCountIs(1) })` 夺回单步决策控制权，工具结果以 `role:'tool'` 回注继续下一轮；`agent-config.ts` 限 `AGENT_MAX_STEPS=5`、`AGENT_MIN_STEPS=2`、`AGENT_PROVIDER='deepseek'`、`AGENT_MODEL='deepseek-flash'`。这不是调一个 `useChat` 能得到的。
2. **工具治理管道**：`src/lib/agent/tool-pipeline.ts` —— 去重缓存、单轮/全局/出图三重上限、连败熔断、240s 时间预算、合规二道检查；`registry.ts` 用 zod 单源生成入参校验与模型可见 JSON Schema；6 个内置工具 + 用户自定义 Webhook 工具。
3. **人机协同写操作审批**：`src/lib/agent/approval-token.ts` HMAC-SHA256 凭证绑定用户/工具/域名/参数哈希、10 分钟有效、Redis 一次性消费、密钥或 Redis 异常时失败关闭；Webhook 出站有 SSRF 与 DNS 重绑定防护、AES-256-GCM 凭证加密、`WebhookToolCall` 全量审计。
4. **生产级混合检索 RAG**：`lib/rag/hybrid-retrieval.ts` 稠密 Top20（pgvector `<=>` HNSW）+ 词法 Top20（jieba + `ts_rank_cd` + GIN）→ 自研 RRF(k=60) → 可选 Cross-Encoder 精排 → `[^n]` 引用契约与越权核验 → FAQ 短路；检索 SQL 在 `packages/db/src/rag/chunk-store.ts` 按 `user_id` 前置 ACL 过滤；文档版本化 + 软删除 + 事务内原子替换切片。
5. **前后端共享的 SSE 事件契约**：`packages/shared/src/chat-stream-contract.ts` 定义 `text-delta` / `reasoning-delta` / `tool_call` / `tool_result` / `plan_created` / `tool_approval_request` / `artifact_*` / `done` / `error`；服务端 15s 心跳 `api/chat/_lib/sse.ts`；前端 `lib/utils/chat-stream.ts` 自研状态机 + 60s 首字节 / 150s 沉默看门狗；`stores/chat-store.ts` 用 rAF 合帧 + 1s 节流落盘。
6. **成本与配额账本**：`packages/db/src/billing/quota-session.ts` 预留 → 领取执行权 → 结算/释放；`success/partial/failed` 三态决策；Worker 60s 周期对账；`AIUsageRecord` 记录 input/output/cached/reasoning tokens。
7. **前端工程化**：`DESIGN.md`（411 行，移动优先、44×44 热区、`safe-area-inset`、WCAG 2.1 AA）、11 处 `next/dynamic`、15 处 `useShallow`、30 处 `Promise.all/allSettled`、react-window 虚拟列表、移动底栏与抽屉、计划卡片 / 审批卡片 / 审计视图 / 产物工作台。
8. **QA 与决策留痕**：`docs/agents/qa-workflow.md` 7 阶段闭环、Schema 4 测试计划、真实浏览器验收与防证据伪造检测（`qa-check.mjs`）、双轴独立代码审查、`docs/adr/` 48 篇。

### 1.5 能力边界：这是「带 Agent 内核的 AI 应用」，不是「Agent 平台」

源码零命中 / 明确缺失：MCP client/server（未装 `@ai-sdk/mcp`）、多 Agent 委托与协作（只有 1 个 `runAgent`，planner/evaluator 是同一模型的辅助单次调用）、通用工作流引擎与 Checkpointer、代码执行沙箱、上下文压缩、prompt 版本化、Skills 可加载体系、独立向量数据库、独立内容安全服务、OpenTelemetry、CI/CD 配置。

Agent 是**同步 SSE 单 Agent**：`runAgent` 直接返回 `ReadableStream`，运行中状态在请求内存，完成态才写 `AgentRun` 表，无断点续跑；`settings-store.ts:87` 默认关闭，主线产品是普通多模型聊天。`PRODUCT.md:24` 明确「不做节点画布、连线编排或配置繁重的工作流引擎」。

### 1.6 求职材料必须先对齐的口径冲突（本次已亲自复核）

| 项 | 文档说法 | 代码事实 |
|---|---|---|
| 对话供应商 | `CLAUDE.md:6`、`README.md:16`、`docs/project-guide.md` 称「通义千问 / 智谱 GLM / DeepSeek / Agnes」 | `packages/providers/src/factory.ts:3` 为 `xunfei \| doubao \| deepseek` 三家；智谱只在视频/鉴权、Agnes 只在图像/视频、通义 `DASHSCOPE_API_KEY` 源码零引用 |
| Rerank 默认值 | `docs/reports/rag-eval-report.md` 称「默认不开启」 | `packages/shared/src/rag-config.ts:201` 为 `RAG_RERANK_ENABLED = true`（注释与常量自相矛盾） |
| Agent 是否默认启用 | 多数文档以 Agent 为主线叙述 | `settings-store.ts:87` `agentModeEnabled: false` |
| 生成质量评测 | 报告称引用/拒答/注入防御 100% | `tooling/scripts/eval-rag.mts` 中答案为脚本写死；`apps/web/src/eval/agent-baseline.eval.test.ts` 对 `ai` 做 `vi.mock`，是编排行为回归，不是模型能力评测 |
| 后端形态 | `README.md` 称独立 API / NestJS | 无 `apps/api`、无 NestJS，全部 BFF 在 `apps/web/src/app/api/**/route.ts` |
| Worker 完整度 | `README.md:25` 称 STT/PPT/IMG | `apps/worker/src/workers/{stt,ppt,image}.ts` 是 TODO 占位 + 写死示例输出，且全仓无生产者 `.add()` 调用 |

**这些不是小瑕疵**：面试里一句「你接了几家模型」「Agent 默认开吗」就能击穿。表述按代码事实写。

---

## 2. 岗位市场画像（2026-11-09 检索）

### 2.1 数据来源与证据等级

- **本次检索（一手，可直接引用）**：BOSS 直聘、智联招聘、猎聘、职坐标、华夏基金/金蝶/开目等招聘主体公开 JD，共 15 条，来源 URL 见 §2.4 表下清单。
- **补充交叉印证（二手，需标注）**：仓库内 `docs/research/agent-job-market-fit-2026.md`（2026-10-30）记录腾讯/阿里/字节/美团等官方招聘接口 151 条岗位、筛出 52 条「Agent 应用开发类」样本的词频：任务规划 69%、评测 57%、记忆 55%、工具调用 50%、上下文 46%、RAG 44%、多 Agent 40%、高并发 40%、异常恢复 36%、成本 31%、Tracing 29%、主流框架 23%、MCP 21%、语言要求 Python 71% / TS 或 Node 31%。该报告自述存在样本偏差与未核实主体，**只作方向性信号**。
- 岗位趋势文（掘金「AI 岗位选型」、CSDN 前端转 Agent 指南、公众号 JD 拆解）仅用于判断岗位分层，不作为硬要求依据。

### 2.2 Agent 开发工程师：常见职责与技能

**职责**：设计 Agent 架构与核心模块（任务规划、工具调用、记忆、多 Agent 协同）；搭建 RAG 知识库与向量检索；设计 Function Calling / MCP 方案连接业务系统；实现 Planner / Executor / Evaluator 与失败重试降级；Prompt 编写调优；评估体系、Trace/日志可观测；Docker 封装与生产部署。

**技能**：Python（智联 CC383625320 明确「Python / Java / Go 至少一门」；职坐标「精通 Python」；中科院岗要求 FastAPI/Flask）、LangGraph / LangChain / Dify / AutoGen / CrewAI、ReAct 与 Plan-and-Execute、Milvus/Chroma/Pinecone/FAISS、向量检索与召回融合、Prompt 版本管理、评测与可观测、Docker/K8s。部分岗位写「Python 或 TypeScript」「TS/Node.js 或 Python」（美团 `3424768905`、阿里云 `100053460002`、商汤量子城市），这是本项目可切入的缝隙。

**趋势**：反复强调「生产级、非 Demo」；评测从加分项变主要职责；「有突出的开源作品或项目实践者，年限可适当放宽」在腾讯 IEG、美团履约、阿里云、MiniMax 的 JD 中有明确文字。

### 2.3 AI 前端开发工程师：常见职责与技能

**职责**：大模型对话平台 / AI 助手 / Agent / RAG 知识库 / 智能创作产品的前端研发；SSE/WebSocket 流式输出、打字机、增量渲染、多轮会话与消息断点续传；统一封装多家大模型 API、处理异常降级；思维链展示、工具调用过程可视化、Agent 状态可视化、引用溯源卡片；流式渲染与长列表性能专项优化；AI 组件库与前端 SDK、设计系统；工程化与 CI/CD。

**技能**：HTML/CSS/JS/TS、React 或 Vue 生态、复杂状态管理、浏览器渲染原理与性能、ECharts/Recharts/D3、Monorepo、移动端适配；AI 专项要求为「理解多轮对话、Prompt 交互、上下文管理、Token 节流、消息防抖限流」「有 RAG / Agent / Function Calling 项目实战，理解向量检索与工具调用的前端交互逻辑」。高级岗（开目信息、金蝶、LTS）额外要求 SSR/SSG/ISR、边缘渲染、Web-Vitals/Tracing、A/B 平台、React Flow/X6/G6 画布、Section 508/WCAG、端侧推理（TensorFlow.js / ONNX）。

### 2.4 两类岗位的分水岭

| 维度 | Agent 开发工程师 | AI 前端开发工程师 |
|---|---|---|
| 主语言 | Python 为主，Java/Go 次之；TS 或 Node 仅 31% | TypeScript / JavaScript 绝对主力 |
| 主战场 | 服务端编排、模型网关、工具生态、运行时 | 浏览器端交互、流式渲染、状态与性能 |
| 核心交付物 | 可运行的 Agent 系统、RAG 链路、评测与观测 | 对话/知识库/Agent 可视化界面、组件库与 SDK |
| 硬门槛 | 框架经验、MCP、多 Agent、向量库、生产级后端 | SSE 流式实战、复杂状态管理、组件化与性能优化 |
| 项目最稀缺的加分项 | 生产落地证据、可复跑评测、故障恢复 | Agent 过程可视化、引用溯源、检索调试台 |
| 年限 / 薪资信号（本次样本） | 1-5 年，本科/硕士；部分岗位 20-30K | 2-5 年为主，高级岗 5-10 年；1.2-2.5 万，个别 18-25K |

**本次主要来源 URL**（访问日期 2026-11-09）：
- Agent 岗：zhipin.com/job_detail/759fc85bae9784720nBz2Ny_E1tT.html（中软国际·智能体引擎）、zhipin.com/job_detail/96fa3c059520dd530nB42dq9FVtT.html（中科院自动化所）、zhaopin.com/jobdetail/CC383625320J40853609409.htm（Agent 开发工程师）、job.zhizuobiao.com/gwai000360.html（AI Agent 应用开发，2026-10-30 更新）、m.zhaopin.com/jobs/CC556530580J40936394002.htm（智能体开发工程师）
- AI 前端岗：zhipin.com/job_detail/816d782febd27c770nR639S0EVdS.html（北京衔远）、m.zhipin.com/job_detail/b274f0e5f65071240nF43d67GVRR.html（软通动力）、zhaopin.com/jobdetail/CC854626770J41012193302.htm（AI 前端）、zrc-sme.chinasme.cn/job/6993d0f0fc45f410491714f5（之江生物）、m.liepin.com/job/1986484399.shtml（金蝶）、zhipin.com/job_detail/6ed672effcbb543b031809i8E1FS.html（开目信息）
- 全栈 / 交集岗：zhipin.com/job_detail/cfecc49b6003c1ad0nV73N21GFVR.html（高级全栈·AI Agent 方向）、zhipin.com/job_detail/5dfd4ac63ccbf85f0nJ-3Ny8FFZS.html（阿里云·大模型应用工程师）、zhaopin.com/jobdetail/CCL1387109580J40871747105.htm（AI 应用工程师·全栈）、chinaamc.zhiye.com/zpdetail/190767079（华夏基金·大模型应用开发）、juejin.cn/post/7651812581205377030（岗位选型，趋势参考）

---

## 3. 匹配度评估

### 3.1 评分口径

为两类岗位各自定义 **14 个高频 JD 维度**（取自 §2.2/§2.3，非统计抽样），逐项判定为「完整命中 / 部分具备 / 缺失」。**这是维度覆盖计数，不是通过率、竞争力或录用概率**；维度的选取本身带有主观权重，结论应结合 §3.5 的不足一起读。

### 3.2 与「AI 前端开发工程师」：完整 10 / 部分 1 / 缺失 3

| # | JD 维度 | 判定 | 项目依据 |
|---|---|---|---|
| 1 | React/Vue + TS 框架与生态 | 完整 | Next 15.5 / React 19.2 / TS 5.9 strict、19 页面 76 路由；无 Vue（多数 JD 为二选一） |
| 2 | SSE/WebSocket 流式、打字机、增量渲染 | 完整 | `api/chat/_lib/sse.ts`（15s 心跳）、`lib/utils/chat-stream.ts`（状态机 + 双看门狗）、`chat-store.ts` rAF 合帧；超出普通要求 |
| 3 | 多轮会话、复杂状态管理、持久化 | 完整 | `stores/chat-store.ts` + Dexie IndexedDB + `conversation-orchestrator.ts`、15 处 `useShallow`；`reload/stop/loadConversation` |
| 4 | 多模型 API 统一封装、异常降级 | 完整 | `providers/src/factory.ts` 3 家协议兼容（Ark `doubaoFetch`、DeepSeek thinking 注入、讯飞手写 SSE）；`chat-handler.ts:handleError` 统一 401/402/429/503/504 映射 |
| 5 | Markdown / 代码块 / 引用溯源卡片 | 完整 | react-markdown + rehype-highlight + `lib/rag/citation.ts` `[^n]` 契约 |
| 6 | 思维链、工具调用过程、Agent 状态可视化 | 完整 | `reasoning-delta` 事件、计划卡片 `components/chat/plan/`、审批卡片、审计视图、瞬态状态条、元信息行（`CONTEXT.md` 有产品级定义）；**这一项是差异化优势** |
| 7 | RAG 知识库前端、检索结果展示 | 完整 | `app/knowledge/`、`_components/retrieval-debugger.tsx`、文档上传/URL 摄取/版本化 |
| 8 | 长列表与流式渲染性能 | 完整 | react-window、11 处 `next/dynamic`、1s 节流落盘、30 处 `Promise.all` |
| 9 | 组件库 / 设计系统 / Monorepo | 完整 | `DESIGN.md` 411 行 + 16 个 shadcn 原语 + `components.json` + pnpm/Turbo 12 包 |
| 10 | 移动端 / H5 适配 | 完整 | 32 个文件命中 `env(safe-area-inset-*)`、`min-h-11` 44px 热区、移动底栏/抽屉、Playwright Pixel 7 项目 |
| 11 | 数据可视化 / 图谱 / 工作流画布 | 部分 | 有 ECharts 6、echarts-for-react、R3F 星盘，但业务向命理；**无 React Flow/X6/G6 工作流画布**，`PRODUCT.md:24` 明确不做 |
| 12 | SSR/SSG/ISR、边缘渲染、SEO | 缺失 | 9 个主功能页 `dynamic(..., {ssr:false})`，全仓无 `generateMetadata` / `sitemap.ts` / `robots.ts` / OG 标签 |
| 13 | 前端监控 RUM / Web-Vitals / CI/CD | 缺失 | 无 web-vitals、Sentry、PerformanceObserver、`instrumentation.ts`；无 `.github/`/`.gitee/` 等 CI 配置；`trackEvent` 是业务埋点，Langfuse 是服务端 Trace |
| 14 | 端侧推理（TF.js/ONNX/WebGPU）、跨端（小程序/RN/Flutter） | 缺失 | 全仓零命中；移动端是响应式 Web，不是跨端工程 |

**结论**：核心职责（1-10）逐条有代码，且 2、4、6、7 属于「超出岗位常规要求」——因为项目的 AI 逻辑与界面在同一代码库内，做界面的人必须理解 SSE 契约、工具事件、引用锚点。缺口集中在**高级前端架构岗**才要求的 SSR/监控/画布/端侧，不影响中初级与产品型 AI 前端岗的适配。

### 3.3 与「Agent 开发工程师」：完整 6 / 部分 5 / 缺失 3

| # | JD 维度 | 判定 | 项目依据 |
|---|---|---|---|
| 1 | Agent Loop / 任务规划与编排 | 完整 | `agent-runner.ts` 自写有界循环 + `planner.ts` + `agent-plan.ts` 线性计划状态机 + 计划干预 UI |
| 2 | 工具调用 / Function Calling / 参数校验 | 完整 | `registry.ts` zod 单源 JSON Schema、6 内置工具 + Webhook 工具、`tool-pipeline.ts` 治理、`tool-policy.ts` 15s 超时 |
| 3 | RAG / 向量检索 / 知识库 | 完整 | pgvector HNSW + GIN/tsvector + jieba + RRF + Rerank + 引用契约 + FAQ 短路 + 多租户 SQL ACL；**但用 pgvector 而非 JD 常点名的 Milvus/Chroma/Pinecone** |
| 4 | 安全 / 权限 / 审计 / 护栏 / HITL | 完整 | SSRF/DNS 重绑定防护、HMAC 一次性审批凭证、`WebhookToolCall` 全量审计、合规二道检查、失败关闭；**全项目最突出的差异点**（对应 JD 中 29% 的安全维度） |
| 5 | 成本 / Token 控制 | 完整 | `quota-session.ts` 预留/结算/释放三态 + Worker 对账 + 按可负担步数预留 + usage 归一化 |
| 6 | 多模型接入与协议差异适配 | 完整 | `factory.ts` 3 家 + Ark `/responses` 协议兼容 + DeepSeek `/chat/completions` 分流 + 链式 `previous_response_id` 断链自愈 |
| 7 | 记忆 / Memory | 部分 | 仅 `ConversationMemoryChunk` 一种 opt-in 向量检索型会话记忆（30s 防抖索引），无写入策略、遗忘、画像、分层 |
| 8 | 评测 / Eval / Trace 可观测 | 部分 | RAG 检索离线评测（22 题标注集、真实检索）可信；Agent 基线是 mock 编排回归；`langfuse-client.ts` 封装与脱敏完整但**只在开发 compose**，生产无看板，无 LLM-as-judge |
| 9 | Prompt 工程与版本管理 | 部分 | 3 套能力包 systemPrompt + planner/evaluator 提示词，全是硬编码常量；无注册表、版本表、A/B、灰度 |
| 10 | 后端服务与生产部署 | 部分 | Prisma + BullMQ + Redis + S3 + 自研 JWT 全链路完整，`DEPLOYMENT.md` 有真实发布记录；但**单机 Docker Compose、无 CI、无压测/多副本/容量数据**，且非 Python 服务栈 |
| 11 | 异步长任务 / 检查点 / 高并发 HA / 容错 | 部分 | Redis 限流、BullMQ 3 次指数退避、连败熔断、partial 终态落盘；**Agent 本身是同步 SSE，无运行中检查点/断线补拉**，`stt/ppt/image` 三个 worker 是 TODO 占位 |
| 12 | Python/Java/Go + 主流 Agent 框架 | 缺失 | 全仓无 Python 服务、无 `LangGraph`/`LangChain Agent`/`AutoGen`/`Dify`/`ADK`；仅 `@langchain/textsplitters`。ADR-0021 明确拒绝引入编排类 |
| 13 | MCP / 工具生态标准 | 缺失 | `@modelcontextprotocol`、`@ai-sdk/mcp`、`McpClient` 全仓源码零命中，仅 `docs/` 规划 |
| 14 | 多 Agent 协作 / 通用工作流引擎 | 缺失 | 单个 `runAgent`，planner/evaluator 是辅助单次调用；无委托/并行/协作协议、无 LangGraph/Temporal/XState |

**结论**：Agent 的**机制层**（循环、工具、检索、治理、安全、成本）覆盖得很扎实，在个人项目里属于偏完整；但 JD 的**生态层与工程层**（Python + 框架 + MCP + 多 Agent + 可恢复长任务 + 生产规模）大面积缺失，而这些恰恰是简历筛选阶段的关键词。匹配度因此明显低于 AI 前端。

### 3.4 两类对比：差距从哪来

| 对比项 | AI 前端 | Agent 开发 |
|---|---|---|
| 完整命中 | 10 / 14 | 6 / 14 |
| 缺失项性质 | 高级/架构岗才要求的**外围能力**（SSR、RUM、CI、画布、端侧） | **岗位定义级硬门槛**（主语言、框架、MCP、多 Agent） |
| 缺失是否可绕 | 可通过选岗规避（投产品型 AI 前端，不投高级前端架构岗） | 难绕：多数 JD 在任职要求里直接点名 Python/LangGraph/MCP |
| 项目超额部分 | 懂服务端 Agent 链路、能自己定 SSE 契约，相对纯前端候选人稀缺 | 有完整前端交付与 UI 设计系统，相对纯后端候选人稀缺（腾讯 IEG、商汤明确写 TS/React 加分） |
| 主要风险 | 岗位天花板与薪资偏低，AI 工程能力被「只做界面」浪费 | 简历关被语言/框架关键词刷掉；面试深挖「生产级」时无规模数据 |

**一句话**：项目对 AI 前端是「能力溢出」，对 Agent 岗是「机制对齐、生态错位」。

### 3.5 明显不足（按对结论的影响排序，两类岗位共用）

1. **无生产规模证据**：`infra/docker/docker-compose.prod.yml` 仅 nginx + web + worker 三服务单机部署，无用户量、成功率、SLA、压测、多副本数据。JD 反复强调「生产级而非 Demo」，这是最容易被追问击穿的一点。
2. **Agent 链路不可恢复**：同步 SSE、状态在请求内存、完成态才落 `AgentRun`；无 Checkpointer、断线补拉、异步长任务。对应 10-30 报告的「异常恢复 36%」维度。
3. **MCP / 多 Agent / 沙箱 / 框架经验全缺**：仅存在于 `docs/agent-engineering-roadmap.md` 与 `docs/plans/2026-10-30-agent-platform-design.md` 的规划中。
4. **评测可信度分层**：`tooling/scripts/eval-rag.mts` 中「引用/拒答/注入 100%」为脚本写死答案；`agent-baseline.eval.test.ts` mock 模型。可讲的是「22 题真实检索的四组对照 + 编排层确定性回归」，不能讲生成质量。
5. **高级前端岗的三块硬缺口**：SSR/SEO、前端 RUM/监控、CI/CD；另有工作流画布（`PRODUCT.md` 主动放弃）、端侧推理、Vue/跨端。
6. **文档与代码口径不一致**（§1.6）：简历按代码写，否则面试一问即穿。
7. **功能面过宽**：命理、图像、视频、语音、简历等与岗位主线的关联弱，容易让作品集显得「什么都有但没有主线」。

---

## 4. 岗位方向判断与排序

### 4.1 为什么最适合的不是这两者中的任何一个

项目的真实形态是「一个 Next.js 进程里同时装了前端交互层和 Agent 运行时」：`apps/web/src/app/api/chat/_lib/agent/` 与 `apps/web/src/components/chat/` 由同一套 SSE 事件契约（`packages/shared/src/chat-stream-contract.ts`）连接。投 AI 前端，白扔 6 项 Agent 工程能力；投 Agent 开发，白扔 10 项前端能力，还要先过 Python/框架关键词关。

**交集岗位同时需要两端，且对语言更宽容**：本次检索到的「高级全栈工程师（AI Agent 方向）」JD 直接写 Next.js + Node.js + PG + Monorepo + RAG + Function Call；阿里云「大模型应用工程师」写 Python/TypeScript、Agent/RAG/Tool Calling、评估与可观测；智联「AI 应用工程师（全栈）」写 Node.js/Next.js + Agent/RAG。这些描述几乎是项目的镜像。掘金《AI 岗位选型》也把「AI 应用 / Agent 全栈工程师」列为最主流、前端转 AI 的最优解，10-30 的自评报告同样把「Agent 应用开发 / AI 全栈」列为最适合投递层级。

### 4.2 按匹配度从高到低

| 序 | 岗位方向 | 匹配度 | 理由（紧扣项目） | 需要规避/补强 |
|---|---|---|---|---|
| 1 | **AI 应用 / Agent 应用全栈工程师（偏前端的 LLM 应用方向）** | **最高** | 形态 1:1 对应：Next.js 15 全栈 + 自写 Agent Loop + 混合检索 RAG + 配额账本 + SSE 契约 + 真实部署。前端 10 项与 Agent 6 项优势可同时兑现；岗位常写「TS/Node 或 Python 任一」，不触发硬门槛 | 补一份可复跑的真实模型端到端评测与生产 Trace，用来回答「生产级」 |
| 2 | **AI 前端开发工程师（LLM 交互 / Agent 交互方向，尤其中初级与产品型）** | **高** | 10/14 完整命中，流式状态机、工具过程可视化、计划/审批卡片、引用溯源、检索调试台是同类候选人罕见项；`DESIGN.md` + 16 组件 + 移动适配 + Playwright 双项目支撑工程化 | 避开「高级前端架构 / SSR / Web-Vitals / A-B 平台」（开目信息）、「AI 画布可视化 / React Flow」（一苇科技）导向的岗；优先衔远、软通、金蝶、之江生物这类产品型 JD |
| 3 | **Agent 开发工程师（应用层，非平台/Infra）** | **中高** | 机制层 6 项完整，安全与成本治理是差异化；选对 JD 可以把 TS 全栈当优势 | 只投写明「TS/Node 或 Python」「更看重底层机制」「个人作品可放宽年限」的（美团 `3424768905`、阿里云 `100053460002`、腾讯 IEG `2095441701685608448`、商汤量子城市）；避开「精通 Python + FastAPI + LangGraph + MCP」的（职坐标、中科院自动化所）。MCP 与一个 LangGraph 小样例是性价比最高的补强 |
| 4 | **Node.js / Next.js 全栈工程师（AI 产品团队）** | **中**（保底/过渡） | 技术栈 100% 对齐：Prisma + PostgreSQL + Redis/BullMQ + S3 + JWT + Docker + Monorepo + 严格 TS；AI 部分变加分项而非门槛 | 岗位上限受限于不写 Python/Java，但能与 1、2 档同时投 |
| 5 | Agent 平台 / Runtime / Harness、Agent Infra / 沙箱 | 低 | 明确要求 Agent Runtime、状态持久化、中断恢复、MCP、多 Agent、K8s、生产可观测；项目 §1.5 全缺 | 不建议以本项目作为主要证据；先完成异步化与 Checkpointer 再考虑 |
| 6 | 算法 / 微调、端侧 AI（WebGPU/ONNX）、纯传统前端 | 低 | 与项目资产不重叠：无训练/微调、无浏览器推理、且纯前端岗会浪费全部 AI 工程能力 | 不建议 |

### 4.3 投递筛选规则（可直接用）

- **优先投**：JD 同时出现 `Next.js / Node.js / TypeScript` 与 `Agent / RAG / 流式输出 / 工具调用`；或写明「TypeScript 或 Python 任一」「个人/开源作品可放宽年限」。
- **谨慎投**：JD 把 `Vue`、`React Flow 画布`、`SSR/边缘渲染`、`Web-Vitals`、`Kubernetes` 列为硬性要求，或以 `Python + LangGraph + MCP` 开篇。
- **简历主线**：只讲一条 —— 「自写有界多步 Agent 运行时 + 前后端共享 SSE 契约 + 混合检索 RAG + 成本与权限治理 + Next.js 全栈交付」，命理/图像/视频/语音压缩成一句「多模态业务面」。
- **可安全写进简历的 6 条证据**：① `agent-runner.ts` + `tool-pipeline.ts`（去重/三重上限/连败熔断/时间预算，7 个编排行为回归用例）；② `approval-token.ts`（HMAC 一次性审批 + 失败关闭）；③ `hybrid-retrieval.ts` + `chunk-store.ts`（HNSW + GIN + RRF + 可插拔 Rerank + SQL 层多租户 ACL，22 题真实检索四组对照，**结果是在该小语料上混合检索未带来净收益**，这个负结果比「提升召回」更经得起追问）；④ `quota-session.ts`（预留/结算/释放三态 + 周期对账）；⑤ `chat-stream-contract.ts` + `chat-store.ts`（自定义事件契约与流式状态机）；⑥ `webhook/executor.ts` + `url-guard.ts`（SSRF/DNS 重绑定防护与全量审计）。
- **不能写**：MCP、多 Agent、沙箱、断点续跑、上下文压缩、Skills、生成质量 100%、高并发/高可用、「接入 4-5 家模型」、Rerank 默认开或默认关（先对齐生产配置）。

### 4.4 若只做三件事补强（按求职回报）

1. 对齐 §1.6 全部口径冲突（零成本，避免面试被一句追问击穿）。
2. 跑一次真实模型的端到端 Agent 评测（20-30 个任务，记录成功率/工具次数/token/延迟 + 关闭规划质检的消融），补上「评测 57%」维度里最空的一块。
3. 用现有 `ToolExecutionPipeline` 接 1-2 个 MCP 工具并纳入 SSRF、审批、审计边界，补 21% 的 MCP 关键词且能讲出有深度的安全话题。

---

## 5. 结论的边界

1. 岗位侧证据来自 2026-11-09 公开检索的 15 条 JD 与仓库内 10-30 报告的 52 条样本统计（后者为自评、含样本偏差），**不代表全市场，也不代表任一公司的真实用人标准**；词频只表示「JD 提及」，不等于硬性要求。
2. 源码侧未运行测试与评测脚本、未启动应用、未查看生产环境变量与数据库；「生产 Rerank 是否开启」「线上 Agent 成功率」无法判断。
3. 14 维打分是本报告自定义口径，维度选取与权重带主观性；不同权重下 AI 前端与 Agent 岗的差距会变化，但「AI 前端完整命中更多、Agent 岗硬门槛错位」这一结构性结论不依赖具体打分。
4. 「缺失」结论基于全仓检索，极少数以别名实现的能力可能被漏掉；对 MCP、多 Agent、CI、沙箱这类有明确特征词的项，可信度较高。
5. 本报告不评估个人能力、年限、学历与城市因素，也不构成录用概率判断；按题设假设技术栈已全部掌握。
