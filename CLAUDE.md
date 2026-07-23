# CLAUDE.md — AI 聚合平台 (AI-Aggregation)

## 项目简介

这是一个基于 **pnpm Workspace + Turborepo** 的 Monorepo AI 聚合平台，整合了多个国内 AI 服务商（通义千问、智谱 GLM、DeepSeek），提供对话、图像生成、视频生成、语音转写等功能。

---

## 适用人群

- **产品/运营**：快速体验多模型能力，对比生成效果与成本
- **开发者**：基于统一 Provider 适配层接入/替换 AI 服务商
- **团队协作**：以 Monorepo 方式集中管理 Web + Worker + 共享包

---

## 快速开始

### 1) 前置依赖

- **Node.js**：22.x
- **pnpm**：10.x
- **Docker**：用于本地 PostgreSQL / Redis / MinIO（可选，但推荐）

### 2) 安装依赖使用 pnpm

```bash
pnpm i
```

### 3) 启动本地基础设施（推荐）

```bash
docker-compose -f infra/docker/docker-compose.yml up -d
```

### 4) 配置环境变量

- Web 端：`apps/web/.env.local`
- Worker：如果单独部署，按需在对应 app 内配置（通常与 web 共享一套）

### 5) 初始化数据库

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

### 6) 启动开发环境

```bash
pnpm dev
```

---

## 常用命令

```bash
pnpm dev           # 智能启动（自动加载共享环境、清理旧进程、确保 Redis 可用）
pnpm dev:docker    # 使用 Docker 基础设施启动 Web + Worker
pnpm dev:web       # 仅启动 Web（Next.js，端口 3030）
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

`pnpm dev` 实际上执行的是 `tooling/scripts/dev.mjs`，会自动完成以下步骤：

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

---

## Web 应用结构（`apps/web/src/`）

### 页面路由（`app/`）

| 路径                   | 功能                      |
| ---------------------- | ------------------------- |
| `app/page.tsx`         | 首页                      |
| `app/chat/page.tsx`    | 多模型 AI 对话页          |
| `app/image/page.tsx`   | 图像生成页（Kolors 模型） |
| `app/video/page.tsx`   | 视频生成页（CogVideoX）   |
| `app/voice/`           | 语音转写页（录音 + 上传） |
| `app/history/page.tsx` | 统一历史记录页            |

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
| `index.ts`               | 统一导出入口                                |

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
├── api/         # API 请求封装（kolors、siliconflow 等）
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

- 通义千问 DashScope（对话、图像）
- 智谱 GLM（对话、视频生成 CogVideoX）
- DeepSeek（对话）
- 讯飞 / 阿里云 NLS（语音转写）
- 硅基流动 Kolors（图像生成）

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
DASHSCOPE_API_KEY=         # 通义千问 API Key
ZHIPU_API_KEY=             # 智谱 API Key
DEEPSEEK_API_KEY=          # DeepSeek API Key
SILICONFLOW_API_KEY=       # 硅基流动（Kolors 图像生成）
```

### 环境变量分组说明

- **数据库**
  - `DATABASE_URL`
- **队列/缓存（BullMQ）**
  - `REDIS_HOST`
  - `REDIS_PORT`
  - `REDIS_PASSWORD`
- **LLM/多模态**
  - `DASHSCOPE_API_KEY`
  - `ZHIPU_API_KEY`
  - `DEEPSEEK_API_KEY`
  - `SILICONFLOW_API_KEY`

---

## 开发规范

### 语言使用规范

- **全局提问和回答必须使用中文**
- 所有用户界面文本、提示信息、错误消息等必须使用中文
- 代码注释和文档必须使用中文
- 仅在必要的技术术语或 API 调用时使用英文

### 代码注释

- **所有注释必须使用中文**
- 修改文件时，需同步翻译文件中已有的英文注释

### 组件结构

- 页面组件放在 `app/<功能>/page.tsx`
- 复杂页面的子组件放在 `app/<功能>/_components/`
- 复用组件放在 `components/<功能分类>/`

### 状态管理

- 使用 **Zustand** 管理全局状态
- 使用 `useShallow` 避免不必要的重渲染
- Store 从 `@/stores` 统一导入

### 导入规范

- 使用直接路径导入，避免 barrel 文件（如用 `@/components/ui/button` 而非 `@/components/ui`）
- 路径别名：`@/` 指向 `apps/web/src/`

### 包引用

- 跨 app 引用共享代码必须通过 `packages/` 下的包导入（如 `@repo/shared`、`@repo/db`）
- 禁止 apps 之间直接引用

### 性能

- 独立异步操作使用 `Promise.all()` 并发执行
- 重量级组件使用 `next/dynamic` 动态导入
- 使用 `React.cache()` 做请求级别的去重缓存

### 移动端优先设计

- **默认按移动端优先设计**：新增页面和组件时，先完成手机端布局，再逐步增强到平板和桌面端
- **优先保证核心链路单手可操作**：对话发送、模型切换、图片生成、语音录制、历史查看等高频操作放在拇指易触达区域
- **底部区域优先级高于侧边栏**：移动端使用底部导航、底部抽屉、底部操作栏，不直接复用桌面端侧边栏交互
- **控制首屏信息密度**：移动端首屏只保留当前任务最关键的输入、结果和操作，弱化说明性内容
- **表单和配置面板分层展示**：图像/视频参数、语音设置、模型配置等复杂选项放入抽屉、弹层或分步区域
- **安全区适配必须完整**：底部输入框、录音按钮、悬浮操作按钮、弹层操作区要兼容 iPhone 安全区
- **点击热区必须足够大**：按钮、分段控制器、列表操作项的可点击区域不小于 `44x44`
- **减少悬停依赖**：移动端不能依赖 hover 提示暴露关键信息
- **空状态和异常状态要可操作**：无记录、生成失败、网络错误、权限拒绝等场景须直接提供下一步操作
- **响应式实现方式**：使用 Tailwind 断点、`min-h`/`max-h`、`overflow`、`sticky`、`safe-area` 等解决布局问题，避免为移动端单独复制页面
- **改动前检查移动端影响**：涉及 AppLayout、底部输入区、消息列表、历史列表、媒体预览、弹层抽屉的修改时，须同时评估窄屏表现

---

## 基础设施（本地开发）

```bash
# 启动 PostgreSQL + Redis + MinIO
docker-compose -f infra/docker/docker-compose.yml up -d
```

推荐云端替代方案：

- 数据库：[Supabase](https://supabase.com/) 或 [Neon](https://neon.tech/)
- Redis：[Upstash](https://upstash.com/)

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

## 文件创建注意事项

在创建大文件（>500 行）或包含中文的特殊文件时，优先使用 `cat` heredoc 方式而非直接写入：

```bash
# 创建文件
cat > path/to/file.md << 'EOF'
文件内容...
EOF

# 追加内容
cat >> path/to/file.md << 'EOF'
更多内容...
EOF
```

- 文件名使用英文，避免中文字符
- 超过 500 行的文件分批写入
- 写入后使用 `wc -l` 或 `head` 验证内容完整性
