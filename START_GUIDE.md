# 🚀 AI 聚合平台 - 启动指南

## 方式 1：智能启动（个人开发推荐）⭐

在项目根目录运行：

```bash
pnpm dev
```

这会执行以下流程：

- ✅ 加载 `apps/web/.env.local` 作为 Web 与 Worker 共享环境
- ✅ 输出关键环境状态（如 `ARK_API_KEY=SET/UNSET`）
- ✅ 自动检查 Redis
- ✅ 若本机已有 Redis，则直接复用
- ✅ 若安装了 `redis-server` 或 Homebrew Redis，则尝试自动启动
- ✅ 若安装了 Docker，则可回退使用 Docker Redis
- ✅ 自动清理旧的 `turbo dev` / `worker` 进程，避免多套进程抢任务
- ✅ 启动 Next.js Web 应用
- ✅ 启动 BullMQ Worker

推荐只使用根目录 `pnpm dev` 联调，不要同时手工执行多套 `pnpm dev:web` / `pnpm dev:worker`。

## 方式 2：Docker 基础设施（团队推荐）

```bash
# 启动 Redis / PostgreSQL / MinIO
pnpm infra:up

# 启动 Web + Worker
pnpm dev:docker
```

适合：
- 新同学入组
- 团队统一环境
- 需要更贴近部署环境时

## 方式 3：分别启动

如果需要单独启动某个服务：

### 启动 Next.js Web

```bash
pnpm dev:web
```

### 启动 BullMQ Worker

```bash
pnpm dev:worker
```

`pnpm dev:worker` 现在也会自动加载 `apps/web/.env.local` 作为共享环境。

### 启动实时语音网关

```bash
pnpm dev:rtasr
```

### 奇门链路自检

```bash
pnpm qimen:check
```

---

## 🔍 验证服务状态

### 检查 Next.js

```bash
curl http://localhost:3030
```

### 检查 Redis

```bash
redis-cli -p 6379 ping
# 预期输出: PONG
```

### 检查奇门链路

```bash
pnpm qimen:check
```

---

## 🎤 测试实时语音转写

1. 访问 `http://localhost:3000/voice`
2. 切换到"实时录音"标签
3. 点击"开始录音"
4. 允许浏览器访问麦克风
5. 开始说话，查看实时转写结果

---

## 🛠️ 常用命令

```bash
# 安装依赖
pnpm install

# 启动开发服务器（智能模式）
pnpm dev

# 使用 Docker 基础设施启动
pnpm dev:docker

# 单独启动
pnpm dev:web
pnpm dev:worker
pnpm dev:rtasr
pnpm qimen:check

# 构建所有包
pnpm build

# 代码检查
pnpm lint

# 类型检查
pnpm typecheck

# 数据库操作
pnpm db:generate   # 生成 Prisma Client
pnpm db:migrate    # 执行数据库迁移
pnpm db:seed       # 填充初始数据

# 清理
pnpm clean
```

---

## 📦 项目结构

```
ai-aggregation/
├── apps/
│   ├── web/                  # Next.js 主应用
│   └── worker/               # BullMQ Worker（异步任务）
├── packages/
│   ├── shared/               # 共享类型和工具
│   ├── providers/            # AI 提供方适配层
│   ├── db/                   # Prisma 数据库
│   └── ...
├── infra/
│   ├── docker/               # Docker Compose（Redis / Postgres / MinIO）
│   └── worker-rtasr/         # 讯飞实时转写网关
└── docs/                     # 文档
```

---

## 🚨 故障排查

### 端口被占用

**错误**: `Port 3000 is already in use`

**解决**:

```bash
# 查找占用端口的进程
lsof -ti:3000
# 杀死进程
kill -9 $(lsof -ti:3000)
```

### Redis 无法启动

**错误**: `Redis 未运行，且当前环境没有可用的 Docker`

**解决**:

```bash
# 方案 1：安装本地 Redis
brew install redis
brew services start redis

# 方案 2：安装 Docker Desktop 后使用容器
pnpm infra:up
```

### 奇门链路频繁报 `Missing ARK_API_KEY`

**现象**: 页面提示“演化分析失败 Missing ARK_API_KEY”

**解决**:

```bash
# 重新启动统一开发进程
pnpm dev

# 若仍有残留，再手工清理一次
pkill -f "turbo run dev --filter=@repo/web --filter=@repo/worker"
pkill -f "tsx.*src/index.ts"
pnpm dev

# 使用自检脚本确认基础盘状态
pnpm qimen:check
```

### 实时语音网关无法启动

**错误**: `wrangler: command not found`

**解决**:

```bash
pnpm install
pnpm dev:rtasr
```

### 数据库连接失败

**错误**: `Can't reach database server`

**解决**:

1. 检查 `apps/web/.env.local` 中的 `DATABASE_URL`
2. 确保 PostgreSQL 正在运行
3. 运行 `pnpm db:migrate`

---

## 📚 更多文档

- [实时语音转写完整指南](./VOICE_REALTIME_GUIDE.md)
- [部署检查清单](./DEPLOYMENT_CHECKLIST.md)
- [项目架构说明](./AGENTS.md)

---

## ✨ 快速体验

```bash
# 1. 克隆项目
git clone <your-repo-url>
cd ai-aggregation

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp apps/web/.env.example apps/web/.env.local
# 编辑 .env.local 填入必要的 API 密钥

# 4. 初始化数据库
pnpm db:migrate
pnpm db:seed

# 5. 启动开发服务
pnpm dev

# 6. 访问应用
open http://localhost:3030
```

🎉 开始使用吧！
