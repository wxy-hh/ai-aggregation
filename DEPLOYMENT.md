# Vercel 部署指南

## 前置准备

### 1. 云服务准备（必需）

由于项目依赖以下服务，需要提前准备：

#### 数据库（PostgreSQL）

- **推荐**：[Supabase](https://supabase.com/)（免费额度充足）
- 或 [Neon](https://neon.tech/)
- 或 [Vercel Postgres](https://vercel.com/storage/postgres)

#### Redis（用于 BullMQ 队列）

- **推荐**：[Upstash Redis](https://upstash.com/)（免费额度充足）
- 或 [Redis Cloud](https://redis.com/try-free/)
- 不建议生产环境依赖开发机本地 Redis 或 Homebrew Redis

#### 对象存储（可选，用于文件上传）

- 阿里云 OSS
- 或 MinIO（需自行部署）

### 2. API Keys 准备

确保已获取以下 API Keys：

- `DASHSCOPE_API_KEY` - 通义千问
- `ZHIPU_API_KEY` - 智谱 GLM
- `DEEPSEEK_API_KEY` - DeepSeek
- `SILICONFLOW_API_KEY` - 硅基流动（Kolors 图像生成）

---

## 部署步骤

### 方式 1：通过 Vercel Dashboard（推荐）

#### 步骤 1：导入项目

1. 访问 [Vercel Dashboard](https://vercel.com/new)
2. 点击 **Import Project**
3. 选择 **Import Git Repository**
4. 选择你的 GitHub 仓库：`wxy-hh/ai-aggregation`
5. 点击 **Import**

#### 步骤 2：配置项目

在 **Configure Project** 页面：

**Framework Preset**: Next.js（自动检测）

**Root Directory**: 保持默认（根目录）

**Build and Output Settings**:

- **Build Command**: `pnpm turbo build --filter=@repo/web`
- **Output Directory**: `apps/web/.next`
- **Install Command**: `pnpm install`

**Node.js Version**: 22.x

#### 步骤 3：配置环境变量

点击 **Environment Variables**，添加以下变量：

```bash
# 数据库
DATABASE_URL=postgresql://user:password@host:5432/dbname

# Redis（BullMQ）
REDIS_HOST=your-upstash-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# AI 服务商 API Keys
DASHSCOPE_API_KEY=sk-xxx
ZHIPU_API_KEY=xxx
DEEPSEEK_API_KEY=sk-xxx
SILICONFLOW_API_KEY=sk-xxx

# 对象存储（可选）
OSS_ACCESS_KEY_ID=xxx
OSS_ACCESS_KEY_SECRET=xxx
OSS_BUCKET=your-bucket
OSS_REGION=oss-cn-hangzhou

# Next.js
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
```

#### 步骤 4：部署

1. 点击 **Deploy** 按钮
2. 等待构建完成（首次约 3-5 分钟）
3. 部署成功后会自动分配域名

---

### 方式 2：通过 Vercel CLI

#### 安装 Vercel CLI

```bash
npm i -g vercel
```

#### 登录 Vercel

```bash
vercel login
```

#### 部署

```bash
# 首次部署（会引导配置）
vercel

# 生产环境部署
vercel --prod
```

---

## 部署后配置

### 1. 数据库迁移

部署成功后，需要初始化数据库：

```bash
# 本地执行（确保 DATABASE_URL 指向生产数据库）
pnpm db:migrate
pnpm db:seed
```

或在 Vercel Dashboard 中添加部署后脚本（Project Settings → Git → Post-deploy Command）：

```bash
pnpm db:migrate
```

### 2. 自定义域名（可选）

1. 进入 Vercel 项目 → **Settings** → **Domains**
2. 添加你的域名
3. 按提示配置 DNS 记录

### 3. 环境变量管理

- **Development**: 用于预览分支
- **Preview**: 用于 PR 预览
- **Production**: 用于生产环境

建议为不同环境配置不同的数据库和 API Keys。

---

## 注意事项

### 1. Monorepo 构建优化

Vercel 会自动检测 Turborepo，但需要确保：

- `vercel.json` 中的 `buildCommand` 正确
- `ignoreCommand` 配置正确，避免不必要的构建

### 2. 环境变量前缀

- `NEXT_PUBLIC_*` 前缀的变量会暴露到客户端
- 敏感信息（API Keys）不要使用 `NEXT_PUBLIC_` 前缀

### 3. 数据库连接池

Vercel 是 Serverless 环境，建议使用连接池：

- Supabase 自带连接池
- 或使用 [Prisma Data Proxy](https://www.prisma.io/data-platform)

### 4. Worker 服务

BullMQ Worker（`apps/worker`）无法在 Vercel 上运行，需要单独部署：

- **推荐**：[Railway](https://railway.app/)
- 或 [Render](https://render.com/)
- 或自建服务器

建议部署方式：

- `apps/web`：部署到 Vercel
- `apps/worker`：部署到 Railway / Render / 容器平台
- `Redis`：使用托管 Redis
- `PostgreSQL`：使用托管 PostgreSQL

推荐同时补齐以下生产配置：

- Web 与 Worker 使用同一套 Redis 连接信息
- 优先使用 `REDIS_URL`
- 如果 Redis 要求 TLS，设置 `REDIS_TLS=true`，或直接使用 `rediss://` 形式的 `REDIS_URL`
- `apps/worker` 启动后会持续写入 Worker 心跳；生产环境下若心跳不存在，奇门异步入口会直接返回 503，避免任务长期卡在 pending 状态

`apps/worker` 的 Railway / Render 启动说明见：

- [apps/worker/DEPLOY.md](/Users/weixiaoyu/Desktop/practice/AI-aggregation/apps/worker/DEPLOY.md)

如果后续采用容器化平台，推荐为 `web` 和 `worker` 分别维护镜像与启动命令，避免将两者耦合在同一进程中。

---

## 常见问题

### Q1: 构建失败 - "Cannot find module '@repo/xxx'"

**原因**：Workspace 依赖未正确安装

**解决**：

1. 确认 `vercel.json` 中 `installCommand` 为 `pnpm install`
2. 确认根目录有 `pnpm-workspace.yaml`

### Q2: 运行时错误 - "Prisma Client not generated"

**原因**：数据库客户端未生成

**解决**：
在 `package.json` 中添加 `postinstall` 脚本（已配置）：

```json
{
  "scripts": {
    "postinstall": "pnpm db:generate"
  }
}
```

### Q3: 环境变量未生效

**原因**：环境变量未正确配置或需要重新部署

**解决**：

1. 检查 Vercel Dashboard 中的环境变量配置
2. 修改环境变量后需要重新部署（Redeploy）

### Q4: 数据库连接超时

**原因**：Serverless 冷启动 + 数据库连接池耗尽

**解决**：

1. 使用 Supabase 的连接池模式（Pooler）
2. 或配置 Prisma 连接池：

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}
```

---

## 监控与日志

### Vercel Analytics

在 Vercel Dashboard 中启用：

- **Analytics**: 页面性能监控
- **Speed Insights**: Core Web Vitals
- **Web Vitals**: 用户体验指标

### 日志查看

```bash
# 实时日志
vercel logs --follow

# 查看最近日志
vercel logs
```

---

## 成本估算

### Vercel 免费额度（Hobby Plan）

- **带宽**: 100 GB/月
- **构建时间**: 6000 分钟/月
- **Serverless 函数执行**: 100 GB-小时/月
- **边缘函数**: 500,000 次调用/月

### 升级建议

如果超出免费额度，考虑升级到 **Pro Plan**（$20/月）：

- 无限带宽
- 无限构建时间
- 更高的函数执行限制

---

## 相关链接

- [Vercel 文档](https://vercel.com/docs)
- [Next.js 部署指南](https://nextjs.org/docs/deployment)
- [Turborepo 部署](https://turbo.build/repo/docs/handbook/deploying-with-docker)
- [Prisma 部署最佳实践](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-vercel)
