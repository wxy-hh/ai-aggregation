# 🚀 AI 聚合平台 - 启动指南

## 方式 1：一键启动（推荐）⭐

在项目根目录运行：

```bash
pnpm dev
```

这会同时启动：

- ✅ Next.js Web 应用（`http://localhost:3000`）
- ✅ Cloudflare Worker 网关（`ws://localhost:8787`）

**访问应用**：

- 主页：`http://localhost:3000`
- 实时语音转写：`http://localhost:3000/voice`

---

## 方式 2：分别启动

如果需要单独启动某个服务：

### 启动 Next.js

```bash
pnpm --filter @repo/web dev
```

### 启动 Worker 网关

```bash
pnpm --filter @repo/worker-rtasr dev
```

---

## 🔍 验证服务状态

### 检查 Next.js

```bash
curl http://localhost:3000
```

### 检查 Worker 网关

```bash
curl http://localhost:8787/health
# 预期输出: {"status":"ok","service":"rtasr-gateway"}
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

# 启动开发服务器（所有服务）
pnpm dev

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
│   ├── docker/               # Docker Compose
│   └── worker-rtasr/         # 讯飞实时转写网关 ⭐
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

### Worker 无法启动

**错误**: `wrangler: command not found`

**解决**:

```bash
pnpm install
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

# 5. 启动所有服务
pnpm dev

# 6. 访问应用
open http://localhost:3000
```

🎉 开始使用吧！
