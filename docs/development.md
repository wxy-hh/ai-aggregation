# 开发指南

## 快速开始

### 1. 环境准备

确保已安装：
- Node.js 22.x LTS
- pnpm 10.x
- Docker Desktop

### 2. 初始化项目

```bash
# 使用初始化脚本（推荐）
bash tooling/scripts/init.sh

# 或手动执行
pnpm install
cd infra/docker && docker compose up -d && cd ../..
pnpm db:generate
pnpm db:migrate
```

### 3. 配置环境变量

复制示例文件并填入实际配置：

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/worker/.env.example apps/worker/.env
```

关键配置项：
- `DATABASE_URL`: PostgreSQL 连接字符串
- `REDIS_HOST` / `REDIS_PORT`: Redis 配置
- `DASHSCOPE_API_KEY`: 通义千问 API Key
- `ZHIPU_API_KEY`: 智谱 API Key
- `DEEPSEEK_API_KEY`: DeepSeek API Key

### 4. 启动开发服务

```bash
pnpm dev
```

这会并发启动：
- Web 应用 (http://localhost:3000)
- Worker 服务

## 项目结构

```
.
├── apps/
│   ├── web/          # Next.js Web 应用
│   └── worker/       # BullMQ Worker 服务
├── packages/
│   ├── shared/       # 共享类型和常量
│   ├── providers/    # AI 提供方适配
│   ├── db/           # Prisma 数据库
│   ├── queue/        # BullMQ 队列定义
│   ├── storage/      # 对象存储封装
│   ├── logger/       # 日志工具
│   └── config-*/     # 共享配置
└── infra/
    └── docker/       # 本地基础设施
```

## 开发工作流

### 添加新功能

1. 在 `packages/shared` 中定义类型
2. 在相应的 `apps/*` 中实现功能
3. 如需队列任务，在 `packages/queue` 定义 job，在 `apps/worker` 实现 worker

### 数据库变更

```bash
# 修改 packages/db/prisma/schema.prisma
# 生成迁移
pnpm db:migrate

# 重新生成 Prisma Client
pnpm db:generate
```

### 添加新的 AI 提供方

1. 在 `packages/providers/src` 创建新文件
2. 实现 `AIProvider` 接口
3. 导出到 `packages/providers/src/index.ts`

## 常用命令

```bash
# 开发
pnpm dev              # 启动所有服务
pnpm dev --filter web # 只启动 web

# 构建
pnpm build            # 构建所有应用

# 代码质量
pnpm lint             # 代码检查
pnpm typecheck        # 类型检查
pnpm format           # 格式化代码

# 数据库
pnpm db:generate      # 生成 Prisma Client
pnpm db:migrate       # 运行迁移
pnpm db:seed          # 填充种子数据
pnpm db:studio        # 打开 Prisma Studio

# 清理
pnpm clean            # 清理所有构建产物
```

## 调试

### Web 应用

使用 VS Code 调试配置或浏览器开发工具。

### Worker 服务

查看日志：
```bash
pnpm --filter @repo/worker dev
```

### 数据库

使用 Prisma Studio：
```bash
pnpm db:studio
```

### 队列

使用 BullMQ Board 或 Redis CLI 查看队列状态。

## 测试

```bash
# 运行所有测试
pnpm test

# 运行 E2E 测试
pnpm test:e2e
```

## 部署

详见 `docs/deployment.md`

## 常见问题

### 端口冲突

如果 3000/5432/6379/9000 端口被占用，修改相应配置文件。

### Docker 服务启动失败

```bash
cd infra/docker
docker compose down
docker compose up -d
```

### Prisma Client 未生成

```bash
pnpm db:generate
```

### 依赖安装失败

```bash
pnpm clean
pnpm install
```
