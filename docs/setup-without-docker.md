# 无 Docker 环境搭建指南

如果你的系统没有安装 Docker，可以使用以下方式搭建开发环境。

## 方案选择

### 方案 1: 使用云服务（推荐，最简单）

使用云服务提供商的数据库和缓存服务，无需本地安装。

#### PostgreSQL 云服务

**国内选项：**

- [阿里云 RDS PostgreSQL](https://www.aliyun.com/product/rds/postgresql)
- [腾讯云 PostgreSQL](https://cloud.tencent.com/product/postgres)
- [华为云 RDS PostgreSQL](https://www.huaweicloud.com/product/rds.html)

**国际选项：**

- [Supabase](https://supabase.com/) - 免费套餐，包含 PostgreSQL
- [Neon](https://neon.tech/) - 免费套餐，Serverless PostgreSQL
- [Railway](https://railway.app/) - 免费额度

#### Redis 云服务

**国内选项：**

- [阿里云 Redis](https://www.aliyun.com/product/kvstore)
- [腾讯云 Redis](https://cloud.tencent.com/product/crs)

**国际选项：**

- [Upstash](https://upstash.com/) - 免费套餐，Serverless Redis
- [Redis Cloud](https://redis.com/cloud/) - 免费套餐

#### 配置示例

使用 Supabase + Upstash（免费方案）：

1. **注册 Supabase**
   - 访问 https://supabase.com/
   - 创建项目，获取数据库连接字符串

2. **注册 Upstash**
   - 访问 https://upstash.com/
   - 创建 Redis 数据库，获取连接信息

3. **更新环境变量**

`apps/web/.env.local`:

```env
DATABASE_URL="postgresql://postgres:[password]@[host]:[port]/postgres"
REDIS_HOST="[upstash-host]"
REDIS_PORT="[upstash-port]"
```

`apps/worker/.env`:

```env
DATABASE_URL="postgresql://postgres:[password]@[host]:[port]/postgres"
REDIS_HOST="[upstash-host]"
REDIS_PORT="[upstash-port]"
```

### 方案 2: 本地安装（需要管理员权限）

#### macOS

使用 Homebrew 安装：

```bash
# 安装 PostgreSQL
brew install postgresql@16
brew services start postgresql@16

# 创建数据库
createdb ai_aggregation

# 安装 Redis
brew install redis
brew services start redis
```

配置环境变量：

```env
DATABASE_URL="postgresql://localhost:5432/ai_aggregation"
REDIS_HOST="localhost"
REDIS_PORT="6379"
```

#### Windows

**PostgreSQL:**

1. 下载安装器: https://www.postgresql.org/download/windows/
2. 安装并启动服务
3. 使用 pgAdmin 创建数据库 `ai_aggregation`

**Redis:**

1. 下载 Windows 版本: https://github.com/tporadowski/redis/releases
2. 解压并运行 `redis-server.exe`

#### Linux (Ubuntu/Debian)

```bash
# 安装 PostgreSQL
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql

# 创建数据库
sudo -u postgres createdb ai_aggregation

# 安装 Redis
sudo apt install redis-server
sudo systemctl start redis-server
```

### 方案 3: 仅开发前端（最简单）

如果你只想开发前端 UI，可以暂时跳过数据库：

1. **注释掉数据库相关代码**

`apps/web/next.config.ts`:

```typescript
const nextConfig: NextConfig = {
  transpilePackages: [
    '@repo/shared',
    // '@repo/db',  // 暂时注释
    '@repo/providers',
    '@repo/queue',
    '@repo/storage',
    '@repo/logger',
  ],
};
```

2. **使用 Mock 数据**

创建 `apps/web/src/lib/mock-data.ts`:

```typescript
export const mockMessages = [
  { id: '1', role: 'user', content: '你好' },
  { id: '2', role: 'assistant', content: '你好！有什么可以帮助你的吗？' },
];

export const mockTasks = [{ id: '1', type: 'ppt', status: 'completed', createdAt: new Date() }];
```

3. **启动开发服务**

```bash
pnpm --filter @repo/web dev
```

## 初始化数据库

无论使用哪种方案，配置好数据库后都需要运行：

```bash
# 生成 Prisma Client
pnpm db:generate

# 运行数据库迁移
pnpm db:migrate

# 填充种子数据（可选）
pnpm db:seed
```

## 对象存储配置

### 开发阶段

可以暂时跳过对象存储，或使用以下方案：

1. **本地文件系统**（最简单）
   - 将文件保存到 `public/uploads/` 目录
   - 通过 `/uploads/[filename]` 访问

2. **云存储服务**
   - 阿里云 OSS
   - 腾讯云 COS
   - 七牛云

## 验证安装

### 检查 PostgreSQL

```bash
# 使用 psql 连接
psql -h localhost -U postgres -d ai_aggregation

# 或使用 Prisma Studio
pnpm db:studio
```

### 检查 Redis

```bash
# 使用 redis-cli
redis-cli ping
# 应该返回 PONG
```

## 启动开发服务

```bash
# 启动所有服务
pnpm dev

# 或分别启动
pnpm --filter @repo/web dev
pnpm --filter @repo/worker dev
```

## 常见问题

### Q: 数据库连接失败

检查：

1. 数据库服务是否启动
2. `DATABASE_URL` 是否正确
3. 防火墙是否允许连接
4. 用户名密码是否正确

### Q: Redis 连接失败

检查：

1. Redis 服务是否启动
2. `REDIS_HOST` 和 `REDIS_PORT` 是否正确
3. 如果使用云服务，检查是否需要密码

### Q: Prisma 迁移失败

```bash
# 重置数据库（会删除所有数据）
pnpm --filter @repo/db prisma migrate reset

# 重新生成 Client
pnpm db:generate
```

## 推荐配置（开发阶段）

对于快速开始，推荐使用：

- **数据库**: Supabase（免费，无需安装）
- **Redis**: Upstash（免费，无需安装）
- **对象存储**: 暂时使用本地文件系统

这样可以在 5 分钟内完成环境搭建，专注于功能开发。

## 生产环境

生产环境建议使用：

- 阿里云 RDS PostgreSQL
- 阿里云 Redis
- 阿里云 OSS

详见 `docs/deployment.md`（待创建）
