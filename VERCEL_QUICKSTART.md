# Vercel 快速部署清单 ⚡

## 📋 部署前准备（5 分钟）

### 1️⃣ 准备数据库（选择一个）

**推荐：Supabase（免费）**

1. 访问 https://supabase.com/
2. 创建新项目
3. 复制 **Connection String**（在 Settings → Database）
4. 格式：`postgresql://postgres:[password]@db.[project-ref].supabase.co:5432/postgres` 5.账号17633514452@163.com密码Wxyfirst2244.

**或：Vercel Postgres**

1. 在 Vercel Dashboard 中创建 Postgres 数据库
2. 自动获取 `DATABASE_URL`

### 2️⃣ 准备 Redis（必需）

**推荐：Upstash Redis（免费）**

1. 访问 https://upstash.com/
2. 创建 Redis 数据库
3. 复制连接信息：
   - `REDIS_HOST`
   - `REDIS_PORT`
   - `REDIS_PASSWORD`

### 3️⃣ 准备 API Keys

确保已获取：

- ✅ `DASHSCOPE_API_KEY` - 通义千问
- ✅ `ZHIPU_API_KEY` - 智谱 GLM
- ✅ `DEEPSEEK_API_KEY` - DeepSeek
- ✅ `SILICONFLOW_API_KEY` - 硅基流动

---

## 🚀 开始部署（3 分钟）

### 步骤 1：导入项目

1. 访问 https://vercel.com/new
2. 选择 **Import Git Repository**
3. 选择 `wxy-hh/ai-aggregation`
4. 点击 **Import**

### 步骤 2：配置构建设置

Vercel 会自动检测配置，确认以下设置：

- **Framework Preset**: Next.js ✅
- **Root Directory**: `.` (根目录) ✅
- **Build Command**: `pnpm turbo build --filter=@repo/web` ✅
- **Output Directory**: `apps/web/.next` ✅
- **Install Command**: `pnpm install` ✅
- **Node.js Version**: 22.x ✅

### 步骤 3：配置环境变量

点击 **Environment Variables**，复制粘贴以下内容（替换为你的实际值）：

```bash
# 数据库
DATABASE_URL=postgresql://postgres:[YOUR_PASSWORD]@db.[YOUR_PROJECT].supabase.co:5432/postgres

# Redis
REDIS_HOST=your-redis.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password

# AI API Keys
DASHSCOPE_API_KEY=sk-your-key
ZHIPU_API_KEY=your-key
DEEPSEEK_API_KEY=sk-your-key
SILICONFLOW_API_KEY=sk-your-key

# 应用配置
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
AUTH_SECRET=your-random-secret-string-change-this
```

**生成 AUTH_SECRET**：

```bash
openssl rand -base64 32
```

### 步骤 4：部署

1. 点击 **Deploy** 按钮
2. 等待 3-5 分钟
3. ✅ 部署成功！

---

## 🔧 部署后配置（2 分钟）

### 初始化数据库

部署成功后，需要运行数据库迁移：

**方式 1：本地执行（推荐）**

```bash
# 1. 设置生产数据库 URL
export DATABASE_URL="postgresql://postgres:..."

# 2. 运行迁移
pnpm db:migrate

# 3. 填充初始数据（可选）
pnpm db:seed
```

**方式 2：Vercel Dashboard**

1. 进入项目 → **Settings** → **General**
2. 找到 **Build & Development Settings**
3. 添加 **Post-deploy Command**:
   ```bash
   pnpm db:migrate
   ```

### 更新应用 URL

1. 复制 Vercel 分配的域名（如 `https://ai-aggregation-xxx.vercel.app`）
2. 在 Vercel Dashboard → **Settings** → **Environment Variables**
3. 更新 `NEXT_PUBLIC_APP_URL` 为实际域名
4. 点击 **Redeploy** 重新部署

---

## ✅ 验证部署

访问你的应用：`https://your-app.vercel.app`

测试功能：

- [ ] 首页加载正常
- [ ] 对话功能可用
- [ ] 图像生成可用
- [ ] 历史记录保存正常

---

## 🎯 下一步

### 自定义域名（可选）

1. 进入 **Settings** → **Domains**
2. 添加你的域名
3. 配置 DNS 记录（按提示操作）

### 启用监控

在 Vercel Dashboard 中启用：

- **Analytics** - 页面访问统计
- **Speed Insights** - 性能监控
- **Web Vitals** - 用户体验指标

### 配置 Worker（可选）

如果需要异步任务处理（视频生成等），需要单独部署 Worker：

**推荐平台**：

- [Railway](https://railway.app/) - 简单易用
- [Render](https://render.com/) - 免费额度充足

---

## 🆘 遇到问题？

### 构建失败

1. 检查 Node.js 版本是否为 22.x
2. 检查 `vercel.json` 配置是否正确
3. 查看构建日志：Vercel Dashboard → **Deployments** → 点击失败的部署

### 运行时错误

1. 检查环境变量是否配置完整
2. 检查数据库连接是否正常
3. 查看运行时日志：
   ```bash
   vercel logs --follow
   ```

### 数据库连接超时

1. 确认使用 Supabase 的 **Pooler** 连接字符串
2. 或配置 Prisma 连接池（参考 `DEPLOYMENT.md`）

---

## 📚 相关文档

- [完整部署指南](./DEPLOYMENT.md)
- [Vercel 文档](https://vercel.com/docs)
- [项目文档](./AGENTS.md)

---

**预计总时间**：10-15 分钟

**成本**：完全免费（使用 Vercel Hobby + Supabase Free + Upstash Free）
