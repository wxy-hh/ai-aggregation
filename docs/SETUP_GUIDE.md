# Supabase + Upstash 配置指南

## 第一步：注册 Supabase（数据库）

### 1. 访问并注册

1. 打开 https://supabase.com/
2. 点击右上角 **"Start your project"**
3. 使用 **GitHub** 账号登录（推荐）或邮箱注册

### 2. 创建项目

1. 登录后，点击 **"New project"**
2. 填写项目信息：
   - **Name**: `ai-aggregation`（或任意名称）
   - **Database Password**: 设置一个强密码（记住它！）
   - **Region**: 选择 **Southeast Asia (Singapore)** 或离你最近的区域
   - **Pricing Plan**: 选择 **Free**
3. 点击 **"Create new project"**
4. 等待约 2 分钟，项目创建完成

### 3. 获取数据库连接字符串

1. 项目创建完成后，点击左侧菜单 **"Settings"** (齿轮图标)
2. 点击 **"Database"**
3. 向下滚动到 **"Connection string"** 部分
4. 选择 **"URI"** 标签（不是 Session mode）
5. 点击 **"Copy"** 复制连接字符串

连接字符串格式：

```
postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

⚠️ **重要**: 将 `[YOUR-PASSWORD]` 替换为你在第 2 步设置的密码

### 4. 测试连接（可选）

在 Supabase 控制台：

1. 点击左侧 **"SQL Editor"**
2. 点击 **"New query"**
3. 输入 `SELECT version();` 并运行
4. 如果看到 PostgreSQL 版本信息，说明数据库正常

---

## 第二步：注册 Upstash（Redis）

### 1. 访问并注册

1. 打开 https://console.upstash.com/
2. 点击 **"Sign Up"**
3. 使用 **GitHub** 或 **Google** 账号登录

### 2. 创建 Redis 数据库

1. 登录后，点击 **"Create Database"**
2. 填写数据库信息：
   - **Name**: `ai-aggregation-redis`（或任意名称）
   - **Type**: 选择 **Regional**
   - **Region**: 选择离你最近的区域（如 `ap-southeast-1`）
   - **TLS**: 保持启用
   - **Eviction**: 选择 **noeviction**
3. 点击 **"Create"**

### 3. 获取连接信息

数据库创建后，在详情页面可以看到：

1. **Endpoint**: 类似 `gusc1-charming-seahorse-12345.upstash.io`
2. **Port**: `6379`
3. **Password**: 点击眼睛图标显示密码

或者直接复制 **REST URL** 和 **REST Token**（如果使用 REST API）

### 4. 测试连接（可选）

在 Upstash 控制台：

1. 点击 **"CLI"** 标签
2. 输入 `PING` 并回车
3. 如果返回 `PONG`，说明 Redis 正常

---

## 第三步：配置环境变量

### 1. 配置 Web 应用

编辑 `apps/web/.env.local`：

```env
# ==================== 数据库配置 ====================
# 从 Supabase 复制的连接字符串
# 格式: postgresql://postgres.xxxxx:[密码]@aws-0-xxx.pooler.supabase.com:6543/postgres
DATABASE_URL="你的_Supabase_连接字符串"

# ==================== Redis 配置 ====================
# 从 Upstash 复制的信息
REDIS_HOST="你的_Upstash_Endpoint"
REDIS_PORT="6379"
REDIS_PASSWORD="你的_Upstash_密码"

# ==================== 对象存储（暂时不用配置）====================
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# ==================== AI Providers（暂时可以留空）====================
DASHSCOPE_API_KEY=""
ZHIPU_API_KEY=""
DEEPSEEK_API_KEY=""

# ==================== 鉴权配置 ====================
# 生成一个随机字符串（可以用下面的命令生成）
# openssl rand -base64 32
AUTH_SECRET="your-random-secret-string-change-this"
NEXTAUTH_URL="http://localhost:3000"
```

### 2. 配置 Worker 服务

编辑 `apps/worker/.env`：

```env
# ==================== 数据库配置 ====================
# 与 Web 应用相同
DATABASE_URL="你的_Supabase_连接字符串"

# ==================== Redis 配置 ====================
# 与 Web 应用相同
REDIS_HOST="你的_Upstash_Endpoint"
REDIS_PORT="6379"
REDIS_PASSWORD="你的_Upstash_密码"

# ==================== 对象存储（暂时不用配置）====================
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# ==================== AI Providers（暂时可以留空）====================
DASHSCOPE_API_KEY=""
ZHIPU_API_KEY=""
DEEPSEEK_API_KEY=""
```

### 3. 生成 AUTH_SECRET

在终端运行：

```bash
openssl rand -base64 32
```

将输出的字符串复制到 `AUTH_SECRET`

---

## 第四步：初始化数据库

### 1. 生成 Prisma Client

```bash
pnpm db:generate
```

### 2. 运行数据库迁移

```bash
pnpm db:migrate
```

这会在 Supabase 数据库中创建所有需要的表。

### 3. 填充种子数据（可选）

```bash
pnpm db:seed
```

### 4. 验证数据库

打开 Prisma Studio：

```bash
pnpm db:studio
```

应该能看到以下表：

- users
- chat_sessions
- messages
- tasks
- user_usage

---

## 第五步：启动开发服务

```bash
pnpm dev
```

这会启动：

- Web 应用: http://localhost:3000
- Worker 服务（后台运行）

---

## 验证配置

### 1. 检查 Web 应用

访问 http://localhost:3000，应该能看到首页。

### 2. 检查数据库连接

在 Supabase 控制台的 SQL Editor 中运行：

```sql
SELECT * FROM users;
```

应该能看到种子数据中创建的测试用户。

### 3. 检查 Redis 连接

在 Upstash 控制台的 CLI 中运行：

```
KEYS *
```

如果没有错误，说明连接正常。

---

## 常见问题

### Q1: Supabase 连接超时

**解决方案**:

1. 检查连接字符串是否正确
2. 确保使用的是 **Transaction** 模式的连接字符串（端口 6543）
3. 检查密码是否正确（不要有多余的空格）

### Q2: Prisma 迁移失败

**解决方案**:

```bash
# 重置数据库（会删除所有数据）
pnpm --filter @repo/db prisma migrate reset

# 重新迁移
pnpm db:migrate
```

### Q3: Upstash 连接失败

**解决方案**:

1. 检查 `REDIS_PASSWORD` 是否配置
2. 确保 `REDIS_HOST` 不包含 `https://` 前缀
3. 端口应该是 `6379`

### Q4: 环境变量不生效

**解决方案**:

1. 确保文件名是 `.env.local`（不是 `.env.local.example`）
2. 重启开发服务器
3. 检查是否有语法错误（如多余的引号）

---

## 配置示例

### 完整的 .env.local 示例

```env
# 数据库
DATABASE_URL="postgresql://postgres.abcdefghijk:MyPassword123@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres"

# Redis
REDIS_HOST="gusc1-charming-seahorse-12345.upstash.io"
REDIS_PORT="6379"
REDIS_PASSWORD="AaBbCcDdEeFfGgHhIiJjKkLlMmNn"

# 对象存储（暂时不用）
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# AI Providers（暂时留空）
DASHSCOPE_API_KEY=""
ZHIPU_API_KEY=""
DEEPSEEK_API_KEY=""

# 鉴权
AUTH_SECRET="Kq8xN2vP9wR5tY7uI3oP1aS4dF6gH8jK"
NEXTAUTH_URL="http://localhost:3000"
```

---

## 下一步

配置完成后，你可以：

1. **开发对话功能** - 实现 AI Provider
2. **开发任务功能** - 实现 Worker
3. **开发 UI** - 创建页面和组件

参考文档：

- [开发指南](development.md)
- [架构设计](architecture.md)

---

## 成本说明

### Supabase 免费套餐

- ✅ 500MB 数据库存储
- ✅ 1GB 文件存储
- ✅ 50,000 月活用户
- ✅ 500MB 出站流量/月
- ✅ 2GB 入站流量/月

**足够开发和小规模使用**

### Upstash 免费套餐

- ✅ 10,000 命令/天
- ✅ 256MB 存储
- ✅ 无限数据库数量

**足够开发使用**

### 总成本

**$0/月** 🎉

---

## 需要帮助？

- 查看 [CURRENT_STATUS.md](../CURRENT_STATUS.md) 了解项目状态
- 查看 [development.md](development.md) 了解开发流程
- 遇到问题可以查看上面的"常见问题"部分
