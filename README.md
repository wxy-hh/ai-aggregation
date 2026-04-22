# AI 聚合网站 Monorepo

基于 pnpm workspace + Turborepo 的 AI 聚合平台，包含 Web 前端、API 服务和异步 Worker。

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/wxy-hh/ai-aggregation)

## 技术栈

- **运行时**: Node.js 22.x LTS
- **包管理**: pnpm 10.x
- **构建编排**: Turborepo 2.x
- **前端**: Next.js 15.x + React 19.x + TypeScript 5.6+
- **后端**: Next.js Route Handlers / NestJS
- **任务队列**: BullMQ 5.x + Redis 7.x
- **数据库**: PostgreSQL 16.x + Prisma 6.x
- **AI 提供方**: 通义千问 / 智谱 GLM / DeepSeek

## 项目结构

```
.
├── apps/
│   ├── web/          # Next.js 应用（UI、对话、任务中心）
│   ├── api/          # 可选独立 API 服务
│   └── worker/       # 异步任务执行器（STT/PPT/IMG）
├── packages/
│   ├── shared/       # 共享 types、错误码、schema
│   ├── providers/    # 模型提供方适配层
│   ├── db/           # Prisma schema、migrations
│   ├── queue/        # 队列定义
│   ├── storage/      # 对象存储封装
│   ├── logger/       # 日志封装
│   └── config-*/     # 共享工程配置
├── infra/
│   └── docker/       # 本地 docker-compose
└── tooling/
    └── scripts/      # 常用脚本
```

## 快速开始

### 前置依赖

- Node.js 22.x LTS
- pnpm 10.x (`corepack enable`)
- Docker Desktop（可选，推荐）

### 方式 1: 使用 Docker（团队推荐）

```bash
# 一键初始化
bash tooling/scripts/init.sh

# 启动基础设施
pnpm infra:up

# 启动 Web + Worker 开发服务
pnpm dev:docker
```

### 方式 2: 不使用 Docker

```bash
# 安装依赖
bash tooling/scripts/init-no-docker.sh

# 配置数据库和 Redis（见下方说明）
# 编辑 apps/web/.env.local 和 apps/worker/.env

# 初始化数据库
pnpm db:generate
pnpm db:migrate

# 启动开发服务（会自动检查 Redis，并为 Web / Worker 注入共享环境）
pnpm dev
```

**无 Docker 环境配置**: 详见 [docs/setup-without-docker.md](docs/setup-without-docker.md)

推荐使用免费云服务：

- 数据库: [Supabase](https://supabase.com/) 或 [Neon](https://neon.tech/)
- Redis: [Upstash](https://upstash.com/)

## 🎯 下一步操作

### 你现在在这里 👇

✅ 项目初始化完成  
✅ 依赖安装完成  
⏳ **需要配置 Supabase + Upstash**

### 立即执行（10 分钟）

```bash
# 运行配置助手
bash tooling/scripts/setup-env.sh
```

详细步骤: **[NEXT_STEPS.md](NEXT_STEPS.md)** 或 **[SETUP_SUPABASE_UPSTASH.md](SETUP_SUPABASE_UPSTASH.md)**

### 配置完成后

```bash
# 初始化数据库
pnpm db:generate
pnpm db:migrate
pnpm db:seed

# 启动开发
pnpm dev
```

## 环境变量

关键配置项：

- `DATABASE_URL`: Supabase 连接字符串
- `REDIS_HOST/PORT/PASSWORD`: Upstash 连接信息
- `DASHSCOPE_API_KEY`: 通义千问 API Key（可选）
- `ZHIPU_API_KEY`: 智谱 API Key（可选）
- `DEEPSEEK_API_KEY`: DeepSeek API Key（可选）

## 常用命令

```bash
pnpm dev          # 智能启动开发服务（清理旧进程 + 共享环境注入）
pnpm dev:docker   # 使用 Docker 基础设施启动 Web + Worker
pnpm dev:web      # 仅启动 Web
pnpm dev:worker   # 仅启动 BullMQ Worker
pnpm dev:rtasr    # 仅启动实时语音网关
pnpm qimen:check  # 奇门链路本地自检
pnpm infra:up     # 启动 Redis / Postgres / MinIO
pnpm infra:down   # 停止基础设施
pnpm infra:logs   # 查看基础设施日志
pnpm build        # 构建所有应用
pnpm lint         # 代码检查
pnpm typecheck    # 类型检查
pnpm test         # 运行测试
pnpm test:e2e     # 运行 E2E 测试
```

## 文档

详细技术文档请参考 `docs/monorepo-techstack.md`

## 部署建议

- 本地个人开发：优先 `pnpm dev`，兼容本地 Redis、Homebrew Redis 和 Docker Redis
  - `pnpm dev` 会优先加载 `apps/web/.env.local` 作为共享环境
  - `pnpm dev` 会在启动前清理旧的 `turbo dev` / `worker` 进程，避免多套进程抢任务
  - 不建议并行手工执行多套 `pnpm dev:web` / `pnpm dev:worker`
- 团队协作：优先 `pnpm dev:docker`，保证 Redis / Postgres / MinIO 环境一致
- 生产环境：优先容器化部署或托管服务
  - Web 与 Worker 建议拆开部署
  - Redis 建议使用托管 Redis（如 Upstash / Redis Cloud）
  - PostgreSQL 建议使用托管数据库（如 Supabase / Neon）
  - 不建议生产环境依赖某台机器上的本地 brew 服务
