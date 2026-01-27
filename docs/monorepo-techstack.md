### AI 聚合网站 Monorepo 技术栈参考（国内、低成本 MVP）

> 适用场景：同一产品下同时包含「Web 前端（对话/任务中心）」「API/BFF（模型聚合、鉴权、计费、限流）」「异步 Worker（语音转写/PPT 生成/图像生成）」以及多个可复用基础包。

---

## 1) Monorepo 适用性分析

### 结论
- **推荐采用 monorepo**。你的项目天然是“多应用 + 多能力模块 + 共享基础设施”的形态，monorepo 可以显著降低重复建设与跨仓协作成本。

### 为什么适合
- **多形态应用天然共存**：
  - `web`：对话 UI、文件上传、任务进度、下载中心
  - `api`/`bff`：统一鉴权/限流/计费/路由、多模型适配
  - `worker`：语音转写、PPT 生成、图像生成等长耗时任务
- **强共享需求**：
  - 统一的 `types`（消息结构、任务状态、错误码）
  - 统一的 `provider` 适配层（通义/智谱/DeepSeek…）
  - 统一的 `db`（Prisma schema、迁移、client）
  - 统一的 `config`（ESLint/TSConfig/Prettier）
- **需要一套统一工程治理**：
  - 同一套质量门禁（lint/typecheck/test）
  - 同一套 CI 缓存与增量构建（节省时间与成本）

### 可能的代价（以及规避方式）
- **代价：仓库结构更复杂**
  - 规避：严格的目录规范 + 强制边界（只允许通过包依赖共享代码）
- **代价：依赖管理与版本漂移**
  - 规避：使用 `pnpm` + workspace，锁定 Node 版本与关键依赖版本；共享配置抽到 `packages/config-*`
- **代价：构建/测试链路更长**
  - 规避：用 `Turborepo` 做增量任务与缓存，CI 只跑受影响的包

### 何时不建议 monorepo（反例）
- 只有单一 `web` 且短期不做 worker/服务拆分
- 团队非常分散、权限隔离强（不同业务线强隔离）且缺少工程治理投入

---

## 2) 推荐的技术栈组合及版本（可执行、面向国内）

> 说明：版本选择以“LTS 稳定 + 社区成熟 + 与国内生态兼容”为原则；建议在仓库根 `package.json` 中通过 `engines` 与锁文件强制一致。

### 运行时与包管理
- **Node.js**：`22.x LTS`
- **包管理器**：`pnpm 10.x`（启用 workspace）
- **构建编排**：`Turborepo 2.x`

### 前端（Web）
- **框架**：`Next.js 15.x` + `React 19.x` + `TypeScript 5.6+`
- **UI**：`Tailwind CSS 3.x` + `shadcn/ui`
- **数据请求/缓存**：`@tanstack/react-query 5.x`
- **表单与校验**：`react-hook-form 7.x` + `zod 3.x`
- **对话流式输出**：`SSE（text/event-stream）`
- **E2E 测试**：`Playwright 1.x`

### 后端（BFF/API + Worker）
- **服务框架（MVP 优先）**：
  - 方案 A（最省心）：`Next.js Route Handlers` 承担 BFF/API
  - 方案 B（更工程化）：`NestJS 10.x/11.x` 独立 `apps/api`
- **任务队列**：`BullMQ 5.x` + `Redis 7.x`
- **数据库**：`PostgreSQL 16.x`
- **ORM/迁移**：`Prisma 6.x`
- **对象存储（国内）**：`阿里云 OSS` 或 `腾讯云 COS`（也可用 MinIO 作为本地/私有替代）
- **鉴权**：
  - Web 端：`NextAuth.js 5.x`（也可替换为自建 JWT + 短会话）
- **可观测**：`Sentry`（前后端）

### AI 能力提供方（国内优先）
- **大模型对话**：`通义千问（DashScope）` / `智谱 GLM` / `DeepSeek`（建议选“主 + 备”两家）
- **语音转文字**：`讯飞开放平台` 或 `阿里云智能语音（NLS）`
- **图像生成**：`通义万相` 等国内服务
- **PPT 生成**：`PptxGenJS`（模板驱动生成 `.pptx`，低成本、可控）

---

## 3) 项目目录结构规范（推荐）

### 顶层结构
- `apps/`
  - `web/`：Next.js 应用（UI、落地页、对话、任务中心）
  - `api/`：可选（NestJS/Fastify 等独立 API 服务；MVP 可先不建）
  - `worker/`：异步任务执行器（队列消费：STT/PPT/IMG）
- `packages/`
  - `shared/`：共享 types、错误码、schema（禁止放 Next/Node 专用实现）
  - `providers/`：模型提供方适配层（通义/智谱/DeepSeek…统一接口）
  - `db/`：Prisma schema、migrations、client 生成与封装
  - `queue/`：队列定义（job 名称、payload 类型、重试策略）
  - `storage/`：对象存储封装（OSS/COS/MinIO）
  - `logger/`：日志封装（JSON 日志、trace id）
  - `config-eslint/`、`config-ts/`、`config-prettier/`：共享工程配置
- `infra/`
  - `docker/`：本地 `docker-compose`（postgres/redis/minio）
- `tooling/`
  - `scripts/`：常用脚本（初始化、迁移、清理、生成模板）
- `docs/`
  - 参考文档、架构说明、开发约定（本文件所在目录）

### 目录规范与边界约束
- **只允许通过 `packages/*` 共享代码**，禁止 `apps/*` 之间互相相对路径引用。
- **共享包分层**：
  - `packages/shared` 只能依赖“纯 TS 库”，不应依赖 Next/Node 运行时。
  - `packages/providers`/`storage`/`queue` 可以依赖 Node 运行时，但不应依赖 `apps/*`。
- **导入规范**：避免 barrel file（减少 bundle 体积与循环依赖风险），尽量使用路径直达导入。

---

## 4) 多包管理方案（pnpm workspace 推荐实践）

### Workspace 方案
- 使用 `pnpm-workspace.yaml`：
  - `apps/*`
  - `packages/*`

### 依赖策略
- **根依赖最小化**：仅放 `turbo`、`typescript`、`eslint` 等工具型依赖。
- **业务依赖就近放置**：
  - `apps/web` 放 Next/React 相关依赖
  - `apps/worker` 放 BullMQ、PptxGenJS、SDK 依赖
- **共享配置包**：ESLint/TSConfig/Prettier 通过 `packages/config-*` 统一，避免每个包复制一份。

### 版本与发布策略（按产品阶段选）
- **MVP 阶段（推荐）**：全部 `private`，不发布到 npm；内部包用 workspace 引用（`workspace:*`）。
- **需要对外发布组件/SDK 时**：引入 `changesets` 管理版本与变更日志。

---

## 5) 构建与测试工作流配置（Turborepo + CI）

### Turborepo 任务编排（建议的任务集合）
- `lint`：ESLint（增量执行）
- `format`：Prettier（可在本地跑，CI 以 check 为主）
- `typecheck`：TS 类型检查
- `test`：单测（建议 `vitest`）
- `test:e2e`：E2E（Playwright，仅对 `apps/web`）
- `build`：构建（web、api、worker）
- `dev`：本地开发（并发启动 web/api/worker + 依赖服务）

### 建议的质量门禁（从 MVP 就开始）
- PR 必跑：`lint` + `typecheck` + `test`（尽量保证 5 分钟内完成）
- 主干合并后：可选跑 `build` + `test:e2e`（或 nightly）

### GitHub Actions（最小可用配置要点）
- 使用 `actions/setup-node` + 启用 `pnpm` 缓存
- 启用 Turbo 远程缓存（可选；MVP 可先用本地缓存 + CI 缓存）
- CI 步骤建议：
  1) `pnpm i --frozen-lockfile`
  2) `pnpm turbo lint typecheck test`
  3) 需要时 `pnpm turbo build`

### 本地 Git Hooks（推荐）
- `lefthook` 或 `husky`：提交前跑 `lint-staged`（只检查变更文件）
- 避免在 pre-commit 全量跑测试（影响效率）

---

## 6) 开发环境初始化指南（从 0 到可跑）

> 下述步骤是“可执行”的初始化流程；你可以在建立代码骨架后把它逐步落成脚本化命令。

### 前置依赖
- **Node.js**：安装 `22.x LTS`（推荐用 `Volta` 或 `fnm` 管理多版本）
- **pnpm**：推荐开启 `corepack` 管理：
  - `corepack enable`
- **Docker Desktop**：用于本地启动 `Postgres/Redis/MinIO`

### 1. 安装依赖
- 在仓库根目录执行：
  - `pnpm install`

### 2. 启动基础设施（本地）
- 使用 `docker compose` 启动依赖：
  - `postgres`（开发库）
  - `redis`（队列与缓存）
  - `minio`（对象存储本地替代；上线后切 OSS/COS）

### 3. 环境变量与密钥（建议约定）
- 每个应用一份：
  - `apps/web/.env.local`
  - `apps/api/.env`
  - `apps/worker/.env`
- 关键配置建议包含：
  - **DB**：`DATABASE_URL`
  - **Redis**：`REDIS_URL`
  - **对象存储**：`S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_BUCKET`
  - **AI Providers**：例如 `DASHSCOPE_API_KEY`、`ZHIPU_API_KEY`、`DEEPSEEK_API_KEY`
  - **鉴权**：`AUTH_SECRET`（或 JWT secret）

### 4. 初始化数据库
- 在 `packages/db` 中维护 Prisma：
  - `pnpm db:generate`（生成 client）
  - `pnpm db:migrate`（执行迁移）
  - `pnpm db:seed`（可选：写入初始模板/默认配置）

### 5. 启动开发服务
- 推荐并发启动：
  - `pnpm dev`（由 Turbo/脚本统一拉起 `web` + `worker` + 可选 `api`）
- 最小跑通验证：
  - `web`：打开首页/对话页
  - `worker`：能消费队列任务（打印日志）
  - `PPT`：发起“生成 PPT”任务后能产出 `.pptx` 并生成下载链接

### 6. 常见问题（MVP 阶段高频坑）
- **对话流式输出**：优先用 SSE；确保代理/Nginx 不缓存与不缓冲（关闭 buffer）。
- **长任务超时**：所有“生成 PPT/转写/生成图像”必须走队列；HTTP 只负责创建任务与查状态。
- **成本控制**：务必做限流/配额与用量记录（token/次数/任务量），防止接口被刷爆账单。

---

### 附：建议的“最小可行模块”拆分（便于你按 monorepo 落地）
- `apps/web`：对话 + 任务中心 + 文件上传 + 下载中心
- `apps/worker`：
  - `stt`：语音转写 job
  - `ppt`：PptxGenJS 渲染 job
  - `img`：图像生成 job
- `packages/providers`：统一大模型对话接口（主/备 provider）
- `packages/db`：用户/会话/消息/任务/用量表
- `packages/queue`：job 协议与重试策略
- `packages/storage`：OSS/COS/MinIO 抽象

如果你希望我下一步把这份文档进一步“落成代码骨架”（生成 `pnpm-workspace.yaml`、`turbo.json`、`apps/web`、`apps/worker` 的最小可运行模板），你只要说一句“按这个方案初始化仓库”。
