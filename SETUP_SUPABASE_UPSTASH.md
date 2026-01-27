# Supabase + Upstash 配置流程

## 🎯 目标

使用免费的云服务快速搭建开发环境，无需安装 Docker。

## ⏱️ 预计时间

- 注册服务: 5 分钟
- 配置环境: 3 分钟
- 初始化数据库: 2 分钟
- **总计: 10 分钟**

---

## 📋 配置步骤

### 步骤 1: 注册 Supabase（数据库）

#### 1.1 访问并注册

🔗 打开: https://supabase.com/

1. 点击右上角 **"Start your project"**
2. 使用 **GitHub** 账号登录（推荐）

#### 1.2 创建项目

1. 点击 **"New project"**
2. 填写信息：
   - **Name**: `ai-aggregation`
   - **Database Password**: 设置强密码（**记住它！**）
   - **Region**: 选择 **Southeast Asia (Singapore)**
   - **Pricing Plan**: **Free**
3. 点击 **"Create new project"**
4. ⏳ 等待 2 分钟

#### 1.3 获取连接字符串

1. 项目创建完成后，点击左侧 **"Settings"** ⚙️
2. 点击 **"Database"**
3. 滚动到 **"Connection string"**
4. 选择 **"URI"** 标签
5. 点击 **"Copy"** 📋

格式示例：

```
postgresql://postgres.xxxxx:[YOUR-PASSWORD]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
```

⚠️ 将 `[YOUR-PASSWORD]` 替换为你设置的密码

---

### 步骤 2: 注册 Upstash（Redis）

#### 2.1 访问并注册

🔗 打开: https://console.upstash.com/

1. 点击 **"Sign Up"**
2. 使用 **GitHub** 或 **Google** 账号登录

#### 2.2 创建 Redis 数据库

1. 点击 **"Create Database"**
2. 填写信息：
   - **Name**: `ai-aggregation-redis`
   - **Type**: **Regional**
   - **Region**: 选择离你最近的区域
   - **TLS**: 保持启用 ✅
   - **Eviction**: **noeviction**
3. 点击 **"Create"**

#### 2.3 获取连接信息

在数据库详情页，记录以下信息：

- **Endpoint**: `xxx.upstash.io`
- **Port**: `6379`
- **Password**: 点击 👁️ 显示并复制

---

### 步骤 3: 配置环境变量

#### 方式 A: 使用配置脚本（推荐）

```bash
bash tooling/scripts/setup-env.sh
```

按提示输入：

1. Supabase 连接字符串
2. Upstash Endpoint
3. Upstash Port（默认 6379）
4. Upstash Password

脚本会自动创建配置文件。

#### 方式 B: 手动配置

编辑 `apps/web/.env.local`:

```env
# 数据库
DATABASE_URL="postgresql://postgres.xxxxx:你的密码@aws-0-xxx.pooler.supabase.com:6543/postgres"

# Redis
REDIS_HOST="xxx.upstash.io"
REDIS_PORT="6379"
REDIS_PASSWORD="你的Redis密码"

# 对象存储（暂时不用）
S3_ENDPOINT="http://localhost:9000"
S3_ACCESS_KEY="minioadmin"
S3_SECRET_KEY="minioadmin"
S3_BUCKET="ai-aggregation"

# AI Providers（暂时留空）
DASHSCOPE_API_KEY=""
ZHIPU_API_KEY=""
DEEPSEEK_API_KEY=""

# 鉴权（生成随机字符串）
AUTH_SECRET="运行 openssl rand -base64 32 生成"
NEXTAUTH_URL="http://localhost:3000"
```

复制相同内容到 `apps/worker/.env`

---

### 步骤 4: 验证配置

```bash
bash tooling/scripts/check-env.sh
```

应该看到：

```
✅ apps/web/.env.local 存在
✅ apps/worker/.env 存在
✅ DATABASE_URL 已配置
✅ REDIS_HOST 已配置
✅ REDIS_PASSWORD 已配置
✅ AUTH_SECRET 已配置
✅ 配置检查通过
```

---

### 步骤 5: 初始化数据库

```bash
# 1. 生成 Prisma Client
pnpm db:generate

# 2. 运行数据库迁移
pnpm db:migrate

# 3. 填充种子数据（可选）
pnpm db:seed
```

---

### 步骤 6: 启动开发服务

```bash
pnpm dev
```

访问: http://localhost:3000

---

## ✅ 验证安装

### 1. 检查 Web 应用

打开 http://localhost:3000，应该看到首页。

### 2. 检查数据库

```bash
pnpm db:studio
```

应该能看到以下表：

- users
- chat_sessions
- messages
- tasks
- user_usage

### 3. 在 Supabase 控制台验证

1. 打开 Supabase 项目
2. 点击左侧 **"SQL Editor"**
3. 运行：

```sql
SELECT * FROM users;
```

应该能看到测试用户。

### 4. 在 Upstash 控制台验证

1. 打开 Upstash 数据库
2. 点击 **"CLI"** 标签
3. 输入：

```
PING
```

应该返回 `PONG`。

---

## 🎉 完成！

现在你可以开始开发了：

1. **开发对话功能** - 实现 AI Provider
2. **开发任务功能** - 实现 Worker
3. **开发 UI** - 创建页面和组件

---

## 📚 相关文档

- [详细配置指南](docs/SETUP_GUIDE.md)
- [开发指南](docs/development.md)
- [架构设计](docs/architecture.md)
- [当前状态](CURRENT_STATUS.md)

---

## 🆘 遇到问题？

### 问题 1: 数据库连接失败

**症状**: `pnpm db:migrate` 报错

**解决方案**:

1. 检查 `DATABASE_URL` 是否正确
2. 确保密码中没有特殊字符（或正确转义）
3. 确认使用的是 **Transaction** 模式（端口 6543）

### 问题 2: Redis 连接失败

**症状**: Worker 启动报错

**解决方案**:

1. 检查 `REDIS_PASSWORD` 是否配置
2. 确保 `REDIS_HOST` 不包含 `https://`
3. 端口应该是 `6379`

### 问题 3: Prisma 迁移失败

**解决方案**:

```bash
# 重置数据库
pnpm --filter @repo/db prisma migrate reset

# 重新迁移
pnpm db:migrate
```

### 问题 4: 环境变量不生效

**解决方案**:

1. 确保文件名正确（`.env.local` 不是 `.env.local.example`）
2. 重启开发服务器
3. 运行 `bash tooling/scripts/check-env.sh` 检查

---

## 💰 成本说明

### Supabase 免费套餐

- ✅ 500MB 数据库
- ✅ 1GB 文件存储
- ✅ 50,000 月活用户
- ✅ 足够开发使用

### Upstash 免费套餐

- ✅ 10,000 命令/天
- ✅ 256MB 存储
- ✅ 足够开发使用

### 总成本

**$0/月** 🎉

---

## 🚀 下一步

配置完成后，建议：

1. **阅读开发指南**: [docs/development.md](docs/development.md)
2. **了解架构**: [docs/architecture.md](docs/architecture.md)
3. **查看待办事项**: [CURRENT_STATUS.md](CURRENT_STATUS.md)
4. **开始第一个功能**: 实现基础对话

祝开发顺利！🎊
