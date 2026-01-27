# 5 分钟快速开始（使用免费云服务）

最快的方式开始开发，无需安装 Docker、PostgreSQL 或 Redis。

## 步骤 1: 安装依赖

```bash
bash tooling/scripts/init-no-docker.sh
```

## 步骤 2: 注册免费云服务

### 2.1 数据库 - Supabase（免费）

1. 访问 https://supabase.com/
2. 点击 "Start your project"
3. 使用 GitHub 账号登录
4. 创建新项目（选择离你最近的区域）
5. 等待项目创建完成（约 2 分钟）
6. 进入项目，点击左侧 "Settings" → "Database"
7. 复制 "Connection string" 中的 URI（选择 "URI" 标签）

示例：

```
postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres
```

### 2.2 Redis - Upstash（免费）

1. 访问 https://upstash.com/
2. 点击 "Get Started"
3. 使用 GitHub 或 Google 账号登录
4. 点击 "Create Database"
5. 选择 "Global" 类型，选择离你最近的区域
6. 点击创建
7. 在数据库详情页，复制：
   - Endpoint（主机名）
   - Port（端口）
   - Password（密码）

## 步骤 3: 配置环境变量

### 3.1 配置 Web 应用

编辑 `apps/web/.env.local`:

```env
# 数据库（使用 Supabase 的连接字符串）
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Redis（使用 Upstash 的信息）
REDIS_HOST="your-redis-endpoint.upstash.io"
REDIS_PORT="6379"
REDIS_PASSWORD="your-redis-password"

# 对象存储（暂时使用本地，可选）
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# AI Providers（需要申请）
DASHSCOPE_API_KEY="your-dashscope-api-key"
ZHIPU_API_KEY="your-zhipu-api-key"
DEEPSEEK_API_KEY="your-deepseek-api-key"

# Auth
AUTH_SECRET="your-random-secret-string"
NEXTAUTH_URL="http://localhost:3000"
```

### 3.2 配置 Worker 服务

编辑 `apps/worker/.env`:

```env
# 数据库（与 Web 相同）
DATABASE_URL="postgresql://postgres.xxxxx:password@aws-0-ap-southeast-1.pooler.supabase.com:5432/postgres"

# Redis（与 Web 相同）
REDIS_HOST="your-redis-endpoint.upstash.io"
REDIS_PORT="6379"
REDIS_PASSWORD="your-redis-password"

# 对象存储（与 Web 相同）
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# AI Providers（与 Web 相同）
DASHSCOPE_API_KEY="your-dashscope-api-key"
ZHIPU_API_KEY="your-zhipu-api-key"
DEEPSEEK_API_KEY="your-deepseek-api-key"
```

## 步骤 4: 初始化数据库

```bash
# 生成 Prisma Client
pnpm db:generate

# 运行数据库迁移
pnpm db:migrate

# 填充种子数据（可选）
pnpm db:seed
```

## 步骤 5: 启动开发服务

```bash
pnpm dev
```

访问 http://localhost:3000

## 验证安装

### 检查数据库连接

```bash
pnpm db:studio
```

应该会打开 Prisma Studio，可以看到数据库表。

### 检查 Web 应用

访问 http://localhost:3000，应该能看到首页。

## 获取 AI API Keys（可选）

如果要测试 AI 功能，需要申请以下服务的 API Key：

### 通义千问（阿里云）

1. 访问 https://dashscope.aliyun.com/
2. 登录/注册阿里云账号
3. 开通 DashScope 服务
4. 创建 API Key
5. 新用户通常有免费额度

### 智谱 GLM

1. 访问 https://open.bigmodel.cn/
2. 注册账号
3. 创建 API Key
4. 新用户有免费额度

### DeepSeek

1. 访问 https://platform.deepseek.com/
2. 注册账号
3. 创建 API Key
4. 新用户有免费额度

## 暂时跳过 AI Keys

如果暂时不想申请 API Keys，可以：

1. 先开发前端 UI
2. 使用 Mock 数据测试
3. 后续再集成真实 API

## 下一步

- 📖 阅读 [开发指南](development.md)
- 🏗️ 了解 [架构设计](architecture.md)
- 💻 开始开发功能

## 成本说明

使用上述免费服务的成本：

- **Supabase**: 免费套餐包含 500MB 数据库，足够开发使用
- **Upstash**: 免费套餐包含 10,000 命令/天，足够开发使用
- **总成本**: $0/月（开发阶段）

## 常见问题

### Q: Supabase 连接超时

检查：

1. 连接字符串是否正确
2. 是否选择了 "Pooler" 连接模式
3. 网络是否正常

### Q: Upstash 连接失败

检查：

1. 是否需要在环境变量中添加 `REDIS_PASSWORD`
2. 端口是否正确（通常是 6379）

### Q: 数据库迁移失败

```bash
# 重置并重新迁移
pnpm --filter @repo/db prisma migrate reset
pnpm db:migrate
```

### Q: 想切换回本地 Docker

1. 安装 Docker Desktop
2. 运行 `bash tooling/scripts/init.sh`
3. 更新环境变量为本地地址

## 生产环境

开发完成后，生产环境建议使用：

- 阿里云 RDS PostgreSQL
- 阿里云 Redis
- 阿里云 OSS

详见部署文档（待创建）
