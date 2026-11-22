# 项目参考手册（Project Guide）

> 本文档是 AI 聚合平台的**参考资料**，由 Agent 按需阅读，不常驻上下文。
> 行为规则（语言/注释/导入/UI/QA 流程红线）见根目录 `CLAUDE.md`（`AGENTS.md` 是其符号链接，单一事实源）。
> 2026-10-09 由 CLAUDE.md 与 AGENTS.md 合并瘦身产出，分化点已按代码现状核对。

---

## 快速开始

### 前置依赖

- **Node.js**：22.x
- **pnpm**：10.x
- **Docker**：本地 PostgreSQL / Redis / MinIO（可选，但推荐）

### 启动步骤

```bash
pnpm i                # 安装依赖
pnpm infra:up         # 启动本地基础设施（Redis / Postgres / MinIO）
# 配置环境变量：apps/web/.env.local
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev              # 启动开发环境
```

---

## 常用命令

```bash
pnpm dev           # 智能启动（自动加载共享环境、清理旧进程、确保 Redis 可用）
pnpm dev:docker    # 使用 Docker 基础设施启动 Web + Worker
pnpm dev:web       # 仅启动 Web（Next.js，首选端口 3030，被占时自动漂移并同步回调配置）
pnpm dev:worker    # 仅启动 BullMQ Worker
pnpm dev:rtasr     # 仅启动实时语音网关（infra/worker-rtasr）

pnpm infra:up      # 启动 Redis / Postgres / MinIO（Docker）
pnpm infra:down    # 停止基础设施
pnpm infra:logs    # 查看基础设施日志

pnpm qimen:check   # 奇门链路本地自检

pnpm build         # 构建所有包
pnpm lint          # 代码检查（turbo lint）
pnpm format        # 代码格式化（turbo format）
pnpm typecheck     # 类型检查（turbo typecheck）

pnpm test          # 运行测试（turbo test）
pnpm test:e2e      # 运行 E2E 测试

pnpm db:generate   # 生成 Prisma Client
pnpm db:migrate    # 执行数据库迁移
pnpm db:seed       # 填充初始数据

pnpm clean         # 清理构建产物 + node_modules
```

### `pnpm dev` 启动流程

`pnpm dev` 实际执行 `tooling/scripts/dev.mjs`，自动完成：

1. 从 `apps/web/.env.local` 加载共享环境变量
2. 检测 Redis 是否可用（本地 redis-server → Homebrew Redis → Docker Redis）
3. 清理旧的 turbo / worker / wrangler 进程，避免多套进程抢任务
4. 启动 `turbo dev` 运行 `@repo/web`、`@repo/worker`、`@repo/worker-rtasr`

---

## Monorepo 目录结构

```
ai-aggregation/
├── apps/
│   ├── web/                  # Next.js 15 主应用（UI + API Routes）
│   └── worker/               # BullMQ Worker 服务（异步任务执行）
├── packages/
│   ├── shared/               # 共享类型、常量、Zod Schemas
│   ├── providers/            # AI 提供方适配层（DashScope/Zhipu/DeepSeek）
│   ├── db/                   # Prisma Schema 和数据库客户端
│   ├── queue/                # BullMQ 队列定义
│   ├── storage/              # 对象存储封装（OSS/MinIO）
│   ├── logger/               # 结构化日志工具
│   ├── config-typescript/    # 共享 TypeScript 配置
│   └── config-eslint/        # 共享 ESLint 配置
├── infra/
│   ├── docker/               # 本地开发 docker-compose（PostgreSQL + Redis + MinIO）
│   └── worker-rtasr/         # 实时语音转写网关（Cloudflare Workers 部署）
├── tooling/
│   └── scripts/              # 初始化、清理脚本
└── docs/                     # 技术文档
```

## Web 应用结构（`apps/web/src/`）

### 页面路由（`app/`）

| 路径                   | 功能                                   |
| ---------------------- | -------------------------------------- |
| `app/page.tsx`         | 首页                                   |
| `app/chat/page.tsx`    | 多模型 AI 对话页                       |
| `app/image/page.tsx`   | 图像生成页（Agnes Image 2.1 Flash）    |
| `app/video/page.tsx`   | 视频生成页（智谱 CogVideoX + Agnes）   |
| `app/voice/`           | 语音转写页（录音 + 上传）              |
| `app/history/page.tsx` | 统一历史记录页                         |

### API 路由（`app/api/`）

| 路径         | 功能                 |
| ------------ | -------------------- |
| `api/chat/`  | 流式 LLM 对话（SSE） |
| `api/image/` | 图像生成代理         |
| `api/video/` | 视频生成任务（轮询） |
| `api/voice/` | 语音转写相关接口     |

### 状态管理（`stores/`，使用 Zustand）

| Store 文件               | 职责                                        |
| ------------------------ | ------------------------------------------- |
| `chat-store.ts`          | 当前对话消息、流式状态、Provider/Model 切换 |
| `conversations-store.ts` | 多对话管理（历史列表、新建/删除/分组）      |
| `history-store.ts`       | 统一历史记录（聊天/图像/语音）              |
| `audio-history-store.ts` | 语音历史记录专用                            |
| `settings-store.ts`      | 全局设置（主题、语言等）                    |
| `ui-store.ts`            | UI 状态（侧边栏折叠等）                     |

注：`stores/index.ts` 是历史遗留的统一出口，只重导出 8 个 store 且已无任何引用，不要走 barrel。

### 组件目录（`components/`）

```
components/
├── chat/        # 消息列表、输入框等
├── image/       # 风格选择器、设置面板、创作灵感舱
├── voice/       # 录音控件、音频播放器
├── history/     # 历史记录卡片（聊天/图像/语音）
├── layout/      # AppLayout、侧边栏
├── theme/       # 主题切换
├── providers/   # React 全局 Provider
└── ui/          # shadcn/ui 基础组件（Badge、Button 等）
```

### 工具库（`lib/`）

```
lib/
├── api/         # API 请求封装（agnes、siliconflow 等）
├── constants/   # 图像生成参数、模板常量
├── services/    # 业务逻辑服务层
├── storage/     # 客户端存储（localStorage）
└── utils/       # 通用工具函数（history-helpers 等）
```

---

## 技术栈

**前端（关键库）**

- Next.js 15 + React 19 + TypeScript 5.6+
- Tailwind CSS + shadcn/ui（基于 Radix UI）
- Zustand（状态管理）
- React Query（服务端数据获取与缓存）
- React Hook Form + Zod（表单验证）
- Vercel AI SDK（`ai` 包，流式对话）
- react-markdown + remark-gfm + rehype-highlight（Markdown 渲染与代码高亮）
- ECharts（图表可视化）
- Dexie.js（IndexedDB 客户端存储）
- Framer Motion（动画）
- react-window（长列表虚拟化）
- Sonner（Toast 通知）

**后端**

- Next.js Route Handlers（BFF/API 层）
- BullMQ 5.x + Redis 7.x（异步任务队列）
- PostgreSQL 16 + Prisma 6（数据库）
- 阿里云 OSS / MinIO（对象存储）
- pptxgenjs（PPT 生成，在 Worker 中使用）

**AI 服务**

- 讯飞星火 Spark（对话）
- 火山引擎豆包 Doubao（对话、向量 Embedding）
- DeepSeek（对话、Agent 智能体核心）
- Agnes（图像生成 Image 2.1 Flash）
- 智谱 CogVideoX（视频生成）
- 硅基流动 SiliconFlow（向量 Embedding、Rerank）

**工程化**

- pnpm 10.x Workspace
- Turborepo 2.x（构建编排）
- ESLint + Prettier（代码规范）
- Node.js 22.x LTS

---

## 环境变量

关键环境变量配置在 `apps/web/.env.local`：

```bash
DATABASE_URL=              # Supabase / PostgreSQL 连接字符串
REDIS_HOST=                # Redis（Upstash）地址
REDIS_PORT=
REDIS_PASSWORD=
DEEPSEEK_API_KEY=          # DeepSeek API Key（对话与 Agent）
ARK_API_KEY=               # 火山方舟豆包 API Key
XUNFEI_API_KEY=            # 讯飞星火 API Key
XUNFEI_API_SECRET=         # 讯飞星火 API Secret
ZHIPU_API_KEY=             # 智谱 API Key（视频生成）
AGNES_API_KEY=             # Agnes API Key（生图服务）
SILICONFLOW_API_KEY=       # 硅基流动（Embedding / Rerank）
MEDIA_PROXY_ALLOWED_DOMAINS=  # 媒体代理白名单（逗号分隔，追加在默认白名单后）
AUTH_RATE_LIMIT_FAILURE_MODE= # 认证接口限流设施故障时的处置模式（默认 closed，open 为应急放行）
ALIYUN_DM_ACCESS_KEY_ID=      # 阿里云邮件推送 AccessKey ID
ALIYUN_DM_ACCESS_KEY_SECRET=  # 阿里云邮件推送 AccessKey Secret
ALIYUN_DM_ACCOUNT_NAME=       # 发信地址（控制台已配置）
ALIYUN_DM_FROM_ALIAS=         # 发件人昵称（可选）
ALIYUN_DM_REGION=             # 区域（默认 cn-hangzhou）
WEBHOOK_SECRET_KEY=           # Webhook 工具鉴权凭证 AES-256-GCM 主密钥（32 字节 hex，64 字符）
APPROVAL_TOKEN_SECRET=        # 智能体写操作审批凭证 HMAC-SHA256 签名密钥（至少 32 字符）
```

### 环境变量分组说明

- **数据库**：`DATABASE_URL`
- **队列/缓存（BullMQ）**：`REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD`
- **LLM/多模态**：`DEEPSEEK_API_KEY` / `ARK_API_KEY` / `XUNFEI_API_KEY` / `ZHIPU_API_KEY` / `AGNES_API_KEY` / `SILICONFLOW_API_KEY`
- **媒体代理安全**
  - `MEDIA_PROXY_ALLOWED_DOMAINS`：`/api/image/proxy`、`/api/video/proxy` 的额外域名白名单（逗号分隔，格式 `example.com` 或 `example.com:8443`）。默认白名单为 `storage.googleapis.com`（Agnes 生成结果）与 `sfile.chatglm.cn`（智谱 CogVideoX 视频结果）；代理仅允许 https，只有白名单内的本机地址（如 `localhost:9000`）才允许 http，用于本地 MinIO 开发
- **认证加固**
  - `AUTH_RATE_LIMIT_FAILURE_MODE`：登录/注册/忘记密码/重置密码/邮箱验证码路由的限流设施故障处置模式。默认（或设为 `closed`）为 fail-closed——Redis 异常或超时时返回 503 拒绝认证请求；仅当 Redis 长时间故障、需要临时恢复登录能力时设为 `open` 应急放行，恢复后改回。阈值（`AUTH_RATE_LIMITS`）与锁定策略见 `apps/web/src/lib/auth/rate-limit.ts`、`apps/web/src/lib/auth/login-lockout.ts`；锁定期内的登录尝试只拒绝、不累计不延长（防锁定 DoS）
- **邮件通道（阿里云邮件推送 DirectMail）**
  - `ALIYUN_DM_ACCESS_KEY_ID` / `ALIYUN_DM_ACCESS_KEY_SECRET` / `ALIYUN_DM_ACCOUNT_NAME`：DirectMail 发信凭证与发信地址（需在邮件推送控制台创建并完成域名解析），注册验证码、绑定邮箱验证码、忘记密码重置邮件三处共用；`ALIYUN_DM_FROM_ALIAS` 选填（发件人昵称），`ALIYUN_DM_REGION` 默认 `cn-hangzhou`
  - 未配置凭证时发信接口统一返回 503（内测环境可无邮件通道跑通其余流程）；验证码存 Redis `verify:<purpose>:<email>`（用途仅 `register`/`bind`，忘记密码走重置链接不发验证码），只存 SHA-256 摘要、10 分钟有效、验证通过即删；发送限流为 5 次/分钟/IP + 单邮箱日上限 10 次，阈值统一登记在 `apps/web/src/lib/auth/rate-limit.ts` 的 `AUTH_RATE_LIMITS`。实现见 `apps/web/src/lib/mail/`、`apps/web/src/lib/auth/email-verification.ts`
- **Webhook 工具加密**
  - `WEBHOOK_SECRET_KEY`：用户自定义 Webhook 工具鉴权凭证（`authHeaderValue`）的 AES-256-GCM 对称加密主密钥。必须为 32 字节的十六进制字符串（共 64 个字符）。未配置或格式非法时路由抛错（fail-closed）；密钥生成方式：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。实现见 `apps/web/src/lib/crypto/webhook-secret.ts`
- **智能体写操作审批**（ADR-0041）
  - `APPROVAL_TOKEN_SECRET`：审批凭证的 HMAC-SHA256 签名密钥，至少 32 个字符，生成方式：`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`。未配置或长度不足时，需审批的写操作一律失败关闭（不执行）；存量 POST 工具迁移后默认需要审批，生产漏配会让它们全部不可用。凭证一次性标记依赖 Redis，Redis 不可用时同样失败关闭。本期单密钥，不支持轮换。实现见 `apps/web/src/lib/agent/approval-token.ts`

---

## 服务与职责说明

### Web（`apps/web`）

- UI：对话/图像/视频/语音等前端页面
- API：Next.js Route Handlers 作为 BFF
- 关键特性：流式对话（SSE）、任务轮询（视频生成）、上传与对象存储（语音/图片等）

### Worker（`apps/worker`）

- 处理耗时异步任务：视频生成（CogVideoX）、PPT 生成、语音转写（STT）、图像生成
- 与 Web 通过 BullMQ + Redis 解耦

### Worker-RTASR（`infra/worker-rtasr`）

- 实时语音转写网关，基于 Cloudflare Workers 部署
- 用于实时语音识别场景的低延迟推送

---

## 基础设施（本地开发）

```bash
# 启动 PostgreSQL + Redis + MinIO
pnpm infra:up   # 等价于 docker compose -f infra/docker/docker-compose.yml up -d redis postgres minio
```

推荐云端替代方案：

- 数据库：[Supabase](https://supabase.com/) 或 [Neon](https://neon.tech/)
- Redis：[Upstash](https://upstash.com/)

生产服务器连接信息（IP、密码、管理员账号等）记录在 `infra/docker/server-info.md`（本地文件，不提交到仓库）。部署相关操作参见 `DEPLOYMENT.md` 第 14 章。

---

## 常见问题与排查

### 1) `pnpm dev` 启动后页面请求报 500

- 检查 `apps/web/.env.local` 是否配置完整
- 检查数据库与 Redis 是否可用（本地 docker 或云端）

### 2) 队列任务不消费/一直卡住

- 确认 Redis 连接信息正确
- 确认 Worker 是否已启动（如果你的任务由 Worker 处理）

### 3) 数据库迁移失败

- 确认 `DATABASE_URL` 指向可写数据库
- 若本地使用 docker，确认容器已启动且端口未被占用

---

## 约定与命名

- `apps/web/src/app/api/**`：对外 API 入口（BFF）
- `packages/providers/**`：第三方 AI 服务商的适配层
- `packages/shared/**`：跨 app 共享类型/Schema/常量

---

## 移动端设计细则（完整版）

`AGENTS.md` 只保留移动端红线摘要，以下为完整细则（新增/修改移动端相关 UI 前必读）：

- **默认按移动端优先设计**：新增页面和组件时，先完成手机端布局，再逐步增强到平板和桌面端
- **优先保证核心链路单手可操作**：对话发送、模型切换、图片生成、语音录制、历史查看等高频操作必须放在拇指易触达区域
- **底部区域优先级高于侧边栏**：移动端优先使用底部导航、底部抽屉、底部操作栏，不要直接复用桌面端侧边栏交互
- **控制首屏信息密度**：移动端首屏只保留当前任务最关键的输入、结果和操作，弱化说明性内容，避免堆叠过多卡片
- **表单和配置面板分层展示**：图像/视频参数、语音设置、模型配置等复杂选项优先放入抽屉、弹层或分步区域，避免页面一次性展开过多控件
- **长内容场景必须考虑稳定滚动体验**：聊天消息流、历史记录、生成结果列表要避免嵌套滚动，输入框、操作栏和关键状态要在移动端保持稳定
- **安全区适配必须完整**：底部输入框、录音按钮、悬浮操作按钮、弹层操作区要兼容 iPhone 安全区，避免被系统手势区域遮挡
- **点击热区必须足够大**：按钮、分段控制器、列表操作项的可点击区域建议不小于 `44x44`，避免仅图标可点
- **文案必须短且可换行**：移动端按钮、标签、状态提示优先使用短中文；遇到长文案时必须允许换行或截断，不能挤压布局
- **反馈必须即时可见**：提交、上传、生成中、转写中、失败重试等状态在移动端必须有明确反馈，避免用户误以为点击无效
- **媒体内容优先自适应容器**：图片、视频、音频播放器在移动端要保持稳定比例和边界，不允许超出屏幕或导致横向滚动
- **历史和详情要分层进入**：移动端历史记录列表优先展示摘要，详情内容通过新页面、抽屉或全屏层进入，不要在列表页堆满完整内容
- **减少悬停依赖**：移动端不能依赖 hover 提示暴露关键信息，必要说明要通过常驻文案、点击展开或显式图标说明提供
- **空状态和异常状态要可操作**：无记录、生成失败、网络错误、权限拒绝等场景必须直接提供下一步操作，不要只展示说明文字
- **响应式实现要贴近项目栈**：优先使用 Tailwind 断点、`min-h`/`max-h`、`overflow`、`sticky`、`safe-area` 等方式解决布局问题，避免为移动端单独复制一套页面
- **改动前先检查真实移动端影响范围**：涉及 `AppLayout`、底部输入区、消息列表、历史列表、媒体预览、弹层抽屉的修改时，必须同时评估窄屏表现
- **移动端 UI 文本与提示保持中文一致**：包括按钮文案、占位符、空状态、报错提示、权限说明、上传状态等，不能出现中英文混杂的用户可见文本

---

## CodeGraph 代码图谱

本项目使用 [CodeGraph](https://github.com/colbymchenry/codegraph) 构建代码知识图谱：

- **文件监听自动同步**：CodeGraph MCP 服务器使用原生 OS 文件事件（FSEvents）监听文件变更，2 秒防抖后自动增量更新索引；启动时自动 catch-up 离线期间的变更
- **防抖窗口提示**：编辑后 2 秒内查询时，待同步文件会在 CodeGraph 响应中显示 ⚠️ 横幅，此时应直接 Read 取实时内容
- **不提交到 Git**：`.codegraph/` 已通过 `.gitignore` 排除

---

## 文件创建注意事项

在某些宿主中，`fsWrite` 类工具创建大文件（>500 行）或中文文件名时可能出现 `aborted` 错误（工具传输限制，非权限问题）。应对方式：

- 大文件优先使用 `cat` heredoc 分批写入：`cat > file.md << 'EOF' ... EOF` / `cat >> file.md << 'EOF' ... EOF`
- 文件名使用英文，避免中文字符
- 写入后用 `wc -l` 或 `head` 验证内容完整性
